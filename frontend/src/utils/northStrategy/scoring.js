/**
 * Стратегия СЕВЕР v2 — ранжирование комбинаций по 2 критериям + фильтр по марже.
 *
 * ЗАЧЕМ:
 *  - 2 веса (низ → 0, верх → max) позволяют пользователю на лету пересортировать
 *    варианты без перерасчёта анализа.
 *  - Бегунок маржина даёт фильтр поверх кэша: показываем только комбинации,
 *    стоимость которых попадает в [marginCenter − tol, marginCenter + tol].
 *
 * Идея ранжирования:
 *  - Критерий «низ»: |bottomMetric| (идеал 0 — близость к 0).
 *  - Критерий «верх»: −topOptions (идеал +∞ — максимизация P&L).
 *  - Оба критерия нормируются в [0..1] по min/max среди отобранных комбинаций.
 *  - Композитный score = w_низ × норм(низ) + w_верх × норм(верх).
 *  - Меньший score = лучше.
 */

export const DEFAULT_WEIGHTS = Object.freeze({
  bottomZero: 50,
  topMax: 50,
});

const normalizeWeights = (weights) => {
  const w = {
    bottomZero: Math.max(0, Number(weights?.bottomZero) || 0),
    topMax: Math.max(0, Number(weights?.topMax) || 0),
  };
  const sum = w.bottomZero + w.topMax;
  if (sum <= 0) return { bottomZero: 0.5, topMax: 0.5 };
  return {
    bottomZero: w.bottomZero / sum,
    topMax: w.topMax / sum,
  };
};

const normalizeMetric = (values) => {
  if (values.length === 0) return [];
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range <= 0) return values.map(() => 0);
  return values.map((v) => (v - min) / range);
};

/**
 * Фильтр комбинаций по маржину сделки (бегунок маржина на экране результатов).
 *
 * @param {Array} combinations
 * @param {number} marginCenter   Центр диапазона (положение бегунка)
 * @param {number} marginTolerance Допуск ±X (по умолчанию 500)
 * @returns {Array} отфильтрованные комбинации
 */
export const filterByMargin = (combinations, marginCenter, marginTolerance) => {
  if (!Array.isArray(combinations) || combinations.length === 0) return [];
  if (!Number.isFinite(marginCenter) || !Number.isFinite(marginTolerance)) return combinations;
  const lo = marginCenter - marginTolerance;
  const hi = marginCenter + marginTolerance;
  return combinations.filter((c) => {
    const m = c?.cost?.marginUsed;
    return Number.isFinite(m) && m >= lo && m <= hi;
  });
};

/**
 * Ранжирование комбинаций композитным score'ом.
 * Сортирует по возрастанию (лучшие — первыми).
 *
 * @param {Array} combinations
 * @param {{bottomZero:number, topMax:number}} weightsInput
 * @returns {Array} копия с полями score и normalized
 */
export const rankCombinations = (combinations, weightsInput = DEFAULT_WEIGHTS) => {
  if (!Array.isArray(combinations) || combinations.length === 0) return [];

  const weights = normalizeWeights(weightsInput);

  const bottomVals = combinations.map((c) => Math.abs(c.criteria.bottomMetric));
  const topVals = combinations.map((c) => -c.criteria.topOptions);

  const bottomNorm = normalizeMetric(bottomVals);
  const topNorm = normalizeMetric(topVals);

  const ranked = combinations.map((c, i) => ({
    ...c,
    score: weights.bottomZero * bottomNorm[i] + weights.topMax * topNorm[i],
    normalized: {
      bottomZero: bottomNorm[i],
      topMax: topNorm[i],
    },
  }));

  ranked.sort((a, b) => a.score - b.score);
  return ranked;
};
