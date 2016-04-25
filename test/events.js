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
          if(message.event === 'ready'){
            resolve();
          }
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
  /*
    Checks if we can bind to an exchange and receive a message
  */
  it('should bind and receive message', function () {
    this.timeout(20000);
    var taskId = slugid.v4();
    var queueEvents = new taskcluster.QueueEvents();

    let gotMessage = new Promise((resolve, reject)=> {
      socket.onmessage = (e) => {
        var message = JSON.parse(e.data);
        assert(message.event !== 'error', "Error occured while receiving message");
        if(message.event === 'message'){
          debug('payload: %s',JSON.stringify(message.payload));
          resolve(message.payload);
        }
      }
    });
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
      	"provisionerId": "aws-provisioner-v1",
      	"workerType": "tutorial",
      	"created": (new Date()).toJSON(),
      	"deadline": deadline.toJSON(),
      	"payload": {
      		"image": "ubuntu:13.10",
      		"command": [
      			"/bin/bash",
      			"-c",
      			"echo \"hello World\""
      		],
      		"maxRunTime": 600
      	},
      	"metadata": {
      		"name": "Example Task",
      		"description": "Markdown description of **what** this task does",
      		"owner": "name@example.com",
      		"source": "https://tools.taskcluster.net/task-creator/"
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

  /* End of queue tests*/
});
