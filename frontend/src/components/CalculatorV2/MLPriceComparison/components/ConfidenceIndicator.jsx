/**
 * Индикатор уверенности ML модели
 * ЗАЧЕМ: Визуализация уверенности модели в прогнозе (0-100%)
 * Затрагивает: отображение качества прогноза
 */

import React from 'react';
import { getConfidenceColor, getConfidenceLabel } from '../utils/formatters';

export function ConfidenceIndicator({ confidence }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full ${getConfidenceColor(confidence)} transition-all duration-300`}
          style={{ width: `${confidence * 100}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground min-w-[60px]">
        {(confidence * 100).toFixed(0)}% ({getConfidenceLabel(confidence)})
      </span>
    </div>
  );
}
