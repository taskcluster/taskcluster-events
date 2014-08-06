module.exports = {
  // Event specific configuration
  events: {

  },

  // Server configuration
  server: {
    // Public URL from which the server can be accessed (used for persona)
    publicUrl:                      'https://events.taskcluster.net',

    // Port to listen for requests on
    port:                           undefined,

    // Environment 'development' or 'production'
    env:                            'development',

    // Force SSL, not useful when runnning locally
    forceSSL:                       false,

    // Trust a forwarding proxy
    trustProxy:                     false,
  },

  // AMQP configuration
  amqp: {
    // URL for AMQP setup formatted as amqp://user:password@host:port/vhost
    url:                            undefined
  }
};
