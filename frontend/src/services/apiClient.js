/**
 * Единый API клиент для калькулятора опционов
 * ЗАЧЕМ: Централизация всех API запросов к Polygon/Massive через бэкенд
 * Затрагивает: все компоненты калькулятора
 */

import axios from 'axios';

// URL API бэкенда
const API_URL = process.env.REACT_APP_API_URL || 
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8000');

const BASE_URL = `${API_URL}/api/polygon`;

// ============================================================================
// КЕШ И ДЕДУПЛИКАЦИЯ
// ============================================================================

const responseCache = new Map();
const pendingRequests = new Map();
const CACHE_TTL = 2 * 60 * 1000; // 2 минуты

async function cachedCall(key, fn) {
  // Проверяем кеш
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[apiClient] Cache hit: ${key}`);
    return cached.data;
  }
  
  // Дедупликация
  if (pendingRequests.has(key)) {
    console.log(`[apiClient] Dedup: ${key}`);
    return pendingRequests.get(key);
  }
  
  // Выполняем запрос
  const promise = fn()
    .then(data => {
      responseCache.set(key, { data, timestamp: Date.now() });
      pendingRequests.delete(key);
      return data;
    })
    .catch(error => {
      pendingRequests.delete(key);
      throw error;
    });
  
  pendingRequests.set(key, promise);
  return promise;
}

// ============================================================================
// МЕТОДЫ API — POLYGON/MASSIVE
// ============================================================================

/**
 * Получить цену тикера
 */
export async function getTickerPrice(ticker) {
  const key = `price_${ticker}`;
  return cachedCall(key, async () => {
    const response = await axios.get(`${BASE_URL}/current-price/${ticker.toUpperCase()}`);
    return response.data;
  });
}

/**
 * Получить даты экспирации опционов
 */
export async function getExpirationDates(ticker) {
  const key = `expirations_${ticker}`;
  return cachedCall(key, async () => {
    const response = await axios.get(`${BASE_URL}/ticker/${ticker.toUpperCase()}/expirations`);
    return response.data;
  });
}

/**
 * Получить опционную цепочку
 */
export async function getOptionsChain(ticker, expirationDate) {
  const key = `options_${ticker}_${expirationDate}`;
  return cachedCall(key, async () => {
    const params = expirationDate ? { expiration_date: expirationDate } : {};
    const response = await axios.get(`${BASE_URL}/ticker/${ticker.toUpperCase()}/options`, { params });
    return response.data;
  });
}

/**
 * Получить детали конкретного опциона
 */
export async function getOptionDetails(ticker, expirationDate, strike, optionType) {
  const key = `details_${ticker}_${expirationDate}_${strike}_${optionType}`;
  return cachedCall(key, async () => {
    const params = {
      expiration_date: expirationDate,
      strike: strike,
      option_type: optionType.toUpperCase()
    };
    const response = await axios.get(`${BASE_URL}/ticker/${ticker.toUpperCase()}/option-details`, { params });
    return response.data;
  });
}

/**
 * Получить исторические данные (OHLC bars)
 */
export async function getHistoricalBars(ticker, timespan = 'day') {
  const key = `bars_${ticker}_${timespan}`;
  return cachedCall(key, async () => {
    const response = await axios.get(`${BASE_URL}/historical-data/${ticker.toUpperCase()}`, {
      params: { period: '1mo', interval: timespan === 'day' ? '1d' : '1h' }
    });
    return response.data;
  });
}

/**
 * Получить информацию о компании
 */
export async function getTickerDetails(ticker) {
  const key = `tickerDetails_${ticker}`;
  return cachedCall(key, async () => {
    // Polygon не имеет отдельного эндпоинта для деталей, возвращаем базовую информацию
    const priceData = await getTickerPrice(ticker);
    return { ticker: ticker.toUpperCase(), ...priceData };
  });
}

/**
 * Получить текущую цену (алиас для getTickerPrice)
 */
export async function getCurrentPrice(ticker) {
  return getTickerPrice(ticker);
}

// ============================================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================================

const apiClient = {
  getTickerPrice,
  getExpirationDates,
  getOptionsChain,
  getOptionDetails,
  getHistoricalBars,
  getTickerDetails,
  getCurrentPrice,
};

export default apiClient;
