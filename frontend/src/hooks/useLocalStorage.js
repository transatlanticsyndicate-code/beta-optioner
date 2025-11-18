import { useState, useEffect, useRef } from 'react';

/**
 * Хук для работы с localStorage с автоматическим обновлением
 * @param {string} key - ключ в localStorage
 * @param {*} initialValue - начальное значение
 * @returns {*} - текущее значение из localStorage
 */
export function useLocalStorageValue(key, initialValue) {
  const [value, setValue] = useState(initialValue);
  const lastValueRef = useRef(initialValue);

  useEffect(() => {
    // Читаем значение при монтировании компонента
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const item = window.localStorage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item);
          setValue(parsed);
          lastValueRef.current = parsed;
        }
      }
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
    }
  }, [key]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorageChange = (e) => {
      if (e.key === key) {
        try {
          const newValue = e.newValue ? JSON.parse(e.newValue) : initialValue;
          setValue(newValue);
          lastValueRef.current = newValue;
        } catch (error) {
          console.error(`Error parsing localStorage key "${key}":`, error);
        }
      }
    };

    // Проверяем изменения каждые 100ms для быстрого обновления
    const interval = setInterval(() => {
      try {
        const item = window.localStorage.getItem(key);
        const newValue = item ? JSON.parse(item) : initialValue;
        if (JSON.stringify(lastValueRef.current) !== JSON.stringify(newValue)) {
          setValue(newValue);
          lastValueRef.current = newValue;
        }
      } catch (error) {
        console.error(`Error reading localStorage key "${key}":`, error);
      }
    }, 100);

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [key, initialValue]);

  return value;
}
