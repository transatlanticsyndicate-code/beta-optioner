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
      
      {/* Разделитель */}
      <div className="border-t" style={{ borderColor: isCallSelection ? '#22c55e' : '#14b8a6' }}></div>
      
      {/* Параметры ВВЕРХ */}
      <div className="flex justify-between">
        <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-xs">
          Вверх {targetUpPercent}%
        </span>
        <span className="font-medium">${targetUpPrice.toFixed(2)}</span>
      </div>
      {isCallSelection ? (
        <div className="flex justify-between text-muted-foreground text-xs">
          <span>CALL P&L при росте</span>
          <span className={actualCallPLAtUp >= 0 ? 'text-green-600' : 'text-red-600'}>
            {actualCallPLAtUp >= 0 ? `+$${actualCallPLAtUp.toFixed(0)}` : `-$${Math.abs(actualCallPLAtUp).toFixed(0)}`}
          </span>
        </div>
      ) : (
        <div className="flex justify-between text-muted-foreground text-xs">
          <span>Риск опциона {optionRiskPercent}%</span>
          <span>${optionRiskAmount}</span>
        </div>
      )}
      
      {/* Разделитель */}
      <div className="border-t" style={{ borderColor: isCallSelection ? '#22c55e' : '#14b8a6' }}></div>
      
      {/* Параметры ВНИЗ */}
      <div className="flex justify-between">
        <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-xs">
          Вниз {targetDownPercent}%
        </span>
        <span className="font-medium">${targetDownPrice.toFixed(2)}</span>
      </div>
      {isCallSelection ? (
        <div className="flex justify-between text-muted-foreground text-xs">
          <span>CALL P&L при падении</span>
          <span className={actualCallPLAtDown >= 0 ? 'text-green-600' : 'text-red-600'}>
            {actualCallPLAtDown >= 0 ? `+$${actualCallPLAtDown.toFixed(0)}` : `-$${Math.abs(actualCallPLAtDown).toFixed(0)}`}
          </span>
        </div>
      ) : (
        <div className="flex justify-between text-muted-foreground text-xs">
          <span>Общий риск {riskPercent}%</span>
          <span>${totalRiskAmount}</span>
        </div>
      )}
    </div>
  );
}
