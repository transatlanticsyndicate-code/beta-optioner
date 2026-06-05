/**
 * Досчёт P&L-метрик (criteria/meta) для комбинаций стратегии «Север GPT».
 *
 * ЗАЧЕМ: бэкенд присылает ноги с РЕАЛЬНЫМИ ценами из цепочки, но не считает P&L
 * (в Python нет пайплайна Black-Scholes). Карточка результата (ResultCard,
 * переиспользуется от «Севера») требует criteria/meta. Считаем их ТЕМИ ЖЕ
 * функциями ценообразования, что и «Север» — цифры совпадают с калькулятором.
 *
 * «Север» НЕ модифицируется: переиспользуются только базовые модули pricing
 * и read-only константа NORTH_KINDS.
 */

import { calculateOptionPLValue, CALCULATOR_MODES } from '../universalPricing';
import { getOptionVolatility } from '../volatilitySurface';
import { adjustPLByStockGroup } from '../optionPricing';
import { isStockLikeMode } from '../calculatorModes';
import { NORTH_KINDS } from '../northStrategy/analyzer';

const daysBetween = (fromIso, toIso) => {
  const a = new Date(`${fromIso}T00:00:00Z`).getTime();
  const b = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
};

const todayIso = () => new Date().toISOString().split('T')[0];

// Точная копия computeOptionPL из northStrategy/analyzer — тот же расчёт P&L,
// чтобы превью результата совпадало с тем, что покажет калькулятор после «Применить».
const computeOptionPL = ({
  option,
  targetPrice,
  currentPrice,
  daysRemainingAtCalcDate,
  todayDaysToExp,
  ivSurface,
  calculatorMode,
  dividendYield,
  stockClassification,
}) => {
  const iv = getOptionVolatility(
    option,
    todayDaysToExp,
    daysRemainingAtCalcDate,
    ivSurface,
    'simple',
    null,
    null,
    todayDaysToExp,
  );
  let pl = calculateOptionPLValue(
    option,
    targetPrice,
    currentPrice,
    daysRemainingAtCalcDate,
    { mode: calculatorMode, overrideVolatility: iv, dividendYield },
  );
  if (isStockLikeMode(calculatorMode) && stockClassification) {
    pl = adjustPLByStockGroup(pl, stockClassification);
  }
  return pl;
};

/**
 * Дополнить блок комбинации полями criteria и meta.
 * Блоки с ошибкой возвращаются без изменений.
 *
 * @param {object} combination — блок ответа бэкенда {kind, positions, calls, puts, qtyStock, cost, rationale}
 * @param {object} ctx — { entry, currentPrice, topPrice, bottomPrice, expirationDate, calcDate,
 *                          ivSurface, calculatorMode, dividendYield, stockClassification }
 */
export const enrichNorthGptCombination = (combination, ctx) => {
  if (!combination || combination.error) return combination;
  const {
    entry,
    currentPrice,
    topPrice,
    bottomPrice,
    expirationDate,
    calcDate,
    ivSurface = null,
    calculatorMode = CALCULATOR_MODES.STOCKS,
    dividendYield = 0,
    stockClassification = null,
  } = ctx || {};

  const withStock = combination.kind === NORTH_KINDS.WITH_STOCK;
  const qtyStock = Number(combination.qtyStock) || 0;
  const positions = Array.isArray(combination.positions) ? combination.positions : [];

  const levelA = entry + (topPrice - entry) / 2;
  const levelB = entry + (bottomPrice - entry) / 2;

  const safe = (v) => (Number.isFinite(v) ? v : 0);

  let optionsPLTop = 0;
  let optionsPLBottom = 0;
  let optionsPLA = 0;
  let optionsPLB = 0;
  try {
    const today = todayIso();
    const todayDaysToExp = daysBetween(today, expirationDate);
    const daysRemainingAtCalcDate = daysBetween(calcDate, expirationDate);
    const common = {
      currentPrice,
      daysRemainingAtCalcDate,
      todayDaysToExp,
      ivSurface,
      calculatorMode,
      dividendYield,
      stockClassification,
    };
    for (const option of positions) {
      optionsPLTop += safe(computeOptionPL({ option, targetPrice: topPrice, ...common }));
      optionsPLBottom += safe(computeOptionPL({ option, targetPrice: bottomPrice, ...common }));
      optionsPLA += safe(computeOptionPL({ option, targetPrice: levelA, ...common }));
      optionsPLB += safe(computeOptionPL({ option, targetPrice: levelB, ...common }));
    }
  } catch (e) {
    // ЗАЧЕМ: при сбое расчёта показываем нули, а не роняем карточку — ей нужны числа.
    optionsPLTop = 0;
    optionsPLBottom = 0;
    optionsPLA = 0;
    optionsPLB = 0;
  }

  const assetPLTop = withStock ? (topPrice - entry) * qtyStock : 0;
  const assetPLBottom = withStock ? (bottomPrice - entry) * qtyStock : 0;
  const assetPLA = withStock ? (levelA - entry) * qtyStock : 0;
  const assetPLB = withStock ? (levelB - entry) * qtyStock : 0;

  const totalPLTop = optionsPLTop + assetPLTop;
  const bottomMetric = withStock ? optionsPLBottom + assetPLBottom : optionsPLBottom;

  return {
    ...combination,
    criteria: {
      bottomMetric,
      topOptions: optionsPLTop,
      topTotal: withStock ? totalPLTop : optionsPLTop,
    },
    meta: {
      optionsPLBottom,
      optionsPLTop,
      assetPLBottom,
      assetPLTop,
      totalPLBottom: bottomMetric,
      totalPLTop,
      levelA,
      levelB,
      plAtLevelA: optionsPLA + assetPLA,
      plAtLevelB: optionsPLB + assetPLB,
    },
  };
};
