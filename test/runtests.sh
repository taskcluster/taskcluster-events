#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)


DEBUG=test:events mocha                               \
  test/events.js                \
  ;
