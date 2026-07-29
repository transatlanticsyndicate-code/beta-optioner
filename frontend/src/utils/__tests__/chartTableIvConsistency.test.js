/**
 * Тест консистентности волатильности между графиком (PLChart.jsx) и таблицей (OptionsTableV3.jsx).
 *
 * Проблема (задача 2B-1): PLChart.jsx вызывал getOptionVolatility() с 5 аргументами
 * (без manualIvOverride и todayDaysToExpiration), а таблица — с полными 8. В результате
 * ручная волатильность (Fact IV), введённая заказчиком из терминала брокера, учитывалась
 * в таблице, но игнорировалась графиком и метриками — два угла экрана показывали разные числа.
 *
 * Тест закрепляет: при одинаковых входных данных полный (8-аргументный) вызов, которым теперь
 * пользуются все три места в PLChart.jsx, даёт то же значение волатильности, что и вызов в
 * таблице, и это значение действительно равно ручной Fact IV (а не игнорирует её, как раньше).
 * Также проверяется обратный случай: без manualIvOverride оба вызова (короткий и полный)
 * дают одинаковый результат — расширенные аргументы не должны ничего ломать, когда Fact IV не задана.
 */

import { getOptionVolatility } from '../volatilitySurface';
import { calculateDaysRemainingUTC, calculateDaysToExpirationFromToday, getOldestEntryDate } from '../dateUtils';

// Хелпер: 'YYYY-MM-DD' от сегодняшней даты + N дней (UTC-независимый формат для option.date/entryDate)
function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

describe('Консистентность IV между графиком и таблицей (getOptionVolatility)', () => {
  it('с manualIvOverride: полный вызов (как в графике и в таблице) возвращает ручную Fact IV, а не API IV', () => {
    const today = dateOffset(0);

    const option = {
      id: 'test-leg-1',
      date: dateOffset(60),      // экспирация через 60 дней
      entryDate: dateOffset(-5), // вошли 5 дней назад
      impliedVolatility: 0.20,   // IV из API — 20%, заведомо отличается от ручной Fact IV
      manualIvOverride: 45,      // ручная Fact IV из терминала брокера — 45%
      manualIvOverrideDate: today, // введена сегодня — в день ввода IV должна точно равняться manualIvOverride
    };

    const oldestEntryDate = getOldestEntryDate([option]);
    const daysPassed = 0;

    const currentDaysToExpiration = calculateDaysRemainingUTC(option, 0, 30, oldestEntryDate);
    const optionDaysRemaining = calculateDaysRemainingUTC(option, daysPassed, 30, oldestEntryDate);
    const todaySimDaysForOpt = calculateDaysToExpirationFromToday(option);

    // Путь графика (PLChart.jsx после фикса) — 8 аргументов
    const chartIV = getOptionVolatility(
      option,
      currentDaysToExpiration,
      optionDaysRemaining,
      null,
      'simple',
      null,
      option.manualIvOverride,
      todaySimDaysForOpt
    );

    // Путь таблицы (OptionsTableV3.jsx) — та же сигнатура и те же входные данные
    const tableIV = getOptionVolatility(
      option,
      currentDaysToExpiration,
      optionDaysRemaining,
      null,
      'simple',
      null,
      option.manualIvOverride,
      todaySimDaysForOpt
    );

    // График и таблица должны видеть одну и ту же волатильность
    expect(chartIV).toBeCloseTo(tableIV, 6);
    // И это должна быть именно ручная Fact IV (45), а не IV из API (20)
    expect(chartIV).toBeCloseTo(45, 5);

    // Контроль регрессии: старый (неполный) вызов графика без manualIvOverride/todayDaysToExpiration
    // игнорировал ручную Fact IV и возвращал IV из API — именно эту рассинхронизацию устраняет фикс.
    const buggyChartIV = getOptionVolatility(
      option,
      currentDaysToExpiration,
      optionDaysRemaining,
      null,
      'simple'
    );
    expect(buggyChartIV).not.toBeCloseTo(45, 1);
    expect(buggyChartIV).toBeCloseTo(20, 5);
  });

  it('без manualIvOverride: короткий и полный вызовы дают одинаковый результат', () => {
    const option = {
      id: 'test-leg-2',
      date: dateOffset(60),
      entryDate: dateOffset(-5),
      impliedVolatility: 0.30, // только API IV, ручной поправки нет
    };

    const oldestEntryDate = getOldestEntryDate([option]);
    const daysPassed = 15;

    const currentDaysToExpiration = calculateDaysRemainingUTC(option, 0, 30, oldestEntryDate);
    const optionDaysRemaining = calculateDaysRemainingUTC(option, daysPassed, 30, oldestEntryDate);
    const todaySimDaysForOpt = calculateDaysToExpirationFromToday(option);

    // Старая (5-аргументная) форма вызова
    const shortFormIV = getOptionVolatility(
      option,
      currentDaysToExpiration,
      optionDaysRemaining,
      null,
      'simple'
    );

    // Новая (8-аргументная) форма вызова, но без ручной Fact IV
    const fullFormIV = getOptionVolatility(
      option,
      currentDaysToExpiration,
      optionDaysRemaining,
      null,
      'simple',
      null,
      option.manualIvOverride, // undefined
      todaySimDaysForOpt
    );

    expect(fullFormIV).toBeCloseTo(shortFormIV, 6);
  });
});
