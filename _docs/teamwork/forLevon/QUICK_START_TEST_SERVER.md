# ⚡ Быстрый старт: Развертывание тестового сервера

**Время:** 1 час 15 минут  
**Результат:** Андрей деплоит и тестирует САМ

---

## 🎯 Твои задачи (25 минут)

### 1. Создай пользователя для Андрея (5 мин)
```bash
ssh root@optioner.online

sudo adduser andrey
sudo usermod -aG sudo andrey
sudo mkdir -p /var/www/test
sudo chown -R andrey:andrey /var/www/test
```

### 2. Создай SSH ключ (5 мин)
```bash
ssh-keygen -t rsa -b 4096 -C "andrey@optioner.online" -f /root/.ssh/andrey_key

sudo mkdir -p /home/andrey/.ssh
sudo cp /root/.ssh/andrey_key.pub /home/andrey/.ssh/authorized_keys
sudo chown -R andrey:andrey /home/andrey/.ssh
sudo chmod 700 /home/andrey/.ssh
sudo chmod 600 /home/andrey/.ssh/authorized_keys
```

### 3. Скачай и отправь ключ Андрею (5 мин)
```bash
# На своей машине
scp root@optioner.online:/root/.ssh/andrey_key ~/Downloads/andrey_key

# Отправь файл Андрею (Telegram/Email)
```

### 4. Настрой DNS (5 мин)
- Зайди в панель управления доменом
- Добавь A-запись: `test.optioner.online` → `89.117.52.143`
- Подожди 5-10 минут

### 5. Проверь доступ (5 мин)
Попроси Андрея выполнить:
```bash
ssh -i andrey_key andrey@optioner.online
cd /var/www/test
touch test.txt  # Должно работать
rm test.txt
```

---

## 🤖 Задачи для Cascade (50 минут)

Скажи мне:

**"Cascade, настрой тестовый сервер для test.optioner.online"**

Я сделаю:
1. ✅ Nginx конфигурация
2. ✅ SSL сертификат (Let's Encrypt)
3. ✅ Тестовая БД (test_optioner)
4. ✅ PM2 для backend на порту 8001
5. ✅ Скрипт деплоя `/var/www/test/deploy.sh`
6. ✅ Обновление команды `/andrey-test`

---

## ✅ Проверка

После всех настроек:

```bash
# 1. Проверь DNS
ping test.optioner.online

# 2. Проверь сайт
curl https://test.optioner.online

# 3. Андрей делает первый деплой
/andrey-test

# 4. Проверь в браузере
https://test.optioner.online
```

---

## 🎉 Готово!

Теперь Андрей может:
- Работать в v0.app
- Деплоить через `/andrey-test`
- Тестировать на `test.optioner.online`
- Создавать PR когда доволен

**Ты больше не участвуешь в тестировании!**

---

**Полное ТЗ:** [TZ_TEST_SERVER.md](./TZ_TEST_SERVER.md)
