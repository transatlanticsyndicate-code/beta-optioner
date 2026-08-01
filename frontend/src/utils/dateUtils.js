/**
 * Утилиты для работы с датами в опционном калькуляторе
 * ЗАЧЕМ: Обеспечивает единообразный расчёт дат по UTC для всех пользователей
 * Затрагивает: PLChart, usePositionExitCalculator, metricsCalculator
 *
 * ВАЖНО: Все расчёты дней до экспирации должны использовать UTC,
 * чтобы пользователи в разных часовых поясах видели одинаковые результаты
 *
 * === ДВЕ СЕМЬИ ФУНКЦИЙ ДНЕЙ ДО ЭКСПИРАЦИИ (аудит A1 п.3, A5 п.7) ===
 *
 * 1) «Целочисленные / календарные» — calculateDaysRemainingUTC, getDaysUntilExpirationUTC,
 *    calculateDaysToExpirationFromToday, isOptionActiveAtDay, isOptionExpiredAtDay,
 *    hasRemainingDaysUTC. Считают дни как разницу КАЛЕНДАРНЫХ дат по полуночи UTC.
 *    Семантика НЕ менялась — на них держатся гарды («на экспирации якорь не применяем»,
 *    «опцион ещё не куплен»/«уже истёк») и отображение целых дней в UI. Трогать их
 *    поведение опасно: гарды и слайдер симуляции days-passed завязаны именно на целые
 *    календарные шаги.
 *
 * 2) «Точные / ET» — getExpirationMomentET, getFractionalDaysUntilExpirationET,
 *    calculateDaysRemainingPreciseET, calculateDaysToExpirationFromTodayPreciseET.
 *    НОВЫЕ функции. Американские опционы истекают не в полночь UTC, а в 16:00 по времени
 *    Нью-Йорка (America/New_York, с учётом перехода EDT/EST) в день экспирации — старый
 *    расчёт «целые календарные дни до полуночи UTC» даёт систематическую ошибку около
 *    полудня жизни опциона (на типичной ноге заказчика это $6–8 за контракт, то есть
 *    $15–20 на сделку — основная часть медианной погрешности платформы). Эти функции
 *    считают ДРОБНОЕ число дней до реального момента экспирации и предназначены ТОЛЬКО
 *    для ценообразования (аргумент t=days/365 в формулах Black-Scholes/Black-76) — не для
 *    гардов и не для прямого отображения (дробные дни в UI надо округлять на выводе,
 *    а не менять расчёт).
 */

const isValidDate = (date) => date instanceof Date && !Number.isNaN(date.getTime());

// Единая база для всего, что связано с торговлей (экспирации, торговые сессии): биржевое
// время America/New_York. Выбрано, а не UTC/локальное время браузера, потому что именно
// в этой зоне живут часы работы биржи и момент экспирации американских опционов (16:00 ET) —
// любая другая база (UTC, локальная машина пользователя) даёт систематический сдвиг
// относительно того, что реально происходит на бирже.
const NY_TIME_ZONE = 'America/New_York';
// Стандартное время закрытия рынка США, в которое истекают опционы в день экспирации.
const MARKET_CLOSE_HOUR_ET = 16;

/**
 * Форматирует Date как календарную дату YYYY-MM-DD в заданном часовом поясе.
 * ЗАЧЕМ: локаль en-CA форматирует даты в ISO-порядке (YYYY-MM-DD) «из коробки» —
 * это надёжнее, чем формировать строку вручную из formatToParts.
 */
function formatDateInTimeZone(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Смещение America/New_York относительно UTC (в минутах, отрицательное — запад от UTC)
 * для конкретного момента времени.
 * ЗАЧЕМ: EDT (лето, UTC-4) и EST (зима, UTC-5) переключаются по календарю США, который
 * рассчитывается динамически (2-е воскресенье марта / 1-е воскресенье ноября) — хардкодить
 * смещение нельзя, поэтому спрашиваем у Intl фактическое смещение на дату.
 */
function getNyOffsetMinutes(utcInstant) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NY_TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(utcInstant);

  const map = {};
  parts.forEach((p) => { map[p.type] = p.value; });
  // ICU иногда отдаёт час "24" вместо "00" при hour12:false — нормализуем.
  const hour = Number(map.hour) === 24 ? 0 : Number(map.hour);

  // "Псевдо-UTC" момент — те же цифры настенных часов NY, но интерпретированные как UTC.
  // Разница между ним и реальным utcInstant и есть смещение NY от UTC.
  const asIfUTC = Date.UTC(
    Number(map.year), Number(map.month) - 1, Number(map.day),
    hour, Number(map.minute), Number(map.second)
  );
  return Math.round((asIfUTC - utcInstant.getTime()) / 60000);
}

/**
 * Сегодняшняя календарная дата по времени Нью-Йорка (YYYY-MM-DD).
 * ЗАЧЕМ: единая база «сегодня» для дат входа/якорей/ввода волатильности вместо
 * browser-UTC (new Date().toISOString()) или локального времени машины пользователя —
 * см. заголовок файла и docs аудита A5 п.7.
 */
export function getTodayDateStringET() {
  return formatDateInTimeZone(new Date(), NY_TIME_ZONE);
}

/**
 * Момент закрытия рынка (16:00 America/New_York, DST-aware) для календарной даты экспирации.
 *
 * @param {string} dateStr - дата экспирации (любой формат, поддерживаемый normalizeDateString)
 * @returns {Date|null} - момент 16:00 ET в виде Date (UTC-инстант), либо null при невалидной дате
 */
export function getExpirationMomentET(dateStr) {
  const normalized = normalizeDateString(dateStr);
  if (!normalized) return null;
  const [year, month, day] = normalized.split('-').map(Number);

  // Опорный момент — полдень UTC того же календарного дня. Переходы DST в США происходят
  // в 2:00 ночи по местному времени, то есть задолго до полудня UTC (~7-8 утра по NY) —
  // поэтому смещение, снятое в опорной точке, гарантированно совпадает со смещением
  // в 16:00 ET того же дня (обе точки — по одну сторону перехода), и одного прохода достаточно.
  const referenceUTC = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const offsetMinutes = getNyOffsetMinutes(referenceUTC);

  // 16:00 по NY = (16:00 - offsetMinutes) по UTC (offsetMinutes отрицательный ⇒ UTC позже).
  return new Date(Date.UTC(year, month - 1, day, MARKET_CLOSE_HOUR_ET, 0, 0) - offsetMinutes * 60000);
}

/**
 * Точное (дробное) число дней от момента fromDate до 16:00 ET дня экспирации.
 * ЗАЧЕМ: для ценообразования (t=days/365 в Black-Scholes/Black-76) — целочисленные
 * «календарные дни до полуночи UTC» (getDaysUntilExpirationUTC) дают систематическую
 * ошибку около полудня жизни опциона. НЕ использовать для гардов/отображения — там
 * нужны стабильные целочисленные дни, см. заголовок файла.
 *
 * @param {string} dateStr - дата экспирации
 * @param {Date} [fromDate] - момент, от которого считаем (по умолчанию — сейчас)
 * @returns {number|null} - дробное число дней (может быть отрицательным, если экспирация
 *   уже прошла), либо null при невалидной дате экспирации
 */
export function getFractionalDaysUntilExpirationET(dateStr, fromDate = new Date()) {
  const closeMoment = getExpirationMomentET(dateStr);
  if (!closeMoment || !isValidDate(fromDate)) return null;
  return (closeMoment.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
}

export function normalizeDateString(dateValue) {
  if (!dateValue) return null;

  if (typeof dateValue !== 'string') {
    if (dateValue instanceof Date && isValidDate(dateValue)) {
      return dateValue.toISOString().split('T')[0];
    }
    return null;
  }

  const trimmedValue = dateValue.trim();
  if (!trimmedValue) return null;

  const isoMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const compactIsoMatch = trimmedValue.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactIsoMatch) {
    return `${compactIsoMatch[1]}-${compactIsoMatch[2]}-${compactIsoMatch[3]}`;
  }

  const dotMatch = trimmedValue.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotMatch) {
    return `${dotMatch[3]}-${dotMatch[2]}-${dotMatch[1]}`;
  }

  const slashMatch = trimmedValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const firstPart = Number(slashMatch[1]);
    const secondPart = Number(slashMatch[2]);

    if (firstPart > 12 && secondPart <= 12) {
      const day = String(firstPart).padStart(2, '0');
      const month = String(secondPart).padStart(2, '0');
      return `${slashMatch[3]}-${month}-${day}`;
    }

    if (secondPart > 12 && firstPart <= 12) {
      const month = String(firstPart).padStart(2, '0');
      const day = String(secondPart).padStart(2, '0');
      return `${slashMatch[3]}-${month}-${day}`;
    }

    const day = String(firstPart).padStart(2, '0');
    const month = String(secondPart).padStart(2, '0');
    return `${slashMatch[3]}-${month}-${day}`;
  }

  const parsedDate = new Date(trimmedValue);
  if (!isValidDate(parsedDate)) {
    return null;
  }

  // ЗАЧЕМ (фикс дня-сдвига, аудит A5 п.7): раньше здесь брали календарную дату ПО UTC
  // (parsedDate.toISOString().split('T')[0]), а затем эта строка заворачивалась в ЛОКАЛЬНУЮ
  // полночь браузера (см. parseDateAtStartOfDay ниже) — то есть «какой это день» решали
  // по UTC, а хранили/сравнивали потом как локальный день. Для полных ISO-меток с временем
  // (entryDate/actualPLDate/manualIvOverrideDate сохраняются через new Date().toISOString()
  // в браузере) это давало систематический сдвиг на сутки: пользователь в Панаме (UTC-5),
  // сделавший что-то после ~19:00 по своему времени, получал дату СЛЕДУЮЩЕГО дня, потому что
  // в UTC уже наступил следующий календарный день.
  // Берём календарную дату по единой торговой базе — America/New_York (см. заголовок файла),
  // а не по UTC и не по часовому поясу машины пользователя.
  return formatDateInTimeZone(parsedDate, NY_TIME_ZONE);
}

export function parseDateAtStartOfDay(dateValue) {
  const normalizedDate = normalizeDateString(dateValue);
  if (!normalizedDate) {
    return null;
  }

  const parsedDate = new Date(`${normalizedDate}T00:00:00`);
  return isValidDate(parsedDate) ? parsedDate : null;
}

/**
 * Вычисляет количество дней между сегодняшней датой (UTC) и датой экспирации
 * ЗАЧЕМ: Единообразный расчёт для всех часовых поясов
 * 
 * @param {string} dateStr - Дата экспирации в формате YYYY-MM-DD
 * @returns {number} Количество дней от сегодня (UTC)
 */
export function getDaysUntilExpirationUTC(dateStr) {
  if (!dateStr) return 0;
  const normalizedDate = normalizeDateString(dateStr);
  if (!normalizedDate) return 0;
  
  // Получаем текущую дату в UTC (без времени)
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  
  // Парсим дату экспирации как UTC (YYYY-MM-DD)
  const [year, month, day] = normalizedDate.split('-').map(Number);
  const expDateUTC = Date.UTC(year, month - 1, day); // month - 1, т.к. месяцы 0-indexed
  
  const diffTime = expDateUTC - todayUTC;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Вычисляет оставшиеся дни до экспирации для опциона с учётом прошедших дней
 * ЗАЧЕМ: Используется в графике P&L и расчёте выхода из позиции
 * 
 * IMPORTANT: Использует UTC для консистентности между часовыми поясами
 * 
 * ЛОГИКА ИНДИВИДУАЛЬНОГО РАСЧЁТА:
 * - daysPassed считается от самой старой даты входа (oldestEntryDate)
 * - Для каждого опциона вычисляем actualDaysPassed на основе его entryDate
 * - Если опцион куплен позже oldestEntryDate, для него прошло меньше дней
 * 
 * Пример: oldestEntryDate = 11.01, daysPassed = 10 (целевая дата = 21.01)
 * - Опцион от 11.01: actualDaysPassed = 10 (21.01 - 11.01)
 * - Опцион от 16.01: actualDaysPassed = 5 (21.01 - 16.01)
 * 
 * @param {Object} option - Опцион с полями date (YYYY-MM-DD), entryDate (YYYY-MM-DD)
 * @param {number} daysPassed - Прошедшие дни от самой старой даты входа (глобальный ползунок)
 * @param {number} defaultDays - Дефолтное значение если нет даты (по умолчанию 30)
 * @param {Date|null} oldestEntryDate - Самая старая дата входа среди всех опционов (опционально)
 * @returns {number} Оставшиеся дни до экспирации (не меньше 0)
 */
export function calculateDaysRemainingUTC(option, daysPassed = 0, defaultDays = 30, oldestEntryDate = null) {
  if (!option?.date) {
    return Math.max(0, defaultDays - daysPassed);
  }

  const normalizedExpirationDate = normalizeDateString(option.date);
  if (!normalizedExpirationDate) {
    return Math.max(0, defaultDays - daysPassed);
  }
  
  // Для зафиксированных позиций используем сохранённое initialDaysToExpiration
  // ЗАЧЕМ: daysPassed считается от даты сохранения, а не от сегодня
  let initialDaysToExpiration;
  if (option.isLockedPosition && option.initialDaysToExpiration !== undefined) {
    initialDaysToExpiration = option.initialDaysToExpiration;
  } else {
    // Для обычных позиций вычисляем от даты входа опциона по UTC
    // ЗАЧЕМ: Каждый опцион имеет свою дату входа (entryDate)
    const entryDateStr = normalizeDateString(option.entryDate) || getTodayDateStringET();
    const [entryYear, entryMonth, entryDay] = entryDateStr.split('-').map(Number);
    const entryDateUTC = Date.UTC(entryYear, entryMonth - 1, entryDay);
    
    // Парсим дату экспирации
    const [expYear, expMonth, expDay] = normalizedExpirationDate.split('-').map(Number);
    const expDateUTC = Date.UTC(expYear, expMonth - 1, expDay);
    
    // Дни от даты входа до экспирации
    initialDaysToExpiration = Math.ceil((expDateUTC - entryDateUTC) / (1000 * 60 * 60 * 24));
  }
  
  // Вычисляем actualDaysPassed для этого конкретного опциона
  // ЗАЧЕМ: Если опцион куплен позже oldestEntryDate, для него прошло меньше дней
  let actualDaysPassed = daysPassed;
  
  if (oldestEntryDate && option.entryDate && !option.isLockedPosition) {
    // Вычисляем разницу между датой входа опциона и самой старой датой входа
    const entryDateStr = normalizeDateString(option.entryDate);
    if (!entryDateStr) {
      return Math.max(0, initialDaysToExpiration - actualDaysPassed);
    }
    const [entryYear, entryMonth, entryDay] = entryDateStr.split('-').map(Number);
    const optionEntryDateUTC = Date.UTC(entryYear, entryMonth - 1, entryDay);
    
    // oldestEntryDate уже является Date объектом (создан через parseDateAtStartOfDay = local midnight)
    // ВАЖНО: Используем getFullYear/Month/Date (local), а не getUTC*
    // ЗАЧЕМ: parseDateAtStartOfDay создаёт дату в local time (new Date("YYYY-MM-DDT00:00:00")),
    // и getUTC* в часовом поясе UTC+ сдвигает дату на день назад (00:00 local = 23:00 UTC предыдущего дня)
    const oldestEntryDateUTC = Date.UTC(
      oldestEntryDate.getFullYear(),
      oldestEntryDate.getMonth(),
      oldestEntryDate.getDate()
    );
    
    // Разница в днях между датой входа опциона и самой старой датой входа
    const entryDiff = Math.ceil((optionEntryDateUTC - oldestEntryDateUTC) / (1000 * 60 * 60 * 24));
    
    // actualDaysPassed = daysPassed - entryDiff
    // Если опцион куплен на 5 дней позже, для него прошло на 5 дней меньше
    actualDaysPassed = Math.max(0, daysPassed - entryDiff);
  }
  
  // Оставшиеся дни = изначальные - прошедшие (симуляция)
  return Math.max(0, initialDaysToExpiration - actualDaysPassed);
}

/**
 * Вычисляет дни до экспирации от реального сегодняшнего дня (не от даты входа)
 * ЗАЧЕМ: Для привязки manualIvOverride к текущей дате, а не к дате входа в позицию
 * 
 * @param {Object} option - Опцион с полем date
 * @returns {number} Дни до экспирации от сегодня
 */
export function calculateDaysToExpirationFromToday(option) {
  if (!option?.date) {
    return 30; // Fallback
  }

  const normalizedExpirationDate = normalizeDateString(option.date);
  if (!normalizedExpirationDate) {
    return 30;
  }

  // Парсим дату экспирации
  const [expYear, expMonth, expDay] = normalizedExpirationDate.split('-').map(Number);
  const expDateUTC = Date.UTC(expYear, expMonth - 1, expDay);

  // Сегодняшняя дата в UTC
  const today = new Date();
  const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  // Дни от сегодня до экспирации
  const daysToExpiration = Math.ceil((expDateUTC - todayUTC) / (1000 * 60 * 60 * 24));

  return Math.max(0, daysToExpiration);
}

/**
 * ТОЧНАЯ (ET) версия calculateDaysToExpirationFromToday — дробные дни от fromDate до
 * 16:00 America/New_York дня экспирации, вместо целых календарных дней до полуночи UTC.
 * ЗАЧЕМ: используется там, где результат идёт в ценообразование/проекцию волатильности
 * (getOptionVolatility) — там нужна точность, а не целочисленный шаг слайдера.
 * НЕ использовать для гардов/отображения — см. заголовок файла.
 *
 * @param {Object} option - Опцион с полем date
 * @param {Date} [fromDate] - момент, от которого считаем (по умолчанию — сейчас)
 * @returns {number} Дробное число дней до экспирации от fromDate (не меньше 0)
 */
export function calculateDaysToExpirationFromTodayPreciseET(option, fromDate = new Date()) {
  if (!option?.date) {
    return 30; // Fallback — как в целочисленной версии
  }

  const fractionalDays = getFractionalDaysUntilExpirationET(option.date, fromDate);
  if (fractionalDays === null) {
    return 30;
  }

  return Math.max(0, fractionalDays);
}

/**
 * ТОЧНАЯ (ET) версия calculateDaysRemainingUTC — та же логика симуляции (даты входа,
 * daysPassed-ползунок, individual actualDaysPassed по oldestEntryDate), но момент
 * экспирации берётся не как полночь UTC, а как 16:00 America/New_York (см. заголовок
 * файла). Результат ДРОБНЫЙ — предназначен только для передачи в формулы ценообразования
 * (Black-Scholes/Black-76, t=days/365) и в applyFactPLAnchor.targetDaysRemaining.
 *
 * НЕ использовать для гардов вида days>0 без понимания, что порог сдвигается на реальный
 * момент закрытия рынка (это и есть цель фикса — гард «на экспирации якорь не применяем»
 * должен срабатывать после 16:00 ET дня экспирации, а не в полночь UTC этого дня).
 * НЕ использовать для отображения — если нужно показать дни в UI, округляй ЭТОТ результат
 * при выводе (Math.round), а не переключай расчёт на целочисленную функцию по разным причинам.
 *
 * @param {Object} option - Опцион с полями date (YYYY-MM-DD), entryDate (YYYY-MM-DD)
 * @param {number} daysPassed - Прошедшие дни от самой старой даты входа (глобальный ползунок)
 * @param {number} defaultDays - Дефолтное значение если нет даты (по умолчанию 30)
 * @param {Date|null} oldestEntryDate - Самая старая дата входа среди всех опционов (опционально)
 * @returns {number} Оставшиеся дни до экспирации, дробное число (не меньше 0)
 */
export function calculateDaysRemainingPreciseET(option, daysPassed = 0, defaultDays = 30, oldestEntryDate = null) {
  if (!option?.date) {
    return Math.max(0, defaultDays - daysPassed);
  }

  const normalizedExpirationDate = normalizeDateString(option.date);
  if (!normalizedExpirationDate) {
    return Math.max(0, defaultDays - daysPassed);
  }

  const expirationMomentET = getExpirationMomentET(normalizedExpirationDate);
  if (!expirationMomentET) {
    return Math.max(0, defaultDays - daysPassed);
  }

  // Для зафиксированных позиций используем сохранённое initialDaysToExpiration «как есть»
  // (оно целое и посчитано старой функцией на момент сохранения) — ЗАЧЕМ: не сдвигать
  // задним числом уже зафиксированные Start P&L снапшоты при переходе на точный расчёт.
  let initialDaysToExpiration;
  if (option.isLockedPosition && option.initialDaysToExpiration !== undefined) {
    initialDaysToExpiration = option.initialDaysToExpiration;
  } else {
    const entryDateStr = normalizeDateString(option.entryDate) || getTodayDateStringET();
    const [entryYear, entryMonth, entryDay] = entryDateStr.split('-').map(Number);
    const entryDateUTC = Date.UTC(entryYear, entryMonth - 1, entryDay);

    // Дробные дни от полуночи UTC даты входа до 16:00 ET даты экспирации. Точка входа
    // намеренно не меняется (не предмет этого фикса, см. заголовок файла) — меняется
    // только точка экспирации, что и убирает систематическую ошибку ~0.5 дня.
    initialDaysToExpiration = (expirationMomentET.getTime() - entryDateUTC) / (1000 * 60 * 60 * 24);
  }

  let actualDaysPassed = daysPassed;

  if (oldestEntryDate && option.entryDate && !option.isLockedPosition) {
    const entryDateStr = normalizeDateString(option.entryDate);
    if (!entryDateStr) {
      return Math.max(0, initialDaysToExpiration - actualDaysPassed);
    }
    const [entryYear, entryMonth, entryDay] = entryDateStr.split('-').map(Number);
    const optionEntryDateUTC = Date.UTC(entryYear, entryMonth - 1, entryDay);

    const oldestEntryDateUTC = Date.UTC(
      oldestEntryDate.getFullYear(),
      oldestEntryDate.getMonth(),
      oldestEntryDate.getDate()
    );

    const entryDiff = Math.ceil((optionEntryDateUTC - oldestEntryDateUTC) / (1000 * 60 * 60 * 24));
    actualDaysPassed = Math.max(0, daysPassed - entryDiff);
  }

  return Math.max(0, initialDaysToExpiration - actualDaysPassed);
}

/**
 * Проверяет, есть ли у опциона оставшиеся дни до экспирации
 * ЗАЧЕМ: Используется для определения, показывать ли линию экспирации на графике
 * 
 * @param {Object} option - Опцион с полем date
 * @param {number} daysPassed - Прошедшие дни от сегодня
 * @param {Date|null} oldestEntryDate - Самая старая дата входа среди всех опционов
 * @returns {boolean} true если есть оставшиеся дни
 */
export function hasRemainingDaysUTC(option, daysPassed = 0, oldestEntryDate = null) {
  return calculateDaysRemainingUTC(option, daysPassed, 30, oldestEntryDate) > 0;
}

/**
 * Проверяет, активен ли опцион на указанный день симуляции
 * ЗАЧЕМ: Если целевая дата раньше даты входа опциона, опцион ещё не куплен
 * 
 * Пример: oldestEntryDate = 11.01, daysPassed = 3 (целевая дата = 14.01)
 * - Опцион от 11.01: активен (14.01 >= 11.01)
 * - Опцион от 16.01: НЕ активен (14.01 < 16.01)
 * 
 * @param {Object} option - Опцион с полем entryDate
 * @param {number} daysPassed - Прошедшие дни от самой старой даты входа
 * @param {Date|null} oldestEntryDate - Самая старая дата входа среди всех опционов
 * @returns {boolean} true если опцион активен (уже куплен), false если ещё не куплен
 */
export function isOptionActiveAtDay(option, daysPassed, oldestEntryDate) {
  if (!oldestEntryDate) return true; // Нет базовой даты — считаем активным
  if (option.isLockedPosition) return true; // Зафиксированные позиции всегда активны
  
  // Вычисляем разницу между датой входа опциона и самой старой датой входа
  // ВАЖНО: Если entryDate отсутствует, используем текущую дату как fallback
  const entryDateStr = normalizeDateString(option.entryDate) || getTodayDateStringET();
  const [entryYear, entryMonth, entryDay] = entryDateStr.split('-').map(Number);
  const optionEntryDateUTC = Date.UTC(entryYear, entryMonth - 1, entryDay);
  
  // ВАЖНО: Используем getFullYear/Month/Date (local), а не getUTC*
  // ЗАЧЕМ: oldestEntryDate создан в local time, getUTC* в UTC+ сдвигает дату на день назад
  const oldestEntryDateUTC = Date.UTC(
    oldestEntryDate.getFullYear(),
    oldestEntryDate.getMonth(),
    oldestEntryDate.getDate()
  );

  // Разница в днях между датой входа опциона и самой старой датой входа
  const entryDiff = Math.ceil((optionEntryDateUTC - oldestEntryDateUTC) / (1000 * 60 * 60 * 24));

  // Опцион активен, если daysPassed >= entryDiff (целевая дата >= даты входа опциона)
  return daysPassed >= entryDiff;
}

/**
 * Проверяет, истёк ли опцион на указанный день симуляции
 * ЗАЧЕМ: Если целевая дата больше даты экспирации, опцион уже истёк
 * 
 * @param {Object} option - Опцион с полями date (экспирация) и entryDate
 * @param {number} daysPassed - Прошедшие дни от самой старой даты входа
 * @param {Date|null} oldestEntryDate - Самая старая дата входа среди всех опционов
 * @returns {boolean} true если опцион истёк, false если ещё действует
 */
export function isOptionExpiredAtDay(option, daysPassed, oldestEntryDate) {
  if (!oldestEntryDate || !option.date) return false; // Нет данных — считаем не истёкшим
  const normalizedExpirationDate = normalizeDateString(option.date);
  if (!normalizedExpirationDate) return false;
  
  // Вычисляем целевую дату в UTC полночь (timestamp)
  // ЗАЧЕМ: Сравниваем только даты без учета времени для консистентности между часовыми поясами
  // ВАЖНО: Используем getFullYear/Month/Date (local), а не getUTC*
  // ЗАЧЕМ: oldestEntryDate создан в local time, getUTC* в UTC+ сдвигает дату на день назад
  const targetDateUTC = Date.UTC(
    oldestEntryDate.getFullYear(),
    oldestEntryDate.getMonth(),
    oldestEntryDate.getDate() + daysPassed
  );
  
  // Парсим дату экспирации опциона в UTC полночь (timestamp)
  const [expYear, expMonth, expDay] = normalizedExpirationDate.split('-').map(Number);
  const expirationDateUTC = Date.UTC(expYear, expMonth - 1, expDay);
  
  // Опцион истёк, если целевая дата > даты экспирации
  // ВАЖНО: Используем строгое сравнение timestamp'ов UTC полночи
  return targetDateUTC > expirationDateUTC;
}

/**
 * Вычисляет самую старую дату входа среди массива опционов
 * ЗАЧЕМ: Используется как базовая дата для расчёта daysPassed
 * 
 * @param {Array} options - Массив опционов с полем entryDate
 * @returns {Date|null} Самая старая дата входа или null
 */
export function getOldestEntryDate(options) {
  if (!options || options.length === 0) return null;
  
  let oldest = null;
  options.forEach(option => {
    const entryDate = parseDateAtStartOfDay(option.entryDate || getTodayDateStringET());
    if (!entryDate) {
      return;
    }
    
    if (!oldest || entryDate < oldest) {
      oldest = entryDate;
    }
  });
  
  return oldest;
}
