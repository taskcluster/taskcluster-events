let mocha           = require('mocha');
let debug           = require('debug')('test:helper');
let load            = require('../src/main');
var config        = require('typed-env-config');
var testing       = require('taskcluster-lib-testing');

const profile = 'test';
let loadOptions = {profile, process: 'test'};

// Create and export helper object
var helper = module.exports = {load, loadOptions};

// Load configuration
var cfg = config({profile});

// Configure PulseTestReceiver
helper.events = new testing.PulseTestReceiver(cfg.pulse, mocha);

var webServer = null;

// Setup before tests
mocha.before(async () => {
  // Create mock authentication server
  webServer = await load('server', loadOptions);
  debug('Server Setup');
});
  
// Cleanup after tests
mocha.after(async () => {
  // Kill webServer
  await webServer.terminate();
  testing.fakeauth.stop();
});
