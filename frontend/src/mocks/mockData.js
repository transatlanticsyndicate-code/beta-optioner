/**
 * Mock данные для разработки UI без backend
 * 
 * Использование:
 * import { mockAnalysisResponse } from './mocks/mockData';
 * const data = mockAnalysisResponse; // Вместо API запроса
 */

export const mockStockData = {
  ticker: "SPY",
  price: 669.21,
  change: -0.12,
  change_percent: -0.02,
  volume: 45123456,
  timestamp: "2025-01-09T14:30:00Z"
};

export const mockMetrics = {
  max_pain: {
    strike: 450.0,
    total_loss: 123456789.0
  },
  put_call_ratio: {
    by_volume: 0.85,
    by_oi: 0.92
  },
  gamma_exposure: {
    total_gex: 1234567890.0,
    call_gex: 987654321.0,
    put_gex: 246913579.0,
    zero_gamma: 455.0
  },
  iv_analysis: {
    avg_iv: 0.25,
    call_iv: 0.24,
    put_iv: 0.26,
    iv_skew: 0.02
  },
  support_resistance: {
    support_levels: [440.0, 445.0, 450.0],
    resistance_levels: [460.0, 465.0, 470.0]
  },
  unusual_activity: {
    high_volume_strikes: [
      { strike: 450.0, type: "call", volume: 50000 },
      { strike: 455.0, type: "put", volume: 45000 }
    ],
    high_oi_strikes: [
      { strike: 450.0, type: "call", oi: 100000 }
    ]
  }
};

export const mockAIAnalysis = `## 🎯 Анализ опционного рынка SPY

### Текущая ситуация
Цена акции SPY торгуется на уровне **$669.21** (-0.02%), что находится **выше Max Pain** ($450.00). Это указывает на то, что маркет-мейкеры могут испытывать давление.

### 📊 Ключевые метрики

**Max Pain:** $450.00
- Уровень, при котором опционные трейдеры понесут максимальные убытки
- Цена значительно выше Max Pain - бычий сигнал

**Put/Call Ratio:** 0.85
- Соотношение путов к коллам ниже 1.0
- Преобладают коллы - рынок настроен оптимистично

**Gamma Exposure (GEX):** $1.23B
- Положительный GEX - рынок стабилен
- Zero Gamma на уровне $455.00

### 🎯 Уровни поддержки и сопротивления

**Поддержка:**
- $450.00 (Max Pain, сильная поддержка)
- $445.00
- $440.00

**Сопротивление:**
- $460.00
- $465.00
- $470.00

### 💡 Необычная активность

**Высокий объем:**
- Call $450.00: 50,000 контрактов
- Put $455.00: 45,000 контрактов

**Высокий Open Interest:**
- Call $450.00: 100,000 контрактов

### 📈 Рекомендации

1. **Бычий сценарий:** Цена выше Max Pain, преобладают коллы
2. **Целевые уровни:** $460-$465
3. **Стоп-лосс:** Ниже $450 (Max Pain)

### ⚠️ Риски

- Высокая волатильность (IV 25%)
- Возможная коррекция к Max Pain
- Следить за уровнем $455 (Zero Gamma)

---

*Анализ выполнен AI моделью Gemini 2.0 Flash*
`;

export const mockAnalysisResponse = {
  status: "success",
  ticker: "SPY",
  stock_data: mockStockData,
  metrics: mockMetrics,
  ai_analysis: mockAIAnalysis,
  ai_provider: "gemini-2.0-flash-exp",
  analysis_id: "550e8400-e29b-41d4-a716-446655440000",
  share_url: "http://localhost:3000/analysis/550e8400-e29b-41d4-a716-446655440000"
};

export const mockHistoryResponse = {
  status: "success",
  data: [
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      ticker: "SPY",
      created_at: "2025-01-09T14:30:00Z",
      ai_model: "gemini",
      ai_provider: "gemini-2.0-flash-exp",
      execution_time_ms: 5234,
      stock_data: mockStockData,
      metrics: mockMetrics,
      ai_analysis: mockAIAnalysis
    },
    {
      id: "550e8400-e29b-41d4-a716-446655440001",
      ticker: "AAPL",
      created_at: "2025-01-09T13:15:00Z",
      ai_model: "claude",
      ai_provider: "claude-3-5-sonnet",
      execution_time_ms: 4521,
      stock_data: {
        ticker: "AAPL",
        price: 185.50,
        change: 2.30,
        change_percent: 1.26
      },
      metrics: {
        max_pain: { strike: 180.0 },
        put_call_ratio: { by_volume: 0.75 }
      },
      ai_analysis: "## Анализ AAPL\n\nБычий тренд..."
    }
  ],
  count: 2
};

export const mockErrorResponse = {
  status: "error",
  error: "Не удалось получить данные для тикера"
};

// Функция для симуляции задержки API
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Функция для симуляции API запроса
export const mockApiCall = async (endpoint, params = {}) => {
  await delay(1000); // Симуляция задержки сети
  
  if (endpoint === '/analyze/step1') {
    return {
      status: "success",
      ticker: params.ticker || "SPY",
      stock_data: mockStockData,
      options_count: 1234
    };
  }
  
  if (endpoint === '/analyze/step2') {
    return {
      status: "success",
      ticker: params.ticker || "SPY",
      stock_data: mockStockData,
      metrics: mockMetrics
    };
  }
  
  if (endpoint === '/analyze/step3') {
    return mockAnalysisResponse;
  }
  
  if (endpoint === '/api/analysis/history') {
    return mockHistoryResponse;
  }
  
  return mockErrorResponse;
};
