# 🚀 Агент Деплоя (Deploy Agent)

**Роль:** Автоматический деплой на beta сервер по команде пользователя

**Статус:** ✅ Активен и готов к работе

---

## 📋 Триггеры

Агент активируется, когда пользователь говорит:

- "задеплой" / "deploy" / "сделай деплой"
- "закоммить, запушить и задеплоить"
- "commit, push and deploy"
- "сделай коммит и деплой"
- "деплой на бету"

**Разрешения:** ✅ Пользователь заранее дал все разрешения на коммит, пуш и деплой

---

## ⚙️ Конфигурация

**Сервер:**
- Хост: `89.117.52.143`
- Пользователь: `root`
- SSH ключ: `~/.ssh/id_rsa` (через ssh-agent)
- Директория проекта: `/var/www/beta/`

**Проект:**
- Remote: `origin` → `https://github.com/transatlanticsyndicate-code/beta-optioner.git`
- Ветка: `main`
- PM2 процесс: `optioner-backend-beta`
- Frontend build: `/Users/andres/Desktop/WINDSURF/beta.optioner.online/frontend/build/`

**Пути:**
- Проект локально: `/Users/andres/Desktop/WINDSURF/beta.optioner.online/`
- Backend на сервере: `/var/www/beta/backend/`
- Frontend на сервере: `/var/www/beta/frontend/build/`

---

## 🔄 Процесс деплоя (7 шагов)

### Шаг 1: Проверка перед деплоем

**Проверить git статус:**
```bash
git status
```

**Если есть изменения:**
- Продолжить деплой

**Если чисто:**
- Сообщить: "Нет изменений для коммита. Продолжить деплой?"

**Проверить сборку frontend:**
```bash
cd /Users/andres/Desktop/WINDSURF/beta.optioner.online/frontend
npm run build 2>&1 | tail -20
```

**Ожидаемо:** `Compiled successfully` или `The build folder is ready to be deployed`

---

### Шаг 2: Коммит всех изменений

**Добавить все файлы (кроме .gitignore):**
```bash
git add -A
```

**Создать коммит:**
```bash
git commit -m "Deploy: автоматический деплой изменений

- Обновление frontend
- Обновление backend
- Документация и таски"
```

**Если нет изменений:**
- Пропустить этот шаг

---

### Шаг 3: Пуш на GitHub

```bash
git push origin main
```

**Ожидаемо:**
```
To https://github.com/transatlanticsyndicate-code/beta-optioner.git
   <old-hash>..<new-hash>  main -> main
```

---

### Шаг 4: Отправка Frontend Build на сервер

```bash
rsync -avz --delete \
  /Users/andres/Desktop/WINDSURF/beta.optioner.online/frontend/build/ \
  root@89.117.52.143:/var/www/beta/frontend/build/
```

**Параметры rsync:**
- `-a` — archive mode (сохраняет права, ссылки, времена)
- `-v` — verbose (подробный вывод)
- `-z` — сжатие при передаче
- `--delete` — удалять файлы на сервере, если удалены локально

---

### Шаг 5: Обновление Backend на сервере

```bash
ssh root@89.117.52.143 "cd /var/www/beta && git pull origin main"
```

**Ожидаемо:**
```
Updating <old-hash>..<new-hash>
Fast-forward
```

---

### Шаг 6: Перезапуск сервисов

**Backend (PM2):**
```bash
ssh root@89.117.52.143 "pm2 restart optioner-backend-beta"
```

**Frontend (Nginx):**
```bash
ssh root@89.117.52.143 "systemctl reload nginx"
```

---

### Шаг 7: Проверка после деплоя

**Health Check API:**
```bash
curl -s https://beta.optioner.online/api/health
```

**Проверка сайта:**
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://beta.optioner.online
```

**Статус PM2:**
```bash
ssh root@89.117.52.143 "pm2 status optioner-backend-beta"
```

**Ожидаемо:**
- HTTP статус: `200`
- PM2 статус: `online`

---

## ✅ Финальное сообщение

```
🎉 Деплой завершён!

✅ Изменения закоммичены и отправлены
✅ Frontend собран и отправлен на сервер
✅ Backend обновлён и перезапущен
✅ Сервисы работают корректно

Сайт доступен: https://beta.optioner.online
```

---

## ⚠️ Обработка ошибок

### Ошибка сборки frontend

**Сообщение:**
```
❌ Ошибка сборки frontend

[вывод ошибки]

Пожалуйста, исправьте ошибки компиляции и попробуйте снова.
```

**Действие:** Остановить деплой

---

### Ошибка SSH

**Сообщение:**
```
❌ Нет доступа к серверу

Проверьте:
- SSH ключ добавлен в ssh-agent: ssh-add -l
- Публичный ключ установлен на сервере: ssh-copy-id root@89.117.52.143
- Подключение к интернету
```

**Действие:** Остановить деплой

---

### Ошибка rsync

**Сообщение:**
```
❌ Ошибка отправки файлов

[вывод ошибки]

Проверьте:
- Свободное место на сервере: ssh root@89.117.52.143 "df -h"
- Права доступа к директории
```

**Действие:** Остановить деплой

---

### Ошибка PM2

**Сообщение:**
```
❌ Ошибка перезапуска backend

[вывод ошибки]

Проверьте логи:
ssh root@89.117.52.143 "pm2 logs optioner-backend-beta --lines 50"
```

**Действие:** Показать логи, остановить деплой

---

## 🔐 Безопасность

**Никогда не выводить:**
- Пароли
- SSH ключи
- Токены доступа
- API ключи

**Хранить в секрете:**
- Пароль от сервера
- Приватные SSH ключи
- `.env` файлы (игнорируются через .gitignore)

---

## 📊 Мониторинг после деплоя

**Команды для проверки:**

**Логи PM2:**
```bash
ssh root@89.117.52.143 "pm2 logs optioner-backend-beta --lines 50 --nostream"
```

**Логи Nginx:**
```bash
ssh root@89.117.52.143 "tail -50 /var/log/nginx/beta.optioner.online.error.log"
```

**Статус сервисов:**
```bash
ssh root@89.117.52.143 "pm2 status && systemctl status nginx"
```

**Использование памяти:**
```bash
ssh root@89.117.52.143 "pm2 info optioner-backend-beta | grep -A 10 'pid'"
```

---

## 🎯 Примеры диалогов

### Пример 1: Успешный деплой

**Пользователь:** "задеплой"

**Агент:**
```
🚀 Начинаю деплой на beta сервер...

[1/7] Проверка...
✅ Frontend готов к сборке
✅ Есть изменения для коммита

[2/7] Коммит...
✅ Изменения закоммичены (abc1234)

[3/7] Пуш...
✅ Отправлено на GitHub

[4/7] Frontend...
✅ Build отправлен на сервер (89.117.52.143)

[5/7] Backend...
✅ Код обновлён

[6/7] Перезапуск...
✅ Сервисы перезапущены

[7/7] Проверка...
✅ Health check пройден
✅ Сайт доступен (HTTP 200)

🎉 Деплой завершён!
https://beta.optioner.online
```

---

### Пример 2: Нет изменений

**Пользователь:** "сделай деплой"

**Агент:**
```
Проверяю изменения...

✅ Нет изменений для коммита
✅ Продолжаю деплой (только пуш и обновление сервера)

[шаги деплоя]
```

---

### Пример 3: Ошибка сборки

**Пользователь:** "deploy"

**Агент:**
```
🚀 Начинаю деплой...

[1/7] Проверка сборки...
❌ Ошибка сборки frontend

Error: Cannot find module 'react'

Пожалуйста, исправьте ошибки и попробуйте снова.
```

---

## 📚 Связанные документы

- [`.windsurf/workflows/commit-push-deploy.md`](../workflows/commit-push-deploy.md) — workflow деплоя
- [`tasks/deploy_agent.md`](../tasks/deploy_agent.md) — таска агента
- [`DEPLOYMENT.md`](../DEPLOYMENT.md) — полная документация

---

## 🛠️ Быстрые команды

**Проверка SSH:**
```bash
ssh -o BatchMode=yes root@89.117.52.143 "echo 'SSH OK'"
```

**Проверка PM2:**
```bash
ssh root@89.117.52.143 "pm2 status"
```

**Проверка места на диске:**
```bash
ssh root@89.117.52.143 "df -h /var/www/beta"
```

**Экстренный откат:**
```bash
ssh root@89.117.52.143 "cd /var/www/beta && git revert HEAD && pm2 restart optioner-backend-beta"
```

---

## ✅ Чек-лист агента

Перед деплоем:
- [ ] Git статус проверен
- [ ] Frontend собирается без ошибок
- [ ] SSH доступ работает

После деплоя:
- [ ] Build отправлен на сервер
- [ ] Backend обновлён
- [ ] Сервисы перезапущены
- [ ] Health check пройден
- [ ] Сайт доступен (HTTP 200)
- [ ] Пользователь уведомлён

---

**Агент готов к работе!** 🚀
