# Руководство по деплою

## 🎯 Архитектура

**Один репозиторий + GitHub Actions = автоматический деплой**

| Окружение | Репозиторий | Сервер | Домен |
|-----------|-------------|--------|-------|
| **Разработка** | modular-code-methodology (main) | localhost | localhost:3000 |
| **Beta** | modular-code-methodology (main) | 89.117.52.143 | beta.optioner.online |
| **Тест** | modular-code-methodology (main) | TBD | test.optioner.online |
| **Продакшн** | modular-code-methodology (main) | TBD | optioner.online |

## 🚀 Быстрый деплой на Beta

```bash
# Просто пуш в main — GitHub Actions сделает всё остальное!
git add -A
git commit -m "Описание изменений"
git push origin main
```

## ⚙️ Что делает GitHub Actions

1. Собирает frontend (`npm run build`)
2. Копирует build на сервер (89.117.52.143:/var/www/beta)
3. Обновляет код (`git pull origin main`)
4. Перезагружает nginx и PM2
5. Отправляет статус в GitHub Actions

## 🔐 Безопасность

Пароли хранятся в GitHub Secrets (не видны в логах):
- `BETA_DEPLOY_HOST` = 89.117.52.143
- `BETA_DEPLOY_USER` = root
- `BETA_DEPLOY_PASSWORD` = Z#yyJl7e34sptFij
- `BETA_DEPLOY_PATH` = /var/www/beta

Настройка: `.github/SETUP_SECRETS.md`

## Проверка статуса деплоя

### На GitHub Actions
1. Перейдите на https://github.com/transatlanticsyndicate-code/modular-code-methodology
2. Вкладка "Actions"
3. Найдите последний workflow "Deploy to Beta Server"
4. Посмотрите статус (✅ успех или ❌ ошибка)

### На beta сервере
```bash
# Проверить, что build обновлён
https://beta.optioner.online

# Очистить кэш браузера
Ctrl+Shift+Delete → "Все время"
```

## Структура папок на сервере

```
/var/www/beta/
├── backend/          # Python FastAPI (запущен через PM2)
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
- **Не пушьте в beta remote** — его больше нет!
- Пушьте только в `origin main` — GitHub Actions сделает всё остальное
