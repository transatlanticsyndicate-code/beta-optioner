// Проверка перед созданием «снимка входа» (startSnapshot): предупреждаем пользователя,
// если у части позиций не заполнен Fact P&L (реальный P&L от брокера на момент входа).
//
// ЗАЧЕМ: startSnapshot замораживает данные позиции один раз и навсегда — если на этот
// момент Fact P&L пустой, снимок сохраняется БЕЗ якоря молча, без предупреждения.
// Восстановить якорь потом нельзя — исторических данных в системе для этого нет.
// Реальный случай на данных заказчика: так пострадали 9 позиций в 4 сделках (T, PDD,
// MKTX, TTD) — прогноз Start P&L для них систематически оптимистичен, потому что не
// учитывает мгновенную потерю на спреде при входе.
//
// Чистые функции без React — вызываются из UniversalOptionsCalculator.jsx перед каждым
// действием, которое может создать startSnapshot (сохранение сделки / фиксация).

/**
 * Fact P&L считается заполненным, если у ноги явно задано числовое значение.
 * ВАЖНО: 0 — валидный факт (например, вышли в ноль по споту), поэтому не должен
 * считаться «не заполнено». Не заполнено — только null/undefined.
 */
function hasFactPL(option) {
  return option != null && option.actualPL !== null && option.actualPL !== undefined;
}

/**
 * Находит ноги, которые получат startSnapshot без якоря Fact P&L, если сохранить
 * позицию прямо сейчас.
 *
 * Учитываются только видимые (visible !== false) и ещё не зафиксированные ранее
 * ноги (без своего startSnapshot) — именно они получат новый снимок при этом
 * сохранении. Скрытые ноги на снимок не влияют. Ноги, у которых startSnapshot уже
 * есть (зафиксированы раньше), тоже не пересматриваются — снимок для них уже
 * записан, повторное предупреждение по ним ничего не изменит и ничего не исправит.
 *
 * @param {Array<object>} options
 * @returns {Array<object>} подмножество options без заполненного Fact P&L
 */
export function findLegsWithoutFactPL(options) {
  if (!Array.isArray(options)) return [];
  return options.filter(opt => {
    if (!opt || opt.visible === false) return false;
    if (opt.startSnapshot) return false;
    return !hasFactPL(opt);
  });
}

// Человекочитаемое описание одной ноги: действие, тип, страйк, количество.
// ЗАЧЕМ: пользователь без технического образования должен узнать позицию по
// тем же признакам, что видит в таблице опционов (не по id).
function describeLeg(opt) {
  const actionLabel = opt.action === 'Buy' ? 'Покупка' : opt.action === 'Sell' ? 'Продажа' : (opt.action || '');
  const typeLabel = opt.type === 'CALL' ? 'Call' : opt.type === 'PUT' ? 'Put' : (opt.type || 'опцион');
  const strike = opt.strike !== undefined && opt.strike !== null ? opt.strike : '?';
  const qtyNum = Number(opt.quantity);
  const qty = Number.isFinite(qtyNum) ? Math.abs(qtyNum) : '?';
  const prefix = actionLabel ? `${actionLabel} ` : '';
  return `${prefix}${typeLabel} ${strike}, ${qty} шт.`;
}

/**
 * Готовый текст предупреждения для показа пользователю перед сохранением.
 * Возвращает '' если предупреждать не о чем (пустой список ног).
 *
 * @param {Array<object>} legs — результат findLegsWithoutFactPL
 * @returns {string}
 */
export function describeMissingFactPL(legs) {
  const list = Array.isArray(legs) ? legs : [];
  const count = list.length;
  if (count === 0) return '';

  // Склонение существительного после числа: 1 позиции / 2-4 позиций / 5+ позиций.
  // ЗАЧЕМ: текст видит заказчик, а не разработчик — грамматика должна быть верной.
  const positionsWord = count === 1 ? 'позиции' : 'позиций';
  const itemsList = list.map(leg => `  • ${describeLeg(leg)}`).join('\n');

  return (
    `У ${count} ${positionsWord} не заполнен фактический P&L (реальная цена входа от брокера):\n\n` +
    `${itemsList}\n\n` +
    'Если сохранить сейчас, снимок входа для этих позиций запишется БЕЗ этого якоря. ' +
    'Прогноз Start P&L для них будет менее точным — он не учтёт мгновенную потерю на ' +
    'спреде при входе. Заполнить это потом будет уже нельзя: исторические данные ' +
    'восстановить будет негде.\n\n' +
    'Нажмите «Отмена», чтобы вернуться и заполнить Fact P&L по этим позициям.\n' +
    'Нажмите «ОК», чтобы сохранить как есть.'
  );
}
