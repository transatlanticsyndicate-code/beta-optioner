/**
 * Стратегия СЕВЕР v2-corrected — анализатор комбинаций Buy Call + Buy Put.
 *
 * ЗАЧЕМ: На лонг-позицию по БА подбираем защитную пару опционов так, чтобы
 * на низу конструкция была близка к 0 (защита), а на верху P&L опционов был максимален.
 *
 * Один запуск анализа возвращает СРАЗУ ДВЕ выборки на одной и той же позиции:
 *  - `withStock`    : актив + опционы. Маржа = премии + (assetQuantity × entry / leverage).
 *                     Критерий «низ» = P&L всей позиции (актив + опционы) на calcDate → 0.
 *  - `optionsOnly`  : только опционы. Стоковая часть и плечо БА игнорируются.
 *                     Критерий «низ» = P&L опционов на calcDate → 0.
 *
 * Критерий «верх» одинаков: P&L опционов на верху на calcDate → max.
 *
 * Уровни A и B (информационные, в скоринг не входят):
 *   A = entry + (top - entry) / 2     — половина пути от входа до верха
 *   B = entry + (bot - entry) / 2     — половина пути от входа до низа
 * На каждой комбинации в `meta` сохраняется P&L на A и B (для withStock — total,
 * для optionsOnly — только опционы).
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
  id: `north-${chainOpt.type}-${chainOpt.strike}-${chainOpt.date}-${quantity}-${Date.now()}`,
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
 * Анализ комбинаций Buy Call + Buy Put — возвращает СРАЗУ ДВЕ выборки.
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
  // По ТЗ: два независимых диапазона страйков — Call (entry→top) и Put (bottom→entry).
  callStrikeMin,
  callStrikeMax,
  putStrikeMin,
  putStrikeMax,
  plTolerance,
  marginPreCalcMin,
  marginPreCalcMax,
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
  if (!Number.isFinite(marginPreCalcMax) || marginPreCalcMax <= 0) return empty;

  const safeLeverage = Number(leverage) > 0 ? Number(leverage) : 1;
  const stockMargin = (assetQuantity * entry) / safeLeverage;

  // Бюджет под опционные премии: верхняя граница берётся максимально широкая,
  // чтобы одна и та же расчётная пара могла попасть и в withStock,
  // и в optionsOnly — внутри отфильтруем отдельно.
  const optionBudgetMax = marginPreCalcMax;

  const levelA = entry + (topPrice - entry) / 2;
  const levelB = entry + (bottomPrice - entry) / 2;

  const dateChain = chain.filter((o) => o.date === expirationDate);
  const validOptions = dateChain.filter((o) => {
    const ask = Number(o.ask);
    const iv = normalizeIV(o.impliedVolatility ?? o.iv ?? o.askIV);
    return Number.isFinite(ask) && ask > 0 && iv > 0 && o.strike != null;
  });

  const callCandidates = validOptions.filter((o) => {
    const strike = Number(o.strike);
    return (
      o.type === 'CALL' &&
      Number.isFinite(callStrikeMin) && Number.isFinite(callStrikeMax) &&
      strike >= callStrikeMin &&
      strike <= callStrikeMax
    );
  });

  const putCandidates = validOptions.filter((o) => {
    const strike = Number(o.strike);
    return (
      o.type === 'PUT' &&
      Number.isFinite(putStrikeMin) && Number.isFinite(putStrikeMax) &&
      strike >= putStrikeMin &&
      strike <= putStrikeMax
    );
  });

  if (callCandidates.length === 0 || putCandidates.length === 0) {
    return { ...empty, levels: { a: levelA, b: levelB } };
  }

  const today = todayIso();
  const todayDaysToExp = daysBetween(today, expirationDate);
  const daysFromTodayToCalcDate = daysBetween(today, calcDate);
  const daysRemainingAtCalcDate = Math.max(0, todayDaysToExp - daysFromTodayToCalcDate);

  const assetPLAt = (price) => (price - entry) * assetQuantity;
  const assetPLBottom = assetPLAt(bottomPrice);
  const assetPLAtA = assetPLAt(levelA);
  const assetPLAtB = assetPLAt(levelB);

  const withStock = [];
  const optionsOnly = [];

  for (const call of callCandidates) {
    const callPremiumDollars = Number(call.ask) * CONTRACT_MULTIPLIER;
    if (callPremiumDollars <= 0) continue;
    const maxQC = Math.max(1, Math.floor(optionBudgetMax / callPremiumDollars));

    for (const put of putCandidates) {
      const putPremiumDollars = Number(put.ask) * CONTRACT_MULTIPLIER;
      if (putPremiumDollars <= 0) continue;
      const maxQP = Math.max(1, Math.floor(optionBudgetMax / putPremiumDollars));

      for (let qC = 1; qC <= maxQC; qC += 1) {
        const callCost = qC * callPremiumDollars;
        if (callCost > optionBudgetMax) break;

        for (let qP = 1; qP <= maxQP; qP += 1) {
          const putCost = qP * putPremiumDollars;
          const optionsCost = callCost + putCost;
          const marginWithStock = stockMargin + optionsCost;
          const marginOptionsOnly = optionsCost;

          // Если ОБА превышают верхнюю границу — дальше по qP бессмысленно.
          if (marginWithStock > marginPreCalcMax && marginOptionsOnly > marginPreCalcMax) break;

          const fitsWithStock = marginWithStock >= marginPreCalcMin && marginWithStock <= marginPreCalcMax;
          const fitsOptionsOnly = marginOptionsOnly >= marginPreCalcMin && marginOptionsOnly <= marginPreCalcMax;
          if (!fitsWithStock && !fitsOptionsOnly) continue;

          const callOpt = buildOptionPosition({
            chainOpt: call,
            action: 'Buy',
            quantity: qC,
            entryAssetPrice: entry,
            entryDate: today,
          });
          const putOpt = buildOptionPosition({
            chainOpt: put,
            action: 'Buy',
            quantity: qP,
            entryAssetPrice: entry,
            entryDate: today,
          });

          const sumOptionsAt = (price) => (
            computeOptionPL({
              option: callOpt,
              targetPrice: price,
              currentPrice,
              daysRemainingAtCalcDate,
              todayDaysToExp,
              ivSurface,
              calculatorMode,
              dividendYield,
              stockClassification,
            })
            + computeOptionPL({
              option: putOpt,
              targetPrice: price,
              currentPrice,
              daysRemainingAtCalcDate,
              todayDaysToExp,
              ivSurface,
              calculatorMode,
              dividendYield,
              stockClassification,
            })
          );

          const optionsPLTop = sumOptionsAt(topPrice);
          if (!(optionsPLTop > 0)) continue;

          const optionsPLBottom = sumOptionsAt(bottomPrice);
          const optionsPLAtA = sumOptionsAt(levelA);
          const optionsPLAtB = sumOptionsAt(levelB);

          const baseRecord = {
            id: `${call.strike}-${put.strike}-${qC}-${qP}`,
            call: {
              strike: Number(call.strike),
              ask: Number(call.ask) || 0,
              bid: Number(call.bid) || 0,
              iv: normalizeIV(call.impliedVolatility ?? call.iv ?? call.askIV),
              raw: call,
            },
            put: {
              strike: Number(put.strike),
              ask: Number(put.ask) || 0,
              bid: Number(put.bid) || 0,
              iv: normalizeIV(put.impliedVolatility ?? put.iv ?? put.askIV),
              raw: put,
            },
            qtyCall: qC,
            qtyPut: qP,
          };

          if (fitsWithStock) {
            const totalPLBottom = optionsPLBottom + assetPLBottom;
            if (Math.abs(totalPLBottom) <= plTolerance) {
              withStock.push({
                ...baseRecord,
                kind: NORTH_KINDS.WITH_STOCK,
                cost: { optionsCost, stockMargin, marginUsed: marginWithStock },
                criteria: { bottomMetric: totalPLBottom, topOptions: optionsPLTop },
                meta: {
                  optionsPLBottom,
                  optionsPLTop,
                  assetPLBottom,
                  totalPLBottom,
                  levelA,
                  levelB,
                  plAtLevelA: optionsPLAtA + assetPLAtA,
                  plAtLevelB: optionsPLAtB + assetPLAtB,
                },
                positions: [callOpt, putOpt],
              });
            }
          }

          if (fitsOptionsOnly) {
            if (Math.abs(optionsPLBottom) <= plTolerance) {
              optionsOnly.push({
                ...baseRecord,
                kind: NORTH_KINDS.OPTIONS_ONLY,
                cost: { optionsCost, stockMargin: 0, marginUsed: marginOptionsOnly },
                criteria: { bottomMetric: optionsPLBottom, topOptions: optionsPLTop },
                meta: {
                  optionsPLBottom,
                  optionsPLTop,
                  assetPLBottom: 0,
                  totalPLBottom: optionsPLBottom,
                  levelA,
                  levelB,
                  plAtLevelA: optionsPLAtA,
                  plAtLevelB: optionsPLAtB,
                },
                positions: [callOpt, putOpt],
              });
            }
          }
        }
      }
    }
  }

  return { withStock, optionsOnly, levels: { a: levelA, b: levelB } };
};
