import React, { useMemo } from 'react';
import { calculateTotalPremium } from '../../utils/metricsCalculator';
import { calculatePLMetrics } from '../../utils/metricsCalculator';
import { CALCULATOR_MODES } from '../../utils/universalPricing';
import { getMarginPerContract } from '../../utils/futuresSettings';

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
  selectedTicker = '',
  leverage = 1,
  stockClassification = null,
  optionsTotalPL = null
}) {
  // ЗАЧЕМ: плечо БА — маржинальное требование брокера, делит notional на N.
  // Если значение мусорное (NaN, < 1, undefined) — работаем без плеча.
  const effectiveLeverage = (typeof leverage === 'number' && Number.isFinite(leverage) && leverage >= 1) ? leverage : 1;

  // Стоимость / маржин позиций БА со знаком: LONG → затраты (−), SHORT → получили (+).
  // С учётом плеча: значение делится на effectiveLeverage (LONG и SHORT симметрично).
  //
  // - Акции/крипто: основа = quantity × price (цена входа), это полная стоимость позиции.
  // - Фьючерсы: основа = quantity × marginPerContract из настроек /settings?section=futures.
  //   ЗАЧЕМ: Для фьючерсов «стоимость» бессмысленна — резервируется маржин у брокера.
  //   Если для тикера в настройках нет маржина, его вклад в сумму = 0
  //   (пользователь увидит предупреждение в строке позиции БА).
  const isFutures = calculatorMode === CALCULATOR_MODES.FUTURES;
  const positionsCost = useMemo(() => {
    const raw = positions.reduce((total, pos) => {
      if (!pos.visible) return total;
      const sign = pos.type === 'SHORT' ? 1 : -1;
      let perUnit;
      if (isFutures) {
        const margin = getMarginPerContract(pos.ticker);
        if (margin == null) return total;
        perUnit = margin;
      } else {
        perUnit = pos.price;
      }
      return total + sign * Math.abs(pos.quantity * perUnit);
    }, 0);
    return raw / effectiveLeverage;
  }, [positions, effectiveLeverage, isFutures]);

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

  // Рассчитываем MAX убыток из метрик — со знаком, как вернула формула
  // (отрицательное — реальный убыток, положительное — гарантированный мин. профит, 0 — точка перехода)
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
    return plMetrics.maxLoss;
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

  // Экспозиция к убытку — абсолют величины, ТОЛЬКО когда maxLoss реально отрицателен.
  // Если стратегия гарантирует мин. профит (maxLoss >= 0), фактической экспозиции к убытку нет
  // и лимит «потерь» считается не превышённым.
  const lossExposure = maxLoss < 0 ? Math.abs(maxLoss) : 0;

  // Проверяем превышение лимита MAX убытка
  const maxLossLimitExceeded = maxLossLimit && lossExposure > maxLossLimit;
  const maxLossExcessAmount = maxLossLimitExceeded ? lossExposure - maxLossLimit : 0;

  // Проверяем, есть ли хотя бы одно превышение
  const hasAnyExcess = instrumentLimitExceeded || maxLossLimitExceeded;

  // P&L базового актива — линейная формула, не зависит от опционов.
  // P&L TOTAL = P&L актива + ИТОГО таблицы опционов (готовое число от родителя через optionsTotalPL).
  // ЗАЧЕМ: Единый источник истины — то же число, что отображается в строке «ИТОГО» таблицы.
  // Никакого пересчёта по своей формуле — это исключает любые расхождения структурно.
  const { underlyingPL, totalPL } = useMemo(() => {
    if (!positions || positions.length === 0 || !currentPrice) {
      return { underlyingPL: 0, totalPL: 0 };
    }
    const simPrice = Number(targetPrice) > 0 ? Number(targetPrice) : Number(currentPrice);
    let upl = 0;
    positions.filter(p => p && p.visible !== false).forEach((position) => {
      const qty = Number(position.quantity) || 0;
      const entry = Number(position.price) || 0;
      const mult = calculatorMode === CALCULATOR_MODES.FUTURES ? contractMultiplier : 1;
      if (position.type === 'LONG') {
        upl += (simPrice - entry) * qty * mult;
      } else if (position.type === 'SHORT') {
        upl += (entry - simPrice) * qty * mult;
      }
    });
    const optionsSum = (optionsTotalPL === null || optionsTotalPL === undefined || isNaN(optionsTotalPL)) ? 0 : Number(optionsTotalPL);
    return { underlyingPL: upl, totalPL: upl + optionsSum };
  }, [positions, currentPrice, targetPrice, calculatorMode, contractMultiplier, optionsTotalPL]);

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

  // ЗАЧЕМ: В фьючерсном режиме «стоимость» некорректна (резервируется маржин),
  // поэтому переименовываем лейбл в «Маржин позиций».
  const positionsCostBaseLabel = isFutures ? 'Маржин позиций' : 'Стоимость позиций';
  const positionsCostLabel = effectiveLeverage > 1
    ? `${positionsCostBaseLabel} (плечо ${effectiveLeverage})`
    : positionsCostBaseLabel;

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
          <span title={
            effectiveLeverage > 1
              ? (isFutures
                  ? 'Маржин на 1 контракт × количество контрактов, делится на плечо.'
                  : 'Делится на плечо. Маржинальное требование, не полная стоимость акций.')
              : undefined
          }>
            {positionsCostLabel}
          </span>
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

      {/* Блок MAX убыток — знак и цвет соответствуют реальному значению:
          отрицательное (убыток) — красный с минусом, положительное (гарантированный
          мин. профит) — зелёный с плюсом, ноль — серый. */}
      <div className="space-y-2 pt-2">
        <div className="flex justify-between text-sm font-semibold">
          <span>MAX убыток</span>
          <span className={
            maxLoss < 0 ? 'text-red-600'
              : maxLoss > 0 ? 'text-green-600'
                : 'text-gray-500'
          }>
            {maxLoss < 0 ? '-' : maxLoss > 0 ? '+' : ''}$ {formatNumber(Math.abs(maxLoss))}
          </span>
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
