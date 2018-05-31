let debug = require('debug')('events:api');
let APIBuilder = require('taskcluster-lib-api');
let taskcluster = require('taskcluster-client');
let uuid = require('uuid');

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

builder.declare({
  method: 'get',
  route: '/connect/',
  name: 'connect',
  description: 'Connect to receive messages',
  stability: APIBuilder.stability.experimental,
  // Add input validation yml
  title: 'Events-Api',
}, async function(req, res) {
  debug("hello");

  let abort;
  const aborted = new Promise((resolve, reject) => abort = reject);
  debug(aborted);

  req.on('close', (err)=> {debug('aborting');abort(err);});

  const sendEvent = (kind, data) => {
    try {
      var event = ['event: ' + kind,
        'data: ' + JSON.stringify(data),
        '\n',
      ].join('\n');

      res.write(event);
      debug(".....res.finished", aborted);
      
    } catch (err) {
      debug("Error in sendEvent: ", err);
    }

  };

  try {

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    });
    headWritten = true;

    // The headers are written without any errors.
    // This means we are ready to send messages.
    sendEvent('ready', true);

    // TODO : add listener = PulseListener

    pingEvent = setInterval(() => sendEvent('ping', {
      time: new Date()
    }), 3 * 1000);
    await Promise.all([
      aborted,
      new Promise((resolve, reject) => res.once('finished', () => {
        debug("Connection closed remotely");
        reject;
      })),
    ]);
    debug("Abort");

  } catch (err) {
    debug('Error : ', err);
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
    sendEvent('error', true);
  } finally {

    if (pingEvent) {
      clearInterval(pingEvent);
    }

    if (!res.finished) {
      clearInterval(pingEvent);
      debug('Closing connection');
      res.end();
    }

    // Finally end the response.
    // Close the listener
  }

});

// Export api
module.exports = builder;