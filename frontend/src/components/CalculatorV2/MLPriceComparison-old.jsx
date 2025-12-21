/**
 * Компонент сравнения ML прогноза с Black-Scholes и текущей ценой
 * ЗАЧЕМ: Визуализация преимуществ ML модели для принятия торговых решений
 * Затрагивает: useMLPredictor, отображение прогнозов, сравнительный анализ
 */

import React, { useState, useEffect } from 'react';
import { Brain, TrendingUp, TrendingDown, Info, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { useMLPredictor } from '../../hooks/useMLPredictor';

/**
 * Форматирование процентного изменения с цветом
 */
const formatPercentChange = (current, predicted) => {
  if (!current || !predicted) return { text: '-', color: 'text-muted-foreground' };
  
  const change = ((predicted - current) / current) * 100;
  const sign = change >= 0 ? '+' : '';
  const color = change >= 0 ? 'text-green-500' : 'text-red-500';
  
  return {
    text: `${sign}${change.toFixed(2)}%`,
    color,
    value: change,
  };
};

/**
 * Индикатор уверенности модели
 */
const ConfidenceIndicator = ({ confidence }) => {
  // Определяем цвет на основе уровня уверенности
  const getColor = () => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  
  const getLabel = () => {
    if (confidence >= 0.8) return 'Высокая';
    if (confidence >= 0.6) return 'Средняя';
    return 'Низкая';
  };
  
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full ${getColor()} transition-all duration-300`}
          style={{ width: `${confidence * 100}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground min-w-[60px]">
        {(confidence * 100).toFixed(0)}% ({getLabel()})
      </span>
    </div>
  );
};

/**
 * Основной компонент сравнения прогнозов
 */
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
    modelInfo,
    reset 
  } = useMLPredictor();
  
  const [isEnabled, setIsEnabled] = useState(true);
  const [lastRequestParams, setLastRequestParams] = useState(null);
  
  // Загружаем информацию о модели при монтировании
  useEffect(() => {
    getModelInfo();
  }, [getModelInfo]);
  
  // Автоматический запрос прогноза при изменении параметров
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
  const handleRefresh = async () => {
    setLastRequestParams(null);
    await predictPrice(ticker, strike, expirationDate, daysForward, optionType);
  };
  
  // Расчёт изменений
  const mlChange = prediction ? formatPercentChange(currentPrice, prediction.ml_predicted_price) : null;
  const bsChange = bsPrice ? formatPercentChange(currentPrice, bsPrice) : 
                   prediction ? formatPercentChange(currentPrice, prediction.bs_predicted_price) : null;
  
  // Компактный режим для встраивания в таблицу
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 cursor-help">
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : error ? (
                <AlertCircle className="h-3 w-3 text-red-500" />
              ) : prediction ? (
                <>
                  <Brain className="h-3 w-3 text-purple-500" />
                  <span className="text-xs font-medium">
                    ${prediction.ml_predicted_price?.toFixed(2)}
                  </span>
                  <span className={`text-xs ${mlChange?.color}`}>
                    {mlChange?.text}
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[300px]">
            <div className="space-y-1">
              <p className="font-medium">ML Прогноз (VAE + MLP)</p>
              {prediction && (
                <>
                  <p className="text-xs">Прогноз: ${prediction.ml_predicted_price?.toFixed(2)}</p>
                  <p className="text-xs">Уверенность: {(prediction.confidence * 100).toFixed(0)}%</p>
                  <p className="text-xs text-muted-foreground">Модель: {prediction.model_version}</p>
                </>
              )}
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  // Полный режим
  return (
    <Card className="border-purple-500/30 bg-purple-500/5">
      <CardContent className="p-4">
        {/* Заголовок */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-500" />
            <h3 className="font-medium">ML Прогноз цены</h3>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Переключатель */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-8 h-4 rounded-full transition-colors ${isEnabled ? 'bg-purple-500' : 'bg-muted'}`}>
                <div className={`w-3 h-3 rounded-full bg-white transition-transform mt-0.5 ${isEnabled ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs text-muted-foreground">
                {isEnabled ? 'Вкл' : 'Выкл'}
              </span>
            </label>
            
            {/* Кнопка обновления */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading || !isEnabled}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        
        {/* Контент */}
        {!isEnabled ? (
          <div className="text-center text-muted-foreground text-sm py-4">
            ML прогнозирование отключено
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
            <span className="text-sm text-muted-foreground">Загрузка прогноза...</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-500 py-4">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm">{typeof error === 'string' ? error : error?.message || 'Ошибка загрузки прогноза'}</span>
          </div>
        ) : prediction ? (
          <div className="space-y-4">
            {/* Сравнительная таблица */}
            <div className="grid grid-cols-3 gap-4 text-sm">
              {/* Текущая цена */}
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Текущая цена</p>
                <p className="text-lg font-bold">${currentPrice?.toFixed(2) || '-'}</p>
              </div>
              
              {/* Black-Scholes */}
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Black-Scholes</p>
                <p className="text-lg font-medium">
                  ${(bsPrice || prediction.bs_predicted_price)?.toFixed(2) || '-'}
                </p>
                {bsChange && (
                  <p className={`text-xs ${bsChange.color}`}>{bsChange.text}</p>
                )}
              </div>
              
              {/* ML Прогноз */}
              <div className="space-y-1 bg-purple-500/10 -m-2 p-2 rounded">
                <p className="text-purple-500 text-xs font-medium">ML Прогноз</p>
                <div className="flex items-center gap-1">
                  <p className="text-lg font-bold text-purple-500">
                    ${prediction.ml_predicted_price?.toFixed(2)}
                  </p>
                  {mlChange?.value >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  )}
                </div>
                {mlChange && (
                  <p className={`text-xs ${mlChange.color}`}>{mlChange.text}</p>
                )}
              </div>
            </div>
            
            {/* Уверенность модели */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Уверенность модели</p>
              <ConfidenceIndicator confidence={prediction.confidence || 0} />
            </div>
            
            {/* Информация о модели */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
              <span>Модель: {prediction.model_version || 'v1.0'}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="flex items-center gap-1 hover:text-foreground transition-colors">
                      <Info className="h-3 w-3" />
                      <span>Как это работает?</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[300px]">
                    <div className="space-y-2 text-xs">
                      <p className="font-medium">VAE + MLP модель</p>
                      <p>
                        Модель использует Variational Autoencoder для сжатия 
                        Volatility Surface в латентное представление, затем 
                        MLP прогнозирует цену опциона на основе этого представления 
                        и параметров опциона (страйк, время до экспирации).
                      </p>
                      <p className="text-muted-foreground">
                        Обучена на исторических данных SPY, QQQ, AAPL, TSLA, NVDA.
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        ) : (
          <div className="text-center text-muted-foreground text-sm py-4">
            Выберите опцион для получения ML прогноза
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MLPriceComparison;
