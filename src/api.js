let debug = require('debug')('app:main');
let API = require('taskcluster-lib-api');
let taskcluster = require('taskcluster-client');
let uuid = require('uuid');


var api = new API({
  title:    'AMQP Messages API Documentation',
  description: [
    'This service is responsible for making pulse messages accessible',
    'from browsers and cli. There are API endpoints to',
    'bind / unbind to an exchange and pause / resume listening from a queue'
  ].join('\n'),


  errorCodes: {
    'InputValidation':  400 // For JSON schema errors (bad exchange).
  }
  context: ['connection']
});


api.declare({
  method: 'get',
  route: '/connect/',
  name: 'Events-Api',
  stability: 'API.stability.experimental'
  // Add input validation yml
  title: 'Connect to receive messages',
},  async function(req,res) {

  const sendEvent = (kind,data) => {
    res.write('event: ' + kind + '\n');
    res.write('data: ' + JSON.stringify(data) + '\n');
    res.write('\n');
  };

  let headWritten. pingEvent;
  try{

    res.writeHead(200, {
      'Connection' : 'keep-alive',
      'Content-Type' : 'text/event-stream',
      'Cache-Control' : 'no-cache',
    });
    headWritten = true;

    // The headers are written without any errors.
    // This means we are ready to send messages.
    sendEvent('ready',true);


    // TODO : add listener = PulseListener

    const pingEvent = setInterval(() => sendEvent('ping', { time : new Date()}), 10*1000);
  } catch(err) {
    // Catch errors 
    // bad exchange will be taken care of by i/p validation
    // Send 5xx error code otherwise. Make sure that the head is not written.
    // You can set the response code only once.
    // If head is written, send an error event.
    if(!headWritten) {
      res.reportError(500, "Something went wrong. Make another request to retry.")
    } 
    // TODO : Find a suitable error message depending on err.
    // Most likely these will be PulseListener errors.
    sendEvent('error',true);
  } finally{
    
    if(pingEvent)
      clearInterval(pingEvent);

    if(!res.finished)
      res.end();

    // Finally end the response.
    // Close the listener
  }
  


})
