#!/usr/bin/env node
var base    = require('taskcluster-base');
var path    = require('path');
var debug   = require('debug')('events:bin:server');
var Promise = require('promise');
var socket  = require('../events/socket');
var express = require('express');

/** Launch server */
var launch = function(profile) {
  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs:         [
      'amqp_url'
    ],
    filename:     'taskcluster-events'
  });

  // Load things that we need to load before starting
  return Promise.all([
  ]).then(function() {
    // Create app
    var app = base.app({
      port:           Number(process.env.PORT || cfg.get('server:port')),
      env:            cfg.get('server:env'),
      forceSSL:       cfg.get('server:forceSSL'),
      trustProxy:     cfg.get('server:trustProxy')
    });

    // Serve static content from assets/
    app.use('/assets', express.static(path.join(__dirname, 'assets')));

    // Create server
    return app.createServer().then(function(server) {
      // Attach socket.io server
      socket.create(server, {
        connectionString:   cfg.get('amqp:url'),
        publicUrl:          cfg.get('server:publicUrl')
      });
      return server;
    })
  });
};

// If server.js is executed start the server
if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: server.js [profile]")
    console.error("ERROR: No configuration profile is provided");
  }
  // Launch with given profile
  launch(profile).then(function() {
    debug("Launched server successfully");
  }).catch(function(err) {
    debug("Failed to start server, err: %s, as JSON: %j", err, err, err.stack);
    // If we didn't launch the server we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;
