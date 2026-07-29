import { resolveContractMultiplier } from '../contractMultiplier';
import { CALCULATOR_MODES } from '../calculatorModes';

describe('resolveContractMultiplier', () => {
  test('FUTURES с pointValue 12.5 → 12.5', () => {
    expect(resolveContractMultiplier(CALCULATOR_MODES.FUTURES, { pointValue: 12.5 }, 'MES')).toBe(12.5);
  });

  test('FUTURES без настроек (selectedFuture=null) → null, НЕ 100', () => {
    expect(resolveContractMultiplier(CALCULATOR_MODES.FUTURES, null, 'XYZ')).toBeNull();
  });

  test('CRYPTO → 1', () => {
    expect(resolveContractMultiplier(CALCULATOR_MODES.CRYPTO, null, 'BTCUSDT')).toBe(1);
  });

  test('STOCKS → 100', () => {
    expect(resolveContractMultiplier(CALCULATOR_MODES.STOCKS, null, 'AAPL')).toBe(100);
  });

  test('ETF → 100 (та же математика, что и STOCKS)', () => {
    expect(resolveContractMultiplier(CALCULATOR_MODES.ETF, null, 'SPY')).toBe(100);
  });

  test('FUTURES с selectedFuture без pointValue (0/undefined) → null', () => {
    expect(resolveContractMultiplier(CALCULATOR_MODES.FUTURES, { pointValue: 0 }, 'XYZ')).toBeNull();
    expect(resolveContractMultiplier(CALCULATOR_MODES.FUTURES, {}, 'XYZ')).toBeNull();
  });
});
