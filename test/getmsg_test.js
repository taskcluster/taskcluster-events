const debug     = require('debug')('test:get_msg');
const assert    = require('assert');
const helper    = require('./helper');
const _         = require('lodash');

helper.secrets.mockSuite(__filename, [], function(mock, skipping) {
  helper.withPulse(mock, skipping);
  helper.withServer(mock, skipping);

  test('Exchange is correct', async () => {
    let bindings = {bindings : [ 
      {exchange :  'exchange/taskcluster-foo/v1/bar', routingKey : '#'},
    ]};

    let controls = helper.connect(bindings);
    //controls = {es, resolve, pass, fail}
    let es = controls.es;

    es.addEventListener('ready', msg => {
      const message = {
        exchange: 'exchange/taskcluster-foo/v1/bar',
        routingKey: 'some.route',
        routes: ['some.other.routes'],
        payload: {
          status: 'fooIsBar',
        },
      };

      helper.listeners.slice(-1)[0].fakeMessage(message);
    });

    es.addEventListener('message', (msg) => {
      assert(JSON.parse(msg.data).status === 'fooIsBar');
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

  // TODO : use fake time to not actually wait for 20s
  test('Timeout if idle for 20 seconds', async () => {
    // Send no messages after connecting. The connection should be 
    // closed automatically after 20s 
    let bindings = {bindings : [ 
      {exchange :  'exchange/taskcluster-foo/v1/bar', routingKey : '#'},
    ]};

    let controls = helper.connect(bindings);
    //controls = {es, resolve, pass, fail}
    let es = controls.es;

    es.addEventListener('message', (msg) => {
      assert(false);
      es.close();
      controls.fail();
    });

    es.addEventListener('error', (err) => {
      es.close();
      assert(JSON.parse(err.data) === 'No messages received for 20s. Aborting...');
      controls.pass();
    });

    await controls.resolve;
  });

});
