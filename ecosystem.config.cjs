module.exports = {
  apps: [
    {
      name: 'scrum-backend',
      cwd: '/mnt/data/projects/scrum-mcp',
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts',
      env: {
        NODE_ENV: 'production',
        SCRUM_PORT: 4177,
        SCRUM_BIND: '127.0.0.1',
        SCRUM_DB_PATH: '/home/boski/.scrum/scrum.sqlite',
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'scrum-frontend',
      cwd: '/mnt/data/projects/scrum-mcp/frontend',
      script: 'node_modules/.bin/vite',
      args: 'preview --port 5174 --host 127.0.0.1',
      env: {
        NODE_ENV: 'production',
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
