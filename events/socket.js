var _           = require('lodash');
var sockjs      = require('sockjs');
var taskcluster = require('taskcluster-client');
var debug       = require('debug')('events:socket');
var urljoin     = require('url-join');
var assert      = require('assert');
var base        = require('taskcluster-base');
var slugid      = require('slugid');

/** Report statistics about web-socket connections */
var WebSocketListeners = new base.stats.Series({
  name:             'WebSocketListeners',
  columns: {
    component:      base.stats.types.String,
    duration:       base.stats.types.Number,
    messages:       base.stats.types.Number,
    bindings:       base.stats.types.Number
  }
});

/** Create SockJS handler on httpServer */
exports.create = function(httpServer, options) {
  // Validate options
  assert(httpServer,                    "httpServer is required");
  assert(options,                       "options are required");
  assert(options.credentials,           "credentials is required");
  assert(options.credentials.username,  "credentials.username is required");
  assert(options.credentials.password,  "credentials.password is required");
  assert(options.publicUrl,             "publicUrl is required");
  assert(options.component,             "component name is required");
  // Provide default options
  options = _.defaults({}, options, {
    drain:      new base.stats.NullDrain()
  });

  // Create statistics reporter
  var reporter = WebSocketListeners.reporter(options.drain);

  // taskcluster events
  var queueEvents = new taskcluster.QueueEvents();
  var schedulerEvents = new taskcluster.SchedulerEvents();

  // Create new Pulse connection for all the listeners to share
  var connection = new taskcluster.PulseConnection(options.credentials);

  // Create sockjs server
  var server = sockjs.createServer();

  // Listen for connections
  server.on('connection', function(socket) {
    socket.proxy = new Proxy(socket, connection, reporter, options.component);
  });

  // Install handler on http server
  server.installHandlers(httpServer, {
    sockjs_url:   urljoin(options.publicUrl, 'assets/v1/sock.js'),
    prefix:       '/v1/listen'
  });
};


/** AMQP to websocket proxy */
var Proxy = function(socket, connection, reporter, component) {
  var that = this;

  // Properties for statistics
  this.reporter   = reporter;
  this.component  = component;
  this.startTime  = new Date().getTime();
  this.bindings   = 0;
  this.messages   = 0;

  // Store socket
  this.socket = socket;

  // Bind to events
  this.socket.on('data',  this.onData.bind(this));
  this.socket.on('close', this.onClose.bind(this));
  this.socket.on('error', this.onError.bind(this));

  // Create listener
  this.listener = new taskcluster.PulseListener({
    prefetch:           10,
    maxLength:          50,
    connection:         connection
  });

  // Send messages to the client
  this.listener.on('message', this.onMessage.bind(this));

  // Connect listener
  this.listener.connect().then(function() {
    return that.listener.resume();
  }).then(function() {
    that.send('ready');
  }, function(err) {
    debug("Failed to connect to AMQP, err: %s, as JSON: %j",
          err, err, err.stack);
    that.fatal();
  });
};

/** Send a JSON object over the socket */
Proxy.prototype.send = function(event, payload, id) {
  if (!id) {
    id = slugid.v4();
  }
  this.socket.write(JSON.stringify({
    event:    event,  // Possible event:  ready, bound, message, error
    id:       id,     // Matches a request id, if related to a request
    payload:  payload
  }));
};

/** Handle message from socket
 *
 * data must be a JSON string on the following form:
 *
 * {
 *   method:  'bind',       // Method to call
 *   options: {...},        // Options for the method
 *   id:      slugid.v4()   // Request id (will be match in response or error)
 * }
 */
Proxy.prototype.onData = function(data) {
  // Parse data
  try {
    var message = JSON.parse(data);
  }
  catch(err) {
    debug("Failed to parse message from socket: %s", data);
    return this.reportError("Failed to parse message", {data: data});
  }

  // Check that id is a string
  if (typeof(message.id) !== 'string') {
    return this.reportError("Message doesn't have an id", {message: message});
  }

  // Handle bind messages
  if (message.method === 'bind') {
    return this.bind(message.id, message.options);
  }

  // If no method handled the message report error
  debug("Client asked for unknown method: %s, message: %j",
        message.method, message);
  this.reportError("Unknown method", {
    method:  message.method,
    message: message
  });
};

/** On socket closed */
Proxy.prototype.onClose = function() {
  // Close listener
  this.listener.close().then(null, function(err) {
    debug("CRITICAL: Failed to close listener, error: %s, as JSON: %j",
          err, err, err.stack);
  });

  // Report stats about the connection to statistics drain
  this.reporter({
    component:  this.component,
    duration:   (new Date().getTime() - this.startTime),
    messages:   this.messages,
    bindings:   this.bindings
  });
};

/** On socket error */
Proxy.prototype.onError = function(err) {
  debug("Experienced socket error: %s, as JSON: %j", err, err, err.stack);
  this.fatal();
};

/** Satisfy a binding request */
Proxy.prototype.bind = function(id, options) {
  var that = this;

  // Check binding is an object
  if (!(options instanceof Object)) {
    return this.reportError("options must be a JSON object", {
      options:    options
    }, id);
  }

  // Exclude other keys
  var binding = _.pick(options, 'exchange', 'routingKeyPattern');

  // Check that the routing key pattern is a string
  if (typeof(binding.routingKeyPattern) !== 'string') {
    return this.reportError("options.routingKeyPattern must be a string", {
      options:            options,
      routingKeyPattern:  options.routingKeyPattern
    }, id);
  }

  // Check length routing key pattern
  if (binding.routingKeyPattern.length > 255) {
    return this.reportError("options.routingKeyPattern is limited to " +
                            "255 characters", {
      options:            options,
      routingKeyPattern:  options.routingKeyPattern
    }, id);
  }

  // Bind to with listener
  return this.listener.bind(binding).then(function() {
    // Count number of bindings created
    this.bindings += 1;
    // Notify client that binding was successful
    that.send('bound', {
      options:      binding
    }, id);
  }, function(err) {
    debug("Failed to bind, binding %j, err %s, as JSON: %j",
          message.binding, err, err, err.stack);
    that.reportError("Failed to bind w. requested binding", {
      options:      binding
    }, id);
  }).then(null, function() {
    debug("Failed to reply to socket with method 'bound'");
    that.fatal();
  });
};

/** Handle message from listener */
Proxy.prototype.onMessage = function(message) {
  // Send message to client
  this.send('message', message);
  // Count messages delivered
  this.messages += 1;
};

/** Handle fatal errors */
Proxy.prototype.fatal = function() {
  // Close listener
  this.listener.close().then(null, function(err) {
    debug("CRITICAL: Failed to close listener, error: %s, as JSON: %j",
          err, err, err.stack);
  });
  // Report an error over the socket if possible
  if(this.socket.readyState === 1) {
    this.reportError("Internal server error", {
      info:  "Sorry, something fatal happen here, use your retry logic " +
             "to survive",
      reconnect: true
    });
  }
  // Make sure the socket is killed
  this.socket.end();
};

/** Report an error over the socket */
Proxy.prototype.reportError = function(message, properties, id) {
  if(this.socket.readyState === 1) {
    if (properties.reconnect === undefined) {
      properties.reconnect = false;
    }
    this.send('error', {
      message:    message,
      properties: properties
    }, id);
  }
};

