/**
 * Тесты проверки перед созданием снимка входа (см. src/utils/entrySnapshotCheck.js).
 *
 * Реальный случай: на данных заказчика 9 позиций в 4 сделках (T, PDD, MKTX, TTD)
 * получили startSnapshot без Fact P&L, потому что предупреждения не было.
 */

import { findLegsWithoutFactPL, describeMissingFactPL } from '../entrySnapshotCheck';

const legWithFact = (overrides = {}) => ({
  action: 'Buy',
  type: 'CALL',
  strike: 150,
  quantity: 2,
  actualPL: 120.5,
  visible: true,
  ...overrides,
});

describe('findLegsWithoutFactPL', () => {
  test('все ноги с фактом → пустой список', () => {
    const options = [
      legWithFact(),
      legWithFact({ type: 'PUT', strike: 140, actualPL: -30 }),
    ];
    expect(findLegsWithoutFactPL(options)).toEqual([]);
  });

  test('часть ног без факта → возвращает только их', () => {
    const withFact = legWithFact();
    const withoutFact = legWithFact({ type: 'PUT', strike: 140, actualPL: null });
    const result = findLegsWithoutFactPL([withFact, withoutFact]);
    expect(result).toEqual([withoutFact]);
  });

  test('actualPL: 0 считается заполненным значением (ноль — валидный факт)', () => {
    const zeroLeg = legWithFact({ actualPL: 0 });
    expect(findLegsWithoutFactPL([zeroLeg])).toEqual([]);
  });

  test('actualPL: null → не заполнено', () => {
    const leg = legWithFact({ actualPL: null });
    expect(findLegsWithoutFactPL([leg])).toEqual([leg]);
  });

  test('actualPL: undefined → не заполнено', () => {
    const { actualPL, ...leg } = legWithFact();
    expect(findLegsWithoutFactPL([leg])).toEqual([leg]);
  });

  test('скрытые ноги (visible: false) не учитываются', () => {
    const hiddenLeg = legWithFact({ actualPL: null, visible: false });
    expect(findLegsWithoutFactPL([hiddenLeg])).toEqual([]);
  });

  test('ноги с уже существующим startSnapshot не учитываются (снимок для них не пересоздаётся)', () => {
    const alreadySnapshotted = legWithFact({ actualPL: null, startSnapshot: { premium: 1 } });
    expect(findLegsWithoutFactPL([alreadySnapshotted])).toEqual([]);
  });

  test('нечисловой/отсутствующий вход options не падает', () => {
    expect(findLegsWithoutFactPL(null)).toEqual([]);
    expect(findLegsWithoutFactPL(undefined)).toEqual([]);
  });
});

describe('describeMissingFactPL', () => {
  test('пустой список → пустая строка (тишина при нормальном сценарии)', () => {
    expect(describeMissingFactPL([])).toBe('');
  });

  test('текст содержит количество позиций', () => {
    const legs = [
      legWithFact({ actualPL: null }),
      legWithFact({ type: 'PUT', strike: 140, actualPL: null }),
    ];
    const text = describeMissingFactPL(legs);
    expect(text).toContain('2');
  });

  test('текст перечисляет тип, страйк и количество каждой позиции', () => {
    const legs = [
      { action: 'Buy', type: 'CALL', strike: 150, quantity: 2, actualPL: null },
      { action: 'Sell', type: 'PUT', strike: 95, quantity: 1, actualPL: null },
    ];
    const text = describeMissingFactPL(legs);
    expect(text).toContain('Call');
    expect(text).toContain('150');
    expect(text).toContain('2 шт.');
    expect(text).toContain('Put');
    expect(text).toContain('95');
    expect(text).toContain('1 шт.');
  });

  test('текст объясняет невозможность заполнить позже и даёт выбор без блокировки', () => {
    const text = describeMissingFactPL([legWithFact({ actualPL: null })]);
    expect(text.toLowerCase()).toContain('нельзя');
    expect(text).toContain('Отмена');
    expect(text).toContain('ОК');
  });
});
