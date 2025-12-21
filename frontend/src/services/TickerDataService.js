/**
 * Централизованный сервис загрузки данных тикера
 * ЗАЧЕМ: Единая точка загрузки с кешем и дедупликацией
 * Затрагивает: NewTikerFinder, useCalculatorAPI, TickerSearch
 * 
 * Решает проблему: 6 одинаковых запросов при выборе тикера → 1 запрос
 */

import { getTickerPrice } from './apiClient';

// ============================================================================
// КОНФИГУРАЦИЯ
// ============================================================================

// TTL кеша в миллисекундах (5 минут)
const CACHE_TTL = 5 * 60 * 1000;

// ============================================================================
// ХРАНИЛИЩА
// ============================================================================

// Кеш данных (cacheKey -> { data, timestamp })
const cache = new Map();

// Pending запросы для дедупликации (cacheKey -> Promise)
// ЗАЧЕМ: Если запрос уже летит, не отправляем новый, а ждём результат
const pendingRequests = new Map();

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Получить данные тикера с кешированием и дедупликацией
 * ЗАЧЕМ: Гарантирует что на один тикер будет максимум 1 запрос
 * 
 * @param {string} ticker - Тикер (ES, NQ, AAPL...)
 * @param {string} instrumentType - 'stock' или 'future'
 * @returns {Promise<Object>} - Данные тикера
 */
export async function fetchTickerData(ticker, instrumentType = 'stock') {
  if (!ticker) {
    return null;
  }
  
  const normalizedTicker = ticker.toUpperCase();
  const cacheKey = `${normalizedTicker}_${instrumentType}`;
  
  // 1. Проверяем кеш — если данные свежие, возвращаем сразу
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[TickerDataService] Cache hit: ${cacheKey}`);
    return cached.data;
  }
  
  // 2. Проверяем pending запрос — если уже летит, ждём его
  if (pendingRequests.has(cacheKey)) {
    console.log(`[TickerDataService] Waiting for pending: ${cacheKey}`);
    return pendingRequests.get(cacheKey);
  }
  
  // 3. Делаем новый запрос
  console.log(`[TickerDataService] Fetching: ${cacheKey}`);
  
  const promise = getTickerPrice(normalizedTicker, instrumentType)
    .then(data => {
      // Сохраняем в кеш
      cache.set(cacheKey, { data, timestamp: Date.now() });
      // Убираем из pending
      pendingRequests.delete(cacheKey);
      return data;
    })
    .catch(error => {
      // При ошибке тоже убираем из pending
      pendingRequests.delete(cacheKey);
      console.error(`[TickerDataService] Error fetching ${cacheKey}:`, error);
      throw error;
    });
  
  // Сохраняем promise для дедупликации
  pendingRequests.set(cacheKey, promise);
  
  return promise;
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Очистить весь кеш
 * ЗАЧЕМ: При логауте или смене пользователя
 */
export function clearCache() {
  cache.clear();
  pendingRequests.clear();
  console.log('[TickerDataService] Cache cleared');
}

/**
 * Инвалидировать конкретный тикер
 * ЗАЧЕМ: Если нужно принудительно обновить данные
 * 
 * @param {string} ticker - Тикер для инвалидации
 */
export function invalidateTicker(ticker) {
  const normalizedTicker = ticker.toUpperCase();
  let count = 0;
  
  for (const key of cache.keys()) {
    if (key.startsWith(normalizedTicker)) {
      cache.delete(key);
      count++;
    }
  }
  
  if (count > 0) {
    console.log(`[TickerDataService] Invalidated ${count} entries for ${normalizedTicker}`);
  }
}

/**
 * Получить статистику кеша (для отладки)
 */
export function getCacheStats() {
  return {
    cacheSize: cache.size,
    pendingRequests: pendingRequests.size,
    entries: Array.from(cache.keys()),
  };
}

// ============================================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================================

const TickerDataService = {
  fetchTickerData,
  clearCache,
  invalidateTicker,
  getCacheStats,
};

export default TickerDataService;
