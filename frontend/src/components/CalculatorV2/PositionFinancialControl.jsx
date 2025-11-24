import React, { useMemo } from 'react';
import { calculateTotalPremium } from '../../utils/metricsCalculator';
import { calculatePLMetrics } from '../../utils/metricsCalculator';

/**
 * Компонент финансового контроля позиций
 * Отображает расчеты стоимости позиций, затрат на опционы и проверку лимитов
 */
function PositionFinancialControl({ 
  positions = [], 
  options = [],
  currentPrice = 0,
  daysRemaining = 0,
  financialControlEnabled = false,
  depositAmount = '',
  instrumentCount = '',
  maxLossPercent = ''
}) {
  // Рассчитываем стоимость позиций базового актива
  const positionsCost = useMemo(() => {
    return positions.reduce((total, pos) => {
      if (!pos.visible) return total;
      const cost = Math.abs(pos.quantity * pos.price);
      return total + cost;
    }, 0);
  }, [positions]);

  // Получаем затраты на опционы (премия)
  const { optionsPremium, optionsCost } = useMemo(() => {
    const completeOptions = options.filter(opt => 
      opt.date && 
      opt.strike && 
      opt.premium !== undefined &&
      opt.premium !== null &&
      opt.visible !== false
    );
    
    // Получаем премию (отрицательная = дебет, положительная = кредит)
    const premium = calculateTotalPremium(completeOptions);
    
    // Если премия положительная (кредит) - это уменьшает затраты
    // Если премия отрицательная (дебет) - это увеличивает затраты
    return {
      optionsPremium: premium,
      optionsCost: Math.abs(premium)
    };
  }, [options]);

  // Итоговая сумма
  // Если премия положительная (кредит), вычитаем из стоимости позиций
  // Если премия отрицательная (дебет), прибавляем к стоимости позиций
  const totalCost = optionsPremium >= 0 
    ? Math.max(0, positionsCost - optionsCost)  // Вычитаем кредит, но не меньше 0
    : positionsCost + optionsCost;              // Прибавляем дебет

  // Рассчитываем лимит на инструмент
  const instrumentLimit = useMemo(() => {
    if (!financialControlEnabled || !depositAmount || !instrumentCount) return null;
    const deposit = parseFloat(depositAmount);
    const count = parseInt(instrumentCount);
    if (deposit <= 0 || count <= 0) return null;
    return Math.round(deposit / count);
  }, [financialControlEnabled, depositAmount, instrumentCount]);

  // Проверяем превышение лимита на инструмент
  const instrumentLimitExceeded = instrumentLimit && totalCost > instrumentLimit;
  const instrumentExcessAmount = instrumentLimitExceeded ? totalCost - instrumentLimit : 0;

  // Рассчитываем MAX убыток из метрик
  const maxLoss = useMemo(() => {
    const completeOptions = options.filter(opt => 
      opt.date && 
      opt.strike && 
      opt.premium !== undefined &&
      opt.premium !== null &&
      opt.visible !== false
    );
    
    if (completeOptions.length === 0) return 0;
    
    const plMetrics = calculatePLMetrics(completeOptions, currentPrice, positions, daysRemaining);
    return Math.abs(plMetrics.maxLoss);
  }, [options, currentPrice, positions, daysRemaining]);

  // Рассчитываем лимит MAX убытка
  const maxLossLimit = useMemo(() => {
    if (!financialControlEnabled || !depositAmount || !instrumentCount || !maxLossPercent) return null;
    const deposit = parseFloat(depositAmount);
    const count = parseInt(instrumentCount);
    const percent = parseFloat(maxLossPercent);
    if (deposit <= 0 || count <= 0 || percent <= 0) return null;
    return Math.round((deposit / count) * (percent / 100));
  }, [financialControlEnabled, depositAmount, instrumentCount, maxLossPercent]);

  // Проверяем превышение лимита MAX убытка
  const maxLossLimitExceeded = maxLossLimit && maxLoss > maxLossLimit;
  const maxLossExcessAmount = maxLossLimitExceeded ? maxLoss - maxLossLimit : 0;

  // Проверяем, есть ли хотя бы одно превышение
  const hasAnyExcess = instrumentLimitExceeded || maxLossLimitExceeded;

  // Форматирование чисел с разделителями
  const formatNumber = (num) => {
    return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };

  // Если нет позиций и опционов - не показываем блок
  if (positions.length === 0 && options.length === 0) {
    return null;
  }

  return (
    <div 
      className={`border rounded-lg p-4 space-y-3 ${
        hasAnyExcess ? 'border-red-500 animate-border-blink' : 'border-gray-300'
      }`}
    >
      {/* Блок стоимости позиций */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Стоимость позиций</span>
          <span>$ {formatNumber(positionsCost)}</span>
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>Затраты на опционы и маржин</span>
          <span>$ {formatNumber(optionsCost)}</span>
        </div>
        <div className="flex justify-between text-sm font-semibold border-t pt-2">
          <span>Итого</span>
          <span>$ {formatNumber(totalCost)}</span>
        </div>
      </div>

      {/* Плашка лимита на инструмент */}
      {instrumentLimit && (
        <div 
          className={`px-3 py-2 rounded text-center text-sm font-medium ${
            instrumentLimitExceeded 
              ? 'bg-red-500 text-white' 
              : 'bg-gray-200 text-gray-500'
          }`}
        >
          {instrumentLimitExceeded ? (
            <>Лимит $ {formatNumber(instrumentLimit)} - ПРЕВЫШЕНИЕ на $ {formatNumber(instrumentExcessAmount)}</>
          ) : (
            <>Лимит $ {formatNumber(instrumentLimit)} - В РАМКАХ ЛИМИТА</>
          )}
        </div>
      )}

      {/* Блок MAX убыток */}
      <div className="space-y-2 pt-2">
        <div className="flex justify-between text-sm font-semibold">
          <span>MAX убыток</span>
          <span className="text-red-600">-$ {formatNumber(maxLoss)}</span>
        </div>
      </div>

      {/* Плашка лимита MAX убытка */}
      {maxLossLimit && (
        <div 
          className={`px-3 py-2 rounded text-center text-sm font-medium ${
            maxLossLimitExceeded 
              ? 'bg-red-500 text-white' 
              : 'bg-gray-200 text-gray-500'
          }`}
        >
          {maxLossLimitExceeded ? (
            <>Лимит $ {formatNumber(maxLossLimit)} - ПРЕВЫШЕНИЕ на $ {formatNumber(maxLossExcessAmount)}</>
          ) : (
            <>Лимит $ {formatNumber(maxLossLimit)} - В РАМКАХ ЛИМИТА</>
          )}
        </div>
      )}
    </div>
  );
}

export default PositionFinancialControl;
