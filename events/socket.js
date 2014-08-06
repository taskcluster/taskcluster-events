var _           = require('lodash');
var sockjs      = require('sockjs');
var taskcluster = require('taskcluster-client');
var debug       = require('debug')('events:socket');
var urljoin     = require('url-join');
var assert      = require('assert');

/**
 */
exports.create = function(httpServer, options) {
  // Validate options
  assert(httpServer,                "httpServer is required");
  assert(options,                   "options are required");
  assert(options.connectionString,  "connectionString is required");
  assert(options.publicUrl,         "publicUrl is required");

  // taskcluster events
  var queueEvents = new taskcluster.QueueEvents();
  var schedulerEvents = new taskcluster.SchedulerEvents();

  // List of allowed exchanges
  var allowedExchanges = [
    queueEvents.taskDefined().exchange,
    queueEvents.taskPending().exchange,
    queueEvents.taskRunning().exchange,
    queueEvents.taskCompleted().exchange,
    queueEvents.taskFailed().exchange,
    schedulerEvents.taskGraphRunning().exchange,
    schedulerEvents.taskGraphExtended().exchange,
    schedulerEvents.taskGraphBlocked().exchange,
    schedulerEvents.taskGraphFinished().exchange
  ];

  // Create new AMQP connection for all the listeners to share
  var connection = new taskcluster.Connection({
    connectionString:     options.connectionString
  });

  // Create sockjs server
  var server = sockjs.createServer();

  // Listen for connections
  server.on('connection', function(socket) {
    socket.proxy = new Proxy(socket, connection, allowedExchanges);
  });

  // Install handler on http server
  server.installHandlers(httpServer, {
    sockjs_url:   urljoin(options.publicUrl, 'assets/v1/sock.js'),
    prefix:       '/v1/listen'
  });
};


/** AMQP to websocket proxy */
var Proxy = function(socket, connection, allowedExchanges) {
  var that = this;

  // Store socket
  this.socket = socket;

  // Store allowedExchanges
  this.allowedExchanges = allowedExchanges;

  // Bind to events
  this.socket.on('data', this.onData.bind(this));
  this.socket.on('close', this.onClose.bind(this));
  this.socket.on('error', this.onError.bind(this));

  // Create listener
  this.listener = new taskcluster.Listener({
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
    socket.write(JSON.stringify({
      method:   'ready'
    }));
  }, function(err) {
    debug("Failed to connect to AMQP, err: %s, as JSON: %j",
          err, err, err.stack);
    that.fatal();
  });
};

/** Satisfy a binding request */
Proxy.prototype.bind = function(message) {
  var that = this;

  // Check binding is an object
  if (!(message.binding instanceof Object)) {
    return this.reportError("message.binding must be a JSON object", {
      binding:    message.binding
    });
  }

  // Exclude other keys
  var binding = _.pick(message.binding, 'exchange', 'routingKeyPattern');

  // Check that the exchange is allowed
  if (!_.contains(this.allowedExchanges, binding.exchange)) {
    return this.reportError("Exchange not allowed", {
      exchange: binding.exchange,
      binding:  message.binding
    });
  }

  // Check that the routing key pattern is a string
  if (typeof(binding.routingKeyPattern) !== 'string') {
    return this.reportError("message.binding.routingKeyPattern must be " +
                            "a string", {
      binding:            message.binding,
      routingKeyPattern:  message.binding.routingKeyPattern
    });
  }

  // Check length routing key pattern
  if (binding.routingKeyPattern.length > 255) {
    return this.reportError("message.binding.routingKeyPattern is limited to " +
                            "255 characters", {
      binding:            message.binding,
      routingKeyPattern:  message.binding.routingKeyPattern
    });
  }

  // Bind to with listener
  return this.listener.bind(binding).then(function() {
    that.socket.write(JSON.stringify({
      method:               'bound',
      binding:              binding
    }));
  }, function(err) {
    debug("Failed to bind, binding %j, err %s, as JSON: %j",
          message.binding, err, err, err.stack);
    that.reportError("Failed to bind w. requested binding", {
      binding:    message.binding
    });
  }).then(null, function() {
    debug("Failed to reply to socket with method 'bound'");
    that.fatal();
  });
};

/** Handle message from listener */
Proxy.prototype.onMessage = function(message) {
  this.socket.write(JSON.stringify({
    method:   'message',
    message:  message
  }));
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


/** Handle message from socket */
Proxy.prototype.onData = function(message) {
  // Parse message
  try {
    message = JSON.parse(message);
  }
  catch(err) {
    debug("Failed to parse message from socket: %s", message);
    return this.reportError("Failed to parse message", {message: message});
  }
  // Handle bind messages
  if (message.method === 'bind') {
    return this.bind(message);
  }

  // If no method handled the message report error
  debug("Client asked for unknown method: %s, message: %j",
        message.method, message);
  this.reportError("Unknown method", {
    method:  message.method,
    message: message
  });
};

/** Report an error over the socket */
Proxy.prototype.reportError = function(message, details) {
  if(this.socket.readyState === 1) {
    if (details.reconnect === undefined) {
      details.reconnect = false;
    }
    this.socket.write(JSON.stringify({
      method:   'error',
      message:  message,
      error:    details
    }));
  }
};

/** On socket closed */
Proxy.prototype.onClose = function() {
  // Close listener
  this.listener.close().then(null, function(err) {
    debug("CRITICAL: Failed to close listener, error: %s, as JSON: %j",
          err, err, err.stack);
  });
};

/** On socket error */
Proxy.prototype.onError = function(err) {
  debug("Experienced socket error: %s, as JSON: %j", err, err, err.stack);
  this.fatal();
};
