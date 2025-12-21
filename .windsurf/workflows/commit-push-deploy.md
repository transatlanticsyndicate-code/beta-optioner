---
description: Сделать коммит, пуш и деплой на тестовый сервер
---

# Коммит, Пуш и Деплой

Этот workflow выполняет полный цикл: коммит изменений, пуш на GitHub и деплой на тестовый сервер.

## Шаги выполнения

### 1. Коммит изменений
```bash
git add -A && git commit -m "update"
```

### 2. Пуш на GitHub
```bash
git push origin main
```

### 3. Деплой на тестовый сервер
```bash
ssh -o StrictHostKeyChecking=no -i ~/.ssh/id_optioner_deploy root@89.117.52.143 "cd /var/www/test && git pull origin main && cd frontend && npm run build && pm2 restart optioner-backend-test && echo 'Deploy completed!'"
```

## Проверка
- Тестовый сервер: https://test.optioner.online
- Продакшн сервер: https://optioner.online

## Примечания
- SSH ключ: `~/.ssh/id_optioner_deploy`
- IP сервера: `89.117.52.143`
- PM2 процесс: `optioner-backend-test`
