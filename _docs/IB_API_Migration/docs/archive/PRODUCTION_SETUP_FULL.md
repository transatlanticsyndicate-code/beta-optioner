# 🚀 Production Setup: Полная инструкция

## Быстрый старт

### 1. Подготовка сервера
```bash
ssh root@your-server-ip
sudo apt update && sudo apt upgrade -y
sudo apt install -y openjdk-11-jre python3 python3-pip git
```

### 2. Установка IB Gateway
```bash
cd /opt
sudo mkdir -p ibgateway
cd ibgateway
sudo wget https://download2.interactivebrokers.com/installers/ibgateway/latest-standalone/ibgateway-latest-standalone-linux-x64.sh
sudo chmod +x ibgateway-latest-standalone-linux-x64.sh
sudo ./ibgateway-latest-standalone-linux-x64.sh -q -dir /opt/ibgateway
```

### 3. Конфигурация
Создать `/opt/ibgateway/jts.ini`:
```ini
[IBGateway]
TradingMode=paper
Username=your_username
PasswordEncrypted=encrypted_password
ApiPort=4001
```

### 4. Systemd Service
Создать `/etc/systemd/system/ibgateway.service`:
```ini
[Unit]
Description=IB Gateway
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ibgateway
ExecStart=/opt/ibgateway/start_gateway.sh
Restart=always

[Install]
WantedBy=multi-user.target
```

Запуск:
```bash
sudo systemctl enable ibgateway
sudo systemctl start ibgateway
```

### 5. Backend
```bash
cd /opt
git clone your-repo
cd windsurf-project
python3 -m venv venv
source venv/bin/activate
pip install ib_insync
```

Connection Manager - см. PRODUCTION_SETUP.md

### 6. Проверка
```bash
sudo systemctl status ibgateway
netstat -tuln | grep 4001
```

## Документация
- Основная: PRODUCTION_SETUP.md
- Миграция: MIGRATION_PLAN_IB_API.md
- Paper Account: IB_PAPER_ACCOUNT_SETUP.md
