'use strict'
var SockJS        = require('sockjs-client');
var launch        = require('../bin/server');
var assert        = require('assert');
var base          = require('taskcluster-base');
var slugid        = require('slugid');
var taskcluster   = require('taskcluster-client');
var debug         = require('debug')('test:events');
var path          = require('path');

const URL = 'http://localhost:12345/v1/listen';


module.exports = suite('events',() => {
  var ready, socket, server;

  var cfg = base.config({
    files: [
      path.join(__dirname,'../config.yml')
    ],
    profile:  'test',
    env:      process.env
  });

  if(!cfg.pulse.username || !cfg.taskcluster.credentials.accessToken){
    debug('skipping tests due to missing configuration');
  }

  before(()=>{
    launch('test').then(serv => {
      server = serv;
    }).then(() => {
      socket = new SockJS(URL);
      socket.onopen = () => { debug('socket open');}
      ready = new Promise(function(resolve, reject) {
        socket.onmessage = (e)=> {
          let message = JSON.parse(e.data);
          debug('message: %s',JSON.stringify(message));
          message.event === 'ready'? resolve():reject();
        }
      });
    });
  });

  after(() => {
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
  /*
  readyState 0 - connecting , 1 - open, 2 - closing, 3 - closed
  */
  it('should connect',() => {
    return ready.then(()=>{
      assert(socket.readyState === 1, "Expected socket to be ready");
    }).catch(()=>{
      assert(socket.readyState !== 2, "Socket closing");
    });
  });

  /* Test queue */

  it('should bind',() => {
    var reqId = slugid.v4();
    // send message
    var queueEvents = new taskcluster.QueueEvents();
    return ready.then(() => {
      socket.send(JSON.stringify ({
        method :  'bind',
        options :  queueEvents.taskPending({
                    taskId : slugid.v4()
                  }),
        id      :  reqId
      }));
      //check response
      return new Promise((resolve,reject) => {
        socket.onmessage = (e) =>{
          var message = JSON.parse(e.data);
          assert(message.event === 'bound', "Unsucessful binding");
          assert(message.id === reqId, "Got wrong request id");
          resolve();
        }
      });
    });
  });

  //Send illegal exchange option to server
  it('bind (illegal exchange)', () => {
    var reqId = slugid.v4();
    //send message
    var queueEvents = new taskcluster.QueueEvents();
    return ready.then(() => {
      socket.send(JSON.stringify ({
        method : 'bind',
        options : { exchange: 'illegal-exchange', routingKeyPattern: '#'},
        id      : reqId
      }));
      //Check for error
      return new Promise((resolve,reject) => {
        socket.onmessage = (e) => {
          var message = JSON.parse(e.data);
          assert(message.event !== 'bound' || message.id === reqId, "Should not bind");
          assert(message.event === "error", "Error expected");
          resolve();
        }
      });
    })
  });

  it('should receive message', function () {
    this.timeout(10000);
    var taskId = slugid.v4();
    var gotMessage = new Promise(function(resolve, reject) {
      socket.onmessage = (e) => {
        var message = JSON.parse(e.data);
        assert(message.event === 'message', "Message event expected");
        debug('payload: %s',message.payload);
        resolve();
      }
    });

    var queueEvents = new taskcluster.QueueEvents();
    return ready.then(() => {
      socket.send(JSON.stringify({
        method  : 'bind',
        options : queueEvents.taskDefined({ taskId  : taskId }),
        id      : slugid.v4()
      }));
    })
    //Set up queue
    .then(() => {
      var queue = new taskcluster.Queue({
        credentials : cfg.taskcluster.credentials
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
    }).then(() => {
      return gotMessage;
    }).then((result) => {
      assert(result.payload.status.taskId === taskId, "Got wrong task id");
    });
  });
  /* End of queue tests*/
});
