var assert      = require('assert');
var taskcluster = require('taskcluster-client');
var debug       = require('debug')('events:listeners');
var _           = require('lodash');

/**
 * Create Listener and Handle Events
 *
 * options:
 * {
 *   credentials:        // Pulse credentials
 * }
 */
var Listeners = function(options) {
  assert(options.credentials, 'Pulse credentials must be provided');

  this.credentials    = options.credentials;
  this.connection     = null
  this.pulseListeners = null;
}

/** Setup the PulseConnection */
Listeners.prototype.setup = function() {
  assert(this.listeners === null, 'Cannot setup twice');

  this.connection = new taskcluster.PulseConnection(this.credentials);
  this.listeners = [];
};

Listeners.prototype.createListener = function(bindings) {
  let listener = new taskcluster.PulseListener({
    prefetch:   5,
    connection: this.connection,
    maxLength:  50,
  });

  _.forEach(bindings, binding => listener.bind({
    exchange:          binding.exchange,
    routingKeyPattern: binding.routingKey,  
  }));

  this.listeners.push(listener);

  return new Promise((resolve,reject) => {
    listener.resume().then(
      () => {return listener;}, err => reject(err)
    )
  });
};

Listeners.prototype.destroyListener = function(listener) {
  let removeIndex = this.listeners.map( item => return item._queueName).indexOf(listener._queueName);
  if (removeIndex > -1) {
    listener.close();
    this.listeners.splice(removeIndex, 1);
  }
}

// Export Listeners
module.exports = Listeners;
