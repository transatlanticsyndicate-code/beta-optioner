/**
 * Менеджер кэша для загруженных данных
 * Поддерживает TTL (Time To Live) для каждого кэша
 */

class CacheManager {
  constructor() {
    this.cache = new Map();
    this.storageKey = 'optioner_cache';
    this.loadFromStorage();
  }

  /**
   * Загрузить кэш из localStorage
   */
  loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        Object.entries(data).forEach(([key, value]) => {
          this.cache.set(key, value);
        });
        console.log(`📦 Loaded ${this.cache.size} items from localStorage cache`);
      }
    } catch (error) {
      console.error('Error loading cache from storage:', error);
    }
  }

  /**
   * Сохранить кэш в localStorage
   */
  saveToStorage() {
    try {
      const data = {};
      this.cache.forEach((value, key) => {
        data[key] = value;
      });
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving cache to storage:', error);
    }
  }

  /**
   * Получить данные из кэша
   * @param {string} key - ключ кэша
   * @param {number} ttlMinutes - время жизни кэша в минутах (0 = не кэшировать)
   * @returns {any|null} - данные из кэша или null если кэш истек/не существует
   */
  get(key, ttlMinutes = 0) {
    if (ttlMinutes === 0) {
      return null; // Кэширование отключено
    }

    if (!this.cache.has(key)) {
      return null;
    }

    const { data, timestamp } = this.cache.get(key);
    const now = Date.now();
    const ageMinutes = (now - timestamp) / (1000 * 60);

    if (ageMinutes > ttlMinutes) {
      // Кэш истек
      this.cache.delete(key);
      return null;
    }

    console.log(`✅ Cache hit for "${key}" (age: ${ageMinutes.toFixed(1)}min, TTL: ${ttlMinutes}min)`);
    return data;
  }

  /**
   * Сохранить данные в кэш
   * @param {string} key - ключ кэша
   * @param {any} data - данные для сохранения
   */
  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    console.log(`💾 Cached "${key}"`);
    // Сохраняем в localStorage
    this.saveToStorage();
  }

  /**
   * Очистить кэш для конкретного ключа
   * @param {string} key - ключ кэша
   */
  clear(key) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
      console.log(`🗑️ Cleared cache for "${key}"`);
      this.saveToStorage();
    }
  }

  /**
   * Очистить весь кэш
   */
  clearAll() {
    this.cache.clear();
    console.log(`🗑️ Cleared all cache`);
    this.saveToStorage();
  }

  /**
   * Получить статистику кэша
   */
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Глобальный экземпляр кэша
export const cacheManager = new CacheManager();

export default cacheManager;
