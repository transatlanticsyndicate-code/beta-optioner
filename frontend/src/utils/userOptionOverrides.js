// Ключи и обслуживание локального хранилища ручных правок опционов.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ: до этого ключ хранилища был объявлен внутри
// UniversalOptionsCalculator.jsx, и любому другому месту, которому нужно
// прикоснуться к этим правкам (например, актуализация волатильности из
// Настроек), пришлось бы продублировать строку ключа. Разъехавшиеся копии
// ключа — это молча неработающая очистка: код пишет в одно хранилище, а
// калькулятор читает другое.
//
// ЧТО ЗДЕСЬ ХРАНИТСЯ: правки пользователя по каждой ноге (количество, премия,
// дата входа, Fact P&L, Fact IV и т.д.), ключ записи — см. utils/optionKey.js.
// Калькулятор накладывает их ПОВЕРХ данных, загруженных из базы.

// ЗАЧЕМ v2: старый ключ строился БЕЗ тикера — правки одного инструмента
// «перетекали» в другой с тем же страйком/типом/датой. Старый ключ НЕ читаем и
// не мигрируем (записи неоднозначны), только чистим при полном сбросе
// калькулятора, чтобы не копился мусор.
export const OPTIONER_USER_OVERRIDES_KEY = 'optioner_user_overrides_v2';
export const OPTIONER_USER_OVERRIDES_LEGACY_KEY = 'optioner_user_overrides';

// Поля якоря Fact P&L и Fact IV — ровно те, что записывает актуализация из файла.
const FACT_FIELDS = [
  'actualPL',
  'actualPLDate',
  'actualPLPrice',
  'actualPLPriceSource',
  'actualPLQuantity',
  'manualIvOverride',
  'manualIvOverrideDate',
  'manualIvOverrideDisplayDate',
];

/**
 * Убрать локальные правки Fact P&L / Fact IV по перечисленным ногам.
 *
 * ЗАЧЕМ: после актуализации по выгрузке из терминала свежие значения лежат в
 * базе, но при открытии сделки калькулятор накладывает поверх них локальные
 * правки этого браузера — и пользователь увидел бы старые цифры, будучи
 * уверенным, что импорт не сработал. Поэтому по обновлённым ногам локальные
 * значения фактов снимаются. Остальные правки (количество, премия, дата входа)
 * не трогаем — они к импорту отношения не имеют.
 *
 * @param {string[]} optionKeys — ключи ног в формате utils/optionKey.js
 * @returns {number} сколько записей хранилища было изменено
 */
export function clearFactOverrides(optionKeys) {
  if (!Array.isArray(optionKeys) || optionKeys.length === 0) return 0;

  try {
    const raw = localStorage.getItem(OPTIONER_USER_OVERRIDES_KEY);
    if (!raw) return 0;

    const overrides = JSON.parse(raw);
    if (!overrides || typeof overrides !== 'object') return 0;

    let touched = 0;
    optionKeys.forEach((key) => {
      const entry = overrides[key];
      if (!entry || typeof entry !== 'object') return;

      const hadFact = FACT_FIELDS.some((field) => field in entry);
      if (!hadFact) return;

      FACT_FIELDS.forEach((field) => { delete entry[field]; });
      // Пустую запись убираем целиком, чтобы хранилище не распухало.
      if (Object.keys(entry).length === 0) delete overrides[key];
      touched += 1;
    });

    if (touched > 0) {
      localStorage.setItem(OPTIONER_USER_OVERRIDES_KEY, JSON.stringify(overrides));
    }
    return touched;
  } catch (error) {
    // Битое хранилище не должно ронять отчёт об успешном импорте —
    // данные в базе уже обновлены, это лишь локальная гигиена.
    console.error('❌ [UserOverrides] Не удалось очистить локальные значения фактов:', error);
    return 0;
  }
}
