// Окно дат экспирации для стратегий СЕВЕР / СЕВЕР GPT.
// Расширение отдаёт полный список дат с доски TradingView — обрезаем его здесь,
// чтобы в выпадающем списке не было десятков дальних серий (2027-2028).
export const EXPIRATION_WINDOW_DAYS = 180;

/**
 * Оставить даты в окне EXPIRATION_WINDOW_DAYS плюс ПЕРВУЮ дату за его границей.
 *
 * ЗАЧЕМ ровно одна лишняя дата, а не «расширить окно на N дней»: на недельных
 * сериях расширение окна добавило бы сразу три-четыре даты, а на редких сериях —
 * ни одной. Заказчику нужна предсказуемая одна запасная дата. Побочный эффект,
 * ради которого это и просили: при выборе последней даты окна у режима двойной
 * экспирации теперь всегда есть следующая дата для второй ноги.
 */
export function limitExpirationDates(dates) {
  try {
    const list = Array.isArray(dates) ? [...new Set(dates.filter(Boolean))].sort() : [];
    if (list.length === 0) return [];

    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const result = [];

    for (const date of list) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
      // Дату непонятного формата не отбрасываем молча — пусть её увидит пользователь.
      if (!m) { result.push(date); continue; }
      const days = Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - todayUtc) / 86400000);
      result.push(date);
      if (days > EXPIRATION_WINDOW_DAYS) break; // это и есть та самая одна дата за окном
    }

    return result;
  } catch (e) {
    // Лучше показать список целиком, чем пустой выпадающий список.
    return Array.isArray(dates) ? dates : [];
  }
}
