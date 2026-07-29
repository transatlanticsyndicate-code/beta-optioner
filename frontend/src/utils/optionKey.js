// Построение ключа опциона для хранилища ручных правок пользователя.
//
// ЗАЧЕМ: Старый ключ (`${strike}-${type}-${date}`, БЕЗ тикера) неоднозначен —
// опцион CALL 100 2026-08-15 у AAPL и у любого другого тикера с тем же страйком
// и датой получал ОДИН И ТОТ ЖЕ ключ. Правки (quantity, customPremium, Fact P&L,
// Fact IV и т.д.) от одного инструмента перетекали в другой. Реальный инцидент:
// у сделки CCI якорная цена стала 1.00 — значение "утекло" от другого тикера.
//
// Ключ без тикера НЕ мигрируется автоматически в v2 — старые записи неоднозначны
// (неизвестно, какому тикеру они принадлежали), переносить их нельзя.

/**
 * Строит ключ опциона с учётом тикера.
 *
 * @param {string} ticker — тикер инструмента (пустой/undefined → ключ построить нельзя)
 * @param {object} option — опцион с полями strike/type/date
 * @returns {string|null} `${TICKER}|${strike}-${TYPE}-${YYYY-MM-DD}`, либо null если
 *   тикер не передан — вызывающий код обязан пропустить сохранение в этом случае.
 */
export function buildOptionKey(ticker, option) {
  const normalizedTicker = (ticker || '').toString().trim().toUpperCase();
  if (!normalizedTicker) return null;

  const strike = option?.strike || 0;
  const type = (option?.type || '').toUpperCase();
  const date = (option?.date || '').toString().split('T')[0];

  return `${normalizedTicker}|${strike}-${type}-${date}`;
}
