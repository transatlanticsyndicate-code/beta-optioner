/**
 * Полный режим отображения ML прогноза
 * ЗАЧЕМ: Детальное сравнение ML прогноза с Black-Scholes и текущей ценой
 * Затрагивает: основное отображение компонента
 */

import React from 'react';
import { Brain, TrendingUp, TrendingDown, Info, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '../../../ui/card';
import { Button } from '../../../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../ui/tooltip';
import { ConfidenceIndicator } from './ConfidenceIndicator';

export function FullView({
  isEnabled,
  setIsEnabled,
  isLoading,
  error,
  prediction,
  currentPrice,
  bsPrice,
  bsChange,
  mlChange,
  handleRefresh,
}) {
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
