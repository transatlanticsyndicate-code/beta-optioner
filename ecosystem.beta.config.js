module.exports = {
  apps: [
    {
      name: 'optioner-backend-beta',
      script: 'venv/bin/uvicorn',
      args: 'app.main:app --host 0.0.0.0 --port 8002',
      cwd: '/var/www/beta/backend',
      interpreter: 'none',
      env: {
        DATABASE_URL: 'postgresql://beta_user:beta_secure_password_2025@localhost:5432/beta_optioner',
        ENVIRONMENT: 'beta',
        HOST: '0.0.0.0',
        PORT: '8002'
      },
      error_file: '/var/www/beta/logs/backend-error.log',
      out_file: '/var/www/beta/logs/backend-out.log',
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
