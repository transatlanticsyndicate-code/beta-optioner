/**
 * Справочник эталонных «цен пункта» (множителей контракта) для фьючерсов.
 *
 * ЗАЧЕМ: «цена пункта» в настройках — это сколько долларов приносит движение
 * цены на 1.00 в тех единицах, в которых контракт котируется (для NG цена 3.63
 * $/MMBtu × 10 000 MMBtu = $10 000 за пункт). Легко перепутать её со стоимостью
 * ТИКА (для NG шаг 0.001 = $10) — именно так и произошло: весь справочник был
 * заполнен стоимостью тиков, из-за чего опционы на фьючерсы считались в сотни и
 * тысячи раз дешевле, а подбор набирал абсурдные количества контрактов.
 *
 * Здесь — эталонные значения по спецификациям бирж (CME/COMEX/NYMEX/ICE).
 * Используются ТОЛЬКО для предупреждения в настройках: пользователь остаётся
 * хозяином цифры (может быть контракт, которого нет в справочнике), но видит
 * расхождение до того, как посчитает по нему сделку.
 */

// Тикер (базовый, без месяца и года) → множитель контракта в долларах за 1.00 цены.
export const REFERENCE_POINT_VALUES = {
  '10Y': 1000, // Micro 1-year yield
  '1OZ': 1, // 1 OZ Gold
  '6A': 100000, // Australian Dollar
  '6B': 62500, // British Pound
  '6C': 100000, // Canadian Dollar
  '6E': 125000, // Euro FX
  '6J': 12500000, // Japanese Yen
  '6L': 100000, // Brazillian Real
  '6M': 500000, // Mexican Peso
  '6N': 100000, // New Zealand Dollar
  '6S': 125000, // Swiss Franc
  '6Z': 500000, // South African Rand
  AW: 100, // Bloomberg Commodity Index
  BZ: 1000, // Brent Crude Oil
  CC: 10, // Cocao
  CL: 1000, // Light Sweet Crude Oil
  CT: 500, // Cotton No.2
  DC: 2000, // Milk Class III
  DX: 1000, // US Dollar Index
  E7: 62500, // E-mini Euro FX
  EMD: 100, // E-mini S&P MidCap 400
  ES: 50, // E-mini S&P 500 Index
  GC: 100, // Gold Futures
  GF: 500, // Feeder Cattle
  HE: 400, // Lean Hog
  HG: 25000, // Copper
  HO: 42000, // Heating Oil
  J7: 6250000, // E-mini Japanese Yen
  KC: 375, // Coffee 'C'
  KE: 50, // KC HRW Wheat
  LE: 400, // Live Cattle
  M2K: 5, // Micro E-mini Russell 2000 Index
  M6A: 10000, // E-Micro AUD/USD
  M6B: 6250, // E-Micro GBP/USD
  M6E: 12500, // E-Micro EUR/USD
  MCD: 10000, // Micro Canadian Dollar
  MCL: 100, // Micro Crude Oil
  MES: 5, // Micro E-mini S&P 500 Stock Price
  MGC: 10, // E-micro Gold
  MHG: 2500, // Micro Copper
  MME: 50, // MSCI Emerging Markets
  MNG: 1000, // Micro Natural Gas
  MNQ: 2, // Micro E-Mini Nasdaq-100 Index
  MSF: 12500, // Micro Swiss Franc
  MSL: 25, // Micro SOL
  MYM: 0.5, // Micro E-mini Dow Jones Industrial
  MZC: 5, // Micro Corn
  MZL: 60, // Micro Soybean Oil
  MZM: 10, // Micro Soybean Meal
  MZS: 5, // Micro Soybean
  MZW: 5, // Micro Wheat
  NG: 10000, // Natural Gas
  NKD: 5, // Nikkei 225 Stock Aerage
  NQ: 20, // E-mini Nasdaq 100 Index
  OJ: 150, // FCOJ-A
  PA: 100, // Palladium
  PL: 50, // Platinum
  QC: 12500, // Copper miNY
  QG: 2500, // miNY Natural Gas
  QI: 2500, // 2500oz miNY Silver
  QM: 500, // NYMEX miNY Light Sweet Crude Oil
  QO: 50, // 50oz miNY Gold
  RB: 42000, // RBOB Gasoline
  RTY: 50, // E-mini Russell 2000 Index
  SB: 1120, // Sugar No. 11
  SI: 5000, // Silver
  SIC: 100, // 100oz Silver
  SIL: 1000, // 1000oz Silver
  SOL: 500, // SOL
  TN: 1000, // Ultra 10-Years U.S Treasury Note
  UB: 1000, // Ultra T-Bond
  VX: 1000, // CBOE volatility INDEX (VIX)
  VXM: 100, // Mini CBOE Volatility (VIX)
  XC: 10, // E-Mini Corn
  XK: 10, // E-mini Soybeans
  XW: 10, // E-Mini Wheat
  YM: 5, // Mini Dow Jones Industrial Areage
  ZB: 1000, // 30-Years U.S Treasury Bond
  ZC: 50, // Corn
  ZF: 1000, // 5-Year U.S. Treasury Note
  ZL: 600, // Soybean Oil
  ZM: 100, // Soybean Meal
  ZN: 1000, // 10-Years U.S. Treasury Note
  ZO: 50, // Oats
  ZQ: 4166.67, // Thirty-Day Fed Funds
  ZR: 2000, // Rough Rice
  ZS: 50, // Soybean
  ZT: 2000, // 2-Years U.S. Treasury Note
  ZW: 50, // Wheat
};

/**
 * Эталонная цена пункта по тикеру.
 * @param {string} ticker — базовый тикер (NG, ES, 6E…)
 * @returns {number|null} множитель или null, если контракта нет в справочнике
 */
export const getReferencePointValue = (ticker) => {
  try {
    const key = (ticker || '').trim().toUpperCase();
    if (!key) return null;
    const value = REFERENCE_POINT_VALUES[key];
    return typeof value === 'number' ? value : null;
  } catch (error) {
    return null;
  }
};

/**
 * Проверить введённую цену пункта по справочнику.
 * Возвращает подсказку, если значение расходится с эталоном (в том числе
 * типовой случай «введена стоимость тика» — значение в разы меньше эталона).
 *
 * @param {string} ticker — базовый тикер
 * @param {number} pointValue — введённое значение
 * @returns {{reference: number, looksLikeTickValue: boolean}|null} null — расхождений нет
 */
export const checkPointValue = (ticker, pointValue) => {
  try {
    const reference = getReferencePointValue(ticker);
    const value = Number(pointValue);
    if (!reference || !Number.isFinite(value) || value <= 0) return null;
    // Допуск 1% — защита от округлений (например, 4166.67 против 4166.6667).
    if (Math.abs(value - reference) <= reference * 0.01) return null;
    return { reference, looksLikeTickValue: value < reference };
  } catch (error) {
    return null;
  }
};
