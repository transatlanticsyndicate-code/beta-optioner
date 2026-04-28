import React, { useMemo } from 'react';
import { calculateTotalPremium } from '../../utils/metricsCalculator';
import { calculatePLMetrics } from '../../utils/metricsCalculator';
import { calculatePortfolioPLAtPrice } from '../../utils/metricsCalculator';
import { CALCULATOR_MODES } from '../../utils/universalPricing';

/**
 * Компонент финансового контроля позиций
 * Отображает расчеты стоимости позиций, затрат на опционы и проверку лимитов
 */
function PositionFinancialControl({
  positions = [],
  options = [],
  currentPrice = 0,
  daysPassed = 0,
  financialControlEnabled = false,
  depositAmount = '',
  instrumentCount = '',
  maxLossPercent = '',
  ivSurface = null,
  isAIEnabled = false,
  aiVolatilityMap = {},
  targetPrice = 0,
  calculatorMode = CALCULATOR_MODES.STOCKS,
  contractMultiplier = 100,
  dividendYield = 0,
  selectedTicker = ''
}) {
  // Стоимость позиций БА со знаком: LONG → затраты (−), SHORT → получили (+)
  const positionsCost = useMemo(() => {
    return positions.reduce((total, pos) => {
      if (!pos.visible) return total;
      const sign = pos.type === 'SHORT' ? 1 : -1;
      return total + sign * Math.abs(pos.quantity * pos.price);
    }, 0);
  }, [positions]);

  // Премия опционов со знаком: Buy → −, Sell → + (calculateTotalPremium уже даёт со знаком)
  const optionsCost = useMemo(() => {
    const completeOptions = options.filter(opt =>
      opt.date &&
      opt.strike &&
      opt.premium !== undefined &&
      opt.premium !== null &&
      opt.visible !== false
    );
    return calculateTotalPremium(completeOptions, contractMultiplier);
  }, [options, contractMultiplier]);

  // Итог = арифметическая сумма с учётом знаков (нетто кеш-флоу при входе)
  const totalCost = positionsCost + optionsCost;

  // Рассчитываем лимит на инструмент
  const instrumentLimit = useMemo(() => {
    if (!financialControlEnabled || !depositAmount || !instrumentCount) return null;
    const deposit = parseFloat(depositAmount);
    const count = parseInt(instrumentCount);
    if (deposit <= 0 || count <= 0) return null;
    return Math.round(deposit / count);
  }, [financialControlEnabled, depositAmount, instrumentCount]);

  // Лимит превышен только при нетто-затратах (totalCost < 0); кредит лимит не нарушает
  const usedCapital = totalCost < 0 ? Math.abs(totalCost) : 0;
  const instrumentLimitExceeded = instrumentLimit && usedCapital > instrumentLimit;
  const instrumentExcessAmount = instrumentLimitExceeded ? usedCapital - instrumentLimit : 0;

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
    
    const plMetrics = calculatePLMetrics(
      completeOptions, 
      currentPrice, 
      positions, 
      daysPassed, 
      ivSurface,
      0, // dividendYield
      false, // isAIEnabled
      {}, // aiVolatilityMap
      0, // targetPrice
      '', // selectedTicker
      calculatorMode,
      contractMultiplier
    );
    return Math.abs(plMetrics.maxLoss);
  }, [options, currentPrice, positions, daysPassed, ivSurface, calculatorMode, contractMultiplier]);

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

  // P&L базового актива и P&L TOTAL в точке симуляции (цена + дни)
  // ЗАЧЕМ: пользователь должен видеть числа без наведения на график; обязаны совпадать с тултипом графика
  const { underlyingPL, totalPL } = useMemo(() => {
    if (!positions || positions.length === 0 || !currentPrice) {
      return { underlyingPL: 0, totalPL: 0 };
    }
    const simPrice = Number(targetPrice) > 0 ? Number(targetPrice) : Number(currentPrice);
    const result = calculatePortfolioPLAtPrice({
      price: simPrice,
      daysPassed,
      positions,
      options,
      currentPrice,
      ivSurface,
      calculatorMode,
      contractMultiplier,
      dividendYield,
      isAIEnabled,
      aiVolatilityMap,
      selectedTicker
    });
    return { underlyingPL: result.underlyingPL, totalPL: result.totalPL };
  }, [positions, options, currentPrice, daysPassed, targetPrice, ivSurface, calculatorMode, contractMultiplier, dividendYield, isAIEnabled, aiVolatilityMap, selectedTicker]);

  // Форматирование чисел с разделителями
  const formatNumber = (num) => {
    return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };

  // Подписанная сумма со знаком и форматом, как в столбце P&L таблицы и тултипе графика
  const formatSignedAmount = (num) => {
    const value = Number(num) || 0;
    const sign = value > 0 ? '+' : (value < 0 ? '−' : '');
    return `${sign}$ ${formatNumber(Math.abs(value))}`;
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
      {/* P&L базового актива и P&L TOTAL — показываем только когда есть хотя бы одна позиция БА */}
      {/* ЗАЧЕМ: пользователь хочет видеть «живой» P&L из графика прямо в карточке */}
      {positions.length > 0 && (
        <div className="space-y-2 pb-3 border-b">
          <div className="flex justify-between text-xs text-gray-500">
            <span>P&amp;L базового актива</span>
            <span className={underlyingPL >= 0 ? 'text-green-600' : 'text-red-600'}>
              {formatSignedAmount(underlyingPL)}
            </span>
          </div>
          <div className="flex justify-between text-sm font-semibold">
            <span>P&amp;L TOTAL</span>
            <span className={totalPL >= 0 ? 'text-green-600' : 'text-red-600'}>
              {formatSignedAmount(totalPL)}
            </span>
          </div>
        </div>
      )}

      {/* Блок стоимости позиций — со знаками: LONG/Buy → −, SHORT/Sell → + */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Стоимость позиций</span>
          <span>{formatSignedAmount(positionsCost)}</span>
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>Затраты на опционы и маржин</span>
          <span>{formatSignedAmount(optionsCost)}</span>
        </div>
        <div className="flex justify-between text-sm font-semibold border-t pt-2">
          <span>Итого</span>
          <span className={totalCost > 0 ? 'text-green-600' : (totalCost < 0 ? 'text-red-600' : '')}>
            {formatSignedAmount(totalCost)}
          </span>
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
