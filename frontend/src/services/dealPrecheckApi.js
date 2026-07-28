/**
 * API-сервис «Проверка сделки» (precheck) для окна «Подбор СЕВЕР GPT».
 * ЗАЧЕМ: обёртка над fetch к своему бэкенду (который авторизованно проксирует
 * запрос во внешний сервис news.optioner.online). В отличие от соседних сервисов
 * этого приложения — НИКОГДА не бросает исключение: вызов информационный, сбой
 * не должен ломать экран результатов, только оставить карточку без риск-блока.
 */

// На localhost фронт :3000 → бэк :8000; на beta оба на одном домене (относительный путь).
const API_BASE_URL = process.env.REACT_APP_API_URL
  || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:8000' : '');

// Бэкенд сам ждёт внешний сервис до 40с — берём запас на сетевые накладные расходы.
const TIMEOUT_MS = 48_000;

/**
 * Запросить проверку риска по собранной конструкции.
 * @returns {Promise<{status: 'ok'|'unavailable', message?: string, ...}>}
 */
export const requestDealPrecheck = async (payload) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}/api/deal/precheck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { status: 'unavailable', message: `Проверка сделки: ошибка сервера (${response.status})` };
    }
    return await response.json();
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'Проверка сделки не ответила вовремя'
      : 'Не удалось связаться с сервером проверки сделки';
    console.warn('Проверка сделки недоступна:', error);
    return { status: 'unavailable', message };
  } finally {
    clearTimeout(timer);
  }
};
