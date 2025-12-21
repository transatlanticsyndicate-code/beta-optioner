# 📦 Mock Data для локальной разработки

Эта директория содержит mock данные для локальной разработки и тестирования без подключения к реальным API.

## 📁 Структура

```
mock_data/
├── stocks/              # Цены акций
│   ├── SPY.json
│   └── AAPL.json
├── options_chains/      # Опционные цепочки
│   ├── SPY_NOV25.json
│   └── AAPL_NOV25.json
└── analyzers/           # Данные для Options Analyzer
    ├── SPY.json
    └── AAPL.json
```

## 🎯 Использование

### Python (Backend)

```python
from app.services.mock_data_provider import MockDataProvider

# Инициализация
provider = MockDataProvider()

# Получить цену акции
price = provider.get_stock_price("SPY")
print(price['price'])  # 684.64

# Получить даты экспирации
expirations = provider.get_expiration_dates("SPY")
print(expirations)  # ['NOV25']

# Получить опционную цепочку
options = provider.get_options_chain("SPY", "NOV25")
print(len(options))  # 10 опционов

# Получить метрики
metrics = provider.get_metrics("SPY")
print(metrics['iv_rank'])  # 45
```

### Переключение через DataSourceFactory

```python
from app.services.data_source_factory import DataSourceFactory

# Установить переменную окружения
os.environ["DATA_SOURCE"] = "mock"
# или
os.environ["REACT_APP_ENV"] = "local"

# Получить клиент (автоматически выберет MockDataProvider)
client = DataSourceFactory.get_client()
price = client.get_stock_price("SPY")
```

## 📝 Формат данных

### Stock Price (`stocks/*.json`)

```json
{
  "ticker": "SPY",
  "price": 684.64,
  "bid": 684.63,
  "ask": 684.67,
  "high": 684.67,
  "low": 177.0,
  "volume": 800,
  "previous_close": 682.06,
  "open": 682.06,
  "change": 2.58,
  "change_percent": 0.38,
  "_source": "IB Client Portal Gateway",
  "_captured_at": "2025-11-03T14:30:00Z"
}
```

### Options Chain (`options_chains/*.json`)

```json
{
  "ticker": "SPY",
  "expiration": "NOV25",
  "expiration_date": "2025-11-14",
  "underlying_price": 684.64,
  "options": [
    {
      "strike": 680.0,
      "type": "CALL",
      "conid": 819900001,
      "bid": 7.20,
      "ask": 7.40,
      "last": 7.30,
      "volume": 1250,
      "open_interest": 5420,
      "iv": 0.18,
      "delta": 0.62,
      "gamma": 0.045,
      "theta": -0.15,
      "vega": 0.12,
      "rho": 0.08
    }
  ]
}
```

### Analyzer Data (`analyzers/*.json`)

```json
{
  "ticker": "SPY",
  "step1_stock_price": { ... },
  "step2_metrics": {
    "iv_rank": 45,
    "iv_percentile": 52,
    "put_call_ratio": 0.92,
    "skew": -0.08,
    "atm_iv": 0.175,
    "implied_move": 6.20,
    "vix_level": 18.5
  },
  "step3_recommendation": "NEUTRAL",
  "step4_ai_analysis": "..."
}
```

## ➕ Добавление новых данных

### Быстрый способ (рекомендуется)

Используйте утилиту `create_mock_data.py`:

```bash
cd backend
python3 create_mock_data.py MSTR 350
```

Это автоматически создаст:
- `stocks/MSTR.json`
- `options_chains/MSTR_DEC25.json`
- `analyzers/MSTR.json`

с базовыми template данными, которые потом можно обновить.

### Ручной способ

1. **Stock price:** Создать `stocks/TICKER.json`
2. **Options chain:** Создать `options_chains/TICKER_EXPIRATION.json`
3. **Analyzer:** Создать `analyzers/TICKER.json`

Используйте существующие файлы (SPY.json, AAPL.json) как шаблон.

### Обновить существующие данные

Просто отредактируйте соответствующий JSON файл.

## 🔄 Auto-Capture (планируется)

В будущем планируется автоматический захват данных с production:

```python
# На production
os.environ["CAPTURE_MOCK_DATA"] = "true"

# При каждом запросе к IB Gateway
# данные автоматически сохраняются как mock
```

## ⚠️ Важно

- Mock данные используются **только для локальной разработки**
- На production (`REACT_APP_ENV=production`) используется IB Client Portal Gateway
- Greeks в options chain - **расчетные**, не real-time от IB (пока нет подписки)
- Low значения могут содержать аномалии от IB field 87_raw

## 🧪 Тестирование

```bash
cd backend
python3 test_mock_data_provider.py
```

## 📚 Дополнительно

- Все mock данные основаны на реальных данных от IB Gateway (3 ноября 2025)
- Источник данных указан в поле `_source`
- Время захвата указано в поле `_captured_at`
- Дополнительные заметки в поле `_notes`
