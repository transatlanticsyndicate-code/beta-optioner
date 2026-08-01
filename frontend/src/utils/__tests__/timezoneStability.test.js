/**
 * Тесты стабильности расчёта дат/дней относительно часового пояса МАШИНЫ, на которой
 * выполняется код (браузер пользователя / сервер сборки), — frontend/src/utils/dateUtils.js.
 *
 * КОНТЕКСТ (аудит A5 п.7): заказчик торгует из Панамы (America/Panama, UTC-5, без DST).
 * Старый код в ряде мест ($normalizeDateString$) брал календарную дату ПО UTC из полной
 * ISO-метки (браузерный `new Date().toISOString()`), а затем заворачивал строку в
 * ЛОКАЛЬНУЮ полночь браузера — то есть «какой это день» решалось по UTC, что для
 * пользователя в UTC-5 после ~19:00 локального времени давало дату СЛЕДУЮЩЕГО дня.
 *
 * Способ подмены часового пояса: process.env.TZ + jest.resetModules() + повторный
 * require('../dateUtils') — это выбранный надёжный вариант для CRA/Jest (Node читает
 * process.env.TZ при инициализации Intl/Date для конкретного require, а resetModules
 * гарантирует, что не переиспользуется закэшированный модуль/форматтер с прошлым TZ).
 *
 * Проверяем две зоны, явно упомянутые в задании:
 *  - America/Panama (UTC-5, без перехода на летнее время) — зона заказчика;
 *  - Pacific/Chatham (UTC+12:45) — на ней старый код (getUTC* поверх локально
 *    построенной полуночи) давал сдвиг на день; нестандартное смещение в 45 минут
 *    дополнительно проверяет, что ничего не округляется «случайно правильно».
 */

const TIMEZONES = ['America/Panama', 'Pacific/Chatham', 'UTC', 'America/New_York'];

function loadDateUtilsWithTZ(tz) {
  const originalTZ = process.env.TZ;
  process.env.TZ = tz;
  jest.resetModules();
  // eslint-disable-next-line global-require
  const mod = require('../dateUtils');
  process.env.TZ = originalTZ;
  return mod;
}

describe('Точные ET-функции — результат не зависит от часового пояса машины', () => {
  test.each(TIMEZONES)('getExpirationMomentET одинаков под TZ=%s', (tz) => {
    const { getExpirationMomentET } = loadDateUtilsWithTZ(tz);
    expect(getExpirationMomentET('2026-01-15').toISOString()).toBe('2026-01-15T21:00:00.000Z');
    expect(getExpirationMomentET('2026-07-15').toISOString()).toBe('2026-07-15T20:00:00.000Z');
  });

  test.each(TIMEZONES)('getFractionalDaysUntilExpirationET одинаков под TZ=%s (explicit fromDate)', (tz) => {
    const { getFractionalDaysUntilExpirationET } = loadDateUtilsWithTZ(tz);
    const from = new Date('2026-01-01T15:00:00.000Z');
    const days = getFractionalDaysUntilExpirationET('2026-02-01', from);
    expect(days).toBeCloseTo(31.25, 6);
  });

  test.each(TIMEZONES)('calculateDaysRemainingPreciseET одинаков под TZ=%s (ядро задания — точное ценообразование)', (tz) => {
    const { calculateDaysRemainingPreciseET } = loadDateUtilsWithTZ(tz);
    const option = { date: '2026-01-31', entryDate: '2026-01-01' };
    expect(calculateDaysRemainingPreciseET(option, 0, 30, null)).toBeCloseTo(30.875, 6);
    expect(calculateDaysRemainingPreciseET(option, 10, 30, null)).toBeCloseTo(20.875, 6);
  });

  test.each(TIMEZONES)('getTodayDateStringET зависит только от реального момента (Date.now), не от TZ машины — под фиксированным Date', (tz) => {
    const RealDate = Date;
    // Фиксируем "сейчас" на конкретный момент, одинаковый для всех TZ в этом тесте.
    const fixedNow = new RealDate('2026-01-15T23:30:00.000Z'); // 18:30 EST в NY в этот момент
    global.Date = class extends RealDate {
      constructor(...args) {
        if (args.length === 0) return fixedNow;
        return new RealDate(...args);
      }
      static now() { return fixedNow.getTime(); }
    };

    const { getTodayDateStringET } = loadDateUtilsWithTZ(tz);
    expect(getTodayDateStringET()).toBe('2026-01-15');

    global.Date = RealDate;
  });
});

describe('Фикс дня-сдвига (normalizeDateString, аудит A5 п.7) — стабилен под разными TZ машины', () => {
  // 2026-01-15T02:00:00.000Z = 21:00 EST 14 января (ET-календарный день — 14-е),
  // но UTC-календарный день — 15-е. Старый код брал UTC-день (совпадало бы с "15"
  // независимо от TZ машины, т.к. toISOString() всегда UTC) — но это НЕ совпадает
  // с торговым днём по Нью-Йорку, из-за чего entryDate/actualPLDate/manualIvOverrideDate
  // "прыгали" на день вперёд относительно того, что пользователь считал текущим днём
  // по факту закрытия рынка. Новый код берёт ET-день — и на предыдущий день это должно
  // быть заметно.
  const TIMESTAMP_NEAR_ET_BOUNDARY = '2026-01-15T02:00:00.000Z';

  test.each(TIMEZONES)('normalizeDateString даёт один и тот же (ET) день под TZ=%s', (tz) => {
    const { normalizeDateString } = loadDateUtilsWithTZ(tz);
    expect(normalizeDateString(TIMESTAMP_NEAR_ET_BOUNDARY)).toBe('2026-01-14');
  });

  test.each(TIMEZONES)('чистая YYYY-MM-DD строка не подвержена этому эффекту под TZ=%s (regex-путь, не Date-парсинг)', (tz) => {
    const { normalizeDateString } = loadDateUtilsWithTZ(tz);
    expect(normalizeDateString('2026-01-15')).toBe('2026-01-15');
  });
});

describe('getOldestEntryDate + calculateDaysRemainingPreciseET (многоногая симуляция) — согласованы под разными TZ', () => {
  test.each(TIMEZONES)('обе ноги с общей датой экспирации дают одинаковый остаток на одну и ту же симулируемую дату, независимо от TZ=%s', (tz) => {
    const { getOldestEntryDate, calculateDaysRemainingPreciseET } = loadDateUtilsWithTZ(tz);

    const options = [
      { date: '2026-02-15', entryDate: '2026-01-01' },
      { date: '2026-02-15', entryDate: '2026-01-06' }, // на 5 дней позже
    ];
    const oldestEntry = getOldestEntryDate(options);

    const daysPassed = 10; // симулируем 10 дней от oldestEntry (обе ноги уже активны — entryDiff=5 < 10)
    const remainingLeg1 = calculateDaysRemainingPreciseET(options[0], daysPassed, 30, oldestEntry);
    const remainingLeg2 = calculateDaysRemainingPreciseET(options[1], daysPassed, 30, oldestEntry);

    // Обе ноги истекают в одну и ту же дату — «дней до экспирации» на одну и ту же
    // симулируемую дату (oldestEntry + daysPassed) должно совпадать независимо от того,
    // когда каждая нога вошла в позицию, и независимо от TZ машины.
    expect(remainingLeg2).toBeCloseTo(remainingLeg1, 6);

    // И сам остаток не целый (дробная ET-поправка), одинаков под любым TZ.
    expect(remainingLeg1).toBeCloseTo(35.875, 6); // Фев15 16:00 ET − Янв11 = 35 дней + 21ч (EST)
  });

  test.each(TIMEZONES)('нога, вошедшая позже oldestEntry, ещё "не активна" при daysPassed < entryDiff — здесь только сам расчёт дней (без гарда) под TZ=%s', (tz) => {
    const { getOldestEntryDate, calculateDaysRemainingPreciseET } = loadDateUtilsWithTZ(tz);

    const options = [
      { date: '2026-02-15', entryDate: '2026-01-01' },
      { date: '2026-02-15', entryDate: '2026-01-06' },
    ];
    const oldestEntry = getOldestEntryDate(options);

    // daysPassed=2 < entryDiff(5) для второй ноги ⇒ actualDaysPassed для неё зажимается в 0
    // (Math.max(0, daysPassed - entryDiff)) — то есть функция вернёт «дни как в момент своего
    // входа», а не отрицательное значение. Гард «нога ещё не куплена» — отдельная функция
    // (isOptionActiveAtDay), здесь проверяем только устойчивость арифметики дней к TZ.
    const remainingLeg2 = calculateDaysRemainingPreciseET(options[1], 2, 30, oldestEntry);
    expect(remainingLeg2).toBeCloseTo(40.875, 6); // Фев15 16:00 ET − Янв6 = 40 дней + 21ч (EST)
  });
});
