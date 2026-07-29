/**
 * Тесты валидации Fact P&L (см. src/utils/factPLValidation.js).
 *
 * Тестовые данные — реальные кейсы из аудита 1B:
 *  - MKTX: нога 4×CALL 130 по цене входа 3.97, множитель 100 → стоимость ноги $1588.
 *  - ZC (фьючерс): нога 1×контракт по цене входа 3.50, множитель 12.5 → стоимость ноги ~$44,
 *    на которую был записан ошибочный якорь +$587 (в ~13 раз больше стоимости ноги).
 */

import { getLegCost, validateFactPL, describeAnchorResidual } from '../factPLValidation';

// Нога MKTX: 4× CALL 130, цена входа (ask) 3.97, множитель 100 → стоимость $1588.
const MKTX_CALL_LEG = {
  action: 'Buy',
  ask: 3.97,
  quantity: 4,
  entryDate: '2026-07-01',
};

// Проданная нога (для block по прибыли > премии).
const SOLD_LEG = {
  action: 'Sell',
  ask: 2.5,
  quantity: 1,
  entryDate: '2026-07-01',
};

// Нога с нулевой ценой входа (bid/ask ещё не определены) — блокировка не должна применяться.
const ZERO_PRICE_LEG = {
  action: 'Buy',
  ask: 0,
  quantity: 1,
  entryDate: '2026-07-01',
};

// Нога ZC (фьючерс): 1 контракт, цена входа 3.50, множитель 12.5 → стоимость ~$43.75.
const ZC_LEG = {
  action: 'Buy',
  ask: 3.5,
  quantity: 1,
  entryDate: '2026-07-01',
};

describe('getLegCost', () => {
  test('считает стоимость купленной ноги MKTX (4 × 3.97 × 100 = 1588)', () => {
    expect(getLegCost(MKTX_CALL_LEG, 100)).toBeCloseTo(1588, 5);
  });

  test('возвращает null для ноги с нулевой ценой входа', () => {
    expect(getLegCost(ZERO_PRICE_LEG, 100)).toBeNull();
  });

  test('возвращает null, если option отсутствует', () => {
    expect(getLegCost(null, 100)).toBeNull();
  });
});

describe('validateFactPL — блокировка физически невозможных значений', () => {
  test('купленная нога: убыток больше уплаченной премии → block', () => {
    const result = validateFactPL({ value: -5000, option: MKTX_CALL_LEG, contractMultiplier: 100 });
    expect(result.level).toBe('block');
  });

  test('купленная нога: убыток ровно равен премии (граница) → ok', () => {
    const result = validateFactPL({ value: -1588, option: MKTX_CALL_LEG, contractMultiplier: 100 });
    expect(result.level).toBe('ok');
  });

  test('купленная нога: убыток чуть меньше премии → ok', () => {
    const result = validateFactPL({ value: -1000, option: MKTX_CALL_LEG, contractMultiplier: 100 });
    expect(result.level).toBe('ok');
  });

  test('проданная нога: прибыль больше полученной премии → block', () => {
    // Стоимость ноги: 2.5 × 1 × 100 = 250. Прибыль 400 больше — невозможно.
    const result = validateFactPL({ value: 400, option: SOLD_LEG, contractMultiplier: 100 });
    expect(result.level).toBe('block');
  });

  test('нога с нулевой ценой входа: НИКОГДА не блокируется, даже при огромном значении', () => {
    const result = validateFactPL({ value: -999999, option: ZERO_PRICE_LEG, contractMultiplier: 100 });
    expect(result.level).not.toBe('block');
  });

  test('регистр action: "buy" и "Buy" обрабатываются одинаково', () => {
    const lowerCaseLeg = { ...MKTX_CALL_LEG, action: 'buy' };
    const resultLower = validateFactPL({ value: -5000, option: lowerCaseLeg, contractMultiplier: 100 });
    const resultUpper = validateFactPL({ value: -5000, option: MKTX_CALL_LEG, contractMultiplier: 100 });
    expect(resultLower.level).toBe(resultUpper.level);
    expect(resultLower.level).toBe('block');
  });
});

describe('validateFactPL — предупреждения (warn)', () => {
  test('якорь введён в день входа со значением больше половины стоимости ноги (кейс ZC) → warn', () => {
    // Стоимость ноги ZC ~43.75, половина ~21.9. Якорь +587 введён в день входа.
    const legWithAnchor = { ...ZC_LEG, actualPLDate: ZC_LEG.entryDate };
    const result = validateFactPL({ value: 587, option: legWithAnchor, contractMultiplier: 12.5 });
    expect(result.level).toBe('warn');
  });

  test('корректное значение (не в день входа, разумный размер) → ok', () => {
    const legLater = { ...MKTX_CALL_LEG, actualPLDate: '2026-07-15' };
    const result = validateFactPL({ value: -200, option: legLater, contractMultiplier: 100 });
    expect(result.level).toBe('ok');
  });

  test('якорная цена расходится с ценой входа актива больше чем на 20% → warn', () => {
    const legWithPriceDrift = {
      ...MKTX_CALL_LEG,
      actualPLDate: '2026-07-15', // не день входа — чтобы сработал именно ценовой warn
      actualPLPrice: 150,
      assetPriceAtEntry: 100, // расхождение 50% > 20%
    };
    const result = validateFactPL({ value: -200, option: legWithPriceDrift, contractMultiplier: 100 });
    expect(result.level).toBe('warn');
  });
});

describe('describeAnchorResidual', () => {
  test('форматирует кратность поправки к стоимости ноги (кейс ZC, ~13×)', () => {
    const text = describeAnchorResidual({ actualPL: 587, plAtAnchor: 0, legCost: 43.75 });
    expect(text).toContain('+$587');
    expect(text).toContain('13×');
  });

  test('без legCost выводит только сумму поправки, без кратности', () => {
    const text = describeAnchorResidual({ actualPL: 587, plAtAnchor: 0, legCost: null });
    expect(text).toBe('поправка к модели +$587');
  });

  test('возвращает пустую строку, если plAtAnchor не посчитан', () => {
    expect(describeAnchorResidual({ actualPL: 587, plAtAnchor: null, legCost: 43.75 })).toBe('');
  });
});
