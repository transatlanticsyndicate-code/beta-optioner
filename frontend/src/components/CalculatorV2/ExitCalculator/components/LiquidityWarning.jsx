/**
 * Компонент предупреждения о низкой ликвидности
 * ЗАЧЕМ: Информирование пользователя о рисках закрытия позиций с низкой ликвидностью
 * Затрагивает: предупреждения о ликвидности опционов
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../ui/tooltip';
import { LIQUIDITY_LEVELS } from '../../../../utils/liquidityCheck';

export function LiquidityWarning({ warnings }) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
        <div className="text-xs">
          <span className="font-semibold text-orange-700">Низкая ликвидность:</span>
          <span className="text-orange-600 ml-1">
            {warnings.map((w, i) => (
              <TooltipProvider key={i}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={`cursor-help underline decoration-dotted ${
                      w.level === LIQUIDITY_LEVELS.VERY_LOW ? 'text-red-600' : ''
                    }`}>
                      {w.option}{i < warnings.length - 1 ? ', ' : ''}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">
                      <p className="font-semibold">{w.option}</p>
                      <p>OI: {w.oi}, Volume: {w.volume}</p>
                      <p className="text-orange-600 mt-1">{w.message}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
