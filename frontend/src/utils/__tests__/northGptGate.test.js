/**
 * Тесты шлюза по допуску P&L на низу (стратегия «Север GPT»).
 *
 * ЗАЧЕМ: шлюз решает, показать комбинацию или заменить её на «нет подходящей
 * комбинации». Ошибка здесь либо прячет годные варианты, либо — что хуже —
 * выдаёт сбой расчёта за идеальный ноль.
 */

import { gateByBottomTolerance, gateByMargin, filterChainByMode } from '../northGptStrategy/enrich';

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
    // Режим «без Put»: допуск не заполняется (null) — чистый Call с крупным
    // убытком по низу должен показываться, а не отсекаться.
    expect(gateByBottomTolerance(c, null)).toBe(c);
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

describe('filterChainByMode', () => {
  const chain = [
    { type: 'CALL', strike: 100 },
    { type: 'PUT', strike: 90 },
    { type: 'call', strike: 105 },
  ];

  it('в режиме «без Put» оставляет только Call (регистр не важен)', () => {
    const res = filterChainByMode(chain, true);
    expect(res).toHaveLength(2);
    expect(res.every((r) => r.type.toUpperCase() === 'CALL')).toBe(true);
  });

  it('в обычном режиме возвращает цепочку без изменений', () => {
    expect(filterChainByMode(chain, false)).toBe(chain);
  });

  it('не падает на пустых данных', () => {
    expect(filterChainByMode(null, true)).toBeNull();
    expect(filterChainByMode([], true)).toEqual([]);
  });
});

describe('gateByMargin', () => {
  const marginCombo = (marginUsed) => ({
    kind: 'optionsOnly',
    positions: [{ type: 'CALL', strike: 100, quantity: 1 }],
    rationale: 'пояснение ИИ',
    cost: { marginUsed },
  });

  it('пропускает сделку в пределах бюджета с допуском', () => {
    const c = marginCombo(10400);
    expect(gateByMargin(c, 10000, 500)).toBe(c);
  });

  it('пропускает ровно на границе допуска', () => {
    const c = marginCombo(10500);
    expect(gateByMargin(c, 10000, 500)).toBe(c);
  });

  it('отсекает сделку дороже бюджета', () => {
    const res = gateByMargin(marginCombo(11522), 10000, 500);
    expect(res.error).toMatch(/дороже заданного маржина/);
    // Разделитель разрядов — неразрывный пробел (ru-RU), поэтому \s.
    expect(res.error).toMatch(/11\s522/);
    expect(res.rationale).toBe('пояснение ИИ');
    expect(res.positions).toBeUndefined();
  });

  it('недобор по бюджету не считается ошибкой', () => {
    const c = marginCombo(4000);
    expect(gateByMargin(c, 10000, 500)).toBe(c);
  });

  it('не фильтрует, если маржин не задан', () => {
    const c = marginCombo(999999);
    expect(gateByMargin(c, 0, 500)).toBe(c);
    expect(gateByMargin(c, undefined, undefined)).toBe(c);
  });

  it('отсекает комбинацию с нечисловым маржином', () => {
    const res = gateByMargin(marginCombo(NaN), 10000, 500);
    expect(res.error).toMatch(/Не удалось посчитать маржин/);
  });

  it('не трогает блок с ошибкой и пустые данные', () => {
    const err = { error: 'ChatGPT не собрал комбинацию' };
    expect(gateByMargin(err, 10000, 500)).toBe(err);
    expect(gateByMargin(null, 10000, 500)).toBeNull();
  });
});
