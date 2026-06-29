module.exports = {
  apps: [
    {
      name: 'proxy',
      script: 'proxy_server.js',
      env: { PORT: 3000 }
    },
    {
      name: 'dashboard',
      script: 'dashboard.js',
      env: { PORT: 3001 }
    }
  ]
};
