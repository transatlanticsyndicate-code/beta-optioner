import { useEffect, useState } from 'react';

/**
 * Hook для регистрации и управления Service Worker
 */
export function useServiceWorker() {
  const [isRegistered, setIsRegistered] = useState(false);
  const [registration, setRegistration] = useState(null);

  useEffect(() => {
    // Проверяем поддержку Service Worker
    if (!('serviceWorker' in navigator)) {
      console.log('Service Worker не поддерживается');
      return;
    }

    // Регистрируем Service Worker
    const registerServiceWorker = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/options-cache-sw.js', {
          scope: '/'
        });

        console.log('✅ Service Worker зарегистрирован:', reg.scope);
        setRegistration(reg);
        setIsRegistered(true);

        // Обработка обновлений
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          console.log('🔄 Найдено обновление Service Worker');

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('✅ Новая версия Service Worker установлена');
              // Можно показать уведомление пользователю о необходимости обновить страницу
            }
          });
        });
      } catch (error) {
        console.error('❌ Ошибка регистрации Service Worker:', error);
      }
    };

    registerServiceWorker();

    // Cleanup
    return () => {
      // Service Worker остается активным даже после unmount
    };
  }, []);

  // Функция для очистки кэша
  const clearCache = async () => {
    if (!registration) {
      console.warn('Service Worker не зарегистрирован');
      return false;
    }

    try {
      const messageChannel = new MessageChannel();
      
      return new Promise((resolve) => {
        messageChannel.port1.onmessage = (event) => {
          if (event.data.success) {
            console.log('✅ Кэш очищен');
            resolve(true);
          } else {
            resolve(false);
          }
        };

        registration.active.postMessage(
          { type: 'CLEAR_CACHE' },
          [messageChannel.port2]
        );
      });
    } catch (error) {
      console.error('❌ Ошибка очистки кэша:', error);
      return false;
    }
  };

  // Функция для получения размера кэша
  const getCacheSize = async () => {
    if (!registration) {
      return 0;
    }

    try {
      const messageChannel = new MessageChannel();
      
      return new Promise((resolve) => {
        messageChannel.port1.onmessage = (event) => {
          if (event.data.success) {
            resolve(event.data.size);
          } else {
            resolve(0);
          }
        };

        registration.active.postMessage(
          { type: 'GET_CACHE_SIZE' },
          [messageChannel.port2]
        );
      });
    } catch (error) {
      console.error('❌ Ошибка получения размера кэша:', error);
      return 0;
    }
  };

  return {
    isRegistered,
    registration,
    clearCache,
    getCacheSize
  };
}
