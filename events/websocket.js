var _               = require('lodash');
var WebSocket       = require('ws');
var taskcluster     = require('taskcluster-client');
var debug           = require('debug')('events:socket');
var urljoin         = require('url-join');
var assert          = require('assert');
var base            = require('taskcluster-base');
var slugid          = require('slugid');

// Maximum number of inactive iteration before closing a socket
var MAX_INACTIVE_ITERATIONS = 2;

// Number of ms between keep-alive intervals
var ITERATION_INTERVAL      = 30 * 1000;

/** Create WebSocketServer handler on httpServer */
exports.create = function(httpServer, options) {
  // Validate options
  assert(httpServer,                    "httpServer is required");
  assert(options,                       "options are required");
  assert(options.credentials,           "credentials is required");
  assert(options.credentials.username,  "credentials.username is required");
  assert(options.credentials.password,  "credentials.password is required");
  assert(options.publicUrl,             "publicUrl is required");
  assert(options.component,             "component name is required");
  assert(options.reporter,              "reporter for stats expected");

  // Create new Pulse connection for all the listeners to share
  var connection = new taskcluster.PulseConnection(options.credentials);

  // Create WebSocketServer server
  var server = new WebSocket.Server({
    server:           httpServer,
    clientTracking:   false,  // Let's not duplicate the effort
    path:             '/v1/socket'
  });
  debug("Create WebSocketServer");

  // Common context
  var ctx = {
    connection: connection,
    reporter:   options.reporter,
    component:  options.component,
    proxies:    []  // List of proxies
  };

  // Listen for connections
  server.on('connection', function(socket) {
    ctx.proxies.push(new Proxy(socket, ctx));
  });

  // Send pongs and ensure sockets are alive
  var keepAlive = function() {
    debug("Running keep-alive cycle");
    try {
      ctx.proxies.forEach(function(proxy) {
        proxy.keepAlive();
      });
    }
    catch (err) {
      debug("[alert-operator] Error doing keepAlive cycling: %s, JSON: %j",
            err, err, err.stack);
      // Ignore error and continue
    }
    setTimeout(keepAlive, ITERATION_INTERVAL);
  };

  // Start keep-alive cycling
  keepAlive();
};


/** AMQP to websocket proxy */
var Proxy = function(socket, ctx) {
  var that = this;

  // Store socket
  this.socket = socket;

  // Store reference to common context
  this.ctx = ctx;

  // Properties for keep alive
  this.inactiveIterations = 0;

  // Properties for statistics
  this.startTime  = new Date().getTime();
  this.bindings   = 0;
  this.messages   = 0;

  // Bind to events
  this.socket.on('message',   this.onMessage.bind(this));
  this.socket.on('ping',      this.onPing.bind(this));
  this.socket.on('pong',      this.onPong.bind(this));
  this.socket.on('close',     this.close.bind(this));
  this.socket.on('error',     function(err) {
    debug("Experienced websocket error: %s, as JSON: %j", err, err, err.stack);
    that.close();
  }.bind(this));

  // Create listener
  this.listener = new taskcluster.PulseListener({
    prefetch:           10,
    maxLength:          50,
    connection:         ctx.connection
  });

  // Catch errors
  this.listener.on('error', function(err) {
    debug("Experienced pulse error: %s, as JSON: %j", err, err, err.stack);

    // Report an error from the listener
    that.sendError('PulseListener Error', {
      reason: err.toString()
    });

    // Close everything
    that.close();
  });

  // Make sure we close if the listener closes
  this.listener.on('close', this.close.bind(this));

  // Send messages to the client
  this.listener.on('message', function(message) {
    // Send message to client
    that.send('message', message);

    // Count messages delivered
    that.messages += 1;
  });

  // Connect listener
  this.listener.connect().then(function() {
    return that.listener.resume();
  }).then(function() {
    that.send('ready');
  }, function(err) {
    debug("Failed to connect to AMQP, err: %s, as JSON: %j",
          err, err, err.stack);
    that.sendError('AMQP channel setup failed', {
      reason:       err.toString()
    });
    that.close();
  });
};

/** Send a JSON object over the socket */
Proxy.prototype.send = function(event, payload, id) {
  if (!id) {
    id = slugid.v4();
  }
  this.socket.send(JSON.stringify({
    event:    event,  // Possible event:  ready, bound, message, error
    id:       id,     // Matches a request id, if related to a request
    payload:  payload
  }));
};

/**
 * Free all resources held by this proxy object
 *
 * This method tries to be as robust as possible, feel free to all more than
 * necessary.
 */
Proxy.prototype.close = function() {
  // Close listener
  if (this.listener) {
    var listener = this.listener;
    Promise.resolve().then(function() {
      listener.close();
    }).then(null, function(err) {
      debug("[alert-operator]: Failed to close listener, error: %s, as " +
            "JSON: %j", err, err, err.stack);
    });
    // Don't close the listener again
    this.listener = null;
  }

  // Remove this from proxies
  var index = this.ctx.proxies.indexOf(this);
  if (index > -1) {
    this.ctx.proxies.splice(index, 1);
  }

  // Close the socket
  if (this.socket) {
    try {
      this.socket.close();
    }
    catch(err) {
      debug("Failed to terminate socket, not sure if this is bad: %s, JSON: %j",
            err, err, err.stack);
    }
    this.socket = null;
  }

  // Report stats about the connection to statistics drain
  if (this.startTime) {
    this.ctx.reporter({
      component:  this.ctx.component,
      duration:   (new Date().getTime() - this.startTime),
      messages:   this.messages,
      bindings:   this.bindings
    });
    // Only report stats once, that enough
    this.startTime = null;
  }
};

/**
 * Send an error over the socket
 *
 * This is a error message telling the client that a messages couldn't
 * be handled. For example the exchange doesn't exist, or the routing pattern
 * is invalid.
 */
Proxy.prototype.sendError = function(message, details, id) {
  try {
    this.send('error', {
      message:    message,
      details:    details
    }, id);
  }
  catch (err) {
    debug("Failed to send error: %s with details: %j; due to " +
          "error: %s, as JSON: %j", message, details, err, err, err.stack);
  }
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
Proxy.prototype.onMessage = function(data) {
  this.inactiveIterations = 0;
  // Parse data
  try {
    var message = JSON.parse(data);
  }
  catch(err) {
    debug("Failed to parse message from socket: %s", data);
    return this.sendError("Failed to parse message", {data: data});
  }

  // Check that id is a string
  if (typeof(message.id) !== 'string') {
    return this.reportError("Message doesn't have an id", {data: message});
  }

  // Handle bind messages
  if (message.method === 'bind') {
    return this.bind(message.id, message.options);
  }

  // If no method handled the message report error
  debug("Client asked for unknown method: %s, message: %j",
        message.method, message);
  this.sendError("Unknown method", {
    method:   message.method,
    data:     message
  }, message.id);
};

/** Satisfy a binding request */
Proxy.prototype.bind = function(id, options) {
  var that = this;

  // Check binding is an object
  if (!(options instanceof Object)) {
    return this.sendError("bind: options must be a JSON object", {
      options:    options
    }, id);
  }

  // Exclude other keys
  var binding = _.pick(options, 'exchange', 'routingKeyPattern');

  // Check that the routing key pattern is a string
  if (typeof(binding.routingKeyPattern) !== 'string') {
    return this.sendError("bind: options.routingKeyPattern must be a string", {
      options:            options,
      routingKeyPattern:  options.routingKeyPattern
    }, id);
  }

  // Check length routing key pattern
  if (binding.routingKeyPattern.length > 255) {
    return this.sendError("bind: options.routingKeyPattern is limited to " +
                          "255 characters", {
      options:            options,
      routingKeyPattern:  options.routingKeyPattern
    }, id);
  }

  // Bind to with listener
  return this.listener.bind(binding).then(function() {
    // Count number of bindings created
    that.bindings += 1;
    // Notify client that binding was successful
    that.send('bound', {
      options:      binding
    }, id);
  }, function(err) {
    debug("Failed to bind, binding %j, err %s, as JSON: %j",
          message.binding, err, err, err.stack);
    that.sendError("bind: Failed to bind w. requested binding", {
      options:      binding
    }, id);
  }).then(null, function(err) {
    debug("Failed to reply to socket with method 'bound', err: %s, JSON: %j",
          err, err, err.stack);
    // At this stage we panic and close
    that.close();
  });
};

/** Respond to a ping frame */
Proxy.prototype.onPing = function(data, flags) {
  try {
    this.socket.pong(data, flags, true);
  }
  catch (err) {
    debug("Failed to send pong: %s, as JSON: %j", err, err, err.stack);
    // Close, just as a good measure
    this.close();
  }
};

/** Send a ping to check if the connection is alive */
Proxy.prototype.keepAlive = function() {
  // If we have reached the maximum number of inactive iteration close
  // everything and clean-up
  if (this.inactiveIterations <= MAX_INACTIVE_ITERATIONS * - 1) {
    this.sendError("Closing due to missing pongs", {
      missingPongs:  this.inactiveIterations * - 1
    });
    return this.close();
  }
  // Increment number of inactive iterations
  this.inactiveIterations = -1;
  try {
    this.socket.ping(slugid.v4());
  }
  catch (err) {
    debug("Failed to send ping");
    this.close();
  }
};

/** Handle pongs, so that keepAlive won't close() in next iteration */
Proxy.prototype.onPong = function(data, flags) {
  this.inactiveIterations = 0;
};