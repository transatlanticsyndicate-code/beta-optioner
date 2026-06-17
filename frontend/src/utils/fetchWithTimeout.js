/**
 * fetch с жёстким таймаутом через AbortController.
 *
 * ЗАЧЕМ: без таймаута зависшее соединение висит до OS-таймаута TCP (десятки секунд,
 * иногда минуты). Именно поэтому коллеги «работали час», думая что данные
 * сохраняются, — запросы молча висели. Жёсткий таймаут даёт быструю и понятную
 * ошибку «сервер недоступен», а не иллюзию работы.
 *
 * Возвращает Response при ЛЮБОМ HTTP-ответе (включая 4xx/5xx — это не исключение).
 * Бросает исключение только при обрыве сети или таймауте; вызывающий код ловит его
 * и трактует как «сервер недоступен».
 *
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs - по умолчанию 10 секунд
 * @returns {Promise<Response>}
 */
export const fetchWithTimeout = async (url, options = {}, timeoutMs = 10000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Разобрать тело ответа-ошибки FastAPI в { code, message }.
 * detail может быть строкой или объектом { code, message } (наши 409-конфликты).
 */
export const parseApiError = async (resp) => {
  try {
    const json = await resp.json();
    const d = json?.detail;
    if (d && typeof d === 'object') {
      return { code: d.code || null, message: d.message || `Ошибка сервера (${resp.status})` };
    }
    if (typeof d === 'string') return { code: null, message: d };
  } catch (e) {
    // тело не JSON — отдадим общий текст ниже
  }
  return { code: null, message: `Ошибка сервера (${resp.status})` };
};
