/**
 * API-сервис для работы с сохранёнными конфигурациями в БД
 * ЗАЧЕМ: Обёртка над fetch для CRUD операций с позициями
 */

// ЗАЧЕМ: На beta сервере используем относительный путь для избежания CORS ошибок
// На localhost фронтенд на :3000 обращается к бэку на :8000 (разные порты)
// На beta сервере оба на одном домене, поэтому используем относительный путь
const API_BASE_URL = process.env.REACT_APP_API_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:8000' : '');

/**
 * Получить список всех конфигураций с фильтрами
 * ЗАЧЕМ: Загрузка списка для отображения на странице
 */
export const getConfigurations = async ({ limit = 50, offset = 0, ticker = null, author = null, search = null } = {}) => {
  try {
    const params = new URLSearchParams();
    params.append('limit', limit);
    params.append('offset', offset);
    if (ticker) params.append('ticker', ticker);
    if (author) params.append('author', author);
    if (search) params.append('search', search);

    const response = await fetch(`${API_BASE_URL}/api/configurations?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Ошибка получения конфигураций:', error);
    throw error;
  }
};

/**
 * Получить одну конфигурацию по ID
 * ЗАЧЕМ: Загрузка конфигурации в калькулятор
 */
export const getConfiguration = async (configId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/configurations/${configId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Конфигурация не найдена');
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Ошибка получения конфигурации:', error);
    throw error;
  }
};

/**
 * Создать новую конфигурацию
 * ЗАЧЕМ: Сохранение позиции из калькулятора в БД
 */
export const createConfiguration = async (configData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/configurations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(configData),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Ошибка создания конфигурации:', error);
    throw error;
  }
};

/**
 * Обновить существующую конфигурацию
 * ЗАЧЕМ: Сохранение изменений при редактировании
 */
export const updateConfiguration = async (configId, configData, userId = null) => {
  try {
    const params = new URLSearchParams();
    if (userId) {
      params.append('user_id', userId);
    }
    const queryString = params.toString();
    const urlPath = `${API_BASE_URL}/api/configurations/${configId}${queryString ? '?' + queryString : ''}`;

    const response = await fetch(urlPath, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(configData),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 403) {
        throw new Error('Нет прав для редактирования этой конфигурации');
      }
      if (response.status === 404) {
        throw new Error('Конфигурация не найдена');
      }
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Ошибка обновления конфигурации:', error);
    throw error;
  }
};

/**
 * Удалить конфигурацию
 * ЗАЧЕМ: Удаление ненужных позиций
 */
export const deleteConfiguration = async (configId, userId = null) => {
  try {
    const params = new URLSearchParams();
    if (userId) {
      params.append('user_id', userId);
    }
    const queryString = params.toString();
    const urlPath = `${API_BASE_URL}/api/configurations/${configId}${queryString ? '?' + queryString : ''}`;

    const response = await fetch(urlPath, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 403) {
        throw new Error('Нет прав для удаления этой конфигурации');
      }
      if (response.status === 404) {
        throw new Error('Конфигурация не найдена');
      }
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Ошибка удаления конфигурации:', error);
    throw error;
  }
};

/**
 * Массовое создание конфигураций
 * ЗАЧЕМ: Миграция из localStorage в БД
 */
export const createConfigurationsBatch = async (configs) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/configurations/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(configs),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Ошибка массового создания конфигураций:', error);
    throw error;
  }
};
