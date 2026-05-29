/**
 * Тесты ранжирования стратегии СЕВЕР (scoring.js).
 * Проверяют новый дефолт «фильтры → максимум верха» и mode-aware верхний критерий.
 */

import {
  DEFAULT_WEIGHTS,
  rankCombinationsDefault,
  rankCombinations,
  filterByMargin,
} from '../scoring';

// Хелпер: собрать комбинацию нужной формы.
const combo = (id, { topTotal, topOptions, bottomMetric, bottomPenalty, marginUsed }) => ({
  id,
  criteria: {
    topTotal: topTotal ?? topOptions,
    topOptions: topOptions ?? topTotal,
    bottomMetric: bottomMetric ?? 0,
    bottomPenalty: bottomPenalty ?? Math.abs(bottomMetric ?? 0),
  },
  cost: { marginUsed: marginUsed ?? 6000 },
});

describe('DEFAULT_WEIGHTS — дефолт приоритезирует верх', () => {
  it('вес низа по умолчанию = 0, вес верха = 100', () => {
    expect(DEFAULT_WEIGHTS.bottomZero).toBe(0);
    expect(DEFAULT_WEIGHTS.topMax).toBe(100);
  });
});

describe('rankCombinationsDefault — лексикографический порядок', () => {
  it('AC9: B(top=7000, bottom=+150) ранжируется выше A(top=3000, bottom=0)', () => {
    const A = combo('A', { topTotal: 3000, bottomMetric: 0, bottomPenalty: 0 });
    const B = combo('B', { topTotal: 7000, bottomMetric: 150, bottomPenalty: 0 });
    const ranked = rankCombinationsDefault([A, B], 6000);
    expect(ranked[0].id).toBe('B');
  });

  it('при равном верхе выше тот, у кого меньше штраф по низу', () => {
    const A = combo('A', { topTotal: 5000, bottomPenalty: 50 });
    const B = combo('B', { topTotal: 5000, bottomPenalty: 10 });
    const ranked = rankCombinationsDefault([A, B], 6000);
    expect(ranked[0].id).toBe('B');
  });

  it('при равном верхе и штрафе выше тот, кто ближе к целевой марже', () => {
    const A = combo('A', { topTotal: 5000, bottomPenalty: 0, marginUsed: 6400 });
    const B = combo('B', { topTotal: 5000, bottomPenalty: 0, marginUsed: 5900 });
    const ranked = rankCombinationsDefault([A, B], 6000);
    expect(ranked[0].id).toBe('B');
  });

  it('mode-aware: ранжирует по topTotal (акция+опционы), а не по topOptions', () => {
    // A выгоднее по опционам, но B выгоднее суммарно — должен победить B.
    const A = combo('A', { topTotal: 3000, topOptions: 9000, bottomPenalty: 0 });
    const B = combo('B', { topTotal: 7000, topOptions: 1000, bottomPenalty: 0 });
    const ranked = rankCombinationsDefault([A, B], 6000);
    expect(ranked[0].id).toBe('B');
  });
});

describe('rankCombinations — взвешенный override', () => {
  it('при весе верха 100/низа 0 ранжирует по верху (topTotal)', () => {
    const A = combo('A', { topTotal: 3000, bottomMetric: 0 });
    const B = combo('B', { topTotal: 7000, bottomMetric: 150 });
    const ranked = rankCombinations([A, B], { bottomZero: 0, topMax: 100 });
    expect(ranked[0].id).toBe('B');
  });

  it('при высоком весе низа приоритет уходит к близкому к 0 низу', () => {
    const A = combo('A', { topTotal: 3000, bottomMetric: 0, bottomPenalty: 0 });
    const B = combo('B', { topTotal: 7000, bottomMetric: 150, bottomPenalty: 150 });
    const ranked = rankCombinations([A, B], { bottomZero: 100, topMax: 0 });
    expect(ranked[0].id).toBe('A');
  });
});

describe('filterByMargin — коридор база ± допуск', () => {
  it('оставляет только комбинации внутри [база−допуск; база+допуск]', () => {
    const list = [
      combo('lo', { topTotal: 1, marginUsed: 5400 }), // вне
      combo('a', { topTotal: 1, marginUsed: 5500 }), // граница
      combo('b', { topTotal: 1, marginUsed: 6000 }),
      combo('c', { topTotal: 1, marginUsed: 6500 }), // граница
      combo('hi', { topTotal: 1, marginUsed: 6600 }), // вне
    ];
    const out = filterByMargin(list, 6000, 500);
    const ids = out.map((c) => c.id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });
});
