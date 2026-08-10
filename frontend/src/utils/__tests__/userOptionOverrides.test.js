// Тесты очистки локальных правок Fact P&L / Fact IV после актуализации из файла.
//
// ЗАЧЕМ: если очистка не сработает, пользователь после импорта откроет сделку и
// увидит СТАРЫЕ значения — браузер наложит свои локальные правки поверх свежих
// данных из базы. Внешне это выглядит как «импорт не работает», хотя база уже
// обновлена. Поэтому поведение зафиксировано тестами.

import { clearFactOverrides, OPTIONER_USER_OVERRIDES_KEY } from '../userOptionOverrides';

const write = (data) => localStorage.setItem(OPTIONER_USER_OVERRIDES_KEY, JSON.stringify(data));
const read = () => JSON.parse(localStorage.getItem(OPTIONER_USER_OVERRIDES_KEY) || '{}');

beforeEach(() => {
  localStorage.clear();
});

test('снимает значения фактов по указанным ключам', () => {
  write({
    'AA|65-CALL-2026-10-16': { actualPL: -100, manualIvOverride: 40, quantity: 4 },
  });

  const touched = clearFactOverrides(['AA|65-CALL-2026-10-16']);

  expect(touched).toBe(1);
  expect(read()['AA|65-CALL-2026-10-16']).toEqual({ quantity: 4 });
});

test('не трогает правки других ног', () => {
  write({
    'AA|65-CALL-2026-10-16': { actualPL: -100 },
    'BB|30-PUT-2026-10-16': { actualPL: -50 },
  });

  clearFactOverrides(['AA|65-CALL-2026-10-16']);

  expect(read()['BB|30-PUT-2026-10-16']).toEqual({ actualPL: -50 });
});

test('удаляет запись целиком, если кроме фактов в ней ничего не было', () => {
  write({ 'AA|65-CALL-2026-10-16': { actualPL: -100, actualPLDate: '2026-08-01' } });

  clearFactOverrides(['AA|65-CALL-2026-10-16']);

  expect(read()).toEqual({});
});

test('сохраняет прочие правки: количество и премию', () => {
  write({
    'AA|65-CALL-2026-10-16': {
      actualPL: -100, actualPLQuantity: 4, manualIvOverrideDate: '2026-08-01',
      quantity: 4, customPremium: 1.5, entryDate: '2026-07-01',
    },
  });

  clearFactOverrides(['AA|65-CALL-2026-10-16']);

  expect(read()['AA|65-CALL-2026-10-16']).toEqual({
    quantity: 4, customPremium: 1.5, entryDate: '2026-07-01',
  });
});

test('пустой список и отсутствие хранилища не ломают импорт', () => {
  expect(clearFactOverrides([])).toBe(0);
  expect(clearFactOverrides(undefined)).toBe(0);
  expect(clearFactOverrides(['AA|65-CALL-2026-10-16'])).toBe(0);
});

test('битое хранилище не выбрасывает исключение', () => {
  localStorage.setItem(OPTIONER_USER_OVERRIDES_KEY, 'не json');

  expect(() => clearFactOverrides(['AA|65-CALL-2026-10-16'])).not.toThrow();
});
