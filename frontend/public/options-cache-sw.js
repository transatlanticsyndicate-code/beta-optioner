/**
 * Service Worker для кэширования опционных данных
 * Кэширует API запросы для быстрого доступа между сессиями
 */

const CACHE_NAME = 'options-calculator-cache-v1';
const API_CACHE_NAME = 'options-api-cache-v1';

// Время жизни кэша (в миллисекундах)
const CACHE_DURATION = {
  expirations: 24 * 60 * 60 * 1000, // 24 часа для дат экспирации
  options: 60 * 60 * 1000,           // 1 час для опционных цепочек
  stockPrice: 5 * 60 * 1000          // 5 минут для цен акций
};

// URL паттерны для кэширования
const API_PATTERNS = {
  expirations: /\/api\/options\/expirations/,
  optionsChain: /\/api\/options\/chain/,
  stockPrice: /\/analyze\/step1/
};

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Обработка запросов
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Кэшируем только GET запросы к API
  if (request.method !== 'GET') {
    return;
  }

  // Определяем тип запроса и стратегию кэширования
  let cacheDuration = null;
  
  if (API_PATTERNS.expirations.test(url.pathname)) {
    cacheDuration = CACHE_DURATION.expirations;
  } else if (API_PATTERNS.optionsChain.test(url.pathname)) {
    cacheDuration = CACHE_DURATION.options;
  } else if (API_PATTERNS.stockPrice.test(url.pathname)) {
    cacheDuration = CACHE_DURATION.stockPrice;
  }

  // Если это не API запрос - пропускаем
  if (!cacheDuration) {
    return;
  }

  // Стратегия: Cache First с проверкой времени жизни
  event.respondWith(
    caches.open(API_CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(request);

      if (cachedResponse) {
        // Проверяем время жизни кэша
        const cachedTime = cachedResponse.headers.get('sw-cached-time');
        if (cachedTime) {
          const age = Date.now() - parseInt(cachedTime);
          
          if (age < cacheDuration) {
            console.log('[SW] Cache hit (fresh):', url.pathname);
            return cachedResponse;
          } else {
            console.log('[SW] Cache hit (stale):', url.pathname);
            // Кэш устарел - удаляем и загружаем заново
            await cache.delete(request);
          }
        }
      }

      // Загружаем с сервера
      console.log('[SW] Fetching from network:', url.pathname);
      try {
        const response = await fetch(request);
        
        // Кэшируем только успешные ответы
        if (response.ok) {
          const responseToCache = response.clone();
          
          // Добавляем метку времени в заголовки
          const headers = new Headers(responseToCache.headers);
          headers.append('sw-cached-time', Date.now().toString());
          
          const cachedResponse = new Response(responseToCache.body, {
            status: responseToCache.status,
            statusText: responseToCache.statusText,
            headers: headers
          });
          
          cache.put(request, cachedResponse);
          console.log('[SW] Cached response:', url.pathname);
        }
        
        return response;
      } catch (error) {
        console.error('[SW] Fetch failed:', error);
        
        // Если сеть недоступна - возвращаем устаревший кэш если есть
        if (cachedResponse) {
          console.log('[SW] Returning stale cache (offline):', url.pathname);
          return cachedResponse;
        }
        
        throw error;
      }
    })
  );
});

// Сообщения от клиента
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[SW] Clearing cache...');
    event.waitUntil(
      caches.delete(API_CACHE_NAME).then(() => {
        console.log('[SW] Cache cleared');
        event.ports[0].postMessage({ success: true });
      })
    );
  }
  
  if (event.data && event.data.type === 'GET_CACHE_SIZE') {
    event.waitUntil(
      caches.open(API_CACHE_NAME).then(async (cache) => {
        const keys = await cache.keys();
        event.ports[0].postMessage({ 
          success: true, 
          size: keys.length 
        });
      })
    );
  }
});
