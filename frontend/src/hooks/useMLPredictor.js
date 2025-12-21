/**
 * Хук для работы с ML API прогнозирования цен опционов
 * ЗАЧЕМ: Обеспечивает интерфейс для получения ML-прогнозов из backend
 * Затрагивает: API /api/ml/*, кэширование, состояния загрузки
 */

import { useState, useCallback, useRef } from 'react';

// URL API сервера
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Время жизни кэша в миллисекундах (5 минут)
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Хук для ML прогнозирования цен опционов
 * @returns {Object} - методы и состояния для работы с ML API
 */
export function useMLPredictor() {
  // Состояния загрузки и ошибок
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [modelInfo, setModelInfo] = useState(null);
  
  // Кэш для результатов прогнозов
  // ЗАЧЕМ: Избегаем повторных запросов к API для одинаковых параметров
  const cacheRef = useRef(new Map());
  
  /**
   * Генерация ключа кэша из параметров запроса
   */
  const getCacheKey = useCallback((ticker, strike, expirationDate, daysForward, optionType) => {
    return `${ticker}-${strike}-${expirationDate}-${daysForward}-${optionType}`;
  }, []);
  
  /**
   * Проверка валидности записи в кэше
   */
  const isCacheValid = useCallback((cacheEntry) => {
    if (!cacheEntry) return false;
    return Date.now() - cacheEntry.timestamp < CACHE_TTL;
  }, []);
  
  /**
   * Прогнозирование цены опциона через ML модель
   * @param {string} ticker - Тикер базового актива (например, "SPY")
   * @param {number} strike - Страйк опциона
   * @param {string} expirationDate - Дата экспирации (ISO формат)
   * @param {number} daysForward - Через сколько дней прогнозируем (по умолчанию 7)
   * @param {string} optionType - Тип опциона ("call" или "put")
   * @returns {Promise<Object>} - Результат прогноза
   */
  const predictPrice = useCallback(async (ticker, strike, expirationDate, daysForward = 7, optionType = 'call') => {
    // Валидация входных параметров
    if (!ticker || !strike || !expirationDate) {
      const errorMsg = 'Недостаточно параметров для прогноза';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
    
    // Проверяем кэш
    const cacheKey = getCacheKey(ticker, strike, expirationDate, daysForward, optionType);
    const cachedResult = cacheRef.current.get(cacheKey);
    
    if (isCacheValid(cachedResult)) {
      console.log('🧠 ML Predictor: используем кэшированный результат');
      setPrediction(cachedResult.data);
      return { success: true, data: cachedResult.data, fromCache: true };
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const requestBody = {
        ticker: ticker.toUpperCase(),
        strike: parseFloat(strike) || 0,
        expiration_date: expirationDate || '',
        days_forward: parseInt(daysForward) || 0,
        option_type: (optionType || 'call').toLowerCase(),
      };
      
      console.log('🧠 ML Predictor: отправляем запрос', requestBody);
      
      const response = await fetch(`${API_BASE_URL}/api/ml/predict-price`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Обрабатываем разные форматы ошибок от FastAPI
        let errorMessage = `HTTP ${response.status}`;
        if (errorData.detail) {
          if (typeof errorData.detail === 'string') {
            errorMessage = errorData.detail;
          } else if (Array.isArray(errorData.detail)) {
            errorMessage = errorData.detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ');
          } else {
            errorMessage = JSON.stringify(errorData.detail);
          }
        }
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      // Сохраняем в кэш
      cacheRef.current.set(cacheKey, {
        data,
        timestamp: Date.now(),
      });
      
      setPrediction(data);
      console.log('🧠 ML Predictor: прогноз получен', data);
      
      return { success: true, data };
      
    } catch (err) {
      const errorMsg = err.message || 'Ошибка при получении прогноза';
      console.error('🧠 ML Predictor: ошибка', errorMsg);
      setError(errorMsg);
      return { success: false, error: errorMsg };
      
    } finally {
      setIsLoading(false);
    }
  }, [getCacheKey, isCacheValid]);
  
  /**
   * Получение информации о ML модели
   * @returns {Promise<Object>} - Информация о модели
   */
  const getModelInfo = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/ml/model-info`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      setModelInfo(data);
      console.log('🧠 ML Predictor: информация о модели', data);
      
      return { success: true, data };
      
    } catch (err) {
      const errorMsg = err.message || 'Ошибка при получении информации о модели';
      console.error('🧠 ML Predictor: ошибка', errorMsg);
      return { success: false, error: errorMsg };
    }
  }, []);
  
  /**
   * Построение Volatility Surface для тикера
   * @param {string} ticker - Тикер базового актива
   * @returns {Promise<Object>} - Данные Volatility Surface
   */
  const buildSurface = useCallback(async (ticker) => {
    if (!ticker) {
      return { success: false, error: 'Тикер не указан' };
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/ml/build-surface`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticker: ticker.toUpperCase(),
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      console.log('🧠 ML Predictor: Volatility Surface построен', data);
      
      return { success: true, data };
      
    } catch (err) {
      const errorMsg = err.message || 'Ошибка при построении Volatility Surface';
      console.error('🧠 ML Predictor: ошибка', errorMsg);
      setError(errorMsg);
      return { success: false, error: errorMsg };
      
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  /**
   * Очистка кэша прогнозов
   */
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
    console.log('🧠 ML Predictor: кэш очищен');
  }, []);
  
  /**
   * Сброс состояния
   */
  const reset = useCallback(() => {
    setPrediction(null);
    setError(null);
    setIsLoading(false);
  }, []);
  
  return {
    // Состояния
    isLoading,
    error,
    prediction,
    modelInfo,
    
    // Методы
    predictPrice,
    getModelInfo,
    buildSurface,
    clearCache,
    reset,
  };
}

export default useMLPredictor;
