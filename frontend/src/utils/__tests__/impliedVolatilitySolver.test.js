/**
 * Тесты решателя обратной задачи (frontend/src/utils/impliedVolatilitySolver.js).
 *
 * КОНТЕКСТ: в проекте не было решателя implied volatility — getImpliedVolatility в
 * optionPricing.js/futuresPricing.js просто читает поле из объекта, не подбирает.
 * Этот модуль нужен для калибровки якоря Fact P&L (frontend/src/utils/factPLAnchor.js) —
 * подбор волатильности, при которой модель сама даёт факт брокера.
 */

import { solveImpliedVolatility, bisectImpliedVolatility } from '../impliedVolatilitySolver';
import { calculateOptionTheoreticalPrice } from '../optionPricing';
import { calculateFuturesOptionTheoreticalPrice } from '../futuresPricing';

const CALL = { type: 'CALL', strike: 100, action: 'Buy' };
const PUT = { type: 'PUT', strike: 100, action: 'Buy' };
const FUTURES_CALL = { type: 'CALL', strike: 50, action: 'Buy' };

describe('solveImpliedVolatility — обратная проверка', () => {
  it('подобранная волатильность даёт цену, совпадающую с целевой (акции, CALL)', () => {
    const knownVol = 42.5; // %
    const assetPrice = 105;
    const days = 30;
    const targetPrice = calculateOptionTheoreticalPrice(CALL, assetPrice, days, knownVol, 0, 0.04);

    const result = solveImpliedVolatility({
      option: CALL,
      targetPrice,
      assetPrice,
      daysRemaining: days,
      dividendYield: 0,
      riskFreeRate: 0.04,
      mode: 'stocks',
    });

    expect(result.converged).toBe(true);
    expect(result.volatility).toBeCloseTo(knownVol, 1);

    // Обратная проверка: цена по подобранной волатильности действительно совпадает с целевой.
    const priceAtSolved = calculateOptionTheoreticalPrice(CALL, assetPrice, days, result.volatility, 0, 0.04);
    expect(priceAtSolved).toBeCloseTo(targetPrice, 3);
  });

  it('подобранная волатильность даёт цену, совпадающую с целевой (PUT, глубокий ITM)', () => {
    const knownVol = 65.0;
    const assetPrice = 80;
    const days = 60;
    const targetPrice = calculateOptionTheoreticalPrice(PUT, assetPrice, days, knownVol, 0, 0.04);

    const result = solveImpliedVolatility({
      option: PUT,
      targetPrice,
      assetPrice,
      daysRemaining: days,
      riskFreeRate: 0.04,
      mode: 'stocks',
    });

    expect(result.converged).toBe(true);
    expect(result.volatility).toBeCloseTo(knownVol, 1);
  });

  it('цена ниже внутренней стоимости → converged: false, reason: below-intrinsic', () => {
    // Глубокий ITM CALL: внутренняя стоимость = 105-100 = 5, а целевая цена ниже неё —
    // физически невозможно ни при какой волатильности.
    const result = solveImpliedVolatility({
      option: CALL,
      targetPrice: 3, // < intrinsic (5)
      assetPrice: 105,
      daysRemaining: 30,
      riskFreeRate: 0.04,
      mode: 'stocks',
    });

    expect(result.converged).toBe(false);
    expect(result.reason).toBe('below-intrinsic');
    expect(result.volatility).toBeNull();
  });

  it('экстремально высокая целевая цена (выше цены при 500% волатильности) → converged: false', () => {
    const assetPrice = 100;
    const days = 30;
    const priceAt500 = calculateOptionTheoreticalPrice(CALL, assetPrice, days, 500, 0, 0.04);

    const result = solveImpliedVolatility({
      option: CALL,
      targetPrice: priceAt500 * 5, // заведомо недостижимо
      assetPrice,
      daysRemaining: days,
      riskFreeRate: 0.04,
      mode: 'stocks',
    });

    expect(result.converged).toBe(false);
    expect(result.reason).toBe('above-max-volatility');
    expect(result.volatility).toBeNull();
  });

  it('на экспирации (daysRemaining <= 0) подбор не выполняется — reason: expiry', () => {
    const result = solveImpliedVolatility({
      option: CALL,
      targetPrice: 5,
      assetPrice: 105,
      daysRemaining: 0,
      mode: 'stocks',
    });

    expect(result.converged).toBe(false);
    expect(result.reason).toBe('expiry');
  });

  it('сходится за разумное число итераций (<= 60, обычно намного меньше)', () => {
    const knownVol = 33.3;
    const assetPrice = 98;
    const days = 45;
    const targetPrice = calculateOptionTheoreticalPrice(PUT, assetPrice, days, knownVol, 0, 0.04);

    const result = solveImpliedVolatility({
      option: PUT,
      targetPrice,
      assetPrice,
      daysRemaining: days,
      riskFreeRate: 0.04,
      mode: 'stocks',
    });

    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThanOrEqual(60);
    expect(result.iterations).toBeGreaterThan(0);
  });

  it('фьючерсный режим (Black-76): подобранная волатильность воспроизводит целевую цену', () => {
    const knownVol = 28.0;
    const futuresPrice = 55;
    const days = 20;
    const targetPrice = calculateFuturesOptionTheoreticalPrice(FUTURES_CALL, futuresPrice, days, knownVol);

    const result = solveImpliedVolatility({
      option: FUTURES_CALL,
      targetPrice,
      assetPrice: futuresPrice,
      daysRemaining: days,
      mode: 'futures',
    });

    expect(result.converged).toBe(true);
    expect(result.volatility).toBeCloseTo(knownVol, 1);

    const priceAtSolved = calculateFuturesOptionTheoreticalPrice(FUTURES_CALL, futuresPrice, days, result.volatility);
    expect(priceAtSolved).toBeCloseTo(targetPrice, 3);
  });

  it('contractMultiplier принимается, но не влияет на результат (цена уже «за контракт»)', () => {
    const knownVol = 40;
    const assetPrice = 100;
    const days = 30;
    const targetPrice = calculateOptionTheoreticalPrice(CALL, assetPrice, days, knownVol, 0, 0.04);

    const withMult = solveImpliedVolatility({
      option: CALL, targetPrice, assetPrice, daysRemaining: days, riskFreeRate: 0.04, mode: 'stocks', contractMultiplier: 100,
    });
    const withoutMult = solveImpliedVolatility({
      option: CALL, targetPrice, assetPrice, daysRemaining: days, riskFreeRate: 0.04, mode: 'stocks',
    });

    expect(withMult.volatility).toBeCloseTo(withoutMult.volatility, 6);
  });
});

describe('bisectImpliedVolatility — общее ядро', () => {
  it('работает с произвольным priceFn (без привязки к option/mode)', () => {
    // Синтетическая монотонная функция — проверка, что ядро не завязано на BSM/Black-76.
    const priceFn = (vol) => vol * 2 + 1;
    const result = bisectImpliedVolatility({ priceFn, targetPrice: 51, volLow: 1, volHigh: 100 });

    expect(result.converged).toBe(true);
    expect(result.volatility).toBeCloseTo(25, 2);
  });

  it('невалидные границы (volHigh <= volLow) → converged: false', () => {
    const result = bisectImpliedVolatility({ priceFn: (v) => v, targetPrice: 10, volLow: 50, volHigh: 10 });
    expect(result.converged).toBe(false);
    expect(result.reason).toBe('invalid-bounds');
  });
});
