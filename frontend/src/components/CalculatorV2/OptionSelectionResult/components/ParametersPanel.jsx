/**
 * Панель параметров подбора опционов
 * ЗАЧЕМ: Отображение параметров подбора (цены, риски, P&L)
 * Затрагивает: левая колонка с параметрами
 */

import React from 'react';

export function ParametersPanel({
  isCallSelection,
  bestExitDay,
  daysAfterEntry,
  targetUpPercent,
  targetUpPrice,
  targetDownPercent,
  targetDownPrice,
  optionRiskPercent,
  optionRiskAmount,
  riskPercent,
  totalRiskAmount,
  actualCallPLAtUp,
  actualCallPLAtDown
}) {
  return (
    <div className="flex-shrink-0 w-64 space-y-2 text-sm">
      <div className="text-xs text-gray-400 mb-2">
        Для изменения - сделайте новый подбор.
      </div>
      
      {/* Показываем "X дней после входа" только если НЕ был автоподбор лучшего дня */}
      {!bestExitDay && (
        <div className="font-medium text-gray-700">
          {daysAfterEntry} дней после входа
        </div>
      )}
    </div>
  );
}
