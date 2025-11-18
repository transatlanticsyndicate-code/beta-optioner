# ✅ Сводка: Моя часть работы выполнена

**Дата:** 2025-10-10  
**Статус:** Готово к развертыванию

---

## 📦 Созданные файлы

### 1. **nginx.test.conf**
Nginx конфигурация для test.optioner.online:
- Frontend: `/var/www/test/frontend/build`
- Backend API: проксирование на порт 8001
- Увеличенные таймауты для AI запросов (10 минут)

### 2. **ecosystem.test.config.js**
PM2 конфигурация для тестового backend:
- Имя процесса: `optioner-backend-test`
- Порт: 8001
- Переменные окружения для тестовой БД
- Логи: `/var/www/test/logs/`

### 3. **backend/.env.test**
Переменные окружения для тестового backend:
- DATABASE_URL для test_optioner
- PORT=8001
- ENVIRONMENT=test
- CORS для test.optioner.online

### 4. **scripts/setup_test_db.sql**
SQL скрипт для создания тестовой БД:
- Создает пользователя `test_user`
- Создает БД `test_optioner`
- Настраивает права доступа

### 5. **scripts/deploy_test.sh**
Автоматический скрипт деплоя:
- Git pull
- Backend: pip install + PM2 restart
- Frontend: npm install + npm run build
- Цветной вывод прогресса

### 6. **scripts/DEPLOY_INSTRUCTIONS.md**
Подробная инструкция по развертыванию:
- 10 шагов с командами
- Чеклист выполнения
- Troubleshooting
- Полезные команды

### 7. **Обновлена команда `/andrey-test`**
Упрощена для использования скрипта деплоя:
- Коммит → Пуш → SSH деплой одной командой

---

## 🎯 Что нужно сделать ТЕБЕ

### Быстрый вариант (следуй инструкции):

Открой и выполни по шагам:
```
scripts/DEPLOY_INSTRUCTIONS.md
```

### Основные шаги:

1. **Подготовка сервера** (10 мин)
   ```bash
   ssh root@optioner.online
   sudo mkdir -p /var/www/test /var/www/test/logs
   ```

2. **Клонирование проекта** (5 мин)
   ```bash
   cd /var/www/test
   git clone https://github.com/levonmusoyan-cell/syn1.git .
   ```

3. **Создание тестовой БД** (5 мин)
   ```bash
   sudo -u postgres psql < scripts/setup_test_db.sql
   ```

4. **Настройка Backend** (10 мин)
   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   cp .env.test .env
   # Добавь OPENAI_API_KEY в .env
   ```

5. **Настройка Frontend** (10 мин)
   ```bash
   cd ../frontend
   npm install
   npm run build
   ```

6. **Настройка Nginx** (5 мин)
   ```bash
   # Скопируй nginx.test.conf на сервер
   sudo cp nginx.test.conf /etc/nginx/sites-available/test.optioner.online
   sudo ln -s /etc/nginx/sites-available/test.optioner.online /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

7. **DNS настройка** (5 мин)
   - Добавь A-запись: `test.optioner.online` → `89.117.52.143`

8. **SSL сертификат** (5 мин)
   ```bash
   sudo certbot --nginx -d test.optioner.online
   ```

9. **Запуск Backend** (5 мин)
   ```bash
   cd /var/www/test
   pm2 start ecosystem.test.config.js
   pm2 save
   ```

10. **Проверка** (5 мин)
    ```bash
    curl https://test.optioner.online/api/health
    # Открой в браузере: https://test.optioner.online
    ```

---

## ⏱️ Время выполнения

**Моя часть (Cascade):** Выполнено ✅  
**Твоя часть (Левон):** ~1 час

---

## 📊 Архитектура

```
VPS (89.117.52.143)
├── Production (optioner.online)
│   ├── Frontend: /home/deploy/app/frontend/build
│   └── Backend: порт 8000
│
└── Test (test.optioner.online)
    ├── Frontend: /var/www/test/frontend/build
    └── Backend: порт 8001 (PM2: optioner-backend-test)
    └── БД: test_optioner (user: test_user)
```

---

## ✅ Чеклист для тебя

- [ ] Выполнил все 10 шагов из DEPLOY_INSTRUCTIONS.md
- [ ] test.optioner.online открывается в браузере
- [ ] Backend отвечает на /api/health
- [ ] PM2 показывает optioner-backend-test (online)
- [ ] SSL сертификат установлен (https работает)
- [ ] Скрипт deploy_test.sh работает

---

## 🚀 После развертывания

### Для Андрея (позже):

1. Создай SSH ключ для Андрея
2. Отправь ему ключ
3. Андрей сможет использовать `/andrey-test`

### Команда для Андрея:
```bash
/andrey-test
# Автоматически: коммит → пуш → деплой на test.optioner.online
```

---

## 🔧 Полезные команды

### Проверка статуса:
```bash
ssh root@optioner.online
pm2 list
pm2 logs optioner-backend-test
sudo systemctl status nginx
```

### Деплой:
```bash
ssh root@optioner.online '/var/www/test/scripts/deploy_test.sh'
```

### Перезапуск:
```bash
pm2 restart optioner-backend-test
sudo systemctl reload nginx
```

---

## 📞 Если что-то не работает

Смотри раздел **Troubleshooting** в `DEPLOY_INSTRUCTIONS.md`

Или напиши мне: "Cascade, помоги с развертыванием" + опиши проблему

---

## 🎉 Результат

После выполнения:
- ✅ test.optioner.online работает
- ✅ Андрей сможет деплоить САМ
- ✅ Андрей тестирует САМ
- ✅ Ты не участвуешь в тестировании
- ✅ Production изолирован от тестов

**Время от изменения до теста: 5-10 минут**

---

**Моя часть выполнена! Теперь твоя очередь 🚀**
