import { buildOptionKey } from '../optionKey';

describe('buildOptionKey', () => {
  const baseOption = { strike: 100, type: 'CALL', date: '2026-08-15' };

  test('разные тикеры дают разные ключи для одного и того же опциона', () => {
    const keyAAPL = buildOptionKey('AAPL', baseOption);
    const keyCCI = buildOptionKey('CCI', baseOption);
    expect(keyAAPL).not.toBe(keyCCI);
  });

  test('регистр тикера нормализуется (aapl === AAPL)', () => {
    expect(buildOptionKey('aapl', baseOption)).toBe(buildOptionKey('AAPL', baseOption));
  });

  test('пустой/undefined тикер → null', () => {
    expect(buildOptionKey('', baseOption)).toBeNull();
    expect(buildOptionKey(undefined, baseOption)).toBeNull();
    expect(buildOptionKey(null, baseOption)).toBeNull();
    expect(buildOptionKey('   ', baseOption)).toBeNull();
  });

  test('дата с временем обрезается до YYYY-MM-DD', () => {
    const withTime = { ...baseOption, date: '2026-08-15T00:00:00.000Z' };
    expect(buildOptionKey('AAPL', withTime)).toBe(buildOptionKey('AAPL', baseOption));
  });

  test('формат ключа: TICKER|strike-TYPE-date', () => {
    expect(buildOptionKey('AAPL', baseOption)).toBe('AAPL|100-CALL-2026-08-15');
  });

  test('тип опциона нормализуется к верхнему регистру', () => {
    expect(buildOptionKey('AAPL', { ...baseOption, type: 'put' })).toBe('AAPL|100-PUT-2026-08-15');
  });
});
