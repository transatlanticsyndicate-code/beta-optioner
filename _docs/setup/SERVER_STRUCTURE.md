# 🏗️ Структура серверов

**Дата обновления:** 15 октября 2025  
**Статус:** ✅ Настроено и работает

---

## 📂 Структура на VPS (89.117.52.143)

### 🟢 Production (optioner.online)

```
Домен: https://optioner.online
Папка: /var/www/production
Ветка: main (только стабильный код)

Frontend:
  - Путь: /var/www/production/frontend/build
  - Nginx root: /var/www/production/frontend/build
  
Backend:
  - Путь: /var/www/production/backend
  - Порт: 8000
  - PM2: optioner-backend-prod
  - Venv: /var/www/production/backend/venv
```

### 🟡 Test (test.optioner.online)

```
Домен: https://test.optioner.online
Папка: /var/www/test
Ветка: любая (feature ветки для тестирования)

Frontend:
  - Путь: /var/www/test/frontend/build
  - Nginx root: /var/www/test/frontend/build
  
Backend:
  - Путь: /var/www/test/backend
  - Порт: 8001
  - PM2: optioner-backend-test
  - Venv: /var/www/test/backend/venv
```

---

## 🔄 Workflow

### Разработка и тестирование

```
1. Работаешь локально
   ↓
2. Коммитишь в feature ветку
   ↓
3. Пушишь в GitHub
   ↓
4. Деплоишь на test: /levon-test
   ↓
5. Тестируешь на test.optioner.online
   ↓
6. Если ОК → создаешь PR
   ↓
7. Мержишь в main
   ↓
8. Деплоишь на production: /levon-deploy-prod
   ↓
9. Проверяешь на optioner.online
```

---

## 🎯 Команды деплоя

### Деплой на тест
```bash
/levon-test
```

**Что делает:**
1. Коммитит изменения
2. Пушит в GitHub
3. Подключается к серверу
4. Переходит в `/var/www/test`
5. Пуллит изменения из текущей ветки
6. Собирает frontend
7. Перезапускает backend (PM2)

### Деплой на production
```bash
/levon-deploy-prod
```

**Что делает:**
1. Подключается к серверу
2. Переходит в `/var/www/production`
3. Пуллит изменения из `main`
4. Собирает frontend
5. Перезапускает backend (PM2)

---

## 📊 PM2 процессы

```bash
pm2 list
```

**Должно быть 2 процесса:**

| ID | Name | Port | Папка | Статус |
|----|------|------|-------|--------|
| 0 | optioner-backend-test | 8001 | /var/www/test | online |
| 1 | optioner-backend-prod | 8000 | /var/www/production | online |

---

## 🌐 Nginx конфигурация

### Production (optioner.online)
```nginx
Файл: /etc/nginx/sites-available/optioner

server {
    listen 443 ssl http2;
    server_name optioner.online www.optioner.online;
    
    root /var/www/production/frontend/build;
    
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
    }
}
```

### Test (test.optioner.online)
```nginx
Файл: /etc/nginx/sites-available/test.optioner.online

server {
    listen 443 ssl;
    server_name test.optioner.online;
    
    root /var/www/test/frontend/build;
    
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
    }
}
```

---

## ✅ Проверка работоспособности

### Production
```bash
# Проверить backend
curl https://optioner.online/api/health

# Проверить frontend
curl -I https://optioner.online
```

### Test
```bash
# Проверить backend
curl https://test.optioner.online/api/health

# Проверить frontend
curl -I https://test.optioner.online
```

---

## 🔧 Полезные команды на сервере

### Подключение
```bash
ssh root@optioner.online
```

### PM2
```bash
# Список процессов
pm2 list

# Логи production
pm2 logs optioner-backend-prod

# Логи test
pm2 logs optioner-backend-test

# Рестарт production
pm2 restart optioner-backend-prod

# Рестарт test
pm2 restart optioner-backend-test
```

### Nginx
```bash
# Проверить конфиг
nginx -t

# Перезагрузить
systemctl reload nginx

# Логи
tail -f /var/log/nginx/error.log
```

### Git
```bash
# Production
cd /var/www/production
git status
git log --oneline -5

# Test
cd /var/www/test
git status
git log --oneline -5
```

---

## 🚨 Важные моменты

1. **Production всегда на main** - никогда не деплой feature веток на production
2. **Test может быть на любой ветке** - для тестирования новых фич
3. **Изоляция** - production и test полностью изолированы:
   - Разные папки
   - Разные порты
   - Разные процессы PM2
   - Разные домены
4. **Безопасность** - всегда тестируй на test перед деплоем на production

---

## 📝 История изменений

### 15 октября 2025
- ✅ Создана папка `/var/www/production`
- ✅ Склонирован код из GitHub
- ✅ Настроен production backend на порту 8000
- ✅ Собран production frontend
- ✅ Исправлен Nginx конфиг для optioner.online
- ✅ Обновлены workflow файлы
- ✅ Production и Test полностью изолированы

### До 15 октября 2025
- ❌ Production и Test смотрели на одну папку `/var/www/test`
- ❌ Не было изоляции между окружениями

---

**Создано:** 15 октября 2025  
**Ответственный:** Cascade AI + Левон
