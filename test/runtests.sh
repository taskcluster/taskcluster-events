#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)


DEBUG=test:events,events:socket mocha                               \
  test/events.js                \
  ;
