/**
 * Тесты точного (ET) расчёта момента экспирации — frontend/src/utils/dateUtils.js.
 *
 * КОНТЕКСТ (аудит A1 п.3): американские опционы истекают в 16:00 по времени Нью-Йорка
 * (America/New_York) в день экспирации, а не в полночь UTC. Старый расчёт «целые
 * календарные дни до полуночи UTC» давал систематическую ошибку около половины дня
 * жизни опциона. Эти тесты проверяют новые функции getExpirationMomentET /
 * getFractionalDaysUntilExpirationET / calculateDaysRemainingPreciseET /
 * calculateDaysToExpirationFromTodayPreciseET — НЕ трогают старые целочисленные
 * функции (calculateDaysRemainingUTC и т.д.), у них семантика не менялась.
 */

import {
  getExpirationMomentET,
  getFractionalDaysUntilExpirationET,
  calculateDaysRemainingPreciseET,
  calculateDaysToExpirationFromTodayPreciseET,
  calculateDaysRemainingUTC,
} from '../dateUtils';

describe('getExpirationMomentET — DST-aware момент закрытия рынка (16:00 ET)', () => {
  test('зима (EST, UTC-5): 16:00 ET = 21:00 UTC', () => {
    // 15 января 2026 — вне периода DST (переход в 2026 году: 8 марта — 1 ноября).
    const moment = getExpirationMomentET('2026-01-15');
    expect(moment.toISOString()).toBe('2026-01-15T21:00:00.000Z');
  });

  test('лето (EDT, UTC-4): 16:00 ET = 20:00 UTC', () => {
    // 15 июля 2026 — внутри периода DST.
    const moment = getExpirationMomentET('2026-07-15');
    expect(moment.toISOString()).toBe('2026-07-15T20:00:00.000Z');
  });

  test('день перехода на летнее время (8 марта 2026, 2:00 ночи по NY) — 16:00 ET в этот день уже EDT (UTC-4)', () => {
    const moment = getExpirationMomentET('2026-03-08');
    expect(moment.toISOString()).toBe('2026-03-08T20:00:00.000Z');
  });

  test('день перехода на зимнее время (1 ноября 2026, 2:00 ночи по NY) — 16:00 ET в этот день уже EST (UTC-5)', () => {
    const moment = getExpirationMomentET('2026-11-01');
    expect(moment.toISOString()).toBe('2026-11-01T21:00:00.000Z');
  });

  test('невалидная дата → null', () => {
    expect(getExpirationMomentET('not-a-date-xyz')).toBeNull();
    expect(getExpirationMomentET(null)).toBeNull();
  });

  test('принимает разные форматы даты через normalizeDateString (напр. DD.MM.YYYY)', () => {
    const fromDotted = getExpirationMomentET('15.01.2026');
    const fromIso = getExpirationMomentET('2026-01-15');
    expect(fromDotted.toISOString()).toBe(fromIso.toISOString());
  });
});

describe('getFractionalDaysUntilExpirationET — дробные дни до экспирации', () => {
  test('в день экспирации ДО 16:00 ET — положительное значение', () => {
    // 15:59 ET (EST, UTC-5) 15 января 2026 = 20:59 UTC.
    const beforeClose = new Date('2026-01-15T20:59:00.000Z');
    const days = getFractionalDaysUntilExpirationET('2026-01-15', beforeClose);
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThan(1 / 24); // меньше часа до закрытия
  });

  test('в день экспирации ПОСЛЕ 16:00 ET — ноль или отрицательное значение', () => {
    // 16:01 ET (EST) 15 января 2026 = 21:01 UTC.
    const afterClose = new Date('2026-01-15T21:01:00.000Z');
    const days = getFractionalDaysUntilExpirationET('2026-01-15', afterClose);
    expect(days).toBeLessThan(0);
  });

  test('ровно в момент закрытия — ноль', () => {
    const atClose = new Date('2026-01-15T21:00:00.000Z');
    const days = getFractionalDaysUntilExpirationET('2026-01-15', atClose);
    expect(days).toBeCloseTo(0, 10);
  });

  test('результат дробный (не целое число дней) для несовпадающего времени суток', () => {
    // От 15:00 UTC 1 января до 21:00 UTC 1 февраля (EST) — 31 день и 6 часов.
    const from = new Date('2026-01-01T15:00:00.000Z');
    const days = getFractionalDaysUntilExpirationET('2026-02-01', from);
    expect(days).toBeCloseTo(31.25, 6);
    expect(Number.isInteger(days)).toBe(false);
  });

  test('летнее время (EDT): та же логика до/после 16:00 ET', () => {
    const before = new Date('2026-07-15T19:59:00.000Z'); // 15:59 EDT
    const after = new Date('2026-07-15T20:01:00.000Z');   // 16:01 EDT
    expect(getFractionalDaysUntilExpirationET('2026-07-15', before)).toBeGreaterThan(0);
    expect(getFractionalDaysUntilExpirationET('2026-07-15', after)).toBeLessThan(0);
  });
});

describe('calculateDaysRemainingPreciseET — дробная поправка ~0.8-0.9 дня относительно старой UTC-функции', () => {
  test('зима (EST): точная функция даёт на 0.875 дня больше, чем целочисленная UTC-версия', () => {
    const option = { date: '2026-01-31', entryDate: '2026-01-01' };
    const utcDays = calculateDaysRemainingUTC(option, 0, 30, null);
    const preciseDays = calculateDaysRemainingPreciseET(option, 0, 30, null);

    expect(utcDays).toBe(30); // 30 календарных дней ровно (обе даты — полночь UTC)
    // 16:00 ET (EST) = 21:00 UTC того же дня экспирации ⇒ +21ч = +0.875 дня сверху.
    expect(preciseDays).toBeCloseTo(30.875, 6);
    expect(preciseDays - utcDays).toBeCloseTo(0.875, 6);
  });

  test('лето (EDT): точная функция даёт на 0.8333 дня больше, чем целочисленная UTC-версия', () => {
    const option = { date: '2026-07-31', entryDate: '2026-07-01' };
    const utcDays = calculateDaysRemainingUTC(option, 0, 30, null);
    const preciseDays = calculateDaysRemainingPreciseET(option, 0, 30, null);

    expect(utcDays).toBe(30);
    // 16:00 ET (EDT) = 20:00 UTC ⇒ +20ч = +0.8333 дня.
    expect(preciseDays).toBeCloseTo(30 + 20 / 24, 6);
  });

  test('дробность сохраняется при движении слайдера daysPassed (симуляция)', () => {
    const option = { date: '2026-01-31', entryDate: '2026-01-01' };
    const day10 = calculateDaysRemainingPreciseET(option, 10, 30, null);
    expect(day10).toBeCloseTo(20.875, 6);
    expect(Number.isInteger(day10)).toBe(false);
  });

  test('на дату экспирации после закрытия рынка результат — 0 (гард не уходит в отрицательные дробные значения из-за Math.max)', () => {
    const option = { date: '2026-01-31', entryDate: '2026-01-01' };
    // daysPassed = 31 — на день позже даже точного (дробного) момента экспирации.
    const days = calculateDaysRemainingPreciseET(option, 31, 30, null);
    expect(days).toBe(0);
  });

  test('без даты опциона — фолбэк как у целочисленной версии (defaultDays - daysPassed)', () => {
    expect(calculateDaysRemainingPreciseET({}, 5, 30, null)).toBe(25);
  });

  test('зафиксированная позиция (isLockedPosition) — initialDaysToExpiration берётся как есть, без пересчёта', () => {
    const option = {
      date: '2026-01-31',
      isLockedPosition: true,
      initialDaysToExpiration: 12,
    };
    expect(calculateDaysRemainingPreciseET(option, 0, 30, null)).toBe(12);
    expect(calculateDaysRemainingPreciseET(option, 5, 30, null)).toBe(7);
  });
});

describe('calculateDaysToExpirationFromTodayPreciseET — дробная версия calculateDaysToExpirationFromToday', () => {
  test('до 16:00 ET в день экспирации — положительное дробное значение', () => {
    const option = { date: '2026-01-15' };
    const before = new Date('2026-01-15T20:00:00.000Z'); // 15:00 EST
    const days = calculateDaysToExpirationFromTodayPreciseET(option, before);
    expect(days).toBeGreaterThan(0);
    expect(days).toBeCloseTo(1 / 24, 6);
  });

  test('после 16:00 ET в день экспирации — 0 (clamp, не уходит в минус)', () => {
    const option = { date: '2026-01-15' };
    const after = new Date('2026-01-15T22:00:00.000Z'); // 17:00 EST
    expect(calculateDaysToExpirationFromTodayPreciseET(option, after)).toBe(0);
  });

  test('без даты — фолбэк 30, как у целочисленной версии', () => {
    expect(calculateDaysToExpirationFromTodayPreciseET({}, new Date())).toBe(30);
  });

  test('результат дробный для типичного случая (не выравнивается на целые сутки)', () => {
    const option = { date: '2026-03-01' };
    const from = new Date('2026-01-30T15:00:00.000Z');
    const days = calculateDaysToExpirationFromTodayPreciseET(option, from);
    expect(Number.isInteger(days)).toBe(false);
  });
});
