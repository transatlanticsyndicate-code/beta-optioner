// Тесты задачи 1D: множитель контракта и режим калькулятора должны
// замораживаться в startSnapshot, а не браться текущими из ctx.
//
// ЗАЧЕМ: до этой правки computeStartPL всегда брал contractMultiplier и
// calculatorMode из ctx (текущие настройки), поэтому правка стоимости пункта
// фьючерса задним числом меняла Start P&L уже сохранённых сделок. Тест
// проверяет, что после правки: 1) снимок с явным полем — расчёт идёт по
// снимку; 2) снимок без поля (старый формат) — мягкая миграция на ctx.
//
// Пайплайн расчёта (getOptionVolatility, calculateStockOptionPLValue,
// calculateFuturesOptionPLValue, dateUtils) замокан — тест проверяет именно
// то, какие значения multiplier/mode долетают до этих функций, а не саму
// финансовую математику (она покрыта другими тестами).
//
// ВАЖНО: react-scripts test включает resetMocks:true по умолчанию (мок-
// реализации сбрасываются перед КАЖДЫМ тестом), поэтому реализации моков
// задаются не в фабрике jest.mock, а в beforeEach через mockReturnValue.

jest.mock('../dateUtils', () => ({
  calculateDaysRemainingUTC: jest.fn(),
  getOldestEntryDate: jest.fn(),
  isOptionActiveAtDay: jest.fn(),
  calculateDaysRemainingPreciseET: jest.fn(),
  calculateDaysToExpirationFromTodayPreciseET: jest.fn(),
}));

jest.mock('../volatilitySurface', () => ({
  getOptionVolatility: jest.fn(),
}));

jest.mock('../optionPricing', () => ({
  calculateOptionPLValue: jest.fn(),
}));

jest.mock('../futuresPricing', () => ({
  calculateFuturesOptionPLValue: jest.fn(),
}));

import { buildStartSnapshot, computeStartPL } from '../startPLSnapshot';
import {
  calculateDaysRemainingUTC,
  getOldestEntryDate,
  isOptionActiveAtDay,
  calculateDaysRemainingPreciseET,
  calculateDaysToExpirationFromTodayPreciseET,
} from '../dateUtils';
import { getOptionVolatility } from '../volatilitySurface';
import { calculateOptionPLValue } from '../optionPricing';
import { calculateFuturesOptionPLValue } from '../futuresPricing';
import { CALCULATOR_MODES } from '../calculatorModes';

const baseOption = {
  strike: 100,
  type: 'call',
  action: 'Buy',
  date: '2026-12-31',
  premium: 1.5,
  isPremiumModified: false,
  bid: 1.4,
  ask: 1.6,
  isBidModified: false,
  isAskModified: false,
  impliedVolatility: 0.3,
  manualIvOverride: null,
  manualIvOverrideDate: null,
  assetPriceAtEntry: 100,
  quantity: 1,
  actualPL: null,
  actualPLDate: null,
  actualPLPrice: null,
  actualPLQuantity: null,
};

const baseSnapshot = {
  premium: 1.5,
  bid: 1.4,
  ask: 1.6,
  impliedVolatility: 0.3,
  manualIvOverride: null,
  manualIvOverrideDate: null,
  assetPrice: 100,
  quantity: 1,
  dividendYield: 0,
  actualPL: null,
  actualPLDate: null,
  actualPLPrice: null,
  actualPLQuantity: null,
};

const baseCtx = {
  allOptions: [],
  currentPrice: 100,
  targetPrice: 105,
  daysPassed: 0,
  ivSurface: null,
};

beforeEach(() => {
  // resetMocks:true (react-scripts) стирает реализации перед каждым тестом —
  // задаём их заново.
  calculateDaysRemainingUTC.mockReturnValue(10);
  getOldestEntryDate.mockReturnValue(new Date('2026-01-01T00:00:00Z'));
  isOptionActiveAtDay.mockReturnValue(true);
  calculateDaysRemainingPreciseET.mockReturnValue(10);
  calculateDaysToExpirationFromTodayPreciseET.mockReturnValue(10);
  getOptionVolatility.mockReturnValue(0.3);
  calculateOptionPLValue.mockReturnValue(100);
  calculateFuturesOptionPLValue.mockReturnValue(200);
});

describe('buildStartSnapshot — заморозка contractMultiplier/calculatorMode', () => {
  test('кладёт оба новых поля в результат', () => {
    const snapshot = buildStartSnapshot(baseOption, {
      currentPrice: 100,
      dividendYield: 0,
      contractMultiplier: 50,
      calculatorMode: CALCULATOR_MODES.FUTURES,
    });

    expect(snapshot.contractMultiplier).toBe(50);
    expect(snapshot.calculatorMode).toBe(CALCULATOR_MODES.FUTURES);
  });
});

describe('computeStartPL — contractMultiplier', () => {
  test('снимок с contractMultiplier=50, ctx.contractMultiplier=12.5 → расчёт идёт по 50 (из снимка)', () => {
    const snapshot = { ...baseSnapshot, contractMultiplier: 50, calculatorMode: CALCULATOR_MODES.STOCKS };
    const ctx = { ...baseCtx, calculatorMode: CALCULATOR_MODES.STOCKS, contractMultiplier: 12.5 };

    const result = computeStartPL(snapshot, baseOption, ctx);

    expect(result).not.toBeNull();
    expect(calculateOptionPLValue).toHaveBeenCalledTimes(1);
    const multiplierArg = calculateOptionPLValue.mock.calls[0][6];
    expect(multiplierArg).toBe(50);
  });

  test('снимок без contractMultiplier (старый формат) → расчёт идёт по ctx (мягкая миграция)', () => {
    const snapshot = { ...baseSnapshot, calculatorMode: CALCULATOR_MODES.STOCKS };
    delete snapshot.contractMultiplier;
    const ctx = { ...baseCtx, calculatorMode: CALCULATOR_MODES.STOCKS, contractMultiplier: 12.5 };

    const result = computeStartPL(snapshot, baseOption, ctx);

    expect(result).not.toBeNull();
    const multiplierArg = calculateOptionPLValue.mock.calls[0][6];
    expect(multiplierArg).toBe(12.5);
  });
});

describe('computeStartPL — calculatorMode', () => {
  test('снимок с calculatorMode=futures, ctx.calculatorMode=stocks → вызывается фьючерсная формула (из снимка)', () => {
    const snapshot = { ...baseSnapshot, contractMultiplier: 50, calculatorMode: CALCULATOR_MODES.FUTURES };
    const ctx = { ...baseCtx, calculatorMode: CALCULATOR_MODES.STOCKS, contractMultiplier: 50 };

    const result = computeStartPL(snapshot, baseOption, ctx);

    expect(result).not.toBeNull();
    expect(calculateFuturesOptionPLValue).toHaveBeenCalledTimes(1);
    expect(calculateOptionPLValue).not.toHaveBeenCalled();
    const multiplierArg = calculateFuturesOptionPLValue.mock.calls[0][3];
    expect(multiplierArg).toBe(50);
  });

  test('снимок без calculatorMode (старый формат) → режим берётся из ctx (мягкая миграция)', () => {
    const snapshot = { ...baseSnapshot, contractMultiplier: 50 };
    delete snapshot.calculatorMode;
    const ctx = { ...baseCtx, calculatorMode: CALCULATOR_MODES.FUTURES, contractMultiplier: 50 };

    const result = computeStartPL(snapshot, baseOption, ctx);

    expect(result).not.toBeNull();
    expect(calculateFuturesOptionPLValue).toHaveBeenCalledTimes(1);
    expect(calculateOptionPLValue).not.toHaveBeenCalled();
  });
});
