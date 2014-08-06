(function(exports) {
"use strict";

// Check for SockJS availability
if (!SockJS) {
  console.log([
    "WARNING: events.taskcluster.net/assets/v1/listener.js does not work",
    "without SockJS. Please make sure it include it from:",
    "    https://events.taskcluster.net/assets/v1/sock.js"
  ].join('\n         '));
}

/**
 * Listener for listening for AMQP events over SockJS
 *
 * Will emit the following events after construction:
 *  - `open`, when socket is open (and you can call `bind()`)
 *  - `ready`, when remote end-point is connected to AMQP and listening
 *     for messages
 *
 * The following events may occur during usage for the listener:
 *  - `bound`, when a binding has been bound, details in the `binding` key
 *     on the event arguments.
 *  - `error`, when an error occurs for some reason.
 *  - `message`, when a message is received, see message format for
 *     `taskcluster.Listener` in `taskcluster-client`. Found under the
 *     `message` key of the event arguments.
 *  - `close`, when the underlying socket is closed.
 */
var Listener = function(options) {
  // Ensure that we have options
  if (!options) {
    options = {};
  }
  // Ensure that options provide us with a baseUrl
  if (!options.baseUrl) {
    options.baseUrl = 'https://events.taskcluster.net/v1/listen';
  }

  // Store list of event listeners
  this._listeners = {};

  // Create socket
  this.socket = new SockJS(options.baseUrl);

  // Listen for open event
  this.socket.addEventListener('open',    this.onOpen.bind(this));
  this.socket.addEventListener('close',   this.onClose.bind(this));
  this.socket.addEventListener('message', this.onMessage.bind(this));
};

/** Add event handler */
Listener.prototype.addEventListener = function(event, handler) {
  // Find handlers
  var handlers = this._listeners[event];
  if (!(handlers instanceof Array)) {
    handlers = this._listeners[event] = [];
  }

  // Check if handler isn't already registered
  if (handlers.indexOf(handler) !== -1) {
    handlers.push(handler);
  }
};

/** Remove event handler */
Listener.prototype.removeEventListener = function(event, handler) {
  // Find handlers
  var handlers = this._listeners[event];

  // If we have handlers
  if (handlers) {
    // Find index of handler in handlers
    var index = handlers.indexOf(handler);

    // If present remove it
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }
};

/** Send an event with arguments */
Listener.prototype.emit = function(event, args) {
  var that = this;
  // Find handlers and invoke with all in the context of the listener
  (this._listeners[event] || []).forEach(function(handler) {
    handler.call(that, args);
  });
};

/** Handle socket open event */
Listener.prototype.onOpen = function() {
  this.emit('open', this);
};

/** Handle socket closure */
Listener.prototype.onClose = function() {
  this.emit('close', this);
};

/** Handle messages from server */
Listener.prototype.onMessage = function(e) {
  var message = JSON.parse(e.data);
  this.emit(message.method, message);
};

/**
 * Bind to an exchange with a routing key
 * The parameter `binding` is the same form as those created by
 * `taskcluster-client`.
 *
 * When a binding is successful the `bound` event will be emitted, where the
 * event arguments will have a `binding` key matching what was bound.
 *
 * Note, if `ready` event haven't been seen yet, messages will not be received
 * either and remote side isn't really bound. But it will bind before sending
 * the `ready` event.
 */
Listener.prototype.bind = function(binding) {
  // Check that we can interact with server
  if (this.socket.readyState !== 1) {
    throw new Error("Socket is not open, please listen for open/close events");
  }
  // Send request
  this.socket.send(JSON.stringify({
    method:   'bind',
    binding:  {
      exchange:           binding.exchange,
      routingKeyPattern:  binding.routingKeyPattern
    }
  }));
};

/** Close the socket */
Listener.prototype.close = function() {
  this.socket.close();
};

// Export Listener
exports.Listener = Listener;
return exports.Listener;

})(this);