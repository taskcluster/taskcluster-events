#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)


mocha                               \
  test/sockjs_test.js               \
  test/websocket_test.js            \
  ;
