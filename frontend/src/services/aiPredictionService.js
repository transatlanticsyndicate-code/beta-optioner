/**
 * Сервис для взаимодействия с AI API прогнозирования волатильности
 */
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const aiPredictionService = {
  /**
   * Получить прогноз IV от AI модели
   * @param {Object} params - Параметры запроса
   * @param {string} params.ticker - Тикер актива
   * @param {string} params.type - Тип опциона ('CALL' или 'PUT')
   * @param {number} params.stockPrice - Целевая цена актива
   * @param {number} params.strike - Страйк опциона
   * @param {number} params.ttm - Время до экспирации в годах
   * @param {number} params.currentIv - Текущая рыночная IV
   * @returns {Promise<number>} - Прогнозируемая IV (или текущая в случае ошибки)
   */
  predictIV: async ({ ticker, type, stockPrice, strike, ttm, currentIv }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/ai/predict-iv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticker,
          type,
          stockPrice,
          strike,
          ttm,
          currentIv
        }),
      });

      if (!response.ok) {
        throw new Error(`AI Prediction failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        return data.iv;
      } else {
        console.warn('AI Prediction returned success=false, using fallback IV');
        return currentIv;
      }
    } catch (error) {
      console.error('Error fetching AI prediction:', error);
      return currentIv; // Fallback на текущую IV
    }
  }
};

export default aiPredictionService;
