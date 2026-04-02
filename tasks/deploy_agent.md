# 🚀 Деплой на Beta сервер

**Статус:** 🟡 Готов к деплою

---

## 📋 Описание задачи

Автоматический деплой изменений на beta сервер (beta.optioner.online).

**Изменения:**
1. ✅ Исправление кнопки сброса калькулятора (принудительная перезагрузка)
2. ✅ Исправление перерасчёта IV от Fact IV (manualIvOverride)

**Что сделано:**
- Frontend собран (`npm run build` ✅)
- Изменения в `UniversalOptionsCalculator.jsx` (кнопка сброса)
- Изменения в `OptionsTableV3.jsx` (сохранение `manualIvOverrideDate`)
- Изменения в `volatilitySurface.js` (перерасчёт IV)

---

##  Команды для деплоя

### 1. Отправить Build на сервер

```bash
rsync -avz --delete \
  /Users/andres/Desktop/WINDSURF/beta.optioner.online/frontend/build/ \
  root@89.117.52.143:/var/www/beta/frontend/build/
```

### 2. Обновить Backend

```bash
ssh root@89.117.52.143 "cd /var/www/beta && git pull origin main"
```

### 3. Перезапустить Backend

```bash
ssh root@89.117.52.143 "pm2 restart beta-backend"
```

### 4. Проверить

```bash
curl https://beta.optioner.online/api/health
```

---

## ✅ Чек-лист

- [x] Frontend собран
- [ ] Build отправлен на сервер
- [ ] Backend обновлён
- [ ] Сервисы перезапущены
- [ ] Health check пройден

---

## 📝 План работ

### 1. Сборка Frontend

```bash
cd /Users/andres/Desktop/WINDSURF/beta.optioner.online/frontend
npm run build
```

**Ожидаемо:**
- Создаётся папка `build/`
- Все файлы минифицированы и оптимизированы
- Нет ошибок компиляции

### 2. Отправка на сервер

**Команда:**
```bash
rsync -avz --delete ./build/ root@89.117.52.143:/var/www/beta/frontend/build/
```

**Параметры:**
- `-a` — archive mode (сохраняет права, ссылки и т.д.)
- `-v` — verbose (подробный вывод)
- `-z` — сжатие при передаче
- `--delete` — удалять файлы на сервере, если они удалены локально

### 3. Обновление Backend

**SSH команда:**
```bash
ssh root@89.117.52.143 "cd /var/www/beta && git pull origin main"
```

**Ожидаемо:**
- Код на сервере обновляется
- Нет конфликтов слияния

### 4. Перезапуск сервисов

**Backend (PM2):**
```bash
ssh root@89.117.52.143 "pm2 restart beta-backend"
```

**Frontend (Nginx):**
```bash
ssh root@89.117.52.143 "systemctl reload nginx"
```

### 5. Проверка

**Health check:**
```bash
curl -s https://beta.optioner.online/api/health
```

**Ожидаемо:**
```json
{"status": "ok", "timestamp": "2026-04-02T..."}
```

---

## 🔐 Доступы

**Сервер:**
- Хост: `89.117.52.143`
- Пользователь: `root`
- Пароль: (хранится в менеджере паролей)

**Проект:**
- Директория: `/var/www/beta/`
- Backend порт: `8002`
- Frontend: Nginx (порт 443, HTTPS)

---

## ⚠️ Важные замечания

1. **Перед деплоем:**
   - Убедиться, что все изменения закоммичены
   - Проверить, что frontend собирается без ошибок
   - Предупредить пользователя о деплое

2. **Во время деплоя:**
   - Сайт может быть недоступен 10-30 секунд
   - Не прерывать процесс деплоя

3. **После деплоя:**
   - Проверить, что сайт доступен
   - Проверить логи на ошибки
   - Сообщить пользователю о результате

---

## 🚨 Если что-то пошло не так

### Деплой не удался

**Проверить:**
1. Есть ли доступ к серверу по SSH
2. Свободно ли место на сервере (`df -h`)
3. Нет ли ошибок в логах (`pm2 logs`, `nginx error.log`)

### Откат деплоя

```bash
# Найти последний удачный коммит
git log --oneline

# Откатиться
git revert HEAD
git push origin main

# Или на сервере
ssh root@89.117.52.143
cd /var/www/beta
git checkout <commit-hash>
pm2 restart beta-backend
```

---

##  Чек-лист деплоя

- [ ] Frontend собран без ошибок
- [ ] Build отправлен на сервер
- [ ] Backend обновлён (git pull)
- [ ] Сервисы перезапущены (PM2, Nginx)
- [ ] Health check пройден
- [ ] Сайт доступен (https://beta.optioner.online)
- [ ] Пользователь уведомлён

---

## 🎯 Команды для агента

**Пользователь говорит:** "задеплой" или "deploy"

**Агент отвечает:**
```
Начинаю деплой на beta сервер...

✅ Frontend собран
✅ Build отправлен на сервер
✅ Backend обновлён
✅ Сервисы перезапущены
✅ Health check пройден

Деплой завершён! ✅
Сайт доступен: https://beta.optioner.online
```

---

## 📚 Связанные файлы

- `/Users/andres/Desktop/WINDSURF/beta.optioner.online/scripts/deploy_beta.sh` — скрипт деплоя
- `/Users/andres/Desktop/WINDSURF/beta.optioner.online/DEPLOYMENT.md` — документация по деплою
- `/Users/andres/Desktop/WINDSURF/beta.optioner.online/backend/deploy_script.py` — Python скрипт деплоя
