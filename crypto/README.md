# Crypto Subdomain - crypto.optioner.online

## Описание
Поддомен для криптовалютных инструментов и калькуляторов опционов.

## Структура
```
crypto/
├── frontend/          # React приложение (будет собрано в build/)
├── backend/           # FastAPI бэкенд
└── logs/             # Логи PM2 (создается автоматически)
```

## Конфигурация

### Nginx
- Конфигурация: `nginx.crypto.conf`
- Порт бэкенда: 8003
- Путь к frontend build: `/var/www/crypto/frontend/build`

### PM2
- Конфигурация: `ecosystem.crypto.config.js`
- Процесс: `crypto-backend`
- Порт: 8003

### Environment
- Шаблон: `.env.crypto.template`
- База данных: `crypto_optioner`
- Окружение: `crypto`

## Деплой

1. **Скопировать файлы на сервер**
   ```bash
   scp -r crypto/ root@89.117.52.143:/var/www/
   scp nginx.crypto.conf root@89.117.52.143:/etc/nginx/sites-available/
   scp ecosystem.crypto.config.js root@89.117.52.143:/var/www/crypto/
   ```

2. **Настроить Nginx**
   ```bash
   ln -s /etc/nginx/sites-available/nginx.crypto.conf /etc/nginx/sites-enabled/
   nginx -t
   systemctl reload nginx
   ```

3. **Настроить SSL (certbot)**
   ```bash
   certbot --nginx -d crypto.optioner.online
   ```

4. **Создать базу данных**
   ```bash
   sudo -u postgres psql
   CREATE DATABASE crypto_optioner;
   CREATE USER crypto_user WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE crypto_optioner TO crypto_user;
   ```

5. **Настроить .env**
   ```bash
   cp .env.crypto.template /var/www/crypto/backend/.env
   # Отредактировать .env с реальными значениями
   ```

6. **Запустить PM2**
   ```bash
   pm2 start ecosystem.crypto.config.js
   pm2 save
   ```

## DNS
Добавить A-запись для `crypto.optioner.online` → `89.117.52.143`
