### Taskcluster AMQP Events Proxy

This proxy, hosted at `events.taskcluster.net/v1`, allows clients to receive events(pulse messages) on AMQP exchanges specified in [`taskcluster-client`](https://github.com/taskcluster/taskcluster-client). 

## Usage

We use [Server-Sent Events](https://www.w3.org/TR/2009/WD-eventsource-20090421/). The client has to use an EventSource interface to connect to the api and listen for events. The bindings (exchange and routingKeyPattern) have to be provided as query parameters. 

```js
const EventSource = require('eventsource'); // Not required in browser-clients
const urlencode   = require('urlencode'); // Not required in browser-clients

const bindings = {bindings : [ 
      {exchange :  'exchange/foo/bar', routingKeyPattern : 'a.b.c'},
      ...
    ]};
const json_bindings = urlencode(JSON.stringify(bindings);

const listener = new EventSource(`events.taskcluster.net/v1/connect/?bindings=${json_bindings}`)
```
The browser exposes an instance of `EventSource` so there is no need to `require` it. Similar client implementations are available in most common languages

## Events

We have 4 types of events - 
..* __ping__  : sent every 3 seconds
..* __ready__ : sent after the binding is complete. Now you can expect pulse messages.
..* __message__ : sent when a pulse message arrives. Note that the actual message is in `message.data`
..* __error__ : sent in case of errors like bad input.

```js
// Listen for an event type 
listener.addEventListener('message', msg => {
    const message = JSON.parse(msg.data);
    // Do something with message

//Close the listener
listener.close();
});
```
The connection is closed by the server if no pulse messages have been received for more than 20 seconds.
We reject automatic reconnect attempts by `EventSource`. The client can force this by closing and restarting the listener.


## Testing

Install npm dependencies using `yarn` and run `yarn test` to run the tests. 
To build it locally you need to use `NODE_ENV='test' TASKCLUSTER_ROOT_URL='localhost:12345' node src/main.js server` 
This will use the pulse credentials in `user-config.yml`. Set `DEBUG: events:*` for additional debugging information.



