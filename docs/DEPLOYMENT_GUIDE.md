# Руководство по деплою

## Структура репозиториев и серверов

| Окружение | Репозиторий | Remote | Сервер | Домен |
|-----------|-------------|--------|--------|-------|
| **Разработка** | modular-code-methodology | origin | localhost | localhost:3000 |
| **Beta** | optioner-beta-deploy2 | beta | 89.117.52.143 | beta.optioner.online |
| **Тест** | optioner-test-deploy | test | TBD | test.optioner.online |
| **Продакшн** | optioner-prod-deploy | prod | TBD | optioner.online |

## Быстрый деплой на Beta

```bash
# 1. Коммит и пуш в основной репозиторий
git add -A
git commit -m "Описание изменений"
git push origin main

# 2. Пуш в beta репозиторий
git push beta main

# 3. Запустить скрипт деплоя (автоматический)
./scripts/deploy-beta.sh
```

## Что делает deploy-beta.sh

1. SSH подключение к серверу (89.117.52.143)
2. `git pull origin main` в `/var/www/beta`
3. `npm run build` для frontend
4. `systemctl reload nginx` для обновления статики
5. `pm2 restart all` для перезагрузки backend

## Переменные окружения

Пароль SSH хранится в переменной `BETA_SSH_PASSWORD`:
```bash
export BETA_SSH_PASSWORD="Z#yyJl7e34sptFij"
```

## Проверка статуса

```bash
# Локально
curl http://localhost:3000
curl http://localhost:8000/health

# Beta
curl https://beta.optioner.online
curl https://beta.optioner.online/api/health
```

## Структура папок на сервере

```
/var/www/beta/
├── backend/          # Python FastAPI
├── frontend/         # React
│   ├── src/
│   └── build/        # Production build (подаётся nginx)
└── .git/
```

## Важно!

- **Никогда** не редактируй код на сервере напрямую
- Все изменения должны идти через git
- Frontend кэшируется nginx (expires 1y для статики)
- Для очистки кэша браузера: Ctrl+Shift+Delete → "Все время"
