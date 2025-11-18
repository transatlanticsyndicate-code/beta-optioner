# 🐳 IB Gateway Docker Setup - Финальная инструкция

**Сервер:** optioner.online (89.117.52.143)  
**Статус:** ✅ Gateway запущен, требуется финальная настройка API

---

## ✅ Что уже сделано

1. ✅ Docker установлен
2. ✅ IB Gateway контейнер запущен
3. ✅ Login completed (bogda6172)
4. ✅ Read-Only API отключен
5. ✅ Порты 4002 и 5900 открыты

---

## 🔧 Финальная настройка (требуется 1 раз)

### Подключение через VNC

IB Gateway требует **однократного** включения API через GUI.

**Параметры подключения:**
```
Адрес: 89.117.52.143:5900
Порт: 5900
Пароль: (по умолчанию пустой или "ibgateway")
```

**VNC клиенты:**
- **macOS:** Screen Sharing (встроенный) - `Finder` → `Go` → `Connect to Server` → `vnc://89.117.52.143:5900`
- **Windows:** RealVNC Viewer, TightVNC
- **Linux:** Remmina, TigerVNC

### Включение API (через VNC)

1. Подключитесь к VNC
2. В окне Gateway: `File` → `Global Configuration` → `API` → `Settings`
3. Включите галочки:
   - ✅ `Enable ActiveX and Socket Clients`
   - ⬜ `Read-Only API` (СНЯТЬ галочку)
4. Установите порт: `4002`
5. Нажмите `OK`
6. Перезапустите контейнер: `docker compose restart`

---

## 📂 Структура на сервере

```
/opt/ib-gateway/
├── docker-compose.yml    # Конфигурация Docker
├── fix-api.sh           # Скрипт автонастройки
└── data/                # Данные Gateway (автосоздается)
```

---

## 🚀 Управление Gateway

### Запуск
```bash
cd /opt/ib-gateway
docker compose up -d
```

### Остановка
```bash
cd /opt/ib-gateway
docker compose down
```

### Перезапуск
```bash
cd /opt/ib-gateway
docker compose restart
```

### Логи
```bash
cd /opt/ib-gateway
docker compose logs -f
```

### Статус
```bash
cd /opt/ib-gateway
docker compose ps
```

---

## 🔍 Проверка работы

### 1. Проверка портов
```bash
netstat -tuln | grep -E '4002|5900'
```

Должно быть:
```
tcp        0      0 0.0.0.0:4002            0.0.0.0:*               LISTEN
tcp        0      0 0.0.0.0:5900            0.0.0.0:*               LISTEN
```

### 2. Тест подключения (Python)
```python
from ib_insync import IB

ib = IB()
ib.connect('89.117.52.143', 4002, clientId=1)

if ib.isConnected():
    print("✅ Подключение успешно!")
    print(f"Accounts: {ib.managedAccounts()}")
    ib.disconnect()
```

---

## 🔐 Credentials

```
Username: bogda6172
Password: 19642014angel
Account: DU4883788 (Paper Trading)
API Port: 4002
```

---

## 🐛 Troubleshooting

### Gateway не запускается
```bash
docker compose logs --tail=50
```

### API порт не отвечает
1. Проверьте, что Gateway запущен: `docker compose ps`
2. Проверьте логи: `docker compose logs | grep -i api`
3. Подключитесь через VNC и проверьте настройки API

### Перезапуск с чистого листа
```bash
cd /opt/ib-gateway
docker compose down
rm -rf data/
docker compose up -d
```

---

## 📝 Docker Compose конфигурация

```yaml
services:
  ib-gateway:
    image: ghcr.io/gnzsnz/ib-gateway:stable
    container_name: ib-gateway
    restart: unless-stopped
    environment:
      TWS_USERID: bogda6172
      TWS_PASSWORD: 19642014angel
      TRADING_MODE: paper
      READ_ONLY_API: 'no'
      TWOFA_TIMEOUT_ACTION: restart
    ports:
      - '4002:4002'
      - '5900:5900'
```

---

## 🔄 Автозапуск при перезагрузке сервера

Docker контейнер настроен на автозапуск (`restart: unless-stopped`).

При перезагрузке сервера Gateway запустится автоматически.

---

## 📊 Интеграция с Backend

### Connection Manager (Python)

```python
# backend/app/services/ib_connection.py
from ib_insync import IB
import os

class IBConnectionManager:
    def __init__(self):
        self.ib = IB()
        self.host = os.getenv('IB_HOST', '89.117.52.143')
        self.port = int(os.getenv('IB_PORT', '4002'))
        self.client_id = int(os.getenv('IB_CLIENT_ID', '1'))
    
    def connect(self):
        if not self.ib.isConnected():
            self.ib.connect(self.host, self.port, clientId=self.client_id)
        return self.ib.isConnected()
    
    def get_client(self):
        if not self.ib.isConnected():
            self.connect()
        return self.ib

ib_manager = IBConnectionManager()
```

### Environment Variables

```bash
# .env
IB_HOST=89.117.52.143
IB_PORT=4002
IB_CLIENT_ID=1
IB_ACCOUNT=DU4883788
```

---

## ✅ Следующие шаги

1. ⏳ **Подключиться через VNC и включить API** (требуется 1 раз)
2. ⏳ Протестировать подключение из backend
3. ⏳ Интегрировать с существующим кодом
4. ⏳ Настроить мониторинг

---

## 📞 Поддержка

- **Документация IB API:** https://interactivebrokers.github.io/tws-api/
- **ib_insync:** https://ib-insync.readthedocs.io/
- **Docker образ:** https://github.com/gnzsnz/ib-gateway-docker

---

**Создано:** 20 октября 2025  
**Обновлено:** 20 октября 2025
