/**
 * Стратегия СЕВЕР — анализатор комбинаций Buy Call + Buy Put
 * ЗАЧЕМ: Перебирает все валидные комбинации защитных пар опционов на лонг-позицию
 * и считает P&L по 4 критериям через ту же математику, что и калькулятор.
 *
 * Long-only by design: стратегия предполагает компенсацию убытка на низу и фиксацию
 * прибыли на верху для лонг-позиции по БА. Симметричная версия для шорта — отдельная задача.
 */

import { calculateOptionPLValue, CALCULATOR_MODES } from '../universalPricing';
import { getOptionVolatility } from '../volatilitySurface';
import { adjustPLByStockGroup } from '../optionPricing';
import { isStockLikeMode } from '../calculatorModes';

/**
 * Нормализация IV: всё в десятичный формат (0.30 = 30%).
 */
const normalizeIV = (iv) => {
  const n = Number(iv);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1 ? n / 100 : n;
};

/**
 * Количество дней между двумя датами (целое, по UTC, чтобы не плавало от часового пояса).
 */
const daysBetween = (fromIso, toIso) => {
  const a = new Date(`${fromIso}T00:00:00Z`).getTime();
  const b = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
};

const todayIso = () => new Date().toISOString().split('T')[0];

/**
 * Формирование объекта опциона в формате, ожидаемом калькулятором.
 */
const buildOptionPosition = ({ chainOpt, action, quantity, entryAssetPrice, entryDate }) => ({
  id: `north-${chainOpt.type}-${chainOpt.strike}-${chainOpt.date}-${quantity}-${Date.now()}`,
  action,
  type: chainOpt.type,
  strike: Number(chainOpt.strike),
  date: chainOpt.date,
  quantity,
  // Для Buy премия = ASK
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
 * Подсчёт P&L одного опциона на критериальной цене и календарной дате расчёта,
 * полностью повторяя пайплайн OptionsTableV3 (IV из ivSurface, корректировка stockClassification).
 */
const computeOptionPL = ({
  option,
  targetPrice,
  currentPrice,
  daysRemainingAtCalcDate,
  currentDaysToExp,
  todayDaysToExp,
  ivSurface,
  calculatorMode,
  dividendYield,
  stockClassification,
}) => {
  const iv = getOptionVolatility(
    option,
    currentDaysToExp,
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
 * Генерация всех пар количеств (qC, qP), удовлетворяющих ограничениям.
 */
const buildQuantityPairs = ({ callQtyMin, callQtyMax, putQtyMin, putQtyMax, requirePutGreater }) => {
  const pairs = [];
  for (let qC = callQtyMin; qC <= callQtyMax; qC += 1) {
    for (let qP = putQtyMin; qP <= putQtyMax; qP += 1) {
      if (requirePutGreater && qP <= qC) continue;
      pairs.push([qC, qP]);
    }
  }
  return pairs;
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
 * Главная функция анализа.
 *
 * @param {Object} params
 * @param {number} params.entry            Точка входа в БА (средневзвешенная цена лонг-позиций)
 * @param {number} params.assetQuantity    Количество акций в лонг-позиции
 * @param {number} params.currentPrice     Текущая цена БА (для совместимости с pricing API)
 * @param {number} params.topPrice         Цель по верху
 * @param {number} params.bottomPrice      Закрытие по низу
 * @param {number} params.midAPrice        Промежуточный уровень A
 * @param {number} params.midBPrice        Промежуточный уровень B
 * @param {string} params.expirationDate   ISO дата экспирации (выбранная из chain)
 * @param {string} params.calcDate         ISO дата расчёта
 * @param {number} params.strikeRangeMin   Нижняя граница диапазона страйков
 * @param {number} params.strikeRangeMax   Верхняя граница диапазона страйков
 * @param {Object} params.qty              { callMin, callMax, putMin, putMax, requirePutGreater }
 * @param {Array}  params.chain            Цепочка опционов (extensionData.options)
 * @param {Object} params.ivSurface        IV surface из калькулятора
 * @param {string} params.calculatorMode   'stocks' | 'futures' | 'crypto' — пока только 'stocks'
 * @param {number} params.dividendYield    Дивидендная доходность
 * @param {Object} params.stockClassification Классификация акции (для adjustPLByStockGroup)
 * @returns {Array} Массив комбинаций с criteria — без score (score добавляется в scoring.js)
 */
export const analyzeNorthStrategy = ({
  entry,
  assetQuantity,
  currentPrice,
  topPrice,
  bottomPrice,
  midAPrice,
  midBPrice,
  expirationDate,
  calcDate,
  strikeRangeMin,
  strikeRangeMax,
  qty,
  chain,
  ivSurface = null,
  calculatorMode = CALCULATOR_MODES.STOCKS,
  dividendYield = 0,
  stockClassification = null,
}) => {
  if (!entry || !assetQuantity || !expirationDate || !calcDate) return [];
  if (!Array.isArray(chain) || chain.length === 0) return [];

  // Фильтр цепочки по выбранной экспирации, валидным ask и IV
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
      strike > entry &&
      strike >= strikeRangeMin &&
      strike <= strikeRangeMax
    );
  });

  const putCandidates = validOptions.filter((o) => {
    const strike = Number(o.strike);
    return (
      o.type === 'PUT' &&
      strike < entry &&
      strike >= strikeRangeMin &&
      strike <= strikeRangeMax
    );
  });

  if (callCandidates.length === 0 || putCandidates.length === 0) return [];

  const qtyPairs = buildQuantityPairs({
    callQtyMin: qty.callMin,
    callQtyMax: qty.callMax,
    putQtyMin: qty.putMin,
    putQtyMax: qty.putMax,
    requirePutGreater: qty.requirePutGreater,
  });
  if (qtyPairs.length === 0) return [];

  const today = todayIso();
  const todayDaysToExp = daysBetween(today, expirationDate);
  const daysFromTodayToCalcDate = daysBetween(today, calcDate);
  const daysRemainingAtCalcDate = Math.max(0, todayDaysToExp - daysFromTodayToCalcDate);

  // Для лонг-позиции по акциям множитель актива = 1 (assetQuantity уже в штуках)
  const assetMultiplier = 1;
  const assetPLAt = (price) => (price - entry) * assetQuantity * assetMultiplier;
  const assetPLBottom = assetPLAt(bottomPrice);
  const assetPLMidA = assetPLAt(midAPrice);
  const assetPLMidB = assetPLAt(midBPrice);

  const results = [];

  for (const call of callCandidates) {
    for (const put of putCandidates) {
      for (const [qC, qP] of qtyPairs) {
        const callOpt = buildOptionPosition({
          chainOpt: call,
          action: 'Buy',
          quantity: qC,
          entryAssetPrice: currentPrice,
          entryDate: today,
        });
        const putOpt = buildOptionPosition({
          chainOpt: put,
          action: 'Buy',
          quantity: qP,
          entryAssetPrice: currentPrice,
          entryDate: today,
        });

        const optionsPair = [callOpt, putOpt];

        const sumPLAt = (price) => optionsPair.reduce(
          (sum, opt) => sum + computeOptionPL({
            option: opt,
            targetPrice: price,
            currentPrice,
            daysRemainingAtCalcDate,
            currentDaysToExp: todayDaysToExp,
            todayDaysToExp,
            ivSurface,
            calculatorMode,
            dividendYield,
            stockClassification,
          }),
          0,
        );

        const optsPLBottom = sumPLAt(bottomPrice);
        const optsPLTop = sumPLAt(topPrice);
        const optsPLMidA = sumPLAt(midAPrice);
        const optsPLMidB = sumPLAt(midBPrice);

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
          criteria: {
            bottomTotal: optsPLBottom + assetPLBottom,
            topOptions: optsPLTop,
            midATotal: optsPLMidA + assetPLMidA,
            midBTotal: optsPLMidB + assetPLMidB,
          },
          // Сохраняем готовые объекты опционов для добавления в калькулятор без повторной сборки
          positions: optionsPair,
        });
      }
    }
  }

  return results;
};
