# 🚀 Инструкция по развертыванию тестового сервера

**Дата:** 2025-10-10  
**Цель:** Развернуть test.optioner.online на VPS

---

## 📋 Что уже создано

Cascade создал следующие файлы:

1. **nginx.test.conf** - Nginx конфигурация для test.optioner.online
2. **ecosystem.test.config.js** - PM2 конфигурация для тестового backend
3. **backend/.env.test** - Переменные окружения для теста
4. **scripts/setup_test_db.sql** - SQL скрипт для создания тестовой БД
5. **scripts/deploy_test.sh** - Скрипт автоматического деплоя

---

## 🎯 Шаги развертывания

### Шаг 1: Подготовка сервера (10 мин)

Подключись к серверу:
```bash
ssh root@optioner.online
```

Создай пользователя для Андрея (опционально, можно сделать позже):
```bash
sudo adduser andrey
sudo usermod -aG sudo andrey
```

Создай директорию для тестового окружения:
```bash
sudo mkdir -p /var/www/test
sudo mkdir -p /var/www/test/logs
sudo chown -R $USER:$USER /var/www/test
```

---

### Шаг 2: Клонирование проекта (5 мин)

Клонируй репозиторий в тестовую директорию:
```bash
cd /var/www/test
git clone https://github.com/levonmusoyan-cell/syn1.git .
```

Или если уже есть, просто скопируй:
```bash
cp -r /home/deploy/app/* /var/www/test/
cd /var/www/test
git remote set-url origin https://github.com/levonmusoyan-cell/syn1.git
```

---

### Шаг 3: Настройка тестовой БД (5 мин)

Создай тестовую базу данных:
```bash
cd /var/www/test
sudo -u postgres psql < scripts/setup_test_db.sql
```

Проверь подключение:
```bash
psql -U test_user -d test_optioner -h localhost
# Пароль: test_password_123
```

Скопируй схему из production (опционально):
```bash
# Экспортируй схему из production
pg_dump -U postgres -s optioner > /tmp/schema.sql

# Импортируй в тестовую БД
psql -U test_user -d test_optioner -h localhost < /tmp/schema.sql
```

---

### Шаг 4: Настройка Backend (10 мин)

Перейди в директорию backend:
```bash
cd /var/www/test/backend
```

Создай виртуальное окружение:
```bash
python3 -m venv venv
source venv/bin/activate
```

Установи зависимости:
```bash
pip install -r requirements.txt
```

Скопируй .env файл:
```bash
cp .env.test .env
```

**ВАЖНО:** Добавь OPENAI_API_KEY в .env:
```bash
nano .env
# Добавь строку:
# OPENAI_API_KEY=твой_ключ_из_production
```

Или скопируй из production:
```bash
grep OPENAI_API_KEY /home/deploy/app/backend/.env >> /var/www/test/backend/.env
```

Проверь, что backend запускается:
```bash
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8001
# Ctrl+C для остановки
```

---

### Шаг 5: Настройка Frontend (10 мин)

Перейди в директорию frontend:
```bash
cd /var/www/test/frontend
```

Установи зависимости:
```bash
npm install
```

Обнови API URL для тестового окружения:
```bash
# Создай .env.production.local
cat > .env.production.local << EOF
REACT_APP_API_URL=https://test.optioner.online/api
EOF
```

Собери production build:
```bash
npm run build
```

---

### Шаг 6: Настройка Nginx (5 мин)

Скопируй конфигурацию на сервер:
```bash
# На локальной машине
scp nginx.test.conf root@optioner.online:/tmp/

# На сервере
sudo cp /tmp/nginx.test.conf /etc/nginx/sites-available/test.optioner.online
sudo ln -s /etc/nginx/sites-available/test.optioner.online /etc/nginx/sites-enabled/
```

Проверь конфигурацию:
```bash
sudo nginx -t
```

Перезапусти Nginx:
```bash
sudo systemctl reload nginx
```

---

### Шаг 7: SSL сертификат (5 мин)

**ВАЖНО:** Сначала настрой DNS (A-запись test.optioner.online → 89.117.52.143)

Установи certbot (если нет):
```bash
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx
```

Получи SSL сертификат:
```bash
sudo certbot --nginx -d test.optioner.online
```

Проверь автообновление:
```bash
sudo certbot renew --dry-run
```

---

### Шаг 8: Запуск Backend через PM2 (5 мин)

Скопируй PM2 конфиг:
```bash
cp /var/www/test/ecosystem.test.config.js /var/www/test/
```

Запусти backend:
```bash
cd /var/www/test
pm2 start ecosystem.test.config.js
pm2 save
```

Проверь статус:
```bash
pm2 list
pm2 logs optioner-backend-test
```

---

### Шаг 9: Настройка скрипта деплоя (5 мин)

Дай права на выполнение:
```bash
chmod +x /var/www/test/scripts/deploy_test.sh
```

Создай симлинк для удобства:
```bash
sudo ln -s /var/www/test/scripts/deploy_test.sh /usr/local/bin/deploy-test
```

Теперь можно деплоить командой:
```bash
deploy-test
```

---

### Шаг 10: Проверка (5 мин)

Проверь, что все работает:

1. **Backend API:**
```bash
curl https://test.optioner.online/api/health
```

2. **Frontend:**
```bash
curl https://test.optioner.online
```

3. **В браузере:**
- Открой https://test.optioner.online
- Проверь, что UI загружается
- Попробуй сделать запрос (SPY, AAPL, TSLA)

4. **PM2 статус:**
```bash
pm2 list
pm2 logs optioner-backend-test --lines 50
```

---

## ✅ Чеклист

- [ ] Создана директория /var/www/test
- [ ] Клонирован репозиторий
- [ ] Создана тестовая БД test_optioner
- [ ] Backend настроен (venv, .env, зависимости)
- [ ] Frontend собран (npm install, npm run build)
- [ ] Nginx конфигурация добавлена
- [ ] DNS настроен (test.optioner.online → 89.117.52.143)
- [ ] SSL сертификат получен
- [ ] Backend запущен через PM2
- [ ] Скрипт деплоя работает
- [ ] Сайт открывается в браузере
- [ ] API отвечает на запросы

---

## 🔧 Полезные команды

### Проверка статуса:
```bash
# PM2
pm2 list
pm2 logs optioner-backend-test

# Nginx
sudo systemctl status nginx
sudo nginx -t

# База данных
psql -U test_user -d test_optioner -h localhost
```

### Перезапуск:
```bash
# Backend
pm2 restart optioner-backend-test

# Nginx
sudo systemctl reload nginx
```

### Логи:
```bash
# Backend логи
pm2 logs optioner-backend-test

# Nginx логи
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### Деплой:
```bash
# Автоматический деплой
/var/www/test/scripts/deploy_test.sh

# Или через симлинк
deploy-test
```

---

## 🚨 Troubleshooting

### Backend не запускается:
```bash
# Проверь логи
pm2 logs optioner-backend-test

# Проверь .env файл
cat /var/www/test/backend/.env

# Проверь БД подключение
psql -U test_user -d test_optioner -h localhost
```

### Frontend не загружается:
```bash
# Проверь, что build существует
ls -la /var/www/test/frontend/build

# Пересобери
cd /var/www/test/frontend
npm run build
```

### SSL не работает:
```bash
# Проверь DNS
ping test.optioner.online

# Попробуй снова
sudo certbot --nginx -d test.optioner.online
```

---

## 🎉 Готово!

После выполнения всех шагов:
- ✅ test.optioner.online работает
- ✅ Backend на порту 8001
- ✅ Frontend собран и раздается через Nginx
- ✅ SSL сертификат установлен
- ✅ Скрипт деплоя готов для Андрея

**Следующий шаг:** Настроить SSH доступ для Андрея (см. QUICK_START_TEST_SERVER.md)

---

**Время выполнения:** ~1 час  
**Создано:** 2025-10-10
