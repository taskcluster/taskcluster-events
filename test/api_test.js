var EventSource = require('eventsource');
var urlencode = require('urlencode');


var bindings = {"bindings" : [ 
    {"exchange" :  "exchange/taskcluster-queue/v1/task-completed", "routingKey" : "#"},
]};

var json = urlencode(JSON.stringify(bindings));




try{
    var es = new EventSource('http://localhost:12345/api/events/v1/connect/?bindings='+json);
    es.addEventListener('ping', function (e) {
        console.log(e.data)
    });
    es.onmessage = (msg) => console.log(msg);
    es.addEventListener('ready', function (e) {
        console.log(e);
    });
    es.addEventListener('message', function (e) {
        console.log(e);
    });
    es.onerror = (err) => console.log(err);
} catch (err) {
    console.log(err);
}
