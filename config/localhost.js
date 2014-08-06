module.exports = {
  events: {

  },

  server: {
    publicUrl:                      'https://events.taskcluster.net',

    port:                           60002,

    env:                            'development',

    forceSSL:                       false,

    trustProxy:                     false,

    cookieSecret:                   'Warn, if no secret is used on production'
  },

  amqp: {
    url:                            'amqp://guest:guest@localhost:5672'
  }
};
