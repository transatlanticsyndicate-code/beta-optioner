module.exports = {
  apps: [
    {
      name: 'crypto-backend',
      script: 'python',
      args: '-m uvicorn main:app --host 127.0.0.1 --port 8003',
      cwd: '/var/www/crypto/backend',
      interpreter: 'none',
      env: {
        PYTHONPATH: '/var/www/crypto/backend',
        ENV: 'crypto'
      },
      error_file: '/var/www/crypto/logs/backend-error.log',
      out_file: '/var/www/crypto/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
