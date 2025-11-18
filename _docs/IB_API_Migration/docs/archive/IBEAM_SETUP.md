# 🐳 IBEAM Setup Guide

**IBEAM** - Docker контейнер для автоматизации Interactive Brokers Client Portal Gateway

**Статус:** ✅ Установлен на production (89.117.52.143), test, и локально для разработки

---

## 🚀 БЫСТРЫЙ СТАРТ

### Для локальной разработки (твоя машина)

**Требования:**
- Docker Desktop установлен
- macOS или Linux

**Установка:**

```bash
# 1. Создать директорию
mkdir -p ~/ibeam-local
cd ~/ibeam-local

# 2. Создать docker-compose.yml
cat > docker-compose.yml << 'EOF'
services:
  ibeam:
    image: voyz/ibeam:latest
    container_name: ibeam-local
    restart: unless-stopped
    
    environment:
      IBEAM_ACCOUNT: bogda6172
      IBEAM_PASSWORD: 19642014angel
      IBEAM_TRADING_MODE: paper
      
    ports:
      - '5000:5000'
    
    volumes:
      - ./outputs:/srv/ibeam/outputs
      - ./inputs:/srv/ibeam/inputs
EOF

# 3. Запустить IBEAM
docker compose up -d

# 4. Проверить логи
docker compose logs -f

# 5. Дождаться сообщения "Gateway running and authenticated"
```

**Проверка:**
```bash
# Проверить, что IBEAM работает
curl -k -s https://localhost:5000/v1/api/tickle | head -20

# Должен вернуть JSON с информацией о сессии
```

**Остановка:**
```bash
cd ~/ibeam-local
docker compose down
```

---

### Для Андрея (Frontend разработка)

**Инструкция для развертывания IBEAM локально:**

Эта инструкция для твоего ИИ помощника (Cascade):

```bash
# 1. Установить Docker Desktop (если не установлен)
#    macOS: https://www.docker.com/products/docker-desktop
#    Linux: sudo apt-get install docker.io

# 2. Создать директорию и файл конфигурации
mkdir -p ~/ibeam-local
cd ~/ibeam-local

cat > docker-compose.yml << 'EOF'
services:
  ibeam:
    image: voyz/ibeam:latest
    container_name: ibeam-local
    restart: unless-stopped
    
    environment:
      IBEAM_ACCOUNT: bogda6172
      IBEAM_PASSWORD: 19642014angel
      IBEAM_TRADING_MODE: paper
      
    ports:
      - '5000:5000'
    
    volumes:
      - ./outputs:/srv/ibeam/outputs
      - ./inputs:/srv/ibeam/inputs
EOF

# 3. Запустить IBEAM
docker compose up -d

# 4. Проверить логи (дождаться сообщения "Gateway running and authenticated")
docker compose logs -f

# 5. Проверить, что IBEAM работает
curl -k -s https://localhost:5000/v1/api/tickle | head -20
```

**Что это дает:**
- ✅ IBEAM будет доступен на `https://localhost:5000`
- ✅ Backend будет использовать этот IBEAM для получения данных
- ✅ Frontend подключается к Backend (не напрямую к IBEAM)
- ✅ Все данные будут работать локально

**Остановка IBEAM:**
```bash
cd ~/ibeam-local
docker compose down
```

---

### Для test сервера

```bash
# SSH на test сервер
ssh root@test.optioner.online

# Выполнить инструкцию из раздела "На production сервере" ниже
```

---

---

## 📋 Что такое IBEAM?

IBEAM (Interactive Brokers Extensible Automated Manager) - это Docker образ, который:
- Автоматически запускает IB Client Portal Gateway
- Выполняет автоматический логин (включая 2FA)
- Предоставляет доступ к Client Portal Web API
- Работает headless (без GUI)
- Не требует ручной настройки

**GitHub:** https://github.com/Voyz/ibeam

---

## 🚀 Установка на production сервере

### Шаг 1: Подготовка

```bash
# Подключиться к серверу
ssh root@89.117.52.143

# Создать директорию
mkdir -p /opt/ibeam
cd /opt/ibeam
```

### Шаг 2: Docker Compose конфигурация

Создать файл `docker-compose.yml`:

```yaml
services:
  ibeam:
    image: voyz/ibeam:latest
    container_name: ibeam
    restart: unless-stopped
    
    environment:
      IBEAM_ACCOUNT: bogda6172
      IBEAM_PASSWORD: 19642014angel
      IBEAM_TRADING_MODE: paper
      
    ports:
      - '5000:5000'  # Client Portal API
```

### Шаг 3: Запуск

```bash
# Запустить контейнер
docker compose up -d

# Проверить логи
docker compose logs -f

# Дождаться сообщения "Gateway running and authenticated"
```

### Шаг 4: Проверка

```bash
# Проверить статус аутентификации
docker exec ibeam curl -s -k https://localhost:5000/v1/portal/iserver/auth/status | python3 -m json.tool

# Должно вернуть:
# {
#   "authenticated": true,
#   "connected": true,
#   ...
# }

# Получить аккаунты
docker exec ibeam curl -s -k https://localhost:5000/v1/api/portfolio/accounts | python3 -m json.tool
```

---

## 🔧 Управление IBEAM

### Основные команды

```bash
# Статус контейнера
docker compose ps

# Логи (последние 50 строк)
docker compose logs --tail=50

# Логи в реальном времени
docker compose logs -f

# Перезапуск
docker compose restart

# Остановка
docker compose down

# Полная переустановка
docker compose down
docker compose pull
docker compose up -d
```

### Проверка здоровья

```bash
# Проверить, что IBEAM работает
curl -s http://89.117.52.143:5001/health

# Проверить статус аутентификации
curl -s -k https://89.117.52.143:5000/v1/portal/iserver/auth/status
```

---

## 📊 Endpoints Client Portal API

### Базовый URL
```
https://89.117.52.143:5000/v1/api
```

### Основные endpoints

#### 1. Статус аутентификации
```bash
GET /portal/iserver/auth/status
```

#### 2. Аккаунты
```bash
GET /api/portfolio/accounts
```

#### 3. Поиск контракта
```bash
GET /iserver/secdef/search?symbol=SPY
```

#### 4. Market Data Snapshot
```bash
GET /iserver/marketdata/snapshot?conids=265598&fields=31,84,86
```

#### 5. Опционная цепочка (3 шага)

**Шаг 1:** Найти conid базового актива
```bash
GET /iserver/secdef/search?symbol=SPY
```

**Шаг 2:** Получить страйки
```bash
GET /iserver/secdef/strikes?conid=265598&sectype=OPT&month=DEC24
```

**Шаг 3:** Получить данные опционов
```bash
GET /iserver/marketdata/snapshot?conids=<option_conids>&fields=31,84,86,88,85
```

---

## 🐛 Troubleshooting

### Проблема: "Authentication failed"

```bash
# Проверить логи
docker compose logs | grep -i "auth\|error\|fail"

# Перезапустить
docker compose restart

# Проверить credentials в docker-compose.yml
```

### Проблема: "Gateway not responding"

```bash
# Проверить, что контейнер запущен
docker compose ps

# Проверить порты
netstat -tuln | grep 5000

# Перезапустить Gateway
docker compose restart
```

### Проблема: "Session expired"

IBEAM автоматически обновляет сессию каждые 60 секунд. Если сессия истекла:

```bash
# Проверить логи
docker compose logs --tail=20

# Должны видеть "Maintenance" каждые 60 секунд
# Если нет - перезапустить
docker compose restart
```

---

## 🔐 Безопасность

### SSL Certificate

IBEAM использует self-signed сертификат. В Python коде нужно:

```python
import requests

# Отключить проверку SSL
requests.packages.urllib3.disable_warnings()
session = requests.Session()
session.verify = False

# Или использовать сертификат
# session.verify = '/path/to/cert.pem'
```

### Firewall

Порт 5000 должен быть доступен только для backend сервера:

```bash
# Проверить firewall rules
ufw status

# Разрешить только с backend
ufw allow from <backend_ip> to any port 5000
```

---

## 📚 Полезные ссылки

- [IBEAM GitHub](https://github.com/Voyz/ibeam)
- [Client Portal API Documentation](https://www.interactivebrokers.com/campus/ibkr-api-page/cpapi-v1/)
- [IB API Forum](https://groups.io/g/twsapi)

---

## 🎯 Следующие шаги

1. ✅ IBEAM установлен и работает
2. 🔄 Реализовать `ib_client.py` для работы с API
3. 📋 Добавить расчет Greeks через `py_vollib`
4. 🧪 Протестировать на Paper Account
5. 🚀 Интегрировать с backend

---

## 📝 Примечания

- IBEAM автоматически обрабатывает 2FA (если настроено)
- Сессия обновляется каждые 60 секунд
- Gateway перезапускается автоматически при ошибках
- Логи хранятся в контейнере (доступны через `docker logs`)
