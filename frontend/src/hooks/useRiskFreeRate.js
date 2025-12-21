/**
 * Хук для получения актуальной безрисковой ставки (Treasury Rate)
 * ЗАЧЕМ: Обеспечивает точные расчёты Black-Scholes с актуальной ставкой от ФРС
 * 
 * Источник: FRED API через бэкенд
 * Кэширование: 1 час (ставка меняется редко)
 */

import { useState, useEffect, useCallback } from 'react';

// Константы
const CACHE_KEY = 'risk_free_rate_cache';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 час в миллисекундах
const DEFAULT_RATE = 0.045; // 4.5% - fallback если API недоступен
// ЗАЧЕМ: В development режиме API_URL пустой, используем localhost:8000
const API_URL = process.env.REACT_APP_API_URL || 
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8000');

/**
 * Получить кэшированную ставку из localStorage
 */
const getCachedRate = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { rate, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;
      
      // Если кэш свежий (менее 1 часа), возвращаем его
      if (age < CACHE_TTL_MS) {
        return { rate, fromCache: true, age };
      }
    }
  } catch (e) {
    console.warn('⚠️ Ошибка чтения кэша ставки:', e);
  }
  return null;
};

/**
 * Сохранить ставку в localStorage
 */
const setCachedRate = (rate) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      rate,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.warn('⚠️ Ошибка сохранения кэша ставки:', e);
  }
};

/**
 * Хук для получения безрисковой ставки
 * 
 * @returns {Object} { rate, ratePercent, source, loading, error, refetch }
 */
export const useRiskFreeRate = () => {
  const [rate, setRate] = useState(DEFAULT_RATE);
  const [ratePercent, setRatePercent] = useState(DEFAULT_RATE * 100);
  const [source, setSource] = useState('Default');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRate = useCallback(async (forceRefresh = false) => {
    // Проверяем кэш если не принудительное обновление
    if (!forceRefresh) {
      const cached = getCachedRate();
      if (cached) {
        console.log(`📊 Используем кэшированную ставку: ${(cached.rate * 100).toFixed(2)}%`);
        setRate(cached.rate);
        setRatePercent(cached.rate * 100);
        setSource('Cached (FRED)');
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/market/risk-free-rate`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'success' && data.rate) {
        console.log(`✅ Получена ставка от FRED: ${data.rate_percent}%`);
        setRate(data.rate);
        setRatePercent(data.rate_percent);
        setSource(data.source || 'FRED API');
        
        // Сохраняем в кэш
        setCachedRate(data.rate);
      } else {
        throw new Error(data.error || 'Invalid response');
      }
    } catch (err) {
      console.warn('⚠️ Ошибка получения ставки, используем fallback:', err.message);
      setError(err.message);
      
      // Пробуем использовать устаревший кэш
      const cached = getCachedRate();
      if (cached) {
        setRate(cached.rate);
        setRatePercent(cached.rate * 100);
        setSource('Cached (stale)');
      } else {
        setRate(DEFAULT_RATE);
        setRatePercent(DEFAULT_RATE * 100);
        setSource('Default fallback');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Загружаем ставку при монтировании
  useEffect(() => {
    fetchRate();
  }, [fetchRate]);

  return {
    rate,           // Ставка в десятичном формате (0.045)
    ratePercent,    // Ставка в процентах (4.5)
    source,         // Источник данных
    loading,        // Флаг загрузки
    error,          // Ошибка если есть
    refetch: () => fetchRate(true) // Принудительное обновление
  };
};

/**
 * Синхронная функция для получения ставки (для использования вне React)
 * ЗАЧЕМ: Для использования в утилитах расчёта (optionPricing.js)
 * 
 * @returns {number} Безрисковая ставка в десятичном формате
 */
export const getRiskFreeRateSync = () => {
  const cached = getCachedRate();
  if (cached) {
    return cached.rate;
  }
  return DEFAULT_RATE;
};

export default useRiskFreeRate;
