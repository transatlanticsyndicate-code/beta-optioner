// Снимок исходных данных опциона для колонки «Start P&L».
//
// ЗАЧЕМ: «Start P&L» — параллельный расчёт прибыли/убытка с замороженными
// входными данными (премия, bid/ask, IV-входы, цена актива на момент входа,
// дивдоходность, количество). Двигая симуляцию (целевая цена, дни), пользователь
// сравнивает текущий прогноз (с корректировками IV, Fact P&L, обновлёнными
// котировками) и исходный прогноз калькулятора без корректировок.
//
// ВАЖНО: в снимок кладём НЕ результат расчёта IV, а сами IV-входы
// (impliedVolatility / manualIvOverride / manualIvOverrideDate). Это нужно потому
// что функция getOptionVolatility для каждой симуляционной точки сама проецирует
// IV — если бы мы заморозили один результат, при движении ползунка он не «двигался
// бы» вместе с симуляцией, и Start P&L расходился бы с P&L даже без корректировок.

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
  // actualPL-якорь (Start P&L игнорирует Fact P&L), фиксируем количество из снимка
  // и подкладываем замороженные IV-входы вместо текущих.
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

  const pl = calculatorMode === CALCULATOR_MODES.FUTURES
    ? calculateFuturesOptionPLValue(tempOpt, targetForCalc, optionDaysRemaining, contractMultiplier, optionVolatility)
    : calculateStockOptionPLValue(tempOpt, targetForCalc, optAssetPrice, optionDaysRemaining, optionVolatility, divYield, contractMultiplier, rfrOpt);

  // adjustPLByStockGroup НЕ применяем — stockClassification в текущем коде null,
  // и применять его к Start P&L было бы корректировкой, которую мы по дизайну исключаем.
  return pl;
}
