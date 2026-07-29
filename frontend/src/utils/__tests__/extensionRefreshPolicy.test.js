import { normalizeMarketIv, buildIvPatch } from '../extensionRefreshPolicy';

// Тесты на shouldPersistExtensionRefresh (гейт автосейва после обновления от
// расширения) вынесены в отдельный файл: __tests__/extRefreshSaveGate.test.js

describe('normalizeMarketIv', () => {
  test('значение уже в процентах остаётся как есть', () => {
    expect(normalizeMarketIv(54.62)).toBeCloseTo(54.62);
  });

  test('значение-доля домножается на 100', () => {
    expect(normalizeMarketIv(0.5462)).toBeCloseTo(54.62);
  });

  test('120 остаётся процентами, а не превращается в 1.2', () => {
    expect(normalizeMarketIv(120)).toBe(120);
  });

  test('0 → null', () => {
    expect(normalizeMarketIv(0)).toBeNull();
  });

  test('NaN → null', () => {
    expect(normalizeMarketIv(NaN)).toBeNull();
  });

  test('null → null', () => {
    expect(normalizeMarketIv(null)).toBeNull();
  });

  test('5462 (мусор/опечатка, вне коридора) → null', () => {
    expect(normalizeMarketIv(5462)).toBeNull();
  });

  test('0.004 (после *100 = 0.4%, вне коридора [1,500]) → null', () => {
    expect(normalizeMarketIv(0.004)).toBeNull();
  });
});

describe('buildIvPatch', () => {
  const option = { strike: 100, type: 'CALL', date: '2026-08-15' };
  const nowIso = '2026-07-29T10:00:00.000Z';

  test('валидная IV → патч только с полями рыночной IV', () => {
    const patch = buildIvPatch(option, 54.62, nowIso);
    expect(patch).toEqual({
      impliedVolatility: 54.62,
      ivUpdatedFromExtension: true,
      ivUpdatedAt: nowIso,
    });
  });

  test('невалидная IV → null, патч не строится', () => {
    expect(buildIvPatch(option, 0, nowIso)).toBeNull();
    expect(buildIvPatch(option, NaN, nowIso)).toBeNull();
    expect(buildIvPatch(option, null, nowIso)).toBeNull();
  });

  test('патч НИКОГДА не содержит ключей manualIvOverride*', () => {
    const patch = buildIvPatch(option, 0.5462, nowIso);
    expect(patch).not.toHaveProperty('manualIvOverride');
    expect(patch).not.toHaveProperty('manualIvOverrideDate');
    expect(patch).not.toHaveProperty('manualIvOverrideDisplayDate');
    expect(Object.keys(patch).sort()).toEqual(
      ['impliedVolatility', 'ivUpdatedAt', 'ivUpdatedFromExtension'].sort()
    );
  });
});

describe('buildIvPatch — 6 сочетаний статус × Fact IV, manualIvOverride* никогда не пишется', () => {
  const nowIso = '2026-07-29T10:00:00.000Z';

  const scenarios = [
    { name: 'pending, Fact IV задан', status: 'pending', option: { manualIvOverride: 42 } },
    { name: 'pending, Fact IV пуст', status: 'pending', option: {} },
    { name: 'pending, Fact IV перезаписан ранее (ivUpdatedFromExtension true уже стоял)', status: 'pending', option: { manualIvOverride: 42, ivUpdatedFromExtension: true } },
    { name: 'standard, Fact IV задан', status: 'standard', option: { manualIvOverride: 30 } },
    { name: 'standard, Fact IV пуст', status: 'standard', option: {} },
    { name: 'standard, Fact IV перезаписан ранее', status: 'standard', option: { manualIvOverride: 30, ivUpdatedFromExtension: true } },
  ];

  test.each(scenarios)('$name', ({ option }) => {
    const patch = buildIvPatch(option, 54.62, nowIso);
    expect(patch).not.toBeNull();
    expect(patch).not.toHaveProperty('manualIvOverride');
    expect(patch).not.toHaveProperty('manualIvOverrideDate');
    expect(patch).not.toHaveProperty('manualIvOverrideDisplayDate');
    // Исходный manualIvOverride опциона (если был) не подменяется патчем —
    // патч не содержит этого поля вообще, значит объединение { ...opt, ...patch }
    // сохранит существующий manualIvOverride опциона нетронутым.
    if (option.manualIvOverride !== undefined) {
      const merged = { ...option, ...patch };
      expect(merged.manualIvOverride).toBe(option.manualIvOverride);
    }
  });
});

