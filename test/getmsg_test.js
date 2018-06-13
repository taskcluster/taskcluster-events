suite('Get messages', function() {
  let EventSource = require('eventsource');
  let urlencode = require('urlencode');
  let debug       = require('debug')('test:get');
  let assert      = require('assert');
  let helper = require('./helper');
  let _ = require('lodash');

  test('Exchange does not exist', async () => {
    let bindings = {bindings : [ 
      {exchange :  'exchange/random/does-not-exist', routingKey : '#'},
    ]};
    let json = urlencode(JSON.stringify(bindings));
    let es = new EventSource('http://localhost:12345/api/events/v1/connect/?bindings='+json);

    let done;
    let isDone = new Promise(resolve => done = resolve);

    es.addEventListener('error', (e) => {
      error = e.data;
      assert(_.includes(error, '404'));
      assert(_.includes(error, 'no exchange'));
      es.close();
      done();
    });

    await isDone;
  });
});
