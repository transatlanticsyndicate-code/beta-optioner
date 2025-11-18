# 📡 API Contract - Контракт между Frontend и Backend

**Для чего:** Андрей знает, какие запросы делать и что ожидать в ответе, даже если backend еще не готов.

---

## 🔗 Base URL

**Development:**
```
http://localhost:8000
```

**Production:**
```
https://your-domain.com
```

---

## 📋 Endpoints

### 1. Health Check

**Проверка работоспособности сервера**

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "environment": "development",
  "ai_provider": "gemini",
  "data_source": "polygon"
}
```

---

### 2. Анализ опционов (3 шага)

#### Шаг 1: Получить данные

```http
POST /analyze/step1?ticker=SPY
```

**Response:**
```json
{
  "status": "success",
  "ticker": "SPY",
  "stock_data": {
    "ticker": "SPY",
    "price": 669.21,
    "change": -0.12,
    "change_percent": -0.02,
    "volume": 45123456,
    "timestamp": "2025-01-09T14:30:00Z"
  },
  "options_count": 1234
}
```

**Ошибка:**
```json
{
  "status": "error",
  "error": "Не удалось получить данные"
}
```

---

#### Шаг 2: Рассчитать метрики

```http
POST /analyze/step2?ticker=SPY
```

**Response:**
```json
{
  "status": "success",
  "ticker": "SPY",
  "stock_data": {
    "ticker": "SPY",
    "price": 669.21,
    "change": -0.12,
    "change_percent": -0.02
  },
  "metrics": {
    "max_pain": {
      "strike": 450.0,
      "total_loss": 123456789.0
    },
    "put_call_ratio": {
      "by_volume": 0.85,
      "by_oi": 0.92
    },
    "gamma_exposure": {
      "total_gex": 1234567890.0,
      "call_gex": 987654321.0,
      "put_gex": 246913579.0,
      "zero_gamma": 455.0
    },
    "iv_analysis": {
      "avg_iv": 0.25,
      "call_iv": 0.24,
      "put_iv": 0.26,
      "iv_skew": 0.02
    },
    "support_resistance": {
      "support_levels": [440.0, 445.0, 450.0],
      "resistance_levels": [460.0, 465.0, 470.0]
    },
    "unusual_activity": {
      "high_volume_strikes": [
        {"strike": 450.0, "type": "call", "volume": 50000},
        {"strike": 455.0, "type": "put", "volume": 45000}
      ],
      "high_oi_strikes": [
        {"strike": 450.0, "type": "call", "oi": 100000}
      ]
    }
  }
}
```

---

#### Шаг 3: AI Анализ

```http
POST /analyze/step3?ticker=SPY&ai_model=gemini
```

**Parameters:**
- `ticker` (required): Тикер акции
- `ai_model` (optional): `gemini` или `claude` (по умолчанию: `gemini`)

**Response:**
```json
{
  "status": "success",
  "ticker": "SPY",
  "stock_data": {
    "ticker": "SPY",
    "price": 669.21,
    "change": -0.12,
    "change_percent": -0.02
  },
  "metrics": { /* см. выше */ },
  "ai_analysis": "## 🎯 Анализ опционного рынка SPY\n\n### Текущая ситуация\nЦена акции SPY торгуется на уровне $669.21...",
  "ai_provider": "gemini-2.0-flash-exp",
  "analysis_id": "550e8400-e29b-41d4-a716-446655440000",
  "share_url": "http://localhost:3000/analysis/550e8400-e29b-41d4-a716-446655440000"
}
```

**Примечание:** `ai_analysis` - это текст в формате Markdown, который нужно отрендерить на фронте.

---

### 3. История анализов

```http
GET /api/analysis/history?limit=20&offset=0&ticker=SPY
```

**Parameters:**
- `limit` (optional): Количество записей (по умолчанию: 20)
- `offset` (optional): Смещение для пагинации (по умолчанию: 0)
- `ticker` (optional): Фильтр по тикеру

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "ticker": "SPY",
      "created_at": "2025-01-09T14:30:00Z",
      "ai_model": "gemini",
      "ai_provider": "gemini-2.0-flash-exp",
      "execution_time_ms": 5234,
      "stock_data": { /* ... */ },
      "metrics": { /* ... */ },
      "ai_analysis": "..."
    }
  ],
  "count": 1
}
```

---

### 4. Получить конкретный анализ

```http
GET /api/analysis/{analysis_id}
```

**Example:**
```http
GET /api/analysis/550e8400-e29b-41d4-a716-446655440000
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "ticker": "SPY",
    "created_at": "2025-01-09T14:30:00Z",
    "stock_data": { /* ... */ },
    "metrics": { /* ... */ },
    "ai_analysis": "...",
    "ai_model": "gemini",
    "ai_provider": "gemini-2.0-flash-exp",
    "execution_time_ms": 5234
  }
}
```

---

## 🎨 Mock данные для Андрея

**Что такое mock данные:**
Это **поддельные данные**, которые выглядят как настоящие. Андрей может работать с UI, не дожидаясь готового backend.

**Пример mock файла** (`frontend/src/mocks/mockData.js`):

```javascript
export const mockAnalysisResponse = {
  status: "success",
  ticker: "SPY",
  stock_data: {
    ticker: "SPY",
    price: 669.21,
    change: -0.12,
    change_percent: -0.02,
    volume: 45123456
  },
  metrics: {
    max_pain: {
      strike: 450.0,
      total_loss: 123456789.0
    },
    put_call_ratio: {
      by_volume: 0.85,
      by_oi: 0.92
    }
  },
  ai_analysis: "## 🎯 Анализ SPY\n\nРынок показывает...",
  ai_provider: "gemini-2.0-flash-exp"
};
```

**Как Андрей использует:**
```javascript
// Вместо реального API запроса:
// const response = await axios.post('/analyze/step3?ticker=SPY');

// Использует mock:
import { mockAnalysisResponse } from './mocks/mockData';
const response = mockAnalysisResponse;
```

Когда backend готов - просто меняет на реальный запрос.

---

## 🔄 CORS настройки

Backend уже настроен на прием запросов от:
- `http://localhost:3000` (React dev server)
- Другие домены можно добавить в `.env`

---

## ⚠️ Обработка ошибок

Все endpoints возвращают одинаковый формат ошибок:

```json
{
  "status": "error",
  "error": "Описание ошибки"
}
```

**Андрей должен проверять:**
```javascript
if (response.status === "error") {
  // Показать ошибку пользователю
  alert(response.error);
}
```

---

## 📝 Примечания для Андрея

1. **Все тикеры в uppercase:** `spy` → `SPY`
2. **Markdown рендеринг:** `ai_analysis` нужно рендерить через библиотеку (react-markdown)
3. **Loading states:** Шаг 3 может занять 5-10 секунд - показывать лоадер
4. **Кэширование:** Шаги 1-2 кэшируются на 5 минут, можно не повторять запросы

---

**Последнее обновление:** 2025-01-09
