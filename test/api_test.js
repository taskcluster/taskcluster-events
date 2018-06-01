var EventSource = require('eventsource');
var urlencode = require('urlencode');


var bindings = {"bindings" : [ 
    {"exchange" :  "a/b/c", "routingKey" : "a.b.c"},
    {"exchange" :  "x/y/z", "routingKey" : "x.y.z"},
]};

var json = urlencode(JSON.stringify(bindings));




try{
    var es = new EventSource('http://localhost:12345/api/events/v1/connect/?bindings='+json);
    es.addEventListener('ping', function (e) {
        console.log(e.data)
    });
    es.onerror = (err) => console.log(err);
} catch (err) {
    console.log(err);
}
