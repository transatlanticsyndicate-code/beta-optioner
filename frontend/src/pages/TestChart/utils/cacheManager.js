/**
 * Менеджер кэширования данных графика
 * ЗАЧЕМ: Управление кэшем в localStorage для ускорения загрузки
 */

import { CACHE_DURATION } from '../config/chartConfig';

const getCacheKey = (symbol) => `chart_data_${symbol}`;

export const getCachedData = (symbol, cachingEnabled) => {
  if (!cachingEnabled) return null;

  try {
    const cacheKey = getCacheKey(symbol);
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
      const parsed = JSON.parse(cached);
      const now = Date.now();

      if (now - parsed.timestamp < CACHE_DURATION) {
        return parsed.data;
      } else {
        localStorage.removeItem(cacheKey);
      }
    }
  } catch (error) {
    console.warn('Ошибка при чтении кэша:', error);
  }

  return null;
};

export const setCachedData = (symbol, data, cachingEnabled) => {
  if (!cachingEnabled) return;

  try {
    const cacheKey = getCacheKey(symbol);
    const cacheData = {
      data,
      timestamp: Date.now()
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch (error) {
    console.warn('Ошибка при сохранении в кэш:', error);
  }
};
