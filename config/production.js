module.exports = {
  server: {
    publicUrl:                      'https://events.taskcluster.net',
    port:                           undefined,
    env:                            'production',
    forceSSL:                       true,
    trustProxy:                     true,
  },
  pulse: {
    username:                       'taskcluster-events',
    // Provided by environment variable
    password:                       undefined
  },
};
