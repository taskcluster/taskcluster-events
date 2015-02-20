var base        = require('taskcluster-base');

/** Report statistics about web-socket connections */
var WebSocketListeners = new base.stats.Series({
  name:             'WebSocketListeners',
  columns: {
    component:      base.stats.types.String,
    duration:       base.stats.types.Number,
    messages:       base.stats.types.Number,
    bindings:       base.stats.types.Number
  }
});

// Export WebSocketListeners
exports.WebSocketListeners = WebSocketListeners;