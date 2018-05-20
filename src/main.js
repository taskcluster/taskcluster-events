#!usr/bin/env node
let loader = require('taskcluster-lib-loader');
let App = require('taskcluster-lib-app');
let monitor = require('taskcluster-lib-monitor');
let debug = require('debug')('app:main');
let config = require('typed-env-config');


// Create component loader
let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      rootUrl: cfg.monitor.rootUrl,
      credentials: cfg.taskcluster.credentials,
      projectName: 'taskcluster-events',
      mock: cfg.monitor.mock,
      process,
    }),
  },

  server: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => {
      let app = App({
        port: cfg.server.port,
        env: cfg.server.env,
        forceSSL: cfg.server.forceSSL,
        trustProxy: cfg.server.trustProxy,
      });
      return app.createServer();
    },
  },
}, ['profile','process']);

// If this file is executed launch component from first argument
if (!module.parent) {
  load(process.argv[2], {
    process: process.argv[2],
    profile: process.env.NODE_ENV,
  }).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}

// Export load for tests
module.exports = load;
