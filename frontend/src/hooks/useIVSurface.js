/**
 * Хук для загрузки и кэширования IV Surface
 * ЗАЧЕМ: Обеспечивает точное прогнозирование IV при симуляции времени
 * 
 * IV Surface — это 3D модель, где IV зависит от:
 * - Strike (монетность опциона)
 * - Time to Expiration (время до экспирации)
 * 
 * Затрагивает: расчёты P&L, блок "Закрыть всё", графики
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * Хук для загрузки IV Surface с API
 * 
 * @param {string} ticker - Тикер актива
 * @param {boolean} enabled - Включена ли загрузка (по умолчанию true)
 * @returns {Object} - { ivSurface, loading, error, refetch }
 */
export const useIVSurface = (ticker, enabled = true) => {
  const [ivSurface, setIVSurface] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastTicker, setLastTicker] = useState(null);

  // Функция загрузки IV Surface
  const fetchIVSurface = useCallback(async (tickerToFetch) => {
    if (!tickerToFetch) {
      setIVSurface(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log(`📊 Loading IV Surface for ${tickerToFetch}...`);
      const response = await fetch(`/api/polygon/iv-surface/${tickerToFetch}?num_expirations=5`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'success' && data.surface) {
        // Конвертируем ключи surface из строк в числа для корректной работы
        const normalizedSurface = {};
        Object.entries(data.surface).forEach(([strike, daysData]) => {
          const strikeNum = parseFloat(strike);
          normalizedSurface[strikeNum] = {};
          Object.entries(daysData).forEach(([days, iv]) => {
            normalizedSurface[strikeNum][parseInt(days)] = iv;
          });
        });
        
        setIVSurface(normalizedSurface);
        setLastTicker(tickerToFetch);
        console.log(`✅ IV Surface loaded: ${Object.keys(normalizedSurface).length} strikes, ${data.data_points} points`);
      } else {
        console.log(`⚠️ No IV Surface data for ${tickerToFetch}`);
        setIVSurface(null);
      }
    } catch (err) {
      console.error(`❌ Error loading IV Surface:`, err);
      setError(err.message);
      setIVSurface(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Загружаем IV Surface при изменении тикера
  useEffect(() => {
    if (enabled && ticker && ticker !== lastTicker) {
      fetchIVSurface(ticker);
    } else if (!ticker) {
      setIVSurface(null);
      setLastTicker(null);
    }
  }, [ticker, enabled, lastTicker, fetchIVSurface]);

  // Функция для принудительной перезагрузки
  const refetch = useCallback(() => {
    if (ticker) {
      setLastTicker(null); // Сбрасываем кэш
      fetchIVSurface(ticker);
    }
  }, [ticker, fetchIVSurface]);

  return {
    ivSurface,
    loading,
    error,
    refetch,
    hasData: ivSurface !== null && Object.keys(ivSurface).length > 0
  };
};

export default useIVSurface;
