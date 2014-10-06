module.exports = {
  server: {
    publicUrl:                      'http://localhost',
    port:                           60002,
    env:                            'development',
    forceSSL:                       false,
    trustProxy:                     false,
  },

  amqp: {
    url:                            'amqp://guest:guest@localhost:5672'
  }
};
