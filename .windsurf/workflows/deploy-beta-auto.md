---
description: Автоматический деплой на beta сервер с одной командой
---

# Деплой на Beta сервер

Этот workflow автоматизирует весь процесс деплоя на beta.optioner.online

## Что происходит

1. Коммит всех изменений в `origin` (modular-code-methodology)
2. Пуш в `beta` (optioner-beta-deploy2)
3. SSH подключение к серверу (89.117.52.143)
4. Git pull на сервере
5. Перестройка frontend (`npm run build`)
6. Перезагрузка nginx
7. Перезагрузка PM2 процессов

## Использование

```bash
./scripts/deploy-beta.sh "Описание ваших изменений"
```

Пример:
```bash
./scripts/deploy-beta.sh "ТЕСТ ВОЛАТИЛЬНОСТИ: Добавляю debug-информацию для IV"
```

## Требования

- Установлен `sshpass`: `brew install sshpass`
- Git remotes настроены:
  - `origin` → modular-code-methodology
  - `beta` → optioner-beta-deploy2

## Проверка результата

После деплоя:
1. Откройте https://beta.optioner.online
2. Очистите кэш браузера: **Ctrl+Shift+Delete** → "Все время"
3. Или откройте в режиме инкогнито: **Ctrl+Shift+N**

## Если что-то пошло не так

### Изменения не видны
```bash
# Проверить, что build обновлён
sshpass -p 'Z#yyJl7e34sptFij' ssh root@89.117.52.143 \
  "ls -lah /var/www/beta/frontend/build/static/js/main.*.js"
```

### Git push не работает
```bash
# Проверить remotes
git remote -v

# Если beta remote не существует
git remote add beta https://github.com/transatlanticsyndicate-code/optioner-beta-deploy2.git
```

### PM2 процессы не перезагружаются
```bash
# Проверить статус
sshpass -p 'Z#yyJl7e34sptFij' ssh root@89.117.52.143 "pm2 status"

# Перезагрузить вручную
sshpass -p 'Z#yyJl7e34sptFij' ssh root@89.117.52.143 "pm2 restart all"
```

## Структура репозиториев

| Репозиторий | Remote | Назначение |
|-------------|--------|-----------|
| modular-code-methodology | origin | Основной репозиторий разработки |
| optioner-beta-deploy2 | beta | Деплой на beta сервер |

## Сервер Beta

- **IP**: 89.117.52.143
- **Домен**: https://beta.optioner.online
- **Путь**: /var/www/beta
- **Пользователь**: root
- **Пароль**: Z#yyJl7e34sptFij (в переменной BETA_SSH_PASSWORD)

## Подробнее

См. `DEPLOYMENT_QUICK_START.md` и `REPOSITORIES_MAP.md`
