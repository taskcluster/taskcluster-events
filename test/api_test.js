var EventSource = require('eventsource');
var urlencode = require('urlencode');


var bindings = {"bindings" : [ 
    {"exchange" :  "a/b/c", "routingKey" : "a.b.c"},
    {"exchange" :  "x/y/z", "routingKey" : "x.y.z"},
]};
//console.log(JSON.stringify(bindings));
var json = urlencode(JSON.stringify(bindings));
//console.log(urlcodeJson.encode(bindings,false));



try{
    var es = new EventSource('http://localhost:12345/api/events/v1/connect/?bindings='+json);
    es.addEventListener('ping', function (e) {
        console.log(e.data)
    });
} catch (err) {
    console.log(err);
}
