/**
 * Стратегия СЕВЕР v2 — анализатор комбинаций Buy Call + Buy Put.
 *
 * ЗАЧЕМ: На лонг-позицию (или без неё) подбираем защитную пару опционов так, чтобы
 * на низу конструкция была близка к 0 (защита), а на верху P&L опционов был максимален.
 *
 * Два режима:
 *  - WITH_STOCK    : актив + опционы. Стоковая часть фиксирована (введённая позиция),
 *                    маржа сделки = премии + стоковая часть с учётом плеча.
 *                    Критерий «низ» = P&L total (актив + опционы) при цене низа на calcDate → 0.
 *  - OPTIONS_ONLY  : только опционы. Стоковой части и плеча БА нет.
 *                    Критерий «низ» = P&L опционов при цене низа на calcDate → 0.
 *
 * Критерий «верх» одинаков: P&L опционов при цене верха на calcDate → max.
 *
 * Авто-лимит количеств: ручные ограничения сняты, количества (qC, qP) подбираются
 * автоматически в пределах верхней границы маржина (cost ≤ marginPreCalcMax).
 * Жёсткие фильтры из Doc2 применяются здесь: cost в диапазоне, опционы на верху > 0,
 * |критерий «низ»| ≤ plTolerance.
 */

import { calculateOptionPLValue, CALCULATOR_MODES } from '../universalPricing';
import { getOptionVolatility } from '../volatilitySurface';
import { adjustPLByStockGroup } from '../optionPricing';
import { isStockLikeMode } from '../calculatorModes';

export const NORTH_MODES = Object.freeze({
  WITH_STOCK: 'WITH_STOCK',
  OPTIONS_ONLY: 'OPTIONS_ONLY',
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

/**
 * P&L одного опциона на заданной цене и дате расчёта.
 * Повторяет пайплайн OptionsTableV3 (IV из ivSurface, поправка stockClassification).
 */
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

/**
 * Найти ближайшую к заданной дате доступную экспирацию из цепочки.
 */
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
 * Анализ комбинаций Buy Call + Buy Put.
 *
 * @param {Object} params
 * @param {'WITH_STOCK'|'OPTIONS_ONLY'} params.mode
 * @param {number} params.entry              Точка входа в БА (только WITH_STOCK)
 * @param {number} params.assetQuantity      Количество акций (только WITH_STOCK)
 * @param {number} params.leverage           Плечо БА (только WITH_STOCK)
 * @param {number} params.currentPrice       Текущая цена БА
 * @param {number} params.topPrice           Цель по верху
 * @param {number} params.bottomPrice        Закрытие по низу
 * @param {string} params.expirationDate     ISO экспирация
 * @param {string} params.calcDate           ISO дата расчёта
 * @param {number} params.strikeRangeMin
 * @param {number} params.strikeRangeMax
 * @param {number} params.plTolerance        Допуск P&L по низу (например 200)
 * @param {number} params.marginPreCalcMin   Нижняя граница маржи для пред-расчёта (например 4500)
 * @param {number} params.marginPreCalcMax   Верхняя граница маржи для пред-расчёта (например 7500)
 * @param {Array}  params.chain              Цепочка опционов
 * @param {Object} params.ivSurface
 * @param {string} params.calculatorMode     'stocks' | 'etf' (поведение в этих режимах общее)
 * @param {number} params.dividendYield
 * @param {Object} params.stockClassification
 * @returns {Array} комбинации с meta и criteria (без score — он добавляется в scoring.js)
 */
export const analyzeNorthStrategy = ({
  mode,
  entry,
  assetQuantity,
  leverage,
  currentPrice,
  topPrice,
  bottomPrice,
  expirationDate,
  calcDate,
  strikeRangeMin,
  strikeRangeMax,
  plTolerance,
  marginPreCalcMin,
  marginPreCalcMax,
  chain,
  ivSurface = null,
  calculatorMode = CALCULATOR_MODES.STOCKS,
  dividendYield = 0,
  stockClassification = null,
}) => {
  if (!expirationDate || !calcDate) return [];
  if (!Array.isArray(chain) || chain.length === 0) return [];
  if (!Number.isFinite(plTolerance) || plTolerance <= 0) return [];
  if (!Number.isFinite(marginPreCalcMax) || marginPreCalcMax <= 0) return [];

  const withStock = mode === NORTH_MODES.WITH_STOCK;
  if (withStock && (!entry || !assetQuantity)) return [];

  // Цена входа в опционы: для WITH_STOCK — entry (вход в актив), для OPTIONS_ONLY — текущая цена
  const optionEntryPrice = withStock ? entry : Number(currentPrice) || 0;

  // Стоковая часть маржи (фикс): assetQuantity * entry / leverage. В OPTIONS_ONLY = 0.
  const safeLeverage = Number(leverage) > 0 ? Number(leverage) : 1;
  const stockMargin = withStock ? (assetQuantity * entry) / safeLeverage : 0;

  // Если только стоковая часть уже за пределами верхней границы — анализ невозможен.
  if (stockMargin > marginPreCalcMax) return [];

  // Бюджет под опционные премии: что осталось после стоковой части до верхней границы маржина.
  const optionBudgetMax = marginPreCalcMax - stockMargin;
  if (optionBudgetMax <= 0) return [];

  // Фильтр цепочки по выбранной экспирации, валидным ASK и IV.
  const dateChain = chain.filter((o) => o.date === expirationDate);
  const validOptions = dateChain.filter((o) => {
    const ask = Number(o.ask);
    const iv = normalizeIV(o.impliedVolatility ?? o.iv ?? o.askIV);
    return Number.isFinite(ask) && ask > 0 && iv > 0 && o.strike != null;
  });

  // Граница страйков:
  //  - В WITH_STOCK: Call > entry; Put < entry (как в v1, имеет финансовый смысл).
  //  - В OPTIONS_ONLY: Call > currentPrice; Put < currentPrice (симметрично).
  const splitPivot = withStock ? entry : Number(currentPrice) || 0;

  const callCandidates = validOptions.filter((o) => {
    const strike = Number(o.strike);
    return (
      o.type === 'CALL' &&
      strike > splitPivot &&
      strike >= strikeRangeMin &&
      strike <= strikeRangeMax
    );
  });

  const putCandidates = validOptions.filter((o) => {
    const strike = Number(o.strike);
    return (
      o.type === 'PUT' &&
      strike < splitPivot &&
      strike >= strikeRangeMin &&
      strike <= strikeRangeMax
    );
  });

  if (callCandidates.length === 0 || putCandidates.length === 0) return [];

  const today = todayIso();
  const todayDaysToExp = daysBetween(today, expirationDate);
  const daysFromTodayToCalcDate = daysBetween(today, calcDate);
  const daysRemainingAtCalcDate = Math.max(0, todayDaysToExp - daysFromTodayToCalcDate);

  // P&L акций фиксирован (не зависит от опционов) — считаем один раз.
  const assetPLBottom = withStock ? (bottomPrice - entry) * assetQuantity : 0;

  const results = [];

  for (const call of callCandidates) {
    const callPremiumDollars = Number(call.ask) * CONTRACT_MULTIPLIER;
    if (callPremiumDollars <= 0) continue;
    // Максимальное qC такое, что только Call-нога не превышает бюджет.
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
          const marginUsed = stockMargin + optionsCost;

          // Жёсткий фильтр маржи: пред-расчётный диапазон [4500, 7500] по умолчанию.
          if (marginUsed > marginPreCalcMax) break; // qP только растёт — дальше тоже мимо
          if (marginUsed < marginPreCalcMin) continue;

          const callOpt = buildOptionPosition({
            chainOpt: call,
            action: 'Buy',
            quantity: qC,
            entryAssetPrice: optionEntryPrice,
            entryDate: today,
          });
          const putOpt = buildOptionPosition({
            chainOpt: put,
            action: 'Buy',
            quantity: qP,
            entryAssetPrice: optionEntryPrice,
            entryDate: today,
          });

          const computeFor = (price) => (
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

          const optionsPLTop = computeFor(topPrice);
          // Жёсткий фильтр: на цели опционы отдельно должны быть в плюсе.
          if (!(optionsPLTop > 0)) continue;

          const optionsPLBottom = computeFor(bottomPrice);
          const totalPLBottom = optionsPLBottom + assetPLBottom;
          const bottomMetric = withStock ? totalPLBottom : optionsPLBottom;

          // Жёсткий фильтр: «низ» в пределах допустимого диапазона P&L.
          if (Math.abs(bottomMetric) > plTolerance) continue;

          results.push({
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
            cost: {
              optionsCost,
              stockMargin,
              marginUsed,
            },
            criteria: {
              bottomMetric,       // что хотим к 0 (с учётом режима)
              topOptions: optionsPLTop, // что максимизируем
            },
            meta: {
              optionsPLBottom,
              optionsPLTop,
              assetPLBottom,
              totalPLBottom,
              mode,
            },
            positions: [callOpt, putOpt],
          });
        }
      }
    }
  }

  return results;
};
