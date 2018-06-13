let debug = require('debug')('events:api');
let APIBuilder = require('taskcluster-lib-api');
let taskcluster = require('taskcluster-client');
let uuid = require('uuid');
let _ = require('lodash');

let builder = new APIBuilder({
  title: 'AMQP Messages API Documentation',
  description: [
    'This service is responsible for making pulse messages accessible',
    'from browsers and cli. There are API endpoints to',
    'bind / unbind to an exchange and pause / resume listening from a queue',
  ].join('\n'),
  projectName: 'taskcluster-evnets',
  serviceName: 'events',
  version: 'v1',
  context: ['connection'],
});


// Returns JSON.parse(req.query.bindings) if everything goes well
//   {"bindings" : [ 
//     {"exchange" :  "a/b/c", "routingKey" : "a.b.c"},
//     {"exchange" :  "x/y/z", "routingKey" : "x.y.z"},
//   ]};
var validateBindings = function(bindings) {
  return JSON.parse(bindings);
}

builder.declare({
  method: 'get',
  route: '/connect/',
  query: {
    bindings: /./,
  },
  name: 'connect',
  description: 'Connect to receive messages',
  stability: APIBuilder.stability.experimental,
  // Add input validation yml
  title: 'Events-Api',
}, async function(req, res) {
  debug('hello');

  // If the last event id is '-', send a 204 error blocking all reconnects.
  // No reconnect on 204 is not yet supported on EventSource.
  // Clients using that need to use es.close() to stop error messages.
  if(req.headers["last-event-id"]) {
    return res.reportError(204,"Not allowing reconnects");
    abort();
  }

  let abort;
  const aborted = new Promise((resolve, reject) => abort = reject);

  const sendEvent = (kind, data) => {
    try {
      var event = ['event: ' + kind,
        'data: ' + JSON.stringify(data),
        'id: -',
        '\n',
      ].join('\n');
      
      res.write(event);
      debug('.....res.finished', aborted); 
    } catch (err) {
      debug('Error in sendEvent:');
      abort(err);
    }
  };
  
  // parse and validate 
  var json_bindings = validateBindings(req.query.bindings);

  // json_bindings.bindings contains array of {exchange, routingKey}
  if (!json_bindings) {
    debug('Error : InvalidRequestArguments');
    return res.reportError('InvalidRequestArguments', 'The bindings are not in specified json format',);
  }

  try {

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    });
    headWritten = true;

    var listener = new taskcluster.PulseListener({
      prefetch:   5,
      connection: this.connection,
      maxLength:  50,
    });
    
    _.forEach(json_bindings.bindings, (entry)=> listener.bind({
      exchange: entry.exchange,
      routingKeyPattern: entry.routingKey,
    }));
    
    listener.resume().then( function() {
      sendEvent('ready', {})
    }, function(err) {
      debug("Can't resume listener")
      abort(err);
    });

    listener.on('message', (message)=> {
      sendEvent('message', message.payload);
    });

    listener.on('error', (err) => {
      debug('listener Error', err);
      abort(err);
    })

    pingEvent = setInterval(() => sendEvent('ping', {
      time: new Date()
    }), 3 * 1000);

    await Promise.all([
      aborted,
      new Promise((resolve, reject) => req.once('close', reject)),
      new Promise((resolve,reject) => listener.on('error', (err) => {
        debug('PulseListener Error : '. err);
        reject();
      }))
    ]);

  } catch (err) {
    debug('Error : %j', err.message);

    var errorMessage = "Unknown Internal Error";
    if (err.code === 404) {
      errorMessage = err.message;
    }

    // Catch errors 
    // bad exchange will be taken care of by i/p validation
    // Send 5xx error code otherwise. Make sure that the head is not written.
    // You can set the response code only once.
    // If head is written, send an error event.
    if (!headWritten) {
      res.reportError(500, 'Something went wrong. Make another request to retry.');
    }

    // TODO : Find a suitable error message depending on err.
    // Most likely these will be PulseListener errors.
    sendEvent('error', errorMessage);
  } finally {

    if (pingEvent) {
      debug('unping');
      clearInterval(pingEvent);
    }
    // Close the listener
    listener.close();

    if (!res.finished) {
      debug('Ending response');
      res.end();
    }
  }

});

// Export api
module.exports = builder;