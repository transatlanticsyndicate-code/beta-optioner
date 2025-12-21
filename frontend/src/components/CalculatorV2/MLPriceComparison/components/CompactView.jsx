/**
 * Компактный режим отображения ML прогноза
 * ЗАЧЕМ: Встраивание в таблицы с минимальным занимаемым местом
 * Затрагивает: отображение прогноза в OptionsTable
 */

import React from 'react';
import { Brain, Loader2, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../ui/tooltip';

export function CompactView({ isLoading, error, prediction, mlChange }) {
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
