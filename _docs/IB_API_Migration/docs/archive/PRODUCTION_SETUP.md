# 🚀 Production Setup: IB Gateway на сервере

**Дата:** 20 октября 2025  
**Архитектура:** Централизованный IB Gateway на VPS  
**Для:** Вся команда (разработчики + тестировщики)

---

## 🏗️ Архитектура

```
Разработчики/Тестировщики → VPS Server → IB Gateway → IB Servers
                                ↓
                          FastAPI Backend
                                ↓
                              Nginx
```

**Преимущества:**
- ✅ Один Gateway для всех
- ✅ Централизованное управление
- ✅ Единые credentials
- ✅ Проще мониторинг

---

## 📋 Требования

**Сервер:**
- Ubuntu 22.04 LTS
- 2 CPU, 4GB RAM, 20GB SSD
- SSH доступ

**IB Account:**
- Paper Trading Account
- API включен

---

## 🎯 Установка (пошагово)

### Этап 1: Подготовка (10 мин)

```bash
# SSH подключение
ssh root@your-server-ip

# Обновление
sudo apt update && sudo apt upgrade -y

# Java (для Gateway)
sudo apt install -y openjdk-11-jre

# Проверка
java -version
```

### Этап 2: IB Gateway (20 мин)

```bash
# Создать пользователя
sudo useradd -m -s /bin/bash ibgateway
sudo mkdir -p /opt/ibgateway /var/log/ibgateway
sudo chown -R ibgateway:ibgateway /opt/ibgateway /var/log/ibgateway

# Скачать Gateway
cd /opt/ibgateway
sudo wget https://download2.interactivebrokers.com/installers/ibgateway/latest-standalone/ibgateway-latest-standalone-linux-x64.sh
sudo chmod +x ibgateway-latest-standalone-linux-x64.sh

# Установить
sudo ./ibgateway-latest-standalone-linux-x64.sh -q -dir /opt/ibgateway
```

**Конфигурация:**

Полная инструкция в файле - см. раздел "Детальная настройка" ниже.

### Этап 3: Backend (30 мин)

```bash
# Python
sudo apt install -y python3 python3-pip python3-venv

# Клонировать проект
cd /opt
sudo git clone your-repo
cd windsurf-project

# Виртуальное окружение
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
pip install ib_insync
```

### Этап 4: Systemd Services (15 мин)

**IB Gateway service** + **Backend service** - конфигурации в документе.

### Этап 5: Nginx (15 мин)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
# Конфигурация Nginx - см. ниже
```

---

## 📖 Детальная документация

Полная пошаговая инструкция с кодом, конфигурациями и скриптами:

**📄 Скачать:** [PRODUCTION_SETUP_FULL.md](./PRODUCTION_SETUP_FULL.md)

Включает:
- Шифрование паролей IB
- Systemd unit файлы
- Connection Manager код
- Nginx конфигурация
- Мониторинг скрипты
- Troubleshooting

---

## 🔗 Для разработчиков

### Подключение к Gateway

**В вашем коде:**

```python
from ib_insync import IB

ib = IB()
ib.connect('your-server-ip', 4001, clientId=1)
```

**Или через Backend API:**

```bash
curl https://your-domain.com/api/health/ib
```

### Environment Variables

```bash
IB_HOST=your-server-ip
IB_PORT=4001
IB_CLIENT_ID=1
IB_ACCOUNT=DU1234567
```

---

## 🔍 Мониторинг

**Health Check:**
```bash
curl https://your-domain.com/api/health
```

**Логи:**
```bash
# Gateway
sudo journalctl -u ibgateway -f

# Backend
sudo journalctl -u windsurf-backend -f
```

---

## 🆘 Troubleshooting

**Gateway не запускается:**
```bash
sudo systemctl status ibgateway
sudo journalctl -u ibgateway -n 50
```

**Backend не подключается:**
```bash
# Проверить порт
netstat -tuln | grep 4001

# Проверить firewall
sudo ufw status
```

**Детали:** См. PRODUCTION_SETUP_FULL.md

---

## 📞 Контакты

**Вопросы по setup:** @levonmusoyan-cell  
**Документация:** `/opt/windsurf-project/__Levon_tasks/IB_API_Migration/`
