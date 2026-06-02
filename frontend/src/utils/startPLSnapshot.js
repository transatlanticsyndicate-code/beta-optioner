// Снимок исходных данных опциона для колонки «Start P&L».
//
// ЗАЧЕМ: «Start P&L» — параллельный расчёт прибыли/убытка с замороженными
// входными данными. Двигая симуляцию (целевая цена, дни), пользователь сравнивает
// текущий прогноз (с корректировками) и исходный прогноз калькулятора без них.
//
// ПРАВИЛО: всё, что пользователь поправил в позиции ДО первого сохранения, —
// «первичные» данные и попадают в снапшот. Всё, что меняется ПОСЛЕ сохранения, —
// корректировка: на Start P&L не влияет, двигает только P&L.
//
// В снапшоте:
//   - premium / bid / ask (effective значения на момент сохранения)
//   - impliedVolatility, manualIvOverride, manualIvOverrideDate (сырые IV-входы:
//     getOptionVolatility сама проецирует IV по симуляционной точке)
//   - assetPrice (цена актива на момент входа), quantity, dividendYield
//   - actualPL, actualPLDate, actualPLPrice, actualPLQuantity — якорь Fact P&L,
//     зафиксированный при сохранении. Если на момент сохранения Fact P&L пустой,
//     все четыре поля = null, и Start P&L идёт без якоря (теоретика). Если позже
//     пользователь ввёл/поменял Fact P&L — это корректировка: P&L применит новый
//     якорь, Start P&L останется со снапшотным.
//
// Что НЕ замораживаем (корректировки/инфраструктура):
//   - AI-волатильность, обновление котировок расширением, ручная смена
//     IV/премии/Fact P&L ПОСЛЕ сохранения.
//   - IV-поверхность (текущая, для проекции IV по дням).
//   - dividendYield/contractMultiplier — берутся текущие в момент расчёта.

import { calculateOptionPLValue as calculateStockOptionPLValue } from './optionPricing';
import { calculateFuturesOptionPLValue } from './futuresPricing';
import { getOptionVolatility } from './volatilitySurface';
import {
  calculateDaysRemainingUTC,
  getOldestEntryDate,
  isOptionActiveAtDay,
  calculateDaysToExpirationFromToday,
} from './dateUtils';
import { CALCULATOR_MODES } from './calculatorModes';

/**
 * Построить снимок исходных данных для одной ноги в момент фиксации позиции.
 *
 * @param {object} option — текущая нога из state.options
 * @param {object} ctx
 * @param {number} ctx.currentPrice — текущая цена БА (fallback для assetPriceAtEntry)
 * @param {number} ctx.dividendYield — дивдоходность с учётом useDividends-флага (уже домноженная)
 * @returns {object} snapshot — объект, который кладётся в option.startSnapshot
 */
export function buildStartSnapshot(option, ctx) {
  const { currentPrice, dividendYield } = ctx;

  // Effective premium / bid / ask с учётом ручных правок пользователя на момент сохранения.
  const premium = option.isPremiumModified ? option.customPremium : option.premium;
  const bid = option.isPremiumModified
    ? 0
    : (option.isBidModified ? option.customBid : option.bid);
  const ask = option.isPremiumModified
    ? 0
    : (option.isAskModified ? option.customAsk : option.ask);

  // IV-входы — сырые поля опциона, из которых getOptionVolatility считает IV.
  // НЕ кладём результат вызова getOptionVolatility — он бы зафиксировал только
  // один симуляционный срез и не отражал бы проекцию по ползунку.
  const impliedVolatility = option.impliedVolatility ?? option.implied_volatility ?? null;
  const manualIvOverride = option.manualIvOverride ?? null;
  const manualIvOverrideDate = option.manualIvOverrideDate ?? null;

  const assetPrice = option.assetPriceAtEntry || currentPrice;
  const quantity = option.quantity;

  // Якорь Fact P&L — фиксируется на момент сохранения. Если Fact P&L был задан до
  // сохранения, эти значения попадут в Start P&L через якорную формулу. Если был
  // пустым — все четыре поля null, и Start P&L идёт без якоря.
  const actualPL = option.actualPL ?? null;
  const actualPLDate = option.actualPLDate ?? null;
  const actualPLPrice = option.actualPLPrice ?? null;
  const actualPLQuantity = option.actualPLQuantity ?? null;

  return {
    premium: premium ?? null,
    bid: bid ?? null,
    ask: ask ?? null,
    impliedVolatility,
    manualIvOverride,
    manualIvOverrideDate,
    assetPrice: assetPrice ?? null,
    quantity: quantity ?? null,
    dividendYield: dividendYield ?? 0,
    actualPL,
    actualPLDate,
    actualPLPrice,
    actualPLQuantity,
  };
}

/**
 * Посчитать текущий «Start P&L» по сохранённому снимку и текущим симуляционным параметрам.
 *
 * @param {object} snapshot — объект из option.startSnapshot
 * @param {object} option — текущая нога (нужны strike, date, type, action)
 * @param {object} ctx
 * @param {Array} ctx.allOptions — для getOldestEntryDate / isOptionActiveAtDay
 * @param {number} ctx.currentPrice — текущая цена БА (fallback)
 * @param {number} ctx.targetPrice — симуляционная целевая цена
 * @param {number} ctx.daysPassed — сдвиг по дням симуляции
 * @param {string} ctx.calculatorMode — режим: stocks/etf/crypto/futures
 * @param {number} ctx.contractMultiplier — множитель контракта
 * @param {object|null} ctx.ivSurface — текущая IV-поверхность для разрешения волатильности
 * @returns {number|null} — Start P&L в долларах, либо null если посчитать нельзя
 */
export function computeStartPL(snapshot, option, ctx) {
  if (!snapshot) return null;
  const {
    allOptions,
    currentPrice,
    targetPrice,
    daysPassed,
    calculatorMode,
    contractMultiplier,
    ivSurface,
  } = ctx;

  if (!option.strike) return null;
  // Без премии (ни в снимке, ни в bid/ask) посчитать невозможно.
  if (
    (snapshot.premium === null || snapshot.premium === undefined) &&
    (snapshot.bid === null || snapshot.bid === undefined) &&
    (snapshot.ask === null || snapshot.ask === undefined)
  ) {
    return null;
  }
  // Старый buggy-формат снимка (с полем iv вместо impliedVolatility) сюда не
  // попадёт после миграции «чистый старт» — но если вдруг попал, лучше показать
  // прочерк, чем неверное число.
  if (snapshot.impliedVolatility === undefined && snapshot.manualIvOverride === undefined) {
    return null;
  }

  const oldestEntry = getOldestEntryDate(allOptions || []);
  if (!isOptionActiveAtDay(option, daysPassed, oldestEntry)) return null;

  const currentDaysToExp = calculateDaysRemainingUTC(option, 0, 30, oldestEntry);
  const optionDaysRemaining = calculateDaysRemainingUTC(option, daysPassed, 30, oldestEntry);
  const todaySimDays = calculateDaysToExpirationFromToday(option);

  // tempOpt: подменяем входы на снимочные значения, гасим флаги ручных правок,
  // фиксируем количество из снимка и подкладываем замороженные IV-входы вместо
  // текущих. actualPL внутри BSM-вызова не нужен — якорь подмешивается ниже,
  // после расчёта базовой теоретической P&L, через snapshot.actualPL.
  const tempOpt = {
    ...option,
    premium: snapshot.premium,
    bid: snapshot.bid,
    ask: snapshot.ask,
    quantity: snapshot.quantity ?? option.quantity,
    impliedVolatility: snapshot.impliedVolatility ?? null,
    implied_volatility: snapshot.impliedVolatility ?? null,
    manualIvOverride: snapshot.manualIvOverride ?? null,
    manualIvOverrideDate: snapshot.manualIvOverrideDate ?? null,
    isPremiumModified: false,
    isBidModified: false,
    isAskModified: false,
    customPremium: null,
    customBid: null,
    customAsk: null,
    actualPL: null,
    actualPLDate: null,
    actualPLPrice: null,
    actualPLQuantity: null,
  };

  // Разрешаем IV той же функцией, что использует колонка «P&L». На входе —
  // tempOpt с замороженными IV-полями, на выходе — IV, спроецированная на
  // текущую симуляционную точку. Если manualIvOverride/impliedVolatility у
  // снимка совпадают с текущими в option (нет корректировок) — IV получается
  // идентичной IV колонки «P&L». Если в option корректировки были — IV расходятся.
  const optionVolatility = getOptionVolatility(
    tempOpt,
    currentDaysToExp,
    optionDaysRemaining,
    ivSurface,
    'simple',
    null,
    tempOpt.manualIvOverride,
    todaySimDays
  );

  const optAssetPrice = snapshot.assetPrice || currentPrice;
  const rfrOpt = calculatorMode === CALCULATOR_MODES.CRYPTO ? 0 : null;
  const divYield = snapshot.dividendYield ?? 0;
  const targetForCalc = targetPrice || currentPrice;

  let pl = calculatorMode === CALCULATOR_MODES.FUTURES
    ? calculateFuturesOptionPLValue(tempOpt, targetForCalc, optionDaysRemaining, contractMultiplier, optionVolatility)
    : calculateStockOptionPLValue(tempOpt, targetForCalc, optAssetPrice, optionDaysRemaining, optionVolatility, divYield, contractMultiplier, rfrOpt);

  // Якорь Fact P&L — применяем по СНАПШОТНЫМ значениям (зафиксированы на момент
  // сохранения). Логика повторяет блок из OptionsTableV3.jsx (строки 1297-1342),
  // но источники — snapshot.*, а не option.*. Так Start P&L реагирует только на
  // тот Fact P&L, что был в момент сохранения; последующие правки игнорирует.
  // На дату экспирации (optionDaysRemaining <= 0) якорь не применяем —
  // там P&L определяется чистой формулой intrinsic_value − entry_price.
  if (
    optionDaysRemaining > 0 &&
    snapshot.actualPL !== null &&
    snapshot.actualPL !== undefined &&
    snapshot.actualPLDate
  ) {
    const anchorDateObj = new Date(snapshot.actualPLDate + 'T00:00:00Z');
    const oldestEntryDateObj = oldestEntry || new Date();
    const anchorDaysPassed = Math.round((anchorDateObj - oldestEntryDateObj) / (1000 * 60 * 60 * 24));

    if (daysPassed >= anchorDaysPassed) {
      const anchorDaysToExp = calculateDaysRemainingUTC(option, anchorDaysPassed, 30, oldestEntry);
      const rfrAnchor = calculatorMode === CALCULATOR_MODES.CRYPTO ? 0 : null;

      // IV в момент якоря — снапшотный manualIvOverride если задан,
      // иначе — общая optionVolatility, посчитанная выше из снапшотных IV-входов.
      const anchorIV = snapshot.manualIvOverride !== null && snapshot.manualIvOverride !== undefined
        ? snapshot.manualIvOverride
        : optionVolatility;

      // Цена актива на дату якоря — снапшотная (зафиксирована при сохранении).
      const anchorPrice = snapshot.actualPLPrice || optAssetPrice;

      const plAtAnchor = calculatorMode === CALCULATOR_MODES.FUTURES
        ? calculateFuturesOptionPLValue(tempOpt, anchorPrice, anchorDaysToExp, contractMultiplier, anchorIV)
        : calculateStockOptionPLValue(tempOpt, anchorPrice, optAssetPrice, anchorDaysToExp, anchorIV, divYield, contractMultiplier, rfrAnchor);

      // Масштаб по количеству — снапшотное количество (Start P&L не реагирует на
      // изменение quantity после сохранения; и якорное, и «текущее» qty берём
      // одинаково — из снапшота, чтобы коэффициент = 1).
      const anchorQty = Number(snapshot.actualPLQuantity) > 0
        ? Number(snapshot.actualPLQuantity)
        : (Number(snapshot.quantity) || 1);
      const currentQty = Number(snapshot.quantity) || 0;
      const anchorRatio = anchorQty > 0 ? (currentQty / anchorQty) : 1;
      pl = snapshot.actualPL * anchorRatio + (pl - plAtAnchor);
    }
  }

  // adjustPLByStockGroup НЕ применяем — stockClassification в текущем коде null,
  // и применять его к Start P&L было бы корректировкой, которую мы по дизайну исключаем.
  return pl;
}
