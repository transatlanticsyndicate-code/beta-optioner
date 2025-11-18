# ⚡ Быстрое развертывание тестового сервера

**Время:** 15-20 минут  
**Все автоматизировано!**

---

## 🚀 Шаг 1: Скопируй скрипт на сервер (1 мин)

На своей машине выполни:

```bash
cd /Users/levon/Downloads/SYNDICATE/CascadeProjects/windsurf-project
scp scripts/setup_server.sh root@optioner.online:/tmp/
```

---

## 🚀 Шаг 2: Подключись к серверу (1 мин)

```bash
ssh root@optioner.online
```

---

## 🚀 Шаг 3: Запусти автоматическую настройку (10 мин)

```bash
chmod +x /tmp/setup_server.sh
/tmp/setup_server.sh
```

**Скрипт автоматически:**
- ✅ Создаст директории
- ✅ Клонирует проект
- ✅ Создаст тестовую БД
- ✅ Настроит backend (venv, pip install)
- ✅ Соберет frontend (npm install, npm run build)
- ✅ Настроит Nginx
- ✅ Запустит backend через PM2

---

## 🚀 Шаг 4: Добавь OPENAI_API_KEY (2 мин)

```bash
# Скопируй ключ из production
grep OPENAI_API_KEY /home/deploy/app/backend/.env

# Добавь в тестовый .env
nano /var/www/test/backend/.env
# Вставь строку: OPENAI_API_KEY=твой_ключ

# Перезапусти backend
pm2 restart optioner-backend-test
```

---

## 🚀 Шаг 5: Получи SSL сертификат (2 мин)

```bash
sudo certbot --nginx -d test.optioner.online
```

Ответь на вопросы:
- Email: твой email
- Agree to terms: Y
- Redirect HTTP to HTTPS: 2 (Yes)

---

## 🚀 Шаг 6: Проверь работу (2 мин)

```bash
# Проверь API
curl https://test.optioner.online/api/health

# Проверь PM2
pm2 list

# Проверь логи
pm2 logs optioner-backend-test --lines 20
```

**В браузере:**
- Открой: https://test.optioner.online
- Попробуй запрос: SPY, AAPL, TSLA

---

## ✅ Готово!

Если все работает:
- ✅ test.optioner.online открывается
- ✅ Backend отвечает на /api/health
- ✅ PM2 показывает optioner-backend-test (online)
- ✅ SSL работает (https)

---

## 🔧 Полезные команды

```bash
# Статус
pm2 list
pm2 logs optioner-backend-test

# Перезапуск
pm2 restart optioner-backend-test
sudo systemctl reload nginx

# Деплой (после настройки)
deploy-test
```

---

## 🚨 Если что-то не работает

### Backend не запускается:
```bash
pm2 logs optioner-backend-test
# Проверь, добавлен ли OPENAI_API_KEY
cat /var/www/test/backend/.env | grep OPENAI_API_KEY
```

### Frontend не загружается:
```bash
ls -la /var/www/test/frontend/build
# Если пусто, пересобери:
cd /var/www/test/frontend && npm run build
```

### SSL не работает:
```bash
# Проверь DNS
ping test.optioner.online
# Должен отвечать: 89.117.52.143
```

---

## 📞 Нужна помощь?

Напиши мне в чат: "Cascade, помоги с развертыванием" + опиши проблему

---

**Создано:** 2025-10-10  
**Автоматический скрипт:** `scripts/setup_server.sh`
