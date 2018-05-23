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
  route: '/connect/:id',
  name: 'connect'
  title: 'Connect to receive messages',
},  async function(req,res) {

  const sendEvent = (kind,data) => {
    res.write('event: ' + kind + '\n');
    res.write('data: ' + JSON.stringify(data) + '\n');
    res.write('\n');
  };

  // TODO : add listener = PulseListener

  const pingEvent = setInterval(() => sendEvent('ping', { time : new Date()}), 10*1000);
  

})
