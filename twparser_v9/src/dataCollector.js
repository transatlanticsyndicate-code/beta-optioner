/**
 * TradingView Options Calculator - Data Collector модуль
 * ЗАЧЕМ: Сбор всех данных по контракту со всех экспираций
 * 
 * Функционал:
 * 1. Показывает вуаль (overlay) на странице во время сбора
 * 2. Получает список всех экспираций
 * 3. Парсит все опционы на текущей странице
 * 4. Отправляет данные в background.js для навигации
 */

// ============================================
// КОНСТАНТЫ ЗАЩИТЫ ОТ БАНА
// ============================================

const COLLECTOR_CONFIG = {
  // Задержки
  MIN_DELAY: 2000,           // Минимальная задержка между переходами (мс)
  MAX_DELAY: 5000,           // Максимальная задержка между переходами (мс)
  PAUSE_AFTER_LOAD: 500,     // Минимальная пауза после загрузки (мс)
  PAUSE_AFTER_LOAD_MAX: 1000, // Максимальная пауза после загрузки (мс)
  
  // Лимиты
  MAX_EXPIRATIONS: 20,       // Максимум экспираций за один сбор
  COOLDOWN: 30000,           // Cooldown между полными сборами (мс)
  PAGE_TIMEOUT: 60000,       // Таймаут на одну экспирацию (мс)
  MAX_CONSECUTIVE_ERRORS: 3, // Максимум ошибок подряд
  
  // Скролл
  MIN_SCROLL: 100,           // Минимальный скролл (px)
  MAX_SCROLL: 400            // Максимальный скролл (px)
};

// Состояние сбора
let isCollecting = false;
let collectionAborted = false;
let consecutiveErrors = 0;
let lastCollectionTime = 0;

// ============================================
// УТИЛИТЫ ЗАЩИТЫ ОТ БАНА
// ============================================

/**
 * Рандомная задержка между переходами (2-5 сек)
 */
function getRandomDelay() {
  return COLLECTOR_CONFIG.MIN_DELAY + Math.random() * (COLLECTOR_CONFIG.MAX_DELAY - COLLECTOR_CONFIG.MIN_DELAY);
}

/**
 * Рандомная пауза после загрузки (0.5-1 сек)
 */
function getRandomPauseAfterLoad() {
  return COLLECTOR_CONFIG.PAUSE_AFTER_LOAD + Math.random() * (COLLECTOR_CONFIG.PAUSE_AFTER_LOAD_MAX - COLLECTOR_CONFIG.PAUSE_AFTER_LOAD);
}

/**
 * Случайный скролл страницы (имитация чтения)
 */
function randomScroll() {
  const scrollAmount = COLLECTOR_CONFIG.MIN_SCROLL + Math.random() * (COLLECTOR_CONFIG.MAX_SCROLL - COLLECTOR_CONFIG.MIN_SCROLL);
  window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
}

/**
 * Опционально перемешать порядок экспираций (50% шанс)
 */
function shuffleExpirations(expirations) {
  if (Math.random() > 0.5) {
    return [...expirations].sort(() => Math.random() - 0.5);
  }
  return expirations;
}

/**
 * Ожидание с возможностью отмены
 */
function delay(ms) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    // Проверяем отмену каждые 100мс
    const checkAbort = setInterval(() => {
      if (collectionAborted) {
        clearTimeout(timeout);
        clearInterval(checkAbort);
        reject(new Error('Сбор отменён пользователем'));
      }
    }, 100);
    setTimeout(() => clearInterval(checkAbort), ms);
  });
}

// ============================================
// OVERLAY (ВУАЛЬ)
// ============================================

/**
 * Показать вуаль с прогрессом
 */
function showOverlay(message, progress = null) {
  let overlay = document.getElementById('tvc-collector-overlay');
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'tvc-collector-overlay';
    overlay.innerHTML = `
      <div class="tvc-overlay-backdrop"></div>
      <div class="tvc-overlay-content">
        <div class="tvc-overlay-spinner"></div>
        <div class="tvc-overlay-title">🔄 Сбор данных...</div>
        <div class="tvc-overlay-message"></div>
        <div class="tvc-overlay-progress-container">
          <div class="tvc-overlay-progress-bar"></div>
        </div>
        <div class="tvc-overlay-warning">⚠️ Не закрывайте эту вкладку</div>
        <button class="tvc-overlay-cancel">Отмена</button>
      </div>
    `;
    
    // Стили
    const style = document.createElement('style');
    style.id = 'tvc-collector-styles';
    style.textContent = `
      #tvc-collector-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .tvc-overlay-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
      }
      .tvc-overlay-content {
        position: relative;
        background: #1e222d;
        border-radius: 12px;
        padding: 32px 48px;
        text-align: center;
        color: #d1d4dc;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        min-width: 320px;
      }
      .tvc-overlay-spinner {
        width: 48px;
        height: 48px;
        border: 4px solid #363a45;
        border-top-color: #2962ff;
        border-radius: 50%;
        animation: tvc-spin 1s linear infinite;
        margin: 0 auto 16px;
      }
      @keyframes tvc-spin {
        to { transform: rotate(360deg); }
      }
      .tvc-overlay-title {
        font-size: 18px;
        font-weight: 600;
        color: #fff;
        margin-bottom: 8px;
      }
      .tvc-overlay-message {
        font-size: 14px;
        color: #787b86;
        margin-bottom: 16px;
      }
      .tvc-overlay-progress-container {
        width: 100%;
        height: 8px;
        background: #363a45;
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 16px;
      }
      .tvc-overlay-progress-bar {
        height: 100%;
        background: linear-gradient(90deg, #2962ff, #26a69a);
        border-radius: 4px;
        transition: width 0.3s ease;
        width: 0%;
      }
      .tvc-overlay-warning {
        font-size: 12px;
        color: #f7931a;
        margin-bottom: 16px;
      }
      .tvc-overlay-cancel {
        padding: 8px 24px;
        border: none;
        border-radius: 6px;
        background: #ef5350;
        color: white;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
      }
      .tvc-overlay-cancel:hover {
        background: #ff6659;
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(overlay);
    
    // Обработчик отмены
    overlay.querySelector('.tvc-overlay-cancel').onclick = () => {
      collectionAborted = true;
    };
  }
  
  // Обновляем сообщение
  overlay.querySelector('.tvc-overlay-message').textContent = message;
  
  // Обновляем прогресс
  if (progress !== null) {
    overlay.querySelector('.tvc-overlay-progress-bar').style.width = `${progress}%`;
  }
}

/**
 * Скрыть вуаль
 */
function hideOverlay() {
  const overlay = document.getElementById('tvc-collector-overlay');
  if (overlay) {
    overlay.remove();
  }
  const style = document.getElementById('tvc-collector-styles');
  if (style) {
    style.remove();
  }
}

/**
 * Показать результат сбора
 */
function showCollectionResult(success, message, stats = {}) {
  const overlay = document.getElementById('tvc-collector-overlay');
  if (!overlay) return;
  
  const content = overlay.querySelector('.tvc-overlay-content');
  const icon = success ? '✅' : '⚠️';
  const title = success ? 'Сбор завершён!' : 'Сбор прерван';
  
  content.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 16px;">${icon}</div>
    <div class="tvc-overlay-title">${title}</div>
    <div class="tvc-overlay-message">${message}</div>
    ${stats.expirations ? `
      <div style="font-size: 14px; color: #787b86; margin-bottom: 16px;">
        Экспираций: ${stats.expirations} | Опционов: ${stats.options}
        ${stats.time ? ` | Время: ${stats.time} сек` : ''}
      </div>
    ` : ''}
    <button class="tvc-overlay-cancel" style="background: #2962ff;">Закрыть</button>
  `;
  
  content.querySelector('.tvc-overlay-cancel').onclick = hideOverlay;
  
  // Автоматически закрываем через 5 секунд
  setTimeout(hideOverlay, 5000);
}

// ============================================
// ПОЛУЧЕНИЕ СПИСКА ЭКСПИРАЦИЙ
// ============================================

/**
 * Получить все доступные экспирации из dropdown TradingView
 */
function getAvailableExpirations() {
  const expirations = [];
  
  // Ищем кнопки с датами в календаре экспираций
  // TradingView использует кнопки с title в формате "Jan 20, 2026 (4) ESH26 E3B"
  const buttons = document.querySelectorAll('button[title]');
  console.log('[TVC Collector] Всего кнопок с title:', buttons.length);
  
  // Логируем первые 5 title для отладки
  let logged = 0;
  for (const btn of buttons) {
    const title = btn.getAttribute('title');
    if (!title) continue;
    
    if (logged < 5) {
      console.log('[TVC Collector] Кнопка title:', title);
      logged++;
    }
    
    // Парсим формат: "Jan 20, 2026 (4) ESH26 E3B"
    const match = title.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})/);
    if (match) {
      const month = match[1];
      const day = match[2];
      const year = match[3];
      
      // Формируем дату в формате YYYYMMDD для URL
      const months = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
        'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
        'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
      };
      
      const dateCode = `${year}${months[month]}${day.padStart(2, '0')}`;
      const displayDate = `${month} ${day}`;
      
      // Проверяем что такой даты ещё нет
      if (!expirations.find(e => e.dateCode === dateCode)) {
        expirations.push({
          dateCode,
          displayDate,
          year,
          month,
          day,
          button: btn
        });
      }
    }
  }
  
  console.log('[TVC Collector] Найдено экспираций:', expirations.length);
  return expirations;
}

// ============================================
// ПАРСИНГ ВСЕХ ОПЦИОНОВ НА СТРАНИЦЕ
// ============================================

/**
 * Парсит все опционы на текущей странице
 */
function parseAllOptionsOnPage() {
  const options = [];
  const ticker = getTickerFromUrl();
  const expiration = getCurrentExpiration();
  const columnMap = parseTableHeaders();
  
  console.log('[TVC Collector] Парсинг страницы:', { ticker, expiration, hasColumnMap: !!columnMap });
  
  if (!ticker || !columnMap) {
    console.log('[TVC Collector] Не удалось получить тикер или карту колонок');
    return options;
  }
  
  const rows = document.querySelectorAll('tr, [role="row"]');
  console.log('[TVC Collector] Найдено строк:', rows.length);
  
  let rowsWithStrike = 0;
  let rowsChecked = 0;
  
  for (const row of rows) {
    const cells = row.querySelectorAll('td, [role="cell"]');
    if (cells.length < 10) continue;
    
    rowsChecked++;
    
    // Логируем первую строку для отладки
    if (rowsChecked === 1) {
      const cellTexts = Array.from(cells).map((c, i) => `[${i}]=${c.textContent?.trim().substring(0, 10)}`);
      console.log('[TVC Collector] Первая строка ячеек:', cellTexts.join(' | '));
    }
    
    // Ищем ячейку со страйком
    // Структура: ячейка [13] содержит "+C6,9506,9" — это кнопки +C и страйк 6950
    let strikeCell = null;
    let strike = null;
    let strikeIndex = columnMap.strikeIndex;
    
    // Ищем ячейку с кнопкой +C (это ячейка со страйком)
    // Текст выглядит как "+C6,9506,9" — нужно извлечь 6950
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const text = cell.textContent?.trim();
      
      // Ищем паттерн "+C" в начале (кнопки +C и +P)
      if (text && (text.startsWith('+C') || text.includes('+C'))) {
        // Извлекаем страйк — это число после +C, формат: +C6,9506,9 → 6950
        // Ищем кнопку внутри ячейки с числом
        const buttons = cell.querySelectorAll('button');
        for (const btn of buttons) {
          const btnText = btn.textContent?.trim().replace(/,/g, '');
          const num = parseFloat(btnText);
          if (num > 1000 && num < 100000) {
            strike = num;
            strikeCell = cell;
            strikeIndex = i;
            break;
          }
        }
        if (strike) break;
        
        // Fallback: парсим из текста ячейки
        // Формат: +C6,9506,950+P → ищем 4-значное число
        const match = text.match(/(\d{1,2},?\d{3})/);
        if (match) {
          strike = parseFloat(match[1].replace(/,/g, ''));
          strikeCell = cell;
          strikeIndex = i;
          break;
        }
      }
    }
    
    if (rowsChecked === 1) {
      console.log('[TVC Collector] Страйк найден:', { strikeIndex, strike });
    }
    
    if (!strike || !strikeCell || isNaN(strike)) continue;
    
    rowsWithStrike++;
    // Если strikeIndex не был определён из columnMap, вычисляем его
    if (strikeIndex === undefined) {
      strikeIndex = Array.from(cells).indexOf(strikeCell);
    }
    const { callData, callGreeks, putData, putGreeks } = parseOptionRow(cells, strikeIndex, columnMap);
    
    // Логируем первые несколько строк для отладки
    if (rowsWithStrike <= 3) {
      console.log('[TVC Collector] Строка', rowsWithStrike, ':', { strike, callData, putData });
    }
    
    // Добавляем Call (убираем условие bid/ask > 0, добавляем все)
    if (callData.bid >= 0 || callData.ask >= 0 || callData.price >= 0) {
      options.push({
        type: 'CALL',
        strike,
        expiration,
        expirationISO: convertExpDateToISO(expiration),
        bid: callData.bid,
        ask: callData.ask,
        price: callData.price,
        volume: callData.volume,
        iv: callData.iv,
        delta: callGreeks.delta,
        gamma: callGreeks.gamma,
        theta: callGreeks.theta,
        vega: callGreeks.vega,
        rho: callGreeks.rho
      });
    }
    
    // Добавляем Put (убираем условие bid/ask > 0, добавляем все)
    if (putData.bid >= 0 || putData.ask >= 0 || putData.price >= 0) {
      options.push({
        type: 'PUT',
        strike,
        expiration,
        expirationISO: convertExpDateToISO(expiration),
        bid: putData.bid,
        ask: putData.ask,
        price: putData.price,
        volume: putData.volume,
        iv: putData.iv,
        delta: putGreeks.delta,
        gamma: putGreeks.gamma,
        theta: putGreeks.theta,
        vega: putGreeks.vega,
        rho: putGreeks.rho
      });
    }
  }
  
  console.log('[TVC Collector] Распарсено опционов:', options.length);
  return options;
}

// ============================================
// ПРОВЕРКА ГОТОВНОСТИ СТРАНИЦЫ
// ============================================

/**
 * Проверяет загрузилась ли таблица опционов
 */
function isPageReady() {
  const table = document.querySelector('table, [role="table"]');
  const rows = document.querySelectorAll('tr, [role="row"]');
  return table && rows.length > 5;
}

// ============================================
// ОБРАБОТКА СООБЩЕНИЙ ОТ BACKGROUND
// ============================================

// Слушаем сообщения от background.js
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Проверка готовности страницы
    if (message.action === 'isPageReady') {
      sendResponse({ ready: isPageReady() });
      return true;
    }
    
    // Запрос на парсинг текущей страницы
    if (message.action === 'parseCurrentPage') {
      // Случайный скролл перед парсингом
      randomScroll();
      
      // Пауза после загрузки
      setTimeout(() => {
        const options = parseAllOptionsOnPage();
        const expiration = getCurrentExpiration();
        sendResponse({ 
          success: true, 
          options, 
          expiration,
          count: options.length 
        });
      }, getRandomPauseAfterLoad());
      
      return true; // Асинхронный ответ
    }
    
    // Показать overlay
    if (message.action === 'showCollectorOverlay') {
      showOverlay(message.message, message.progress);
      sendResponse({ success: true });
      return true;
    }
    
    // Скрыть overlay
    if (message.action === 'hideCollectorOverlay') {
      hideOverlay();
      sendResponse({ success: true });
      return true;
    }
    
    // Показать результат
    if (message.action === 'showCollectorResult') {
      showCollectionResult(message.success, message.message, message.stats);
      sendResponse({ success: true });
      return true;
    }
    
    // Получить список экспираций
    if (message.action === 'getExpirations') {
      console.log('[TVC Collector] Получен запрос getExpirations');
      const expirations = getAvailableExpirations();
      console.log('[TVC Collector] Отправляем экспираций:', expirations.length, expirations);
      sendResponse({ success: true, expirations });
      return true;
    }
    
    // Обновить overlay
    if (message.action === 'updateOverlay') {
      showOverlay(message.message, message.progress);
      sendResponse({ success: true });
      return true;
    }
    
    return true;
  });
}

console.log('[TVC] dataCollector.js загружен');
