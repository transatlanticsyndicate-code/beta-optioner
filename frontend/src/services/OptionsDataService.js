/**
 * Централизованный сервис загрузки опционных данных
 * ЗАЧЕМ: Единая точка загрузки с кешем и дедупликацией
 * Затрагивает: OptionsBoard, StrikeScale, useCalculatorAPI
 * 
 * Решает проблему: 20+ одинаковых запросов при выборе страйка → 1 запрос
 */

import { getOptionsChain, getOptionDetails } from './apiClient';

// ============================================================================
// КОНФИГУРАЦИЯ
// ============================================================================

// TTL кеша в миллисекундах (2 минуты для опционов — данные меняются чаще)
const CACHE_TTL = 2 * 60 * 1000;

// ============================================================================
// ХРАНИЛИЩА
// ============================================================================

// Кеш опционных цепочек (cacheKey -> { data, timestamp })
const optionsCache = new Map();

// Pending запросы для дедупликации (cacheKey -> Promise)
const pendingOptionsRequests = new Map();

// Кеш деталей опционов
const detailsCache = new Map();
const pendingDetailsRequests = new Map();

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Получить опционную цепочку с кешированием и дедупликацией
 * ЗАЧЕМ: Гарантирует что на один ticker+date будет максимум 1 запрос
 * 
 * @param {string} ticker - Тикер (ES, NQ, AAPL...)
 * @param {string} expirationDate - Дата экспирации (YYYY-MM-DD)
 * @param {string} instrumentType - 'stock' или 'future'
 * @returns {Promise<Object>} - Опционная цепочка
 */
export async function fetchOptionsChain(ticker, expirationDate, instrumentType = 'stock') {
  if (!ticker || !expirationDate) {
    console.warn('[OptionsDataService] Missing ticker or expirationDate');
    return { status: 'error', options: [] };
  }
  
  const normalizedTicker = ticker.toUpperCase();
  const cacheKey = `${normalizedTicker}_${expirationDate}_${instrumentType}`;
  
  // 1. Проверяем кеш — если данные свежие, возвращаем сразу
  const cached = optionsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[OptionsDataService] Cache hit: ${cacheKey}`);
    return cached.data;
  }
  
  // 2. Проверяем pending запрос — если уже летит, ждём его
  if (pendingOptionsRequests.has(cacheKey)) {
    console.log(`[OptionsDataService] Waiting for pending: ${cacheKey}`);
    return pendingOptionsRequests.get(cacheKey);
  }
  
  // 3. Делаем новый запрос
  console.log(`[OptionsDataService] Fetching options: ${cacheKey}`);
  
  const promise = getOptionsChain(normalizedTicker, expirationDate, instrumentType)
    .then(data => {
      // Сохраняем в кеш
      optionsCache.set(cacheKey, { data, timestamp: Date.now() });
      // Убираем из pending
      pendingOptionsRequests.delete(cacheKey);
      return data;
    })
    .catch(error => {
      // При ошибке тоже убираем из pending
      pendingOptionsRequests.delete(cacheKey);
      console.error(`[OptionsDataService] Error fetching ${cacheKey}:`, error);
      throw error;
    });
  
  // Сохраняем promise для дедупликации
  pendingOptionsRequests.set(cacheKey, promise);
  
  return promise;
}

/**
 * Получить детали опциона с кешированием
 * @param {string} ticker - Тикер
 * @param {string} expirationDate - Дата экспирации YYYY-MM-DD
 * @param {number} strike - Страйк
 * @param {string} optionType - CALL или PUT
 * @param {string} instrumentType - 'stock' или 'future'
 */
export async function fetchOptionDetails(ticker, expirationDate, strike, optionType, instrumentType = 'stock') {
  if (!ticker || !expirationDate || !strike || !optionType) {
    console.warn('[OptionsDataService] Missing params for fetchOptionDetails');
    return null;
  }
  
  const cacheKey = `${ticker}_${expirationDate}_${strike}_${optionType}_${instrumentType}`;
  
  // Проверяем кеш
  const cached = detailsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[OptionsDataService] Details cache hit: ${cacheKey}`);
    return cached.data;
  }
  
  // Проверяем pending
  if (pendingDetailsRequests.has(cacheKey)) {
    return pendingDetailsRequests.get(cacheKey);
  }
  
  console.log(`[OptionsDataService] Fetching details: ${ticker} ${optionType} ${strike} on ${expirationDate}`);
  
  // Делаем запрос
  const promise = getOptionDetails(ticker, expirationDate, strike, optionType, instrumentType)
    .then(data => {
      detailsCache.set(cacheKey, { data, timestamp: Date.now() });
      pendingDetailsRequests.delete(cacheKey);
      return data;
    })
    .catch(error => {
      pendingDetailsRequests.delete(cacheKey);
      throw error;
    });
  
  pendingDetailsRequests.set(cacheKey, promise);
  return promise;
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Очистить весь кеш опционов
 */
export function clearOptionsCache() {
  optionsCache.clear();
  pendingOptionsRequests.clear();
  detailsCache.clear();
  pendingDetailsRequests.clear();
  console.log('[OptionsDataService] Cache cleared');
}

/**
 * Инвалидировать кеш для конкретного тикера
 */
export function invalidateOptionsForTicker(ticker) {
  const normalizedTicker = ticker.toUpperCase();
  let count = 0;
  
  for (const key of optionsCache.keys()) {
    if (key.startsWith(normalizedTicker)) {
      optionsCache.delete(key);
      count++;
    }
  }
  
  for (const key of detailsCache.keys()) {
    if (key.startsWith(normalizedTicker)) {
      detailsCache.delete(key);
      count++;
    }
  }
  
  if (count > 0) {
    console.log(`[OptionsDataService] Invalidated ${count} entries for ${normalizedTicker}`);
  }
}

/**
 * Получить статистику кеша (для отладки)
 */
export function getOptionsCacheStats() {
  return {
    optionsCacheSize: optionsCache.size,
    detailsCacheSize: detailsCache.size,
    pendingOptions: pendingOptionsRequests.size,
    pendingDetails: pendingDetailsRequests.size,
  };
}

// ============================================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================================

const OptionsDataService = {
  fetchOptionsChain,
  fetchOptionDetails,
  clearOptionsCache,
  invalidateOptionsForTicker,
  getOptionsCacheStats,
};

export default OptionsDataService;
