suite('event', function() {
  var Promise     = require('promise');
  var launch      = require('../bin/server');
  var SockJS      = require('sockjs-client-node');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var taskcluster = require('taskcluster-client');
  var debug       = require('debug')('test:event');
  var base        = require('taskcluster-base');

  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/localhost'),
    envs:         [
      'taskcluster_credentials_clientId',     // Only for testing
      'taskcluster_credentials_accessToken',  // Only for testing
      'pulse_username',
      'pulse_password'
    ],
    filename:     'taskcluster-events'
  });

  // Check that we have credentials to run these test
  if (!cfg.get('pulse:password') ||
      !cfg.get('taskcluster:credentials:accessToken')) {
    console.log("Skipping event_test.js due to missing configuration");
    return;
  }

  var socket = null;
  var server = null;
  var ready = null;
  setup(function() {
    return launch('localhost').then(function(server_) {
      server = server_;
    }).then(function() {
      socket = new SockJS('http://localhost:60002/v1/listen');
      ready = new Promise(function(accept) {
        socket.addEventListener('open', function() {
          debug('open');
          socket.addEventListener('message', function(e) {
            debug("got message: %s", e.data);
            var message = JSON.parse(e.data);
            if (JSON.parse(e.data).event === 'ready') {
              accept();
            }
          });
        });
      });
    });
  });

  teardown(function() {
    return new Promise(function(accept) {
      socket.onclose = accept;
      socket.close();
      if (socket.readyState === 3) {
        accept();
      }
    }).then(function() {
      return server.terminate();
    });
  });

  test('connect', function() {
    return ready.then(function() {
      assert(socket.readyState === 1, "Expect socket to be ready!");
    });
  });

  test('bind', function() {
    var reqId = slugid.v4();
    var bound = new Promise(function(accept, reject) {
      socket.addEventListener('message', function(e) {
        var message = JSON.parse(e.data);
        if (message.event === 'bound') {
          if (message.id !== reqId) {
            debug("Got requestId: %s Expected: %s", message.id, reqId);
            return reject("Wrong response id");
          }
          return accept("Successful binding");
        }
        if (message.event === 'error') {
          debug("Got error: %j", message);
          return reject("Got an error back");
        }
      });
    });
    var queueEvents = new taskcluster.QueueEvents();
    debug("Sending requestId: %s", reqId);
    return ready.then(function() {
      socket.send(JSON.stringify({
        method:   'bind',
        options:  queueEvents.taskPending({
                    taskId: slugid.v4()
                  }),
        id:       reqId
      }));
      return bound;
    });
  });

  test('bind (illegal exchange)', function() {
    var reqId = slugid.v4();
    var bound = new Promise(function(accept, reject) {
      socket.addEventListener('message', function(e) {
        var message = JSON.parse(e.data);
        if (message.event === 'bound' && message.id !== reqId) {
          return reject("Successful binding");
        }
        if (message.event === 'error') {
          debug("Got expected error: %j", message);
          return accept("Got an error back");
        }
      });
    });
    debug("Sending requestId: %s", reqId);
    return ready.then(function() {
      socket.send(JSON.stringify({
        method:   'bind',
        options:  {exchange: "illegal-exchange", routingKeyPattern: "#"},
        id:       reqId
      }));
      return bound;
    }).then(function() {
      // Create a new socket to ensure that server survived
      var newSocket = new SockJS('http://localhost:60002/v1/listen');
      return new Promise(function(accept) {
        newSocket.addEventListener('open', function() {
          debug('open');
          newSocket.addEventListener('message', function(e) {
            debug("got message from socket2: %s", e.data);
            var message = JSON.parse(e.data);
            if (JSON.parse(e.data).event === 'ready') {
              accept();
            }
          });
        });
      }).then(function() {
        // Check that we can bind with newSocket
        var reqId = slugid.v4();
        var bound = new Promise(function(accept, reject) {
          newSocket.addEventListener('message', function(e) {
            var message = JSON.parse(e.data);
            if (message.event === 'bound') {
              if (message.id !== reqId) {
                debug("Got requestId: %s Expected: %s", message.id, reqId);
                return reject("Wrong response id");
              }
              return accept("Successful binding");
            }
            if (message.event === 'error') {
              debug("Got error: %j", message);
              return reject("Got an error back");
            }
          });
        });
        var queueEvents = new taskcluster.QueueEvents();
        debug("Sending requestId: %s", reqId);
        return ready.then(function() {
          newSocket.send(JSON.stringify({
            method:   'bind',
            options:  queueEvents.taskPending({
                        taskId: slugid.v4()
                      }),
            id:       reqId
          }));
          return bound;
        });
      }).then(function() {
        // Close new socket
        return new Promise(function(accept) {
          newSocket.onclose = accept;
          newSocket.close();
          if (newSocket.readyState === 3) {
            accept();
          }
        });
      });
    });
  });


  test('receive message', function() {
    this.timeout(10000);
    var taskId = slugid.v4();
    var gotMessage = new Promise(function(accept, reject) {
      socket.addEventListener('message', function(e) {
        var message = JSON.parse(e.data);
        if (message.event === 'message') {
          accept(message.payload);
        }
        if (message.event === 'error') {
          debug("Got error: %j", message);
          reject();
        }
      });
    });
    var queueEvents = new taskcluster.QueueEvents();
    return ready.then(function() {
      socket.send(JSON.stringify({
        method:   'bind',
        options:   queueEvents.taskDefined({
                     taskId:     taskId
                   }),
        id:       slugid.v4()
      }));
    }).then(function() {
      var queue = new taskcluster.Queue({
        credentials:  cfg.get('taskcluster:credentials')
      });
      var deadline = new Date();
      deadline.setHours(deadline.getHours() + 2);
      return queue.defineTask(taskId, {
        provisionerId:    "dummy-test-provisioner",
        workerType:       "dummy-test-worker-type",
        schedulerId:      "dummy-test-scheduler",
        created:          (new Date()).toJSON(),
        deadline:         deadline.toJSON(),
        payload:          {},
        metadata: {
          name:           "Print `'Hello World'` Once",
          description:    "This task will prìnt `'Hello World'` **once**!",
          owner:          "jojensen@mozilla.com",
          source:         "https://github.com/taskcluster/taskcluster-events"
        },
        tags: {
          objective:      "Test taskcluster-event"
        }
      });
    }).then(function() {
      return gotMessage;
    }).then(function(result) {
      assert(result.payload.status.taskId === taskId, "Got wrong taskId");
    });
  });
});