/**
 * API-сервис стратегии «Север GPT».
 * ЗАЧЕМ: обёртка над fetch для подбора через ChatGPT и CRUD библиотеки промптов.
 */

// На localhost фронт :3000 → бэк :8000; на beta оба на одном домене (относительный путь).
const API_BASE_URL = process.env.REACT_APP_API_URL
  || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:8000' : '');

/**
 * Подобрать две комбинации через ChatGPT.
 * @returns {{status, withAsset, optionsOnly, error}}
 */
export const requestNorthGptCombination = async ({ params, prompt, chain, context, promptId = null }) => {
  try {
    // Подбор идёт в фоне (gpt-5.5 «думает» минуты): запускаем задачу...
    const startResp = await fetch(`${API_BASE_URL}/api/north-gpt/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params, prompt, chain, context, promptId }),
    });
    if (!startResp.ok) throw new Error(`HTTP error! status: ${startResp.status}`);
    const started = await startResp.json();
    // Совместимость: если сервер вдруг вернул готовый результат сразу — отдаём его.
    if (started.status !== 'pending' || !started.jobId) return started;

    // ...и опрашиваем результат, пока не будет готов.
    const { jobId } = started;
    const POLL_MS = 3000;
    const MAX_MS = 6 * 60 * 1000; // ждём до 6 минут
    const startedAt = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      const pollResp = await fetch(`${API_BASE_URL}/api/north-gpt/select/${jobId}`);
      if (!pollResp.ok) throw new Error(`HTTP error! status: ${pollResp.status}`);
      const pj = await pollResp.json();
      if (pj.status !== 'pending') return pj;
      if (Date.now() - startedAt > MAX_MS) {
        return { status: 'error', error: 'Превышено время ожидания ответа ChatGPT. Попробуйте ещё раз.' };
      }
    }
  } catch (error) {
    console.error('Ошибка подбора «Север GPT»:', error);
    throw error;
  }
};

/** Список промптов (первым — последний использованный). */
export const getPrompts = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/north-gpt/prompts`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Ошибка загрузки промптов:', error);
    throw error;
  }
};

/** Создать новый промпт. */
export const createPrompt = async ({ name, text }) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/north-gpt/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, text }),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Ошибка создания промпта:', error);
    throw error;
  }
};

/** Обновить промпт (переименование и/или текст). */
export const updatePrompt = async (id, { name, text } = {}) => {
  try {
    const body = {};
    if (name !== undefined) body.name = name;
    if (text !== undefined) body.text = text;
    const response = await fetch(`${API_BASE_URL}/api/north-gpt/prompts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Ошибка обновления промпта:', error);
    throw error;
  }
};

/** Удалить промпт. */
export const deletePrompt = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/north-gpt/prompts/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Ошибка удаления промпта:', error);
    throw error;
  }
};
