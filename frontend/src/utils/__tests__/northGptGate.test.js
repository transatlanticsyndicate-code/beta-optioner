/**
 * Тесты шлюза по допуску P&L на низу (стратегия «Север GPT»).
 *
 * ЗАЧЕМ: шлюз решает, показать комбинацию или заменить её на «нет подходящей
 * комбинации». Ошибка здесь либо прячет годные варианты, либо — что хуже —
 * выдаёт сбой расчёта за идеальный ноль.
 */

import { gateByBottomTolerance } from '../northGptStrategy/enrich';

const combo = (bottomMetric, extra = {}) => ({
  kind: 'optionsOnly',
  positions: [{ type: 'CALL', strike: 100, quantity: 1 }],
  rationale: 'пояснение ИИ',
  criteria: { bottomMetric },
  ...extra,
});

describe('gateByBottomTolerance', () => {
  it('пропускает комбинацию внутри допуска', () => {
    const c = combo(-150);
    expect(gateByBottomTolerance(c, 200)).toBe(c);
  });

  it('пропускает ровно на границе допуска', () => {
    const c = combo(-200);
    expect(gateByBottomTolerance(c, 200)).toBe(c);
  });

  it('отсекает комбинацию за пределами допуска', () => {
    const res = gateByBottomTolerance(combo(-1550), 100);
    expect(res.error).toMatch(/выходит за допуск/);
    // Пояснение ИИ должно сохраниться — пользователь видит причину.
    expect(res.rationale).toBe('пояснение ИИ');
    expect(res.positions).toBeUndefined();
  });

  it('не фильтрует, если допуск не задан или неположителен', () => {
    const c = combo(-99999);
    expect(gateByBottomTolerance(c, 0)).toBe(c);
    expect(gateByBottomTolerance(c, undefined)).toBe(c);
    expect(gateByBottomTolerance(c, NaN)).toBe(c);
  });

  it('не трогает блок с ошибкой и блок без позиций', () => {
    const err = { error: 'ChatGPT не собрал комбинацию' };
    expect(gateByBottomTolerance(err, 200)).toBe(err);
    const noPos = { kind: 'optionsOnly', criteria: { bottomMetric: -5000 } };
    expect(gateByBottomTolerance(noPos, 200)).toBe(noPos);
    expect(gateByBottomTolerance(null, 200)).toBeNull();
  });

  it('НЕ выдаёт сбой расчёта за идеальный ноль', () => {
    // При сбое ценообразования P&L обнуляются; без флага |0| <= допуска
    // означало бы «идеальная комбинация» — это и есть ловушка.
    const res = gateByBottomTolerance(combo(0, { plComputeFailed: true }), 200);
    expect(res.error).toMatch(/Не удалось рассчитать P&L/);
    expect(res.rationale).toBe('пояснение ИИ');
  });

  it('отсекает комбинацию с нечисловым P&L по низу', () => {
    const res = gateByBottomTolerance(combo(NaN), 200);
    expect(res.error).toMatch(/Не удалось рассчитать P&L/);
  });
});
