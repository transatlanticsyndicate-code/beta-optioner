module.exports = {
  apps: [
    {
      name: 'optioner-backend-test',
      script: 'venv/bin/uvicorn',
      args: 'app.main:app --host 0.0.0.0 --port 8001',
      cwd: '/var/www/test/backend',
      interpreter: 'none',
      env: {
        DATABASE_URL: 'postgresql://test_user:test_password_123@localhost:5432/test_optioner',
        ENVIRONMENT: 'test',
        HOST: '0.0.0.0',
        PORT: '8001'
      },
      error_file: '/var/www/test/logs/backend-error.log',
      out_file: '/var/www/test/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      instances: 1,
      exec_mode: 'fork'
    }
  ]
};
