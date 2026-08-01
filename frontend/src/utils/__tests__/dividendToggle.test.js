import { resolveDividendYield, shouldWarnDividendsIgnored } from '../dividendPolicy';

describe('resolveDividendYield', () => {
  test('тумблер включён + 0.03 → 0.03', () => {
    expect(resolveDividendYield(true, 0.03)).toBe(0.03);
  });

  test('тумблер выключен + 0.03 → 0', () => {
    expect(resolveDividendYield(false, 0.03)).toBe(0);
  });

  test('тумблер включён + null → 0', () => {
    expect(resolveDividendYield(true, null)).toBe(0);
  });

  test('тумблер включён + undefined → 0', () => {
    expect(resolveDividendYield(true, undefined)).toBe(0);
  });

  test('тумблер включён + NaN → 0', () => {
    expect(resolveDividendYield(true, NaN)).toBe(0);
  });

  test('тумблер включён + отрицательное значение → 0', () => {
    expect(resolveDividendYield(true, -0.05)).toBe(0);
  });

  test('тумблер выключен + отрицательное значение → 0', () => {
    expect(resolveDividendYield(false, -0.05)).toBe(0);
  });

  test('тумблер включён + 0 (легитимное отсутствие дивидендов) → 0', () => {
    expect(resolveDividendYield(true, 0)).toBe(0);
  });
});

describe('shouldWarnDividendsIgnored', () => {
  test('тумблер выключен и доходность > 0 → true', () => {
    expect(shouldWarnDividendsIgnored(false, 0.03)).toBe(true);
  });

  test('тумблер включён и доходность > 0 → false (дивиденды и так учитываются)', () => {
    expect(shouldWarnDividendsIgnored(true, 0.03)).toBe(false);
  });

  test('тумблер выключен и доходность 0 → false (предупреждать не о чем)', () => {
    expect(shouldWarnDividendsIgnored(false, 0)).toBe(false);
  });

  test('тумблер выключен и доходность null/undefined/NaN → false', () => {
    expect(shouldWarnDividendsIgnored(false, null)).toBe(false);
    expect(shouldWarnDividendsIgnored(false, undefined)).toBe(false);
    expect(shouldWarnDividendsIgnored(false, NaN)).toBe(false);
  });

  test('тумблер выключен и доходность отрицательная (мусор) → false', () => {
    expect(shouldWarnDividendsIgnored(false, -0.02)).toBe(false);
  });
});
