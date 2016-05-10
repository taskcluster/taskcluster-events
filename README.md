TaskCluster AMQP Event Proxy
============================
<img src="https://tools.taskcluster.net/lib/assets/taskcluster-120.png" />
[![Build Status](https://travis-ci.org/taskcluster/taskcluster-events.svg?branch=master)](http://travis-ci.org/taskcluster/taskcluster-events)

This allows browser client to bind to AMQP exchanges listed in
`taskcluster-client` and listen for events over a SockJS backed websocket.

```html
<!-- Include taskcluster-client -->
<script src="/.../taskcluster-client.js"></script>

<script>
// Create QueueEvents client from taskcluster-client
var queueEvents = new taskcluster.QueueEvents();

// Create listener
var listener = new taskcluster.WebListener();

// Declare bindings (you can do this at anytime)
listener.bind(queueEvents.taskCompleted({
  taskId:   "<myTaskId>"
})).then(function() {
  // Connect and start listening
  return listener.connect();
});

// Listen for messages
listener.on('message', function(message) {
  // Got message in same format as returned by AMQPListener
  console.log(JSON.stringify(message));
});

// Listen for errors
listener.on('error', function(error) {
  // Got an error message
});

// Listen for listener closure
listener.on('close', function() {
  // Listener is now closed for some reason
});

// Close listener
listener.close();
</script>
```
Testing
-------
1. Add pulse credentials to test profile in user-config.yml (Check user-config-example.yml)
1. Add pulse credentials to test profile in config.yml
>>>>>>> 0206f192d8181a44635c6b5af14649de08ef7410
2. Add taskcluster credentials to test profile in config.yml. Ensure you have the necessary scopes.
3. If required add influxDb connection string to default in config.yml
4. Run `npm test`

Deployment
----------
 1. Supply config as environment variables (see `server.js`).
 2. Use `tools.taskcluster.net/pulse-inspector` to verify that it works
