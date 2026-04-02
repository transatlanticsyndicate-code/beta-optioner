---
description: Сделать коммит, пуш и деплой на beta сервер (полный цикл)
---

# 🚀 Коммит, Пуш и Деплой на Beta

Этот workflow выполняет полный цикл: коммит всех изменений, пуш на GitHub и деплой на beta сервер.

## 📋 Триггеры

Пользователь говорит:
- "закоммить, запушить и задеплоить"
- "commit, push and deploy"
- "сделай деплой"
- "задеплой"
- "deploy"

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
- Frontend: `/var/www/beta/frontend/build/`

## 🔄 Шаги выполнения

### 0. Проверка перед деплоем

**Проверить git статус:**
```bash
git status
```

**Если есть изменения — продолжить. Если чисто — сообщить пользователю.**

**Проверить сборку frontend:**
```bash
cd /Users/andres/Desktop/WINDSURF/beta.optioner.online/frontend
npm run build 2>&1 | tail -20
```

**Ожидаемо:** `Compiled successfully` или `The build folder is ready to be deployed`

### 1. Коммит всех изменений

**Добавить все файлы (кроме .gitignore):**
```bash
git add -A
```

**Создать коммит с описанием:**
```bash
git commit -m "Deploy: автоматический деплой изменений

- Обновление frontend
- Обновление backend
- Документация и таски"
```

**Если нет изменений для коммита:**
```bash
git status
# Если чисто — пропустить коммит, продолжить с пушем
```

### 2. Пуш на GitHub

```bash
git push origin main
```

**Ожидаемо:**
```
To https://github.com/transatlanticsyndicate-code/beta-optioner.git
   <old-hash>..<new-hash>  main -> main
```

### 3. Деплой на beta сервер

#### 3.1. Отправка Frontend Build

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

#### 3.2. Обновление Backend

```bash
ssh root@89.117.52.143 "cd /var/www/beta && git pull origin main"
```

**Ожидаемо:**
```
Updating <old-hash>..<new-hash>
Fast-forward
```

#### 3.3. Перезапуск сервисов

**Backend (PM2):**
```bash
ssh root@89.117.52.143 "pm2 restart optioner-backend-beta"
```

**Frontend (Nginx):**
```bash
ssh root@89.117.52.143 "systemctl reload nginx"
```

### 4. Проверка после деплоя

#### 4.1. Health Check API

```bash
curl -s https://beta.optioner.online/api/health
```

**Ожидаемо:** `{"status":"ok",...}` или HTTP 200/404 (endpoint может отличаться)

#### 4.2. Проверка сайта

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://beta.optioner.online
```

**Ожидаемо:** `200`

#### 4.3. Статус PM2

```bash
ssh root@89.117.52.143 "pm2 status optioner-backend-beta"
```

**Ожидаемо:** `online` в статусе

#### 4.4. Логи (если есть ошибки)

```bash
ssh root@89.117.52.143 "pm2 logs optioner-backend-beta --lines 20 --nostream"
```

## ✅ Финальное сообщение

```
🎉 Деплой завершён!

✅ Изменения закоммичены и отправлены
✅ Frontend собран и отправлен на сервер
✅ Backend обновлён и перезапущен
✅ Сервисы работают корректно

Сайт доступен: https://beta.optioner.online
```

## ⚠️ Обработка ошибок

### Ошибка сборки frontend

**Сообщение:**
```
❌ Ошибка сборки frontend

[вывод ошибки]

Пожалуйста, исправьте ошибки компиляции и попробуйте снова.
```

**Действие:** Остановить деплой

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

### Ошибка PM2

**Сообщение:**
```
❌ Ошибка перезапуска backend

[вывод ошибки]

Проверьте логи:
ssh root@89.117.52.143 "pm2 logs optioner-backend-beta --lines 50"
```

**Действие:** Показать логи, остановить деплой

## 🔐 Безопасность

**Никогда не выводить:**
- Пароли
- SSH ключи
- Токены доступа
- API ключи

**Хранить в секрете:**
- Пароль от сервера
- Приватные SSH ключи
- `.env` файлы

## 📚 Связанные документы

- [`tasks/deploy_agent.md`](../tasks/deploy_agent.md) — таска агента деплоя
- [`DEPLOYMENT.md`](../DEPLOYMENT.md) — полная документация по деплою
- [`.windsurf/rules/deploy-agent.md`](../.windsurf/rules/deploy-agent.md) — правила агента

## 🎯 Примеры использования

### Пользователь: "задеплой"

**Агент:**
```
🚀 Начинаю деплой на beta сервер...

[Проверка]
✅ Frontend готов к сборке
✅ Изменения закоммичены

[Коммит]
✅ Изменения закоммичены (abc1234)

[Пуш]
✅ Отправлено на GitHub

[Деплой]
✅ Frontend отправлен на сервер
✅ Backend обновлён
✅ Сервисы перезапущены

[Проверка]
✅ Health check пройден
✅ Сайт доступен

🎉 Деплой завершён!
https://beta.optioner.online
```

### Пользователь: "сделай коммит, пуш и деплой"

**Агент:** (выполняет тот же workflow)
