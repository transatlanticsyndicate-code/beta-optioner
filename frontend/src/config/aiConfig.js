// Список тикеров, поддерживаемых AI моделью
// Должен совпадать с backend/app/services/ai_prediction_service.py
export const AI_SUPPORTED_TICKERS = [
  'AAPL', 'ABBV', 'ABNB', 'ADBE', 'AMD', 'AMZN', 'BA', 'BAC', 'CAT', 'CMCSA', 
  'COP', 'COST', 'CVX', 'DIA', 'DIS', 'GE', 'GOOGL', 'GS', 'HD', 'HON', 
  'IWM', 'JNJ', 'JPM', 'KO', 'LLY', 'LOW', 'MA', 'META', 'MMM', 'MRK', 
  'MS', 'MSFT', 'NFLX', 'NVDA', 'PEP', 'PFE', 'PG', 'PM', 'QQQ', 'SLB', 
  'SPY', 'T', 'TGT', 'TSLA', 'UBER', 'UNH', 'V', 'VZ', 'WFC', 'WMT', 'XOM'
];

// Проверка поддержки тикера
export const isTickerSupportedByAI = (ticker) => {
  if (!ticker) return false;
  return AI_SUPPORTED_TICKERS.includes(ticker.toUpperCase());
};
