/**
 * Стратегия СЕВЕР v3 — мульти-страйковый жадный анализатор.
 *
 * ЗАЧЕМ: На лонг-позицию по БА (или без неё) подбираем защитную конструкцию
 * из произвольного набора Buy Call + Buy Put разных страйков и количеств так,
 * чтобы на низу P&L был близок к 0, а на верху P&L опционов был максимален.
 *
 * Два режима — одна точка входа:
 *  - `withStock`    : актив + опционы. qtyStock — переменная (от 50 до максимума
 *                     по марже, шаг 25). Стоковая часть маржи = qty × entry / leverage.
 *                     Критерий «низ» = P&L всей позиции (актив + опционы) на calcDate → 0.
 *  - `optionsOnly`  : только опционы. qtyStock = 0. Критерий «низ» = P&L
 *                     опционов на calcDate → 0.
 *
 * Алгоритм:
 *  1. Пред-расчёт P&L per контракт для каждого Call/Put-страйка на четырёх ценах
 *     (верх, низ, уровень A, уровень B). Single BS-call per (option, price).
 *  2. Внешний цикл: qtyStock × все callSeed × все putSeed.
 *  3. Внутри — жадное наращивание: на каждом шаге добавляется 1 контракт того
 *     страйка (Call или Put), который сильнее всего улучшает текущий score.
 *     Шаг останавливается, когда улучшения нет или бюджет исчерпан.
 *  4. Дедупликация по сигнатуре (qtyStock | sorted Call-страйки и qty | sorted Put-…).
 *
 * Жадная оценка score двухфазная:
 *  - Пока |bottomMetric| > plTolerance, оптимизируем низ (минимизируем |bottomMetric|).
 *  - Когда низ в коридоре, максимизируем topOptions, не разрешая выходить за tol.
 *
 * Уровни A/B (информационные, в скоринг не входят):
 *   A = entry + (top  - entry) / 2
 *   B = entry + (bot  - entry) / 2
 */

import { calculateOptionPLValue, CALCULATOR_MODES } from '../universalPricing';
import { getOptionVolatility } from '../volatilitySurface';
import { adjustPLByStockGroup } from '../optionPricing';
import { isStockLikeMode } from '../calculatorModes';

export const NORTH_KINDS = Object.freeze({
  WITH_STOCK: 'withStock',
  OPTIONS_ONLY: 'optionsOnly',
});

const CONTRACT_MULTIPLIER = 100;
const MAX_GREEDY_ITERATIONS = 60;
const STOCK_STEP = 25;
const STOCK_MIN = 50;
// Минимальная доля маржи на акцию для режима withStock (по ТЗ — не меньше 40%).
export const DEFAULT_MIN_STOCK_MARGIN_PCT = 0.40;

/**
 * Проверка низа в зависимости от режима низа.
 *  - strictAbs        : |bottomMetric| ≤ tol (минус и плюс ограничены симметрично);
 *  - noWorseThanLoss  : bottomMetric ≥ −tol (минус ограничен, плюс разрешён).
 */
const bottomPasses = (bottomMetric, plTolerance, bottomMode) => (
  bottomMode === 'strictAbs'
    ? Math.abs(bottomMetric) <= plTolerance
    : bottomMetric >= -plTolerance
);

/**
 * Штраф за низ для ранжирования: 0 — низ идеален/лучше идеала.
 *  - strictAbs        : |bottomMetric| (любое отклонение от 0 — штраф);
 *  - noWorseThanLoss  : max(0, −bottomMetric) (плюс штрафа не даёт).
 */
const bottomPenaltyOf = (bottomMetric, bottomMode) => (
  bottomMode === 'strictAbs'
    ? Math.abs(bottomMetric)
    : Math.max(0, -bottomMetric)
);

const normalizeIV = (iv) => {
  const n = Number(iv);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1 ? n / 100 : n;
};

const daysBetween = (fromIso, toIso) => {
  const a = new Date(`${fromIso}T00:00:00Z`).getTime();
  const b = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
};

const todayIso = () => new Date().toISOString().split('T')[0];

const buildOptionPosition = ({ chainOpt, action, quantity, entryAssetPrice, entryDate }) => ({
  id: `north-${chainOpt.type}-${chainOpt.strike}-${chainOpt.date}-${quantity}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  action,
  type: chainOpt.type,
  strike: Number(chainOpt.strike),
  date: chainOpt.date,
  quantity,
  premium: Number(chainOpt.ask) || Number(chainOpt.premium) || 0,
  bid: Number(chainOpt.bid) || 0,
  ask: Number(chainOpt.ask) || 0,
  volume: Number(chainOpt.volume) || 0,
  oi: 0,
  visible: true,
  isLoadingDetails: false,
  impliedVolatility: normalizeIV(chainOpt.impliedVolatility ?? chainOpt.iv ?? chainOpt.askIV),
  delta: Number(chainOpt.delta) || 0,
  gamma: Number(chainOpt.gamma) || 0,
  theta: Number(chainOpt.theta) || 0,
  vega: Number(chainOpt.vega) || 0,
  entryDate,
  assetPriceAtEntry: entryAssetPrice,
});

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
    {
      mode: calculatorMode,
      overrideVolatility: iv,
      dividendYield,
    },
  );

  if (isStockLikeMode(calculatorMode) && stockClassification) {
    pl = adjustPLByStockGroup(pl, stockClassification);
  }
  return pl;
};

export const findClosestExpiration = (chain, targetIso) => {
  if (!Array.isArray(chain) || chain.length === 0 || !targetIso) return null;
  const uniqueDates = Array.from(new Set(chain.map((o) => o.date).filter(Boolean)));
  if (uniqueDates.length === 0) return null;
  const target = new Date(`${targetIso}T00:00:00Z`).getTime();
  let best = uniqueDates[0];
  let bestDiff = Math.abs(new Date(`${best}T00:00:00Z`).getTime() - target);
  for (const d of uniqueDates) {
    const diff = Math.abs(new Date(`${d}T00:00:00Z`).getTime() - target);
    if (diff < bestDiff) {
      best = d;
      bestDiff = diff;
    }
  }
  return best;
};

/**
 * Пред-расчёт P&L per contract для каждого страйка на четырёх ценах.
 * Возвращает массив компактных дескрипторов.
 */
const precomputeStrikePLs = ({
  rawOptions,
  topPrice,
  bottomPrice,
  levelA,
  levelB,
  currentPrice,
  entry,
  todayDaysToExp,
  daysRemainingAtCalcDate,
  ivSurface,
  calculatorMode,
  dividendYield,
  stockClassification,
  today,
}) => {
  const result = [];
  for (const raw of rawOptions) {
    // buildOptionPosition с qty=1 — единичная позиция для пайплайна BS.
    const opt = buildOptionPosition({
      chainOpt: raw,
      action: 'Buy',
      quantity: 1,
      entryAssetPrice: entry,
      entryDate: today,
    });
    const plTop = computeOptionPL({
      option: opt, targetPrice: topPrice, currentPrice,
      daysRemainingAtCalcDate, todayDaysToExp, ivSurface, calculatorMode, dividendYield, stockClassification,
    });
    const plBottom = computeOptionPL({
      option: opt, targetPrice: bottomPrice, currentPrice,
      daysRemainingAtCalcDate, todayDaysToExp, ivSurface, calculatorMode, dividendYield, stockClassification,
    });
    const plLevelA = computeOptionPL({
      option: opt, targetPrice: levelA, currentPrice,
      daysRemainingAtCalcDate, todayDaysToExp, ivSurface, calculatorMode, dividendYield, stockClassification,
    });
    const plLevelB = computeOptionPL({
      option: opt, targetPrice: levelB, currentPrice,
      daysRemainingAtCalcDate, todayDaysToExp, ivSurface, calculatorMode, dividendYield, stockClassification,
    });
    result.push({
      raw,
      strike: Number(raw.strike),
      type: raw.type,
      ask: Number(raw.ask) || 0,
      bid: Number(raw.bid) || 0,
      iv: normalizeIV(raw.impliedVolatility ?? raw.iv ?? raw.askIV),
      costPerContract: (Number(raw.ask) || 0) * CONTRACT_MULTIPLIER,
      plTop,
      plBottom,
      plLevelA,
      plLevelB,
    });
  }
  return result;
};

/**
 * Жадно собрать ОДНУ комбинацию из стартовой пары (callSeed, putSeed) для заданного qtyStock и режима.
 */
const greedyBuild = ({
  qtyStock,
  mode,
  callSeed,
  putSeed,
  callPrecomp,
  putPrecomp,
  entry,
  topPrice,
  bottomPrice,
  levelA,
  levelB,
  leverage,
  marginMin,
  marginMax,
  plTolerance,
  minStockMarginPct,
}) => {
  const withStock = mode === NORTH_KINDS.WITH_STOCK;
  // Режим низа: withStock — строго ±tol (низ всей позиции около 0);
  // optionsOnly — «не хуже убытка» (плюс снизу допустим).
  const bottomMode = withStock ? 'strictAbs' : 'noWorseThanLoss';
  const bottomPass = (bm) => bottomPasses(bm, plTolerance, bottomMode);
  const bottomPenalty = (bm) => bottomPenaltyOf(bm, bottomMode);

  const stockMargin = withStock ? (qtyStock * entry) / leverage : 0;
  if (stockMargin > marginMax) return null;
  const budget = marginMax - stockMargin;
  if (budget <= 0) return null;

  // putSeed может быть null — это конструкция «только CALL» (для optionsOnly).
  const hasPut = !!putSeed;
  let spent = callSeed.costPerContract + (hasPut ? putSeed.costPerContract : 0);
  if (spent > budget) return null;

  // Карты страйк → quantity.
  const callsMap = new Map();
  const putsMap = new Map();
  callsMap.set(callSeed.strike, 1);
  if (hasPut) putsMap.set(putSeed.strike, 1);

  let plOptionsTop = callSeed.plTop + (hasPut ? putSeed.plTop : 0);
  let plOptionsBottom = callSeed.plBottom + (hasPut ? putSeed.plBottom : 0);
  let plOptionsAtA = callSeed.plLevelA + (hasPut ? putSeed.plLevelA : 0);
  let plOptionsAtB = callSeed.plLevelB + (hasPut ? putSeed.plLevelB : 0);

  const assetPLTop = withStock ? (topPrice - entry) * qtyStock : 0;
  const assetPLBottom = withStock ? (bottomPrice - entry) * qtyStock : 0;
  const assetPLAtA = withStock ? (levelA - entry) * qtyStock : 0;
  const assetPLAtB = withStock ? (levelB - entry) * qtyStock : 0;

  const computeBottomMetric = (plBot) => (withStock ? plBot + assetPLBottom : plBot);
  let bottomMetric = computeBottomMetric(plOptionsBottom);

  // Жадно: до MAX_GREEDY_ITERATIONS контрактов или пока есть улучшение.
  for (let iter = 0; iter < MAX_GREEDY_ITERATIONS; iter += 1) {
    // Улучшаем низ только пока он НЕ проходит фильтр. Как только низ допустим
    // (для optionsOnly это bm ≥ −tol — минус мелкий минус допустим), переходим
    // к максимизации верха, не добавляя лишних путов в чистый CALL.
    const needBottomImprovement = !bottomPass(bottomMetric);
    let bestImpr = 0;
    let bestSide = null;
    let bestStrike = null;

    const sides = [
      { name: 'call', precomp: callPrecomp },
      { name: 'put', precomp: putPrecomp },
    ];
    for (const side of sides) {
      for (const s of side.precomp) {
        if (spent + s.costPerContract > budget) continue;
        const newPlTop = plOptionsTop + s.plTop;
        const newPlBottom = plOptionsBottom + s.plBottom;
        const newBM = computeBottomMetric(newPlBottom);
        let impr;
        if (needBottomImprovement) {
          impr = bottomPenalty(bottomMetric) - bottomPenalty(newBM);
        } else {
          // Низ уже в допуске — не разрешаем ему выйти за допустимое.
          if (!bottomPass(newBM)) continue;
          impr = newPlTop - plOptionsTop;
        }
        if (impr > bestImpr) {
          bestImpr = impr;
          bestSide = side.name;
          bestStrike = s;
        }
      }
    }

    if (bestImpr <= 0 || !bestStrike) break;

    const targetMap = bestSide === 'call' ? callsMap : putsMap;
    targetMap.set(bestStrike.strike, (targetMap.get(bestStrike.strike) || 0) + 1);
    spent += bestStrike.costPerContract;
    plOptionsTop += bestStrike.plTop;
    plOptionsBottom += bestStrike.plBottom;
    plOptionsAtA += bestStrike.plLevelA;
    plOptionsAtB += bestStrike.plLevelB;
    bottomMetric = computeBottomMetric(plOptionsBottom);
  }

  // Финальные жёсткие фильтры.
  const marginUsed = stockMargin + spent;
  if (marginUsed < marginMin || marginUsed > marginMax) return null;
  if (!bottomPass(bottomMetric)) return null;
  if (!(plOptionsTop > 0)) return null;

  const totalPLTop = plOptionsTop + assetPLTop;
  if (withStock) {
    // Верх всей позиции должен быть положительным.
    if (!(totalPLTop > 0)) return null;
    // Доля акции в марже не меньше заданной (по ТЗ — 40%).
    const stockMarginPct = marginUsed > 0 ? stockMargin / marginUsed : 0;
    if (stockMarginPct < minStockMarginPct) return null;
  }

  return {
    qtyStock,
    callsMap,
    putsMap,
    spent,
    stockMargin,
    marginUsed,
    plOptionsTop,
    plOptionsBottom,
    plOptionsAtA,
    plOptionsAtB,
    bottomMetric,
    bottomPenalty: bottomPenalty(bottomMetric),
    assetPLTop,
    assetPLBottom,
    assetPLAtA,
    assetPLAtB,
    totalPLTop,
  };
};

/**
 * Канонический ключ комбинации для дедупликации.
 */
const dedupKey = (combo) => {
  const formatMap = (m) => Array.from(m.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([s, q]) => `${s}:${q}`)
    .join(',');
  return `${combo.qtyStock}|${formatMap(combo.callsMap)}|${formatMap(combo.putsMap)}`;
};

/**
 * Превратить «сырую» greedy-комбинацию в полную запись результата.
 */
const finalizeCombination = ({
  raw,
  mode,
  callPrecomp,
  putPrecomp,
  levelA,
  levelB,
  entry,
  today,
}) => {
  const calls = [];
  const positionsList = [];
  for (const [strike, quantity] of raw.callsMap.entries()) {
    const pre = callPrecomp.find((p) => p.strike === strike);
    if (!pre) continue;
    calls.push({
      raw: pre.raw,
      strike,
      ask: pre.ask,
      bid: pre.bid,
      iv: pre.iv,
      quantity,
    });
    positionsList.push(buildOptionPosition({
      chainOpt: pre.raw,
      action: 'Buy',
      quantity,
      entryAssetPrice: entry,
      entryDate: today,
    }));
  }
  const puts = [];
  for (const [strike, quantity] of raw.putsMap.entries()) {
    const pre = putPrecomp.find((p) => p.strike === strike);
    if (!pre) continue;
    puts.push({
      raw: pre.raw,
      strike,
      ask: pre.ask,
      bid: pre.bid,
      iv: pre.iv,
      quantity,
    });
    positionsList.push(buildOptionPosition({
      chainOpt: pre.raw,
      action: 'Buy',
      quantity,
      entryAssetPrice: entry,
      entryDate: today,
    }));
  }
  calls.sort((a, b) => a.strike - b.strike);
  puts.sort((a, b) => a.strike - b.strike);

  const sigParts = [
    `q${raw.qtyStock}`,
    'C:' + calls.map((c) => `${c.quantity}x${c.strike}`).join('+'),
    'P:' + puts.map((p) => `${p.quantity}x${p.strike}`).join('+'),
  ];
  return {
    id: sigParts.join('|'),
    calls,
    puts,
    qtyStock: raw.qtyStock,
    kind: mode,
    cost: {
      optionsCost: raw.spent,
      stockMargin: raw.stockMargin,
      marginUsed: raw.marginUsed,
      stockMarginPct: raw.marginUsed > 0 ? raw.stockMargin / raw.marginUsed : 0,
    },
    criteria: {
      bottomMetric: raw.bottomMetric,
      bottomPenalty: raw.bottomPenalty,
      // topOptions — P&L только опционов (отдельный фильтр «опционы сверху > 0» и UI).
      topOptions: raw.plOptionsTop,
      // topTotal — главный критерий верха: для withStock это акция + опционы,
      // для optionsOnly совпадает с topOptions.
      topTotal: mode === NORTH_KINDS.WITH_STOCK ? raw.totalPLTop : raw.plOptionsTop,
    },
    meta: {
      optionsPLBottom: raw.plOptionsBottom,
      optionsPLTop: raw.plOptionsTop,
      assetPLBottom: raw.assetPLBottom,
      assetPLTop: raw.assetPLTop,
      totalPLBottom: raw.bottomMetric,
      totalPLTop: raw.totalPLTop,
      levelA,
      levelB,
      plAtLevelA: raw.plOptionsAtA + raw.assetPLAtA,
      plAtLevelB: raw.plOptionsAtB + raw.assetPLAtB,
    },
    positions: positionsList,
  };
};

/**
 * Главная функция анализа.
 *
 * @returns {{withStock: Array, optionsOnly: Array, levels: {a:number,b:number}}}
 */
export const analyzeNorthStrategy = ({
  entry,
  assetQuantity,
  leverage,
  currentPrice,
  topPrice,
  bottomPrice,
  expirationDate,
  calcDate,
  callStrikeMin,
  callStrikeMax,
  putStrikeMin,
  putStrikeMax,
  plTolerance,
  marginBase,
  marginTolerance,
  minStockMarginPct = DEFAULT_MIN_STOCK_MARGIN_PCT,
  chain,
  ivSurface = null,
  calculatorMode = CALCULATOR_MODES.STOCKS,
  dividendYield = 0,
  stockClassification = null,
}) => {
  const empty = { withStock: [], optionsOnly: [], levels: { a: null, b: null } };
  if (!entry || !assetQuantity) return empty;
  if (!expirationDate || !calcDate) return empty;
  if (!Array.isArray(chain) || chain.length === 0) return empty;
  if (!Number.isFinite(plTolerance) || plTolerance <= 0) return empty;
  if (!Number.isFinite(marginBase) || marginBase <= 0) return empty;

  // Жёсткий коридор маржи = база ± допуск (по ТЗ — финальный фильтр и границы поиска).
  const marginTol = Number.isFinite(marginTolerance) ? Math.max(0, marginTolerance) : 0;
  const marginMin = Math.max(0, marginBase - marginTol);
  const marginMax = marginBase + marginTol;
  const minStockPct = Number.isFinite(minStockMarginPct) ? minStockMarginPct : DEFAULT_MIN_STOCK_MARGIN_PCT;

  const safeLeverage = Number(leverage) > 0 ? Number(leverage) : 1;
  const levelA = entry + (topPrice - entry) / 2;
  const levelB = entry + (bottomPrice - entry) / 2;

  const dateChain = chain.filter((o) => o.date === expirationDate);
  const validOptions = dateChain.filter((o) => {
    const ask = Number(o.ask);
    const iv = normalizeIV(o.impliedVolatility ?? o.iv ?? o.askIV);
    return Number.isFinite(ask) && ask > 0 && iv > 0 && o.strike != null;
  });

  const callRaws = validOptions.filter((o) => {
    const strike = Number(o.strike);
    return (
      o.type === 'CALL' &&
      Number.isFinite(callStrikeMin) && Number.isFinite(callStrikeMax) &&
      strike >= callStrikeMin && strike <= callStrikeMax
    );
  });
  const putRaws = validOptions.filter((o) => {
    const strike = Number(o.strike);
    return (
      o.type === 'PUT' &&
      Number.isFinite(putStrikeMin) && Number.isFinite(putStrikeMax) &&
      strike >= putStrikeMin && strike <= putStrikeMax
    );
  });

  if (callRaws.length === 0 || putRaws.length === 0) {
    return { ...empty, levels: { a: levelA, b: levelB } };
  }

  const today = todayIso();
  const todayDaysToExp = daysBetween(today, expirationDate);
  const daysFromTodayToCalcDate = daysBetween(today, calcDate);
  const daysRemainingAtCalcDate = Math.max(0, todayDaysToExp - daysFromTodayToCalcDate);

  // Пред-расчёт P&L по страйкам один раз.
  const callPrecomp = precomputeStrikePLs({
    rawOptions: callRaws,
    topPrice, bottomPrice, levelA, levelB,
    currentPrice, entry,
    todayDaysToExp, daysRemainingAtCalcDate,
    ivSurface, calculatorMode, dividendYield, stockClassification, today,
  }).filter((p) => p.costPerContract > 0);
  const putPrecomp = precomputeStrikePLs({
    rawOptions: putRaws,
    topPrice, bottomPrice, levelA, levelB,
    currentPrice, entry,
    todayDaysToExp, daysRemainingAtCalcDate,
    ivSurface, calculatorMode, dividendYield, stockClassification, today,
  }).filter((p) => p.costPerContract > 0);

  if (callPrecomp.length === 0 || putPrecomp.length === 0) {
    return { ...empty, levels: { a: levelA, b: levelB } };
  }

  // qtyStock-сетка для withStock: старт считаем от минимальной доли акции
  // (чтобы не перебирать заведомо отсеиваемые мелкие позиции), верх — по коридору маржи.
  const maxStockQty = Math.floor((marginMax * safeLeverage) / entry);
  const minStockMarginAbs = marginMin * minStockPct;
  const minQtyByPct = Math.ceil((minStockMarginAbs * safeLeverage) / entry);
  const qtyStartRaw = Math.max(STOCK_MIN, minQtyByPct);
  const qtyStart = Math.ceil(qtyStartRaw / STOCK_STEP) * STOCK_STEP;
  const stockGrid = [];
  if (maxStockQty >= qtyStart) {
    for (let q = qtyStart; q <= maxStockQty; q += STOCK_STEP) stockGrid.push(q);
  }

  const withStock = [];
  const optionsOnly = [];
  const seenWithStock = new Set();
  const seenOptionsOnly = new Set();

  const tryAdd = (rawCombo, mode, bucket, seen) => {
    if (!rawCombo) return;
    const key = dedupKey(rawCombo);
    if (seen.has(key)) return;
    seen.add(key);
    const finalized = finalizeCombination({
      raw: rawCombo,
      mode,
      callPrecomp,
      putPrecomp,
      levelA,
      levelB,
      entry,
      today,
    });
    bucket.push(finalized);
  };

  const commonArgs = {
    callPrecomp,
    putPrecomp,
    entry, topPrice, bottomPrice, levelA, levelB,
    leverage: safeLeverage,
    marginMin, marginMax,
    plTolerance,
    minStockMarginPct: minStockPct,
  };

  // withStock: сетка qtyStock × все стартовые пары (callSeed × putSeed).
  for (const qtyStock of stockGrid) {
    for (const callSeed of callPrecomp) {
      for (const putSeed of putPrecomp) {
        const combo = greedyBuild({
          qtyStock,
          mode: NORTH_KINDS.WITH_STOCK,
          callSeed,
          putSeed,
          ...commonArgs,
        });
        tryAdd(combo, NORTH_KINDS.WITH_STOCK, withStock, seenWithStock);
      }
    }
  }

  // optionsOnly: qtyStock = 0, та же сетка пар callSeed × putSeed.
  for (const callSeed of callPrecomp) {
    for (const putSeed of putPrecomp) {
      const combo = greedyBuild({
        qtyStock: 0,
        mode: NORTH_KINDS.OPTIONS_ONLY,
        callSeed,
        putSeed,
        ...commonArgs,
      });
      tryAdd(combo, NORTH_KINDS.OPTIONS_ONLY, optionsOnly, seenOptionsOnly);
    }
  }

  // optionsOnly: конструкция «только CALL» — отдельный проход без пут-сида.
  // Пут может быть добавлен жадно, если это нужно для низа; иначе остаётся чистый колл.
  for (const callSeed of callPrecomp) {
    const combo = greedyBuild({
      qtyStock: 0,
      mode: NORTH_KINDS.OPTIONS_ONLY,
      callSeed,
      putSeed: null,
      ...commonArgs,
    });
    tryAdd(combo, NORTH_KINDS.OPTIONS_ONLY, optionsOnly, seenOptionsOnly);
  }

  return { withStock, optionsOnly, levels: { a: levelA, b: levelB } };
};
