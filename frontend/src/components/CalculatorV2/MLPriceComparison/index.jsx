/**
 * Компонент сравнения ML прогноза с Black-Scholes и текущей ценой
 * ЗАЧЕМ: Визуализация преимуществ ML модели для принятия торговых решений
 * Затрагивает: useMLPredictor, отображение прогнозов, сравнительный анализ
 */

import React, { useState, useEffect } from 'react';
import { useMLPredictor } from '../../../hooks/useMLPredictor';
import { formatPercentChange } from './utils/formatters';
import { CompactView, FullView } from './components';

export function MLPriceComparison({
  ticker,
  strike,
  expirationDate,
  currentPrice,
  optionType = 'call',
  daysForward = 7,
  bsPrice = null,
  onPredictionUpdate = null,
  compact = false,
}) {
  const { 
    isLoading, 
    error, 
    prediction, 
    predictPrice, 
    getModelInfo,
    reset 
  } = useMLPredictor();
  
  const [isEnabled, setIsEnabled] = useState(true);
  const [lastRequestParams, setLastRequestParams] = useState(null);
  
  // Загружаем информацию о модели при монтировании
  // ЗАЧЕМ: Получение версии модели и метаданных для отображения
  useEffect(() => {
    getModelInfo();
  }, [getModelInfo]);
  
  // Автоматический запрос прогноза при изменении параметров
  // ЗАЧЕМ: Обновление прогноза при изменении тикера, страйка или даты
  useEffect(() => {
    if (!isEnabled || !ticker || !strike || !expirationDate) {
      return;
    }
    
    // Проверяем, изменились ли параметры
    const currentParams = `${ticker}-${strike}-${expirationDate}-${daysForward}-${optionType}`;
    if (currentParams === lastRequestParams) {
      return;
    }
    
    const fetchPrediction = async () => {
      const result = await predictPrice(ticker, strike, expirationDate, daysForward, optionType);
      
      if (result.success && onPredictionUpdate) {
        onPredictionUpdate(result.data);
      }
      
      setLastRequestParams(currentParams);
    };
    
    // Небольшая задержка для debounce
    const timeoutId = setTimeout(fetchPrediction, 500);
    return () => clearTimeout(timeoutId);
    
  }, [ticker, strike, expirationDate, daysForward, optionType, isEnabled, predictPrice, onPredictionUpdate, lastRequestParams]);
  
  // Ручное обновление прогноза
  // ЗАЧЕМ: Возможность принудительного обновления прогноза
  const handleRefresh = async () => {
    setLastRequestParams(null);
    await predictPrice(ticker, strike, expirationDate, daysForward, optionType);
  };
  
  // Расчёт изменений
  // ЗАЧЕМ: Вычисление процентных изменений для отображения
  const mlChange = prediction ? formatPercentChange(currentPrice, prediction.ml_predicted_price) : null;
  const bsChange = bsPrice ? formatPercentChange(currentPrice, bsPrice) : 
                   prediction ? formatPercentChange(currentPrice, prediction.bs_predicted_price) : null;
  
  // Компактный режим для встраивания в таблицу
  if (compact) {
    return (
      <CompactView
        isLoading={isLoading}
        error={error}
        prediction={prediction}
        mlChange={mlChange}
      />
    );
  }
  
  // Полный режим
  return (
    <FullView
      isEnabled={isEnabled}
      setIsEnabled={setIsEnabled}
      isLoading={isLoading}
      error={error}
      prediction={prediction}
      currentPrice={currentPrice}
      bsPrice={bsPrice}
      bsChange={bsChange}
      mlChange={mlChange}
      handleRefresh={handleRefresh}
    />
  );
}

export default MLPriceComparison;
