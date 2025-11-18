import axios from 'axios';

// Определяем API URL в зависимости от окружения
const API_URL = process.env.REACT_APP_API_URL || 
  (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:8000');

/**
 * Анализировать опционы для тикера
 * @param {string} ticker - Тикер акции (например, SPY)
 * @returns {Promise} - Результат анализа
 */
export const analyzeOptions = async (ticker) => {
  try {
    const response = await axios.post(
      `${API_URL}/analyze`,
      null,
      {
        params: { ticker: ticker.toUpperCase() },
        timeout: 60000, // 60 секунд (API может быть медленным)
      }
    );
    
    return response.data;
  } catch (error) {
    // Обработка ошибок
    if (error.response) {
      // Сервер ответил с ошибкой
      throw new Error(error.response.data.error || 'Ошибка сервера');
    } else if (error.request) {
      // Запрос был отправлен, но ответа нет
      throw new Error('Сервер не отвечает. Проверьте, запущен ли backend.');
    } else {
      // Ошибка при настройке запроса
      throw new Error('Ошибка запроса: ' + error.message);
    }
  }
};

/**
 * Шаг 1: Получить данные
 * @param {string} ticker
 * @param {string} dataSource - 'yahoo' или 'polygon'
 * @returns {Promise}
 */
export const analyzeStep1 = async (ticker, dataSource = 'yahoo') => {
  try {
    const response = await axios.post(
      `${API_URL}/analyze/step1`,
      null,
      { params: { ticker: ticker.toUpperCase(), data_source: dataSource }, timeout: 180000 }
    );
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || error.message);
  }
};

/**
 * Шаг 2: Рассчитать метрики
 * @param {string} ticker
 * @returns {Promise}
 */
export const analyzeStep2 = async (ticker) => {
  try {
    const response = await axios.post(
      `${API_URL}/analyze/step2`,
      null,
      { params: { ticker: ticker.toUpperCase() }, timeout: 180000 }
    );
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || error.message);
  }
};

/**
 * Шаг 3: AI анализ
 * @param {string} ticker
 * @param {string} aiModel - 'gemini' или 'claude'
 * @returns {Promise}
 */
export const analyzeStep3 = async (ticker, aiModel = 'gemini') => {
  try {
    const response = await axios.post(
      `${API_URL}/analyze/step3`,
      null,
      { params: { ticker: ticker.toUpperCase(), ai_model: aiModel }, timeout: 600000 } // 10 минут
    );
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || error.message);
  }
};

/**
 * Проверить доступность API
 * @returns {Promise<boolean>}
 */
export const checkHealth = async () => {
  try {
    const response = await axios.get(`${API_URL}/health`);
    return response.data.status === 'healthy';
  } catch (error) {
    return false;
  }
};
