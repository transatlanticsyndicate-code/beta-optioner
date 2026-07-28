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

// IV в долях: цепочка из расширения присылает в процентах (54.62) — делим на 100.
const normalizeIV = (iv) => {
  const n = Number(iv);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1.5 ? n / 100 : n;
};

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
  pointValue,
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
  // pointValue нужен для фьючерсов (Black-76 × стоимость пункта); у акций/крипты
  // calculateOptionPLValue его игнорирует, поэтому передаём всегда (по умолч. 1).
  let pl = calculateOptionPLValue(
    option,
    targetPrice,
    currentPrice,
    daysRemainingAtCalcDate,
    { mode: calculatorMode, overrideVolatility: iv, dividendYield, pointValue },
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
    pointValue = 1,
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
  // Признак несостоявшегося расчёта: нули из catch нельзя принимать за настоящий
  // P&L — иначе шлюз по допуску пропустит сломанную комбинацию как идеальную.
  let plComputeFailed = false;
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
      pointValue,
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
    plComputeFailed = true;
  }

  // P&L базового актива: у фьючерсов 1 контракт = (изменение цены) × стоимость пункта;
  // у акций/крипты множитель = 1 (контракт актива = 1 единица по цене).
  const assetMult = calculatorMode === CALCULATOR_MODES.FUTURES ? (Number(pointValue) || 1) : 1;
  const assetPLTop = withStock ? (topPrice - entry) * qtyStock * assetMult : 0;
  const assetPLBottom = withStock ? (bottomPrice - entry) * qtyStock * assetMult : 0;
  const assetPLA = withStock ? (levelA - entry) * qtyStock * assetMult : 0;
  const assetPLB = withStock ? (levelB - entry) * qtyStock * assetMult : 0;

  const totalPLTop = optionsPLTop + assetPLTop;
  const bottomMetric = withStock ? optionsPLBottom + assetPLBottom : optionsPLBottom;

  return {
    ...combination,
    plComputeFailed,
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

/**
 * Шлюз по допуску P&L на низу. Стратегия требует, чтобы на нижней цене позиция
 * закрывалась около нуля (|P&L по низу| ≤ допуск). Если комбинация в допуск не
 * укладывается — заменяем её на блок-ошибку «нет подходящей комбинации», чтобы
 * не показывать заведомо слабый вариант. Пояснение ИИ сохраняем.
 * Без заданного допуска (нет/≤0) — не фильтруем.
 *
 * @param {object} combination — обогащённый блок (после enrichNorthGptCombination)
 * @param {number} plTolerance — допустимый диапазон P&L по низу ± ($)
 */
export const gateByBottomTolerance = (combination, plTolerance) => {
  if (!combination || combination.error || !Array.isArray(combination.positions)) return combination;
  const tol = Number(plTolerance);
  if (!Number.isFinite(tol) || tol <= 0) return combination;
  // Расчёт P&L не состоялся: нули — не «идеальный ноль», а отсутствие данных.
  // Пропустить такую комбинацию через допуск значило бы выдать сбой за успех.
  if (combination.plComputeFailed) {
    return {
      error: 'Не удалось рассчитать P&L для этой комбинации — проверить нельзя. Попробуйте подобрать заново.',
      rationale: combination.rationale,
    };
  }
  const bottom = Number(combination?.criteria?.bottomMetric);
  if (!Number.isFinite(bottom)) {
    return {
      error: 'Не удалось рассчитать P&L по низу для этой комбинации. Попробуйте подобрать заново.',
      rationale: combination.rationale,
    };
  }
  if (Math.abs(bottom) > tol) {
    return {
      error: `Нет подходящей комбинации: P&L по низу выходит за допуск ±$${tol}.`,
      rationale: combination.rationale,
    };
  }
  return combination;
};

/**
 * Посчитать для КАЖДОГО опциона цепочки прогнозный P&L одного купленного
 * контракта на дату расчёта при цене актива topPrice и bottomPrice.
 *
 * ЗАЧЕМ: модель не умеет точно оценивать опционы «в уме» (в веб-ChatGPT это
 * делал код-интерпретатор). Отдаём ей готовые числа — теми же функциями, что
 * и экран результата — и модель лишь складывает их с количеством. Итог модели
 * в точности совпадает с тем, что покажет калькулятор.
 *
 * Возвращает копию цепочки с добавленными plTop и plBottom (доллары за 1 контракт).
 */
export const precomputeChainPLs = (chain, ctx) => {
  if (!Array.isArray(chain)) return chain;
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
    pointValue = 1,
  } = ctx || {};

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
    pointValue,
  };

  return chain.map((row) => {
    const option = {
      action: 'Buy',
      type: (row.type || '').toUpperCase(),
      strike: Number(row.strike),
      date: row.date || expirationDate,
      quantity: 1,
      premium: Number(row.ask) || 0,
      bid: Number(row.bid) || 0,
      ask: Number(row.ask) || 0,
      impliedVolatility: normalizeIV(row.impliedVolatility ?? row.iv ?? row.askIV),
      delta: Number(row.delta) || 0,
      entryDate: today,
      assetPriceAtEntry: entry,
    };
    let plTop = 0;
    let plBottom = 0;
    try {
      plTop = computeOptionPL({ option, targetPrice: topPrice, ...common });
      plBottom = computeOptionPL({ option, targetPrice: bottomPrice, ...common });
    } catch (e) {
      plTop = 0;
      plBottom = 0;
    }
    return {
      ...row,
      plTop: Number.isFinite(plTop) ? Math.round(plTop) : 0,
      plBottom: Number.isFinite(plBottom) ? Math.round(plBottom) : 0,
    };
  });
};
