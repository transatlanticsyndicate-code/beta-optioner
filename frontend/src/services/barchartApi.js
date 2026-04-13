/**
 * API клиент для получения данных волатильности с barchart.com
 * ЗАЧЕМ: Запрос IV, HV, IV Rank, IV Percentile, 5D IV Avg, 1M IV Avg для блока волатильности
 */

const API_URL = process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8002');

/**
 * Получить метрики волатильности для тикера
 * @param {string} ticker - Тикер акции (AAPL, DOCU и т.д.)
 * @returns {Promise<Object|null>} Объект с метриками или null при ошибке
 */
export async function fetchVolatilityMetrics(ticker) {
  if (!ticker) return null;

  try {
    const response = await fetch(`${API_URL}/api/barchart/volatility/${ticker}`);

    if (!response.ok) {
      console.warn(`⚠️ [Barchart] Ошибка ${response.status} для ${ticker}`);
      return null;
    }

    const data = await response.json();

    if (data.status !== 'success') {
      console.warn(`⚠️ [Barchart] Неуспешный ответ для ${ticker}`);
      return null;
    }

    return {
      impliedVolatility: data.impliedVolatility,
      historicVolatility: data.historicVolatility,
      ivRank: data.ivRank,
      ivPercentile: data.ivPercentile,
      ivAvg5D: data.ivAvg5D,
      ivAvg1M: data.ivAvg1M,
    };
  } catch (error) {
    console.error(`❌ [Barchart] Ошибка запроса для ${ticker}:`, error);
    return null;
  }
}
