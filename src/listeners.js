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
  this.connection     = null;
  this.listeners = null;
};

/** Setup the PulseConnection */
Listeners.prototype.setup = function() {
  debug('Setting up Listeners');
  assert(this.listeners === null, 'Cannot setup twice');

  this.connection = new taskcluster.PulseConnection(this.credentials);
  this.listeners = [];
};

/** Create a new PulseListener instance and add it to this.listeners */
Listeners.prototype.createListener = async function(bindings) {
  let listener;
  try {
    listener = new taskcluster.PulseListener({
      prefetch:   5,
      connection: this.connection,
      maxLength:  50,
    });

    _.forEach(bindings, binding => listener.bind({
      exchange:          binding.exchange,
      routingKeyPattern: binding.routingKey,  
    }));

    this.listeners.push(listener);
    await listener.resume();
    
    return listener;
  } catch (err) {
    err.code = 404;
    debug(err);
    this.closeListener(listener);
    throw err;
  }
};

/** Close and remove listener from this.listeners */
Listeners.prototype.closeListener = function(listener) {
  let removeIndex = this.listeners.map(item => {return item._queueName;}).indexOf(listener._queueName);
  if (removeIndex > -1) {
    listener.close();
    this.listeners.splice(removeIndex, 1);
  }
};

// Export Listeners
module.exports = Listeners;
