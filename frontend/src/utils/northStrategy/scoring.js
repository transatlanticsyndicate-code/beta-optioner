/**
 * Стратегия СЕВЕР — ранжирование комбинаций по 4 критериям с регулируемыми весами.
 * ЗАЧЕМ: Композитный score позволяет пользователю на лету пересортировать топ-варианты
 * без перезапуска самого расчёта.
 *
 * Идея:
 *  - Критерии 1 и 2 — "защитные", идеал = 0 (минимизация |PL|).
 *  - Критерии 3A и 3B — "бонусные", идеал = +∞ (максимизация PL).
 *  - Каждый критерий нормируется в [0..1] по min/max среди всех комбинаций
 *    (0 — лучший вариант, 1 — худший), затем взвешенно суммируется.
 *  - Меньший итоговый score = лучше.
 */

export const DEFAULT_WEIGHTS = Object.freeze({
  bottomZero: 35,
  topZero: 35,
  midAMax: 15,
  midBMax: 15,
});

/**
 * Нормировка веса в [0..1] так, чтобы сумма была 1. Если все нули — равные веса.
 */
const normalizeWeights = (weights) => {
  const w = {
    bottomZero: Math.max(0, Number(weights.bottomZero) || 0),
    topZero: Math.max(0, Number(weights.topZero) || 0),
    midAMax: Math.max(0, Number(weights.midAMax) || 0),
    midBMax: Math.max(0, Number(weights.midBMax) || 0),
  };
  const sum = w.bottomZero + w.topZero + w.midAMax + w.midBMax;
  if (sum <= 0) return { bottomZero: 0.25, topZero: 0.25, midAMax: 0.25, midBMax: 0.25 };
  return {
    bottomZero: w.bottomZero / sum,
    topZero: w.topZero / sum,
    midAMax: w.midAMax / sum,
    midBMax: w.midBMax / sum,
  };
};

/**
 * Нормировка одной метрики в [0..1] по min/max среди комбинаций.
 * Возвращает 0 если max == min (все одинаковые) — нейтрально.
 */
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
 * Ранжирование набора комбинаций.
 * Возвращает копию массива с добавленным полем `score` и нормализованными частями,
 * отсортированную по возрастанию score (лучшие — впереди).
 */
export const rankCombinations = (combinations, weightsInput = DEFAULT_WEIGHTS) => {
  if (!Array.isArray(combinations) || combinations.length === 0) return [];

  const weights = normalizeWeights(weightsInput);

  // Метрики "чем меньше тем лучше":
  //  - bottomTotal:  |PL|  (идеал 0)
  //  - topOptions:   |PL|  (идеал 0)
  //  - midATotal:   -PL    (идеал +∞)
  //  - midBTotal:   -PL    (идеал +∞)
  const bottomVals = combinations.map((c) => Math.abs(c.criteria.bottomTotal));
  const topVals = combinations.map((c) => Math.abs(c.criteria.topOptions));
  const midAVals = combinations.map((c) => -c.criteria.midATotal);
  const midBVals = combinations.map((c) => -c.criteria.midBTotal);

  const bottomNorm = normalizeMetric(bottomVals);
  const topNorm = normalizeMetric(topVals);
  const midANorm = normalizeMetric(midAVals);
  const midBNorm = normalizeMetric(midBVals);

  const ranked = combinations.map((c, i) => {
    const score =
      weights.bottomZero * bottomNorm[i] +
      weights.topZero * topNorm[i] +
      weights.midAMax * midANorm[i] +
      weights.midBMax * midBNorm[i];
    return { ...c, score, normalized: {
      bottomZero: bottomNorm[i],
      topZero: topNorm[i],
      midAMax: midANorm[i],
      midBMax: midBNorm[i],
    } };
  });

  ranked.sort((a, b) => a.score - b.score);
  return ranked;
};
