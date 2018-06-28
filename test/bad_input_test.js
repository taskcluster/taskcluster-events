const debug     = require('debug')('test:get_msg');
const assert    = require('assert');
const helper    = require('./helper');
const _         = require('lodash');

helper.secrets.mockSuite(__filename, [], function(mock, skipping) {
  helper.withPulse(mock, skipping);
  helper.withServer(mock, skipping);

  test('More than one key in query', async () => {
    let bindings = {bindings : [ 
      {exchange :  'exchange/taskcluster-foo/v1/bar', routingKey : '#'},
    ], foo: 'bar'};

    let controls = helper.connect(bindings);
    //controls = {es, resolve, pass, fail}
    let es = controls.es;

    es.addEventListener('error', (e) => {
      error = e.data;
      assert(_.includes(error, 'The json query should have only one key'));
      es.close();
      controls.pass();
    });
    await controls.resolve;
  });

  test('Bindings is not an array', async () => {
    let bindings = {bindings : {exchange :  'exchange/taskcluster-foo/v1/bar', routingKey : '#'}};

    let controls = helper.connect(bindings);
    //controls = {es, resolve, pass, fail}
    let es = controls.es;

    es.addEventListener('error', (e) => {
      error = e.data;
      assert(_.includes(error, 'Bindings must be an array of {exchange, routingKey}'));
      es.close();
      controls.pass();
    });
    await controls.resolve;
  });

});