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


  params: {
    id: /^[a-z0-9]+$/
  }
  context: ['connection']
});


api.declare({
  method: 'get',
  route: '/connect/',
  name: 'Events-Api',
  stability: 'API.stability.experimental'
  // Add inout validation
  title: 'Connect to receive messages',
},  async function(req,res) {

  const sendEvent = (kind,data) => {
    res.write('event: ' + kind + '\n');
    res.write('data: ' + JSON.stringify(data) + '\n');
    res.write('\n');
  };

  res.writeHead(200, {
    'Connection' : 'keep-alive',
    'Content-Type' : 'text/event-stream',
    'Cache-Control' : 'no-cache',
  });

  // The headers are written without any errors.
  // This means we are ready to send messages.
  sendEvent('ready',true);


  // TODO : add listener = PulseListener

  const pingEvent = setInterval(() => sendEvent('ping', { time : new Date()}), 10*1000);

  // Catch errors 
  // bad exchange will be taken care of by i/p validation
  // Send 5xx error code otherwise. Make sure that the head is not written.
  // You can set the response code only once.
  // If head is written, send an error event.

  // Finally end the response.
  // Close the listener

})
