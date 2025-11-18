# ⚡ Быстрая справка - Локальный IBEAM

## 🚀 За 30 секунд

```bash
# Запустить
cd ~/ibeam-local && docker compose up -d

# Проверить
curl -k https://localhost:5001/v1/portal/iserver/auth/status

# Тестировать
cd /path/to/windsurf-project/backend && python tests/test_aapl_final.py
```

---

## 📂 Тестовые скрипты

### 1. Скорость: Локальный vs Прокси
**Файл:** `backend/tests/test_speed_comparison.py`
```bash
python backend/tests/test_speed_comparison.py
```
**Результат:** Локальный IBEAM в 4.2x быстрее

### 2. Полный тест AAPL (рекомендуется)
**Файл:** `backend/tests/test_aapl_final.py`
```bash
python backend/tests/test_aapl_final.py
```
**Результат:** Все данные AAPL (цена, даты, страйки)

### 3. Локальный IBEAM с IBClient
**Файл:** `backend/tests/test_local_ibeam.py`
```bash
python backend/tests/test_local_ibeam.py
```
**Результат:** Тест IBClient класса

### 4. SSH туннель (не рекомендуется)
**Файл:** `backend/tests/test_tunnel.py`
```bash
python backend/tests/test_tunnel.py
```
**Результат:** Медленно (~1 сек/запрос)

---

## 🔌 Основные endpoints

```bash
# Авторизация
curl -k https://localhost:5001/v1/portal/iserver/auth/status

# Поиск AAPL
curl -k "https://localhost:5001/v1/api/iserver/secdef/search?symbol=AAPL"

# Цена AAPL (conid=265598)
curl -k "https://localhost:5001/v1/api/iserver/marketdata/snapshot?conids=265598&fields=31,84,86"

# Страйки для NOV25
curl -k "https://localhost:5001/v1/api/iserver/secdef/strikes?conid=265598&sectype=OPT&month=NOV25"
```

---

## 🐳 Docker команды

```bash
# Запустить
docker compose up -d

# Логи
docker compose logs -f

# Остановить
docker compose down

# Перезапустить
docker compose restart

# Статус
docker ps | grep ibeam-local
```

---

## 🔧 Настройка IBClient

```python
import os
from app.services.ib_client import IBClient

# Локальный IBEAM
os.environ["IB_API_URL"] = "https://localhost:5001"
os.environ.pop("IBEAM_PROXY_API_KEY", None)

# Сбросить Singleton
IBClient._instance = None

# Использовать
client = IBClient()
price = client.get_stock_price("AAPL")
```

---

## 📊 Производительность

| Операция | Время |
|----------|-------|
| Auth check | 98ms |
| Поиск контракта | 796ms |
| Цена | 139ms |
| Даты | 183ms |
| Страйки | 495ms |
| **Итого** | **~1.7 сек** |

---

## 🎯 Рекомендуемый workflow

1. **Запустить IBEAM**
   ```bash
   cd ~/ibeam-local && docker compose up -d
   ```

2. **Проверить подключение**
   ```bash
   python backend/tests/test_aapl_final.py
   ```

3. **Использовать в коде**
   ```python
   os.environ["IB_API_URL"] = "https://localhost:5001"
   client = IBClient()
   ```

4. **Тестировать скорость**
   ```bash
   python backend/tests/test_speed_comparison.py
   ```

---

## 📚 Полная документация

**Основной файл:** `LOCAL_IBEAM_SETUP.md`

Содержит:
- ✅ Полная установка
- ✅ Все endpoints
- ✅ Troubleshooting
- ✅ Сравнение вариантов
- ✅ Ссылки на ресурсы

---

## 🔗 Связанные файлы

- **Прокси решение:** `_docs/architecture/IBEAM_PROXY_SOLUTION.md`
- **IBClient:** `backend/app/services/ib_client.py`
- **Прокси скрипт:** `backend/app/api/ibeam_secure_proxy.py`
- **Конфиг:** `~/ibeam-local/docker-compose.yml`

---

**Версия:** 1.0  
**Дата:** 23 октября 2025  
**Статус:** ✅ Готово
