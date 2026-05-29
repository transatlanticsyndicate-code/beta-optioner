/**
 * Интеграционные тесты движка подбора стратегии СЕВЕР (analyzer.js).
 *
 * Ценообразование замоканo детерминированной моделью «внутренняя стоимость +
 * удержанная временная стоимость», чтобы проверять КОМБИНАТОРНУЮ логику подбора
 * (а не точность Блэка–Шоулза): коридор маржи, чистый CALL, доля акции, учёт
 * прибыли акции на верху, режимы низа.
 */

// Доля удержанной временной стоимости на дату расчёта (до экспирации).
// Высокая (0.98) — чтобы длинный CALL терял немного на низу и чистый CALL мог пройти.
jest.mock('../../universalPricing', () => ({
  CALCULATOR_MODES: { STOCKS: 'stocks' },
  // P&L одного контракта (×100) на целевой цене.
  calculateOptionPLValue: (option, targetPrice) => {
    const RETAIN = 0.98;
    const strike = Number(option.strike);
    const premium = Number(option.premium) || 0;
    const intrinsic = option.type === 'CALL'
      ? Math.max(0, targetPrice - strike)
      : Math.max(0, strike - targetPrice);
    const value = intrinsic + premium * RETAIN;
    return (value - premium) * 100 * (option.quantity || 1);
  },
}));
jest.mock('../../volatilitySurface', () => ({ getOptionVolatility: () => 0.3 }));
jest.mock('../../optionPricing', () => ({ adjustPLByStockGroup: (pl) => pl }));
jest.mock('../../calculatorModes', () => ({ isStockLikeMode: () => false }));

import { analyzeNorthStrategy, NORTH_KINDS, DEFAULT_MIN_STOCK_MARGIN_PCT } from '../analyzer';

const ENTRY = 100;
const TOP = 130;
const BOTTOM = 85;
const MARGIN_BASE = 6000;
const MARGIN_TOL = 500;
const PL_TOL = 200;

const mkOpt = (type, strike, ask) => ({
  type,
  strike,
  ask,
  bid: ask - 0.1,
  impliedVolatility: 0.3,
  date: '2099-12-31',
});

// Цепочка: коллы 100..120, путы 85..100, премии умеренные.
const buildChain = () => [
  mkOpt('CALL', 100, 3),
  mkOpt('CALL', 105, 2.6),
  mkOpt('CALL', 110, 2.2),
  mkOpt('CALL', 115, 1.8),
  mkOpt('CALL', 120, 1.5),
  mkOpt('PUT', 85, 1.5),
  mkOpt('PUT', 90, 2),
  mkOpt('PUT', 95, 2.6),
  mkOpt('PUT', 100, 3.2),
];

const runAnalysis = (overrides = {}) => analyzeNorthStrategy({
  entry: ENTRY,
  assetQuantity: 100,
  leverage: 4,
  currentPrice: ENTRY,
  topPrice: TOP,
  bottomPrice: BOTTOM,
  expirationDate: '2099-12-31',
  calcDate: '2099-06-30',
  callStrikeMin: ENTRY,
  callStrikeMax: TOP,
  putStrikeMin: BOTTOM,
  putStrikeMax: ENTRY,
  plTolerance: PL_TOL,
  marginBase: MARGIN_BASE,
  marginTolerance: MARGIN_TOL,
  minStockMarginPct: 0.40,
  chain: buildChain(),
  ...overrides,
});

describe('константы', () => {
  it('минимальная доля акции по умолчанию = 0.40', () => {
    expect(DEFAULT_MIN_STOCK_MARGIN_PCT).toBe(0.40);
  });
});

describe('analyzeNorthStrategy — общая корректность', () => {
  const result = runAnalysis();

  it('возвращает непустые выборки для обоих режимов', () => {
    expect(result.optionsOnly.length).toBeGreaterThan(0);
    expect(result.withStock.length).toBeGreaterThan(0);
  });

  it('AC1: все комбинации в коридоре маржи база ± допуск', () => {
    const all = [...result.withStock, ...result.optionsOnly];
    for (const c of all) {
      expect(c.cost.marginUsed).toBeGreaterThanOrEqual(MARGIN_BASE - MARGIN_TOL - 1e-6);
      expect(c.cost.marginUsed).toBeLessThanOrEqual(MARGIN_BASE + MARGIN_TOL + 1e-6);
    }
  });

  it('AC7: во всех комбинациях все ноги — только Buy (нет SELL)', () => {
    const all = [...result.withStock, ...result.optionsOnly];
    for (const c of all) {
      for (const p of c.positions) {
        expect(p.action).toBe('Buy');
      }
    }
  });
});

describe('режим OPTIONS_ONLY', () => {
  const result = runAnalysis();

  it('AC6: qtyStock = 0 и stockMargin = 0', () => {
    for (const c of result.optionsOnly) {
      expect(c.qtyStock).toBe(0);
      expect(c.cost.stockMargin).toBe(0);
      expect(c.kind).toBe(NORTH_KINDS.OPTIONS_ONLY);
    }
  });

  it('AC2: появляется конструкция «только CALL» (без путов)', () => {
    const callOnly = result.optionsOnly.filter((c) => c.puts.length === 0 && c.calls.length > 0);
    expect(callOnly.length).toBeGreaterThan(0);
  });

  it('noWorseThanLoss: низ опционов не хуже −допуск (плюс разрешён)', () => {
    for (const c of result.optionsOnly) {
      expect(c.meta.optionsPLBottom).toBeGreaterThanOrEqual(-PL_TOL - 1e-6);
    }
  });

  it('верхний критерий = P&L опционов (topTotal === topOptions)', () => {
    for (const c of result.optionsOnly) {
      expect(c.criteria.topTotal).toBeCloseTo(c.criteria.topOptions, 6);
      expect(c.criteria.topOptions).toBeGreaterThan(0);
    }
  });
});

describe('режим WITH_STOCK', () => {
  const result = runAnalysis();

  it('доля акции в марже не меньше 40%', () => {
    for (const c of result.withStock) {
      expect(c.cost.stockMarginPct).toBeGreaterThanOrEqual(0.40 - 1e-6);
      expect(c.qtyStock).toBeGreaterThan(0);
    }
  });

  it('учитывает прибыль акции наверху: assetPLTop = (top − entry) × qtyStock', () => {
    for (const c of result.withStock) {
      expect(c.meta.assetPLTop).toBeCloseTo((TOP - ENTRY) * c.qtyStock, 6);
    }
  });

  it('верхний критерий = акция + опционы (topTotal = optionsPLTop + assetPLTop)', () => {
    for (const c of result.withStock) {
      expect(c.criteria.topTotal).toBeCloseTo(c.meta.optionsPLTop + c.meta.assetPLTop, 6);
    }
  });

  it('strictAbs: суммарный низ строго в пределах ±допуск', () => {
    for (const c of result.withStock) {
      expect(Math.abs(c.meta.totalPLBottom)).toBeLessThanOrEqual(PL_TOL + 1e-6);
    }
  });

  it('опционы наверху положительны как отдельный фильтр', () => {
    for (const c of result.withStock) {
      expect(c.meta.optionsPLTop).toBeGreaterThan(0);
    }
  });
});

describe('коридор маржи — без вариантов вне диапазона', () => {
  it('при узком допуске нет комбинаций вне база ± допуск', () => {
    const result = runAnalysis({ marginTolerance: 300 });
    const all = [...result.withStock, ...result.optionsOnly];
    for (const c of all) {
      expect(c.cost.marginUsed).toBeGreaterThanOrEqual(MARGIN_BASE - 300 - 1e-6);
      expect(c.cost.marginUsed).toBeLessThanOrEqual(MARGIN_BASE + 300 + 1e-6);
    }
  });
});
