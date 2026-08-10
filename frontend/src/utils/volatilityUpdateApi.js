// Отправка выгрузки позиций из терминала на сервер для актуализации Fact P&L / Fact IV.
//
// ЗАЧЕМ отдельный модуль: остальные настройки тоже держат работу с сервером вне
// JSX-компонента (см. utils/etfSettings.js, utils/futuresSettings.js) — компонент
// занимается только экраном, модуль только запросом и разбором ошибки.

import { fetchWithTimeout, parseApiError } from './fetchWithTimeout';

const ENDPOINT = '/api/volatility-update/apply';

// 60 секунд: импорт перебирает все активные сделки и переписывает их состояние —
// это заметно дольше обычного запроса настроек (там хватает 10 секунд).
const TIMEOUT_MS = 60000;

/**
 * Загрузить CSV и применить его к сохранённым сделкам.
 *
 * @param {File} file — файл, выбранный пользователем
 * @returns {Promise<object>} отчёт о проделанной работе
 * @throws {Error} с понятным пользователю текстом
 */
export async function applyVolatilityUpdate(file) {
  if (!file) {
    throw new Error('Файл не выбран.');
  }

  const form = new FormData();
  form.append('file', file);

  let response;
  try {
    // Content-Type НЕ ставим руками: браузер сам добавит его вместе с boundary,
    // без которого сервер не разберёт форму.
    response = await fetchWithTimeout(ENDPOINT, { method: 'POST', body: form }, TIMEOUT_MS);
  } catch (error) {
    throw new Error('Сервер не отвечает. Проверьте соединение и попробуйте ещё раз.');
  }

  if (!response.ok) {
    const { message } = await parseApiError(response);
    throw new Error(message);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error('Сервер вернул неожиданный ответ. Изменения могли не примениться — проверьте сделки.');
  }
}
