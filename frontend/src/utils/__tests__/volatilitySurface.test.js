/**
 * Тесты getProjectedIV (volatilitySurface.js).
 * Закрепляют плоский fallback (IV = базовой) после удаления эвристики роста IV
 * при приближении к экспирации — см. tasks/fix-iv-projection-flat-fallback/diagnose.md.
 */

import { getProjectedIV } from '../volatilitySurface';

describe('getProjectedIV — fallback без ouParams (плоская IV)', () => {
  it('без калибровки IV остаётся равной базовой, а не растёт к экспирации', () => {
    // Кейс из диагноза: ADBE, IV входа 49%, 71 → 27 дней до экспирации.
    // Старая эвристика роста давала ~58.9%, ожидаем плоскую IV = 49.
    const option = { impliedVolatility: 0.49 };
    const result = getProjectedIV(option, 71, 27, null, null, null);
    expect(result).toBeCloseTo(49, 5);
  });

  it('manualIvOverride тоже держится плоско, без подрастания к экспирации', () => {
    const option = { impliedVolatility: 0.49 };
    const result = getProjectedIV(option, 71, 27, null, null, 49.43);
    expect(result).toBeCloseTo(49.43, 5);
  });

  it('краевой случай: симулируемая дата не раньше текущей — базовая IV без изменений', () => {
    const option = { impliedVolatility: 0.4 };
    // simulatedDaysToExpiration >= currentDaysToExpiration — проецировать некуда
    const result = getProjectedIV(option, 30, 30, null, null, null);
    expect(result).toBeCloseTo(40, 5);
  });
});

describe('getProjectedIV — путь OU-модели (не должен быть затронут фиксом)', () => {
  it('с ouParams результат отклоняется от базовой IV в сторону iv_mean', () => {
    // baseIV 49% выше iv_mean 35% — OU должна тянуть прогноз вниз, к среднему,
    // а не оставлять его равным базовой или уводить выше.
    const option = { impliedVolatility: 0.49 };
    const ouParams = { iv_mean: 0.35, iv_kappa: 10 };
    const result = getProjectedIV(option, 71, 27, null, ouParams, null);

    // Не плоская (OU-путь отличается от fallback-пути) и не равна базовой.
    expect(result).not.toBeCloseTo(49, 1);
    // Двигается в сторону среднего 35%, но не обязана его достигать — проверяем диапазон.
    expect(result).toBeGreaterThan(35);
    expect(result).toBeLessThan(49);
  });
});
