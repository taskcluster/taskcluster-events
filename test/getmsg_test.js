suite('Get messages', function() {
  let EventSource = require('eventsource');
  let urlencode = require('urlencode');
  let debug       = require('debug')('test:get');
  let assert      = require('assert');
  let helper = require('./helper');
  let _ = require('lodash');

  let getControls = bindings => {
    let json = urlencode(JSON.stringify(bindings));
    var es = new EventSource('http://localhost:12345/api/events/v1/connect/?bindings='+json);

    var pass, fail;
    var resolve = new Promise((resolve, reject) => {pass = resolve; fail= reject;});
    return {
      es:      es,
      resolve: resolve,
      pass:    pass,
      fail:    fail, 
    };
  };

  // Everything is fine. We should receive pulse messages as usual
  test('Exchange is correct', async () => {
    let bindings = {bindings : [ 
      {exchange :  'exchange/taskcluster-queue/v1/task-completed', routingKey : '#'},
    ]};

    let controls = getControls(bindings);
    let es = controls.es;

    es.addEventListener('message', (msg) => {
      es.close();
      controls.pass();
    });

    es.addEventListener('error', (err) => {
      es.close();
      assert(false);
      controls.fail(err);
    });

    await controls.resolve;
  });

  // Wrong exchange. Should get 404
  test('Exchange does not exist', async () => {
    let bindings = {bindings : [ 
      {exchange :  'exchange/random/does-not-exist', routingKey : '#'},
    ]};

    let controls = getControls(bindings);
    let es = controls.es;

    es.addEventListener('error', (e) => {
      error = e.data;
      assert(_.includes(error, '404'));
      assert(_.includes(error, 'no exchange'));
      es.close();
      controls.pass();
    });

    await controls.resolve;
  });

  // Bad routingKey. Should not get any messages.
  test.only('Arbitrary routingKey', async () => {
    let bindings = {bindings : [ 
      {exchange :  'exchange/taskcluster-queue/v1/task-completed', routingKey : 'abc'},
    ]};

    let controls = getControls(bindings);
    let es = controls.es;

    es.addEventListener('message', (e) => {
      es.close();
      controls.fail();
    });
    await controls.resolve;
  });
});
