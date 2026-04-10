/**
 * Компонент предупреждений по грекам опционов
 * ЗАЧЕМ: Информирование пользователя о рисковых значениях Delta, Gamma, Theta
 * Затрагивает: предупреждения в ExitCalculator (красная плашка)
 */

import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../ui/tooltip';

export function GreeksWarning({ warnings }) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
        <div className="text-xs">
          <span className="font-semibold text-red-700">Рисковые Greeks:</span>
          <span className="text-red-600 ml-1">
            {warnings.map((w, i) => (
              <TooltipProvider key={i}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help underline decoration-dotted">
                      {w.option}{i < warnings.length - 1 ? ', ' : ''}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <div className="text-xs space-y-1">
                      <p className="font-semibold">{w.option}</p>
                      {w.warnings.map((warn, j) => (
                        <p key={j} className="text-white">
                          <span className="font-medium">{warn.greek}:</span> {warn.message}
                        </p>
                      ))}
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
