module.exports = {
  server: {
    publicUrl:                      'https://events.taskcluster.net',
    port:                           undefined,
    env:                            'production',
    forceSSL:                       true,
    trustProxy:                     true,
  },
  amqp: {
    url:                            undefined
  }
};
