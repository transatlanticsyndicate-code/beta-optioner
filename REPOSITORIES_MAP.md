# 🗺️ Архитектура: один репозиторий, автоматический деплой

## Репозиторий на GitHub

| Название | URL | Назначение |
|----------|-----|-----------|
| **modular-code-methodology** | https://github.com/transatlanticsyndicate-code/modular-code-methodology | Единственный репозиторий разработки |

**Деплой автоматизирован через GitHub Actions** — не нужны отдельные репозитории для каждого окружения!

## Серверы и домены

| Окружение | IP | Домен | Путь | Статус |
|-----------|-------|--------|------|--------|
| **Разработка** | localhost | localhost:3000 | - | ✅ Локально |
| **Beta** | 89.117.52.143 | https://beta.optioner.online | /var/www/beta | ✅ Активен |
| **Тест** | TBD | https://test.optioner.online | TBD | ⏳ Не настроен |
| **Продакшн** | TBD | https://optioner.online | TBD | ⏳ Не настроен |

## Поток разработки и деплоя

```
┌─────────────────────────────────────────────────────────────┐
│ 1. ЛОКАЛЬНАЯ РАЗРАБОТКА                                     │
│    - Редактируем код в /Users/andres/Desktop/WINDSURF/...   │
│    - Тестируем на localhost:3000 и localhost:8000           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. КОММИТ И ПУШ                                             │
│    git add -A                                               │
│    git commit -m "Описание"                                 │
│    git push origin main                                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. GITHUB ACTIONS АВТОМАТИЧЕСКИ ДЕПЛОИТ                     │
│    - Собирает frontend (npm run build)                      │
│    - Копирует build на 89.117.52.143:/var/www/beta         │
│    - Обновляет код (git pull)                              │
│    - Перезагружает nginx и PM2                             │
│    (Всё происходит автоматически!)                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. ПРОВЕРКА НА BETA                                         │
│    https://beta.optioner.online                             │
│    - Очистить кэш браузера: Ctrl+Shift+Delete              │
│    - Или открыть в режиме инкогнито                        │
│    - Проверить Actions вкладку на GitHub                   │
└─────────────────────────────────────────────────────────────┘
```

## Структура папок на сервере

```
/var/www/beta/
├── backend/
│   ├── app/
│   ├── venv/
│   ├── requirements.txt
│   └── main.py
├── frontend/
│   ├── src/
│   ├── public/
│   ├── build/                    ← Подаётся nginx
│   │   ├── index.html
│   │   ├── static/
│   │   │   ├── js/main.*.js      ← Кэшируется на 1 год
│   │   │   └── css/
│   │   └── ...
│   ├── package.json
│   └── node_modules/
├── .git/
├── docker-compose.yml (если используется)
└── pm2-ecosystem.config.js (если используется)
```

## Как работает на сервере

### Frontend
- **Сборка**: `npm run build` → создаёт `/var/www/beta/frontend/build`
- **Подача**: nginx читает из `/var/www/beta/frontend/build`
- **Кэширование**: 
  - HTML (index.html) → кэшируется браузером
  - JS/CSS → кэшируется на 1 год (expires 1y)

### Backend
- **Запуск**: PM2 управляет процессом Python
- **Команда**: `python -m uvicorn app.main:app --host 0.0.0.0 --port 8002`
- **Перезагрузка**: `pm2 restart all`

## Команды для работы

### Локально
```bash
# Запуск серверов
npm start                          # Frontend на localhost:3000
python -m uvicorn app.main:app    # Backend на localhost:8000

# Деплой на beta (просто пуш в main!)
git add -A
git commit -m "Описание"
git push origin main               # GitHub Actions сделает всё остальное

# Проверка статуса
git remote -v
git log --oneline -5
```

### Проверка деплоя
```bash
# На GitHub Actions
https://github.com/transatlanticsyndicate-code/modular-code-methodology/actions

# На beta сервере
https://beta.optioner.online
```

## Проблемы и решения

### Изменения не видны на beta.optioner.online
1. Очистить кэш браузера: **Ctrl+Shift+Delete** → "Все время"
2. Открыть в режиме инкогнито: **Ctrl+Shift+N**
3. Проверить, что build обновлён на сервере

### Git push не работает
```bash
# Проверить remotes
git remote -v

# Если beta remote не существует, добавить
git remote add beta https://github.com/transatlanticsyndicate-code/optioner-beta-deploy2.git
```

### PM2 процессы не перезагружаются
```bash
# Проверить статус
sshpass -p 'Z#yyJl7e34sptFij' ssh root@89.117.52.143 "pm2 status"

# Перезагрузить вручную
sshpass -p 'Z#yyJl7e34sptFij' ssh root@89.117.52.143 "pm2 restart all"
```

## Пароль SSH

```
root@89.117.52.143
Пароль: Z#yyJl7e34sptFij
```

⚠️ **Не коммитьте пароль в git!** Используйте переменную окружения:
```bash
export BETA_SSH_PASSWORD="Z#yyJl7e34sptFij"
```
