# Команды для работы на сервере

После подключения через Remote-SSH используйте эти команды:

## Пересобрать и перезапустить frontend

```bash
cd /var/www/test/frontend && npm run build && pm2 restart optioner-frontend-test
```

## Посмотреть логи frontend

```bash
pm2 logs optioner-frontend-test
```

## Посмотреть статус серверов

```bash
pm2 list
```

## Обновить код с GitHub

```bash
cd /var/www/test && git pull origin main
```

---

## Быстрый workflow:

1. Редактируете файлы в `/var/www/test/frontend/src/`
2. Сохраняете (Ctrl+S)
3. В терминале: `cd /var/www/test/frontend && npm run build && pm2 restart optioner-frontend-test`
4. Проверяете: https://test.optioner.online
