/**
 * Режимы работы стратегии «Север GPT».
 *
 * ЗАЧЕМ: раньше режим задавался двумя независимыми галочками, из-за чего была
 * возможна бессмысленная комбинация «актив + только CALL», а библиотека промптов
 * была общей на все режимы. Теперь режим один и явный, а у каждого — свой
 * изолированный набор промптов на сервере.
 *
 * Модуль намеренно чистый (без React и импортов) — его свободно используют
 * и форма, и диалог, и тесты.
 */

export const NORTH_GPT_MODES = {
  WITH_ASSET: 'with_asset',
  OPTIONS_ONLY: 'options_only',
  CALL_ONLY: 'call_only',
};

export const DEFAULT_NORTH_GPT_MODE = NORTH_GPT_MODES.OPTIONS_ONLY;

// Порядок элементов = порядок кнопок в переключателе.
export const NORTH_GPT_MODE_OPTIONS = [
  {
    value: NORTH_GPT_MODES.WITH_ASSET,
    label: 'Актив + опционы',
    hint: 'Считаются два варианта: с акциями и без них.',
  },
  {
    value: NORTH_GPT_MODES.OPTIONS_ONLY,
    label: 'Только опционы',
    hint: 'Сделка собирается из Call и Put, без акций.',
  },
  {
    value: NORTH_GPT_MODES.CALL_ONLY,
    label: 'Только CALL',
    hint: 'Сделка только из купленных Call: максимальный убыток равен уплаченной премии.',
  },
];

export const isNorthGptMode = (value) =>
  Object.values(NORTH_GPT_MODES).includes(value);

/**
 * Режим → пара признаков, которые понимает бэкенд.
 * Расчётная логика на сервере не менялась — переключатель просто раскладывается
 * в те же два поля, что приходили от старых галочек.
 */
export const modeToFlags = (mode) => {
  if (mode === NORTH_GPT_MODES.WITH_ASSET) {
    return { withAssetEnabled: true, withoutPut: false };
  }
  if (mode === NORTH_GPT_MODES.CALL_ONLY) {
    return { withAssetEnabled: false, withoutPut: true };
  }
  // Неизвестное значение трактуем как режим по умолчанию.
  return { withAssetEnabled: false, withoutPut: false };
};

/**
 * Пара признаков → режим. Нужно для восстановления формы из запуска, сделанного
 * ДО появления переключателя: там обе галочки могли стоять одновременно.
 * Приоритет у «без Put» — он сильнее влияет на форму (в таком запуске диапазон
 * Put-страйков и допуск P&L по низу уже сохранены пустыми).
 */
export const flagsToMode = (params) => {
  const p = params || {};
  if (p.withoutPut === true) return NORTH_GPT_MODES.CALL_ONLY;
  if (p.withAssetEnabled === true) return NORTH_GPT_MODES.WITH_ASSET;
  return NORTH_GPT_MODES.OPTIONS_ONLY;
};
