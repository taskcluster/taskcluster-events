TaskCluster AMQP Event Proxy
============================

This allows browser client to bind to AMQP exchanges listed in
`taskcluster-client` and listen for events over a SockJS backed websocket.

```html
<script src="events.taskcluster.net/assets/v1/sock.js"></script>
<script src="events.taskcluster.net/assets/v1/listener.js"></script>
<script src="/.../taskcluster-client.js"></script>

<script>
// Create QueueEvents client from taskcluster-client
var queueEvents = new taskcluster.QueueEvents();

// Create listener
var listener = new Listener();
listener.addEventListener('open', function() {
  // Bind to task-completed exchange with binding key for a specific taskId
  listener.bind(queueEvents.taskCompleted({
    taskId:   "<myTaskId>"
  }));
});

// Listen for binding request to be bound
listener.addEventsListener('bound', function(message) {
  // Got a binding request is completed
  console.log(message.binding);
});

// Listen for messages
listener.addEventsListener('message', function(message) {
  // Got message in same format as returned by Listener from taskcluster-client
  console.log(JSON.stringify(message));
});

// Listen for errors
listener.addEventsListener('error', function(error) {
  // Got an error message
});

// Listen for listener closure
listener.addEventsListener('close', function() {
  // Listener is now closed for some reasons
});

// Close listener
listener.close();
</script>
```

See documentation comments in `events.taskcluster.net/assets/v1/listener.js
for further details.

