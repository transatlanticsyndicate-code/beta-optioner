// Снимок исходных данных опциона для колонки «Start P&L».
//
// ЗАЧЕМ: «Start P&L» — параллельный расчёт прибыли/убытка с замороженными
// входными данными (премия, bid/ask, IV, цена актива на момент входа, дивдоходность,
// количество). Двигая симуляцию (целевая цена, дни), пользователь сравнивает текущий
// прогноз (с корректировками IV, Fact P&L, обновлёнными котировками) и исходный
// прогноз калькулятора без корректировок.
//
// Снимок не содержит сами числа P&L — только входы; пересчёт «Start P&L» делается
// ниже функцией computeStartPL() с текущими симуляционными параметрами.

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
 * @param {Array} ctx.allOptions — весь массив опционов (нужно для getOldestEntryDate)
 * @param {number} ctx.currentPrice — текущая цена БА (fallback для assetPriceAtEntry)
 * @param {object|null} ctx.ivSurface — IV-поверхность для разрешения волатильности
 * @param {number} ctx.dividendYield — дивдоходность с учётом useDividends-флага (уже домноженная)
 * @returns {object} snapshot — объект, который кладётся в option.startSnapshot
 */
export function buildStartSnapshot(option, ctx) {
  const { allOptions, currentPrice, ivSurface, dividendYield } = ctx;

  const oldestEntry = getOldestEntryDate(allOptions || []);
  const currentDaysToExp = calculateDaysRemainingUTC(option, 0, 30, oldestEntry);
  const todaySimDays = calculateDaysToExpirationFromToday(option);

  // IV в момент сохранения — через ту же функцию, что и колонка «P&L»,
  // но БЕЗ AI-волатильности (это корректировка, которую Start P&L игнорирует).
  // simDaysToExp передаём = currentDaysToExp, чтобы IV-поверхность не интерполировалась
  // по «будущему» дню — нам нужен срез на момент сохранения.
  const iv = getOptionVolatility(
    option,
    currentDaysToExp,
    currentDaysToExp,
    ivSurface,
    'simple',
    null,
    option.manualIvOverride,
    todaySimDays
  );

  // Effective-значения (с учётом ручных правок пользователя на момент сохранения).
  const premium = option.isPremiumModified ? option.customPremium : option.premium;
  const bid = option.isPremiumModified
    ? 0
    : (option.isBidModified ? option.customBid : option.bid);
  const ask = option.isPremiumModified
    ? 0
    : (option.isAskModified ? option.customAsk : option.ask);

  const assetPrice = option.assetPriceAtEntry || currentPrice;
  const quantity = option.quantity;

  return {
    premium: premium ?? null,
    bid: bid ?? null,
    ask: ask ?? null,
    iv: iv ?? null,
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
 * @returns {number|null} — Start P&L в долларах, либо null если посчитать нельзя
 */
export function computeStartPL(snapshot, option, ctx) {
  if (!snapshot) return null;
  const { allOptions, currentPrice, targetPrice, daysPassed, calculatorMode, contractMultiplier } = ctx;

  if (!option.strike) return null;
  // Без премии (ни в снимке, ни в bid/ask) посчитать невозможно.
  if (
    (snapshot.premium === null || snapshot.premium === undefined) &&
    (snapshot.bid === null || snapshot.bid === undefined) &&
    (snapshot.ask === null || snapshot.ask === undefined)
  ) {
    return null;
  }

  const oldestEntry = getOldestEntryDate(allOptions || []);
  if (!isOptionActiveAtDay(option, daysPassed, oldestEntry)) return null;

  const optionDaysRemaining = calculateDaysRemainingUTC(option, daysPassed, 30, oldestEntry);

  // tempOpt: подменяем входы на снимочные значения, гасим флаги ручных правок
  // и actualPL-якорь (Start P&L их игнорирует), фиксируем количество из снимка.
  const tempOpt = {
    ...option,
    premium: snapshot.premium,
    bid: snapshot.bid,
    ask: snapshot.ask,
    quantity: snapshot.quantity ?? option.quantity,
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

  const optAssetPrice = snapshot.assetPrice || currentPrice;
  const rfrOpt = calculatorMode === CALCULATOR_MODES.CRYPTO ? 0 : null;
  const ivToUse = snapshot.iv;
  const divYield = snapshot.dividendYield ?? 0;

  const targetForCalc = targetPrice || currentPrice;

  const pl = calculatorMode === CALCULATOR_MODES.FUTURES
    ? calculateFuturesOptionPLValue(tempOpt, targetForCalc, optionDaysRemaining, contractMultiplier, ivToUse)
    : calculateStockOptionPLValue(tempOpt, targetForCalc, optAssetPrice, optionDaysRemaining, ivToUse, divYield, contractMultiplier, rfrOpt);

  // adjustPLByStockGroup НЕ применяем — stockClassification в текущем коде null,
  // и применять его к Start P&L было бы корректировкой, которую мы по дизайну исключаем.
  return pl;
}
