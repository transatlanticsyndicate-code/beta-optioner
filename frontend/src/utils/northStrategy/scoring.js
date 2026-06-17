/**
 * ⚠️ УСТАРЕЛО (DEPRECATED) — классический математический «Север» отключён и НЕ
 * используется (заменён на «Север GPT»). Код не удалён. Не «чинить», не развивать
 * и не возвращать без явной просьбы.
 *
 * Стратегия СЕВЕР — ранжирование комбинаций + страховочный фильтр по марже.
 *
 * ЗАЧЕМ:
 *  - По умолчанию ранжируем лексикографически (rankCombinationsDefault):
 *    фильтры уже применены → максимум верха → меньше штраф по низу → ближе к марже.
 *  - Ползунки весов (rankCombinations) оставлены как ручной override: подняв вес
 *    низа, пользователь включает взвешенную нормированную пересортировку без
 *    перерасчёта анализа.
 *  - filterByMargin — страховка: варианты уже в коридоре база ± допуск (это гарантирует
 *    анализатор), фильтр лишь дублирует условие на UI-слое.
 *
 * Верхний критерий зависит от режима: withStock — total (акция + опционы),
 * optionsOnly — P&L опционов (оба приходят в criteria.topTotal).
 */

// По умолчанию: после жёстких фильтров приоритет — максимум прибыли наверху.
// Низ уже ограничен фильтром, поэтому в дефолте вес низа = 0 (он работает как
// вторичный tie-breaker через rankCombinationsDefault). Пользователь может поднять
// вес низа ползунком — тогда включается взвешенный режим rankCombinations.
export const DEFAULT_WEIGHTS = Object.freeze({
  bottomZero: 0,
  topMax: 100,
});

// Верхний критерий, зависящий от режима: для withStock — total (акция + опционы),
// для optionsOnly — P&L опционов. topTotal проставляется анализатором для обоих режимов.
const topCriterion = (c) => (
  Number.isFinite(c?.criteria?.topTotal) ? c.criteria.topTotal : c?.criteria?.topOptions
);

const bottomPenalty = (c) => (
  Number.isFinite(c?.criteria?.bottomPenalty)
    ? c.criteria.bottomPenalty
    : Math.abs(c?.criteria?.bottomMetric ?? 0)
);

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
 * Страховочный фильтр комбинаций по марже: оставляет только те, чья marginUsed
 * попадает в [center − tol, center + tol]. Центр = база маржи. Анализатор уже
 * гарантирует этот коридор, фильтр лишь дублирует условие на UI-слое.
 *
 * @param {Array} combinations
 * @param {number} marginCenter    Центр коридора (база маржи)
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

  const bottomVals = combinations.map((c) => bottomPenalty(c));
  const topVals = combinations.map((c) => -topCriterion(c));

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

/**
 * Ранжирование по умолчанию (по ТЗ): сначала жёсткие фильтры уже применены,
 * далее лексикографический порядок:
 *   1) максимум верхнего критерия (mode-aware: total для withStock, опционы для optionsOnly);
 *   2) минимум штрафа по низу (близость к 0 / отсутствие убытка);
 *   3) минимум |marginUsed − marginBase| (ближе к целевой марже).
 *
 * @param {Array} combinations
 * @param {number} marginBase  целевая маржа (для tie-breaker по близости)
 * @returns {Array} копия, отсортированная по убыванию качества (лучшие — первыми)
 */
export const rankCombinationsDefault = (combinations, marginBase) => {
  if (!Array.isArray(combinations) || combinations.length === 0) return [];
  const base = Number.isFinite(marginBase) ? marginBase : 0;
  return combinations
    .map((c) => ({ ...c }))
    .sort((a, b) => {
      const topDiff = topCriterion(b) - topCriterion(a);
      if (Math.abs(topDiff) > 1e-9) return topDiff;
      const penDiff = bottomPenalty(a) - bottomPenalty(b);
      if (Math.abs(penDiff) > 1e-9) return penDiff;
      const aMargin = Math.abs((a?.cost?.marginUsed ?? 0) - base);
      const bMargin = Math.abs((b?.cost?.marginUsed ?? 0) - base);
      return aMargin - bMargin;
    });
};
