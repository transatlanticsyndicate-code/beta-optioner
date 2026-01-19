/**
 * TradingView Options Calculator - Background Script v8
 * ЗАЧЕМ: Синхронизация данных между вкладками, управление вкладками и сбор данных по контракту
 */

// Хранилище ожидающих запросов: { tabId: { sourceTabId, posId, ticker, strike, type, newExp } }
let pendingRequests = {};

// ============================================
// КОНФИГУРАЦИЯ СБОРА ДАННЫХ
// ============================================

const COLLECTOR_CONFIG = {
  MIN_DELAY: 2000,
  MAX_DELAY: 5000,
  PAUSE_AFTER_LOAD: 500,
  PAUSE_AFTER_LOAD_MAX: 1000,
  MAX_EXPIRATIONS: 5,      // Лимит 5 экспираций
  COOLDOWN: 30000,         // Cooldown 30 сек
  PAGE_TIMEOUT: 60000,
  MAX_CONSECUTIVE_ERRORS: 3
};

// Состояние сбора
let isCollecting = false;
let collectionAborted = false;
let lastCollectionTime = 0;

// ============================================
// УТИЛИТЫ СБОРА
// ============================================

function getRandomDelay() {
  return COLLECTOR_CONFIG.MIN_DELAY + Math.random() * (COLLECTOR_CONFIG.MAX_DELAY - COLLECTOR_CONFIG.MIN_DELAY);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Ожидание загрузки страницы
async function waitForPageLoad(tabId, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let resolved = false;
    
    // Слушаем событие завершения загрузки
    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        // Страница загружена, теперь ждём таблицу
        checkTableReady();
      }
    };
    
    chrome.tabs.onUpdated.addListener(onUpdated);
    
    // Проверяем готовность таблицы
    const checkTableReady = () => {
      if (resolved) return;
      
      if (Date.now() - startTime > timeout) {
        cleanup();
        reject(new Error('Таймаут загрузки страницы'));
        return;
      }
      
      chrome.tabs.sendMessage(tabId, { action: 'isPageReady' }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script ещё не загружен, ждём
          setTimeout(checkTableReady, 500);
          return;
        }
        
        if (response?.ready) {
          cleanup();
          resolve();
        } else {
          setTimeout(checkTableReady, 500);
        }
      });
    };
    
    const cleanup = () => {
      resolved = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
    
    // Начинаем проверку через 1 сек (даём время на навигацию)
    setTimeout(checkTableReady, 1000);
  });
}

// Отправить прогресс в popup
function sendProgress(progress, text) {
  chrome.runtime.sendMessage({ action: 'collectionProgress', progress, text }).catch(() => {});
}

// Отправить результат в popup
function sendComplete(success, options = 0, error = '') {
  chrome.runtime.sendMessage({ action: 'collectionComplete', success, options, error }).catch(() => {});
}

// ============================================
// СБОР ДАННЫХ ПО ВСЕМ ЭКСПИРАЦИЯМ
// ============================================

async function startDataCollection(tabId, callerTabId = null) {
  // Проверка cooldown
  const now = Date.now();
  if (now - lastCollectionTime < COLLECTOR_CONFIG.COOLDOWN) {
    const waitSec = Math.ceil((COLLECTOR_CONFIG.COOLDOWN - (now - lastCollectionTime)) / 1000);
    return { success: false, error: `Подождите ${waitSec} сек перед следующим сбором` };
  }
  
  if (isCollecting) {
    return { success: false, error: 'Сбор уже выполняется' };
  }
  
  isCollecting = true;
  collectionAborted = false;
  lastCollectionTime = now;
  
  // Функция для обновления статуса калькулятора
  const updateCalcStatus = (status, progress, currentExp, error = null, stats = {}) => {
    if (callerTabId) {
      updateStatus(callerTabId, status, progress, currentExp, error, stats);
    }
  };
  
  const startTime = Date.now();
  let totalOptions = 0;
  let consecutiveErrors = 0;
  const collectedData = {
    ticker: null,
    collectedAt: new Date().toISOString(),
    underlyingPrice: 0,
    expirations: []
  };
  
  try {
    // Показываем overlay на странице
    await chrome.tabs.sendMessage(tabId, { 
      action: 'showCollectorOverlay', 
      message: 'Получение списка экспираций...',
      progress: 0
    });
    
    // Получаем список экспираций с текущей страницы
    // Сначала парсим текущую страницу
    sendProgress(5, 'Парсинг текущей страницы...');
    
    const currentPageResult = await chrome.tabs.sendMessage(tabId, { action: 'parseCurrentPage' });
    
    if (currentPageResult?.success && currentPageResult.options?.length > 0) {
      collectedData.expirations.push({
        date: currentPageResult.expiration,
        options: currentPageResult.options
      });
      totalOptions += currentPageResult.options.length;
      
      // Получаем тикер из URL
      const tab = await chrome.tabs.get(tabId);
      const tickerMatch = tab.url?.match(/options\/chain\/[^-]+-([A-Z0-9]+)/);
      if (tickerMatch) {
        collectedData.ticker = tickerMatch[1];
      }
    }
    
    // Получаем URL для навигации по экспирациям
    const tab = await chrome.tabs.get(tabId);
    const baseUrl = tab.url?.split('?')[0];
    const seriesMatch = tab.url?.match(/series=([^&]+)/);
    
    if (!baseUrl || !seriesMatch) {
      throw new Error('Не удалось определить URL для навигации');
    }
    
    // Парсим текущую серию для получения формата
    // Формат: CME_MINI:ESH2026;ES;20260115
    const currentSeries = decodeURIComponent(seriesMatch[1]);
    const seriesParts = currentSeries.split(';');
    
    if (seriesParts.length < 3) {
      throw new Error('Неверный формат серии в URL');
    }
    
    const seriesPrefix = seriesParts.slice(0, 2).join(';'); // CME_MINI:ESH2026;ES
    
    // Получаем список доступных экспираций из DOM
    sendProgress(10, 'Анализ доступных экспираций...');
    console.log('[TVC Collector BG] Запрашиваем экспирации...');
    
    const expResult = await chrome.tabs.sendMessage(tabId, { action: 'getExpirations' });
    console.log('[TVC Collector BG] Результат getExpirations:', expResult);
    let expirations = expResult?.expirations || [];
    
    console.log('[TVC Collector BG] Найдено экспираций:', expirations.length);
    
    // Применяем лимит
    if (expirations.length > COLLECTOR_CONFIG.MAX_EXPIRATIONS) {
      console.log('[TVC Collector] Применяем лимит:', COLLECTOR_CONFIG.MAX_EXPIRATIONS);
      expirations = expirations.slice(0, COLLECTOR_CONFIG.MAX_EXPIRATIONS);
    }
    
    // Фильтруем текущую экспирацию (уже собрали)
    const currentDateCode = seriesParts[2]; // 20260115
    expirations = expirations.filter(e => e.dateCode !== currentDateCode);
    
    console.log('[TVC Collector] Экспираций для обхода:', expirations.length);
    
    // Случайный порядок (50% шанс)
    if (Math.random() > 0.5 && expirations.length > 1) {
      expirations = [...expirations].sort(() => Math.random() - 0.5);
      console.log('[TVC Collector] Порядок перемешан');
    }
    
    // Обходим экспирации
    const totalExpirations = expirations.length + 1; // +1 за текущую
    
    for (let i = 0; i < expirations.length; i++) {
      const exp = expirations[i];
      const progress = Math.round(((i + 2) / (totalExpirations + 1)) * 100);
      
      // Обновляем прогресс
      sendProgress(progress, `Экспирация ${i + 2}/${totalExpirations}: ${exp.displayDate}`);
      await chrome.tabs.sendMessage(tabId, { 
        action: 'updateOverlay', 
        message: `Экспирация ${i + 2}/${totalExpirations}: ${exp.displayDate}`,
        progress
      }).catch(() => {});
      
      // Обновляем статус для калькулятора
      updateCalcStatus('collecting', progress, exp.displayDate, null, {
        totalExpirations,
        collectedExpirations: i + 1,
        totalOptions
      });
      
      // Рандомная задержка перед переходом (2-5 сек)
      const delayMs = getRandomDelay();
      console.log('[TVC Collector] Задержка:', Math.round(delayMs/1000), 'сек');
      await delay(delayMs);
      
      // Формируем URL для экспирации
      const newSeries = `${seriesPrefix};${exp.dateCode}`;
      const newUrl = `${baseUrl}?series=${encodeURIComponent(newSeries)}`;
      
      console.log('[TVC Collector] Переход на:', newUrl);
      
      // Переходим на страницу
      await chrome.tabs.update(tabId, { url: newUrl });
      
      // Ждём загрузки страницы
      try {
        await waitForPageLoad(tabId, COLLECTOR_CONFIG.PAGE_TIMEOUT);
        consecutiveErrors = 0;
      } catch (loadError) {
        console.error('[TVC Collector] Ошибка загрузки:', loadError);
        consecutiveErrors++;
        
        if (consecutiveErrors >= COLLECTOR_CONFIG.MAX_CONSECUTIVE_ERRORS) {
          throw new Error(`Сбор прерван: ${consecutiveErrors} ошибок подряд`);
        }
        continue; // Пропускаем эту экспирацию
      }
      
      // Парсим страницу
      const pageResult = await chrome.tabs.sendMessage(tabId, { action: 'parseCurrentPage' });
      
      if (pageResult?.success && pageResult.options?.length > 0) {
        collectedData.expirations.push({
          date: pageResult.expiration,
          dateCode: exp.dateCode,
          options: pageResult.options
        });
        totalOptions += pageResult.options.length;
        console.log('[TVC Collector] Собрано:', pageResult.options.length, 'опционов для', exp.displayDate);
      }
    }
    
    sendProgress(100, 'Сбор завершён');
    
    // Сохраняем данные
    if (collectedData.expirations.length > 0) {
      await chrome.storage.local.set({ tvc_full_chain: collectedData });
      console.log('[TVC Collector] Сохранено:', totalOptions, 'опционов');
    }
    
    // Показываем результат
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    await chrome.tabs.sendMessage(tabId, { 
      action: 'showCollectorResult',
      success: true,
      message: `Собрано ${totalOptions} опционов`,
      stats: {
        expirations: collectedData.expirations.length,
        options: totalOptions,
        time: elapsed
      }
    });
    
    sendComplete(true, totalOptions);
    
    // Обновляем статус для калькулятора — завершено
    updateCalcStatus('completed', 100, null, null, {
      totalExpirations: collectedData.expirations.length,
      collectedExpirations: collectedData.expirations.length,
      totalOptions
    });
    
  } catch (error) {
    console.error('[TVC Collector] Ошибка:', error);
    
    await chrome.tabs.sendMessage(tabId, { 
      action: 'showCollectorResult',
      success: false,
      message: error.message || 'Неизвестная ошибка'
    }).catch(() => {});
    
    sendComplete(false, totalOptions, error.message);
    
    // Обновляем статус для калькулятора — ошибка
    updateCalcStatus('error', 0, null, error.message, { totalOptions });
    
  } finally {
    isCollecting = false;
  }
  
  return { success: true };
}

// ============================================
// ОБРАБОТКА КОМАНДЫ ОТ КАЛЬКУЛЯТОРА
// ============================================

/**
 * Обработка команды collectFullChain от калькулятора
 * Открывает TradingView и запускает сбор данных
 */
async function handleCollectFullChain(command, callerTabId) {
  const { ticker, maxExpirations, timestamp } = command;
  
  console.log('[TVC] handleCollectFullChain:', { ticker, maxExpirations, callerTabId });
  
  if (!ticker) {
    return { success: false, error: 'Не указан тикер' };
  }
  
  // Проверяем cooldown
  const now = Date.now();
  if (now - lastCollectionTime < COLLECTOR_CONFIG.COOLDOWN) {
    const remaining = Math.ceil((COLLECTOR_CONFIG.COOLDOWN - (now - lastCollectionTime)) / 1000);
    updateStatus(callerTabId, 'error', 0, null, `Подождите ${remaining} сек`);
    return { success: false, error: `Cooldown: подождите ${remaining} сек` };
  }
  
  if (isCollecting) {
    return { success: false, error: 'Сбор уже выполняется' };
  }
  
  // Обновляем статус
  updateStatus(callerTabId, 'collecting', 0, null, 'Открытие TradingView...');
  
  // Формируем URL TradingView
  // Формат тикера: ESM2026 → CME_MINI-ESM2026
  const tvUrl = `https://www.tradingview.com/options/chain/CME_MINI-${ticker}/`;
  
  console.log('[TVC] Открываем TradingView:', tvUrl);
  
  try {
    // Открываем вкладку TradingView
    const tab = await chrome.tabs.create({ url: tvUrl, active: true });
    
    // Ждём загрузки страницы
    await waitForPageLoad(tab.id, COLLECTOR_CONFIG.PAGE_TIMEOUT);
    
    // Дополнительная пауза для загрузки таблицы
    await delay(2000);
    
    // Применяем лимит экспираций из команды
    const originalLimit = COLLECTOR_CONFIG.MAX_EXPIRATIONS;
    if (maxExpirations && maxExpirations > 0 && maxExpirations <= 20) {
      COLLECTOR_CONFIG.MAX_EXPIRATIONS = maxExpirations;
    }
    
    // Запускаем сбор данных
    const result = await startDataCollection(tab.id, callerTabId);
    
    // Восстанавливаем лимит
    COLLECTOR_CONFIG.MAX_EXPIRATIONS = originalLimit;
    
    return result;
    
  } catch (error) {
    console.error('[TVC] Ошибка handleCollectFullChain:', error);
    updateStatus(callerTabId, 'error', 0, null, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Обновить статус сбора в localStorage калькулятора
 */
function updateStatus(callerTabId, status, progress, currentExpiration, error = null, stats = {}) {
  const statusData = {
    status,
    progress,
    currentExpiration,
    totalExpirations: stats.totalExpirations || 0,
    collectedExpirations: stats.collectedExpirations || 0,
    totalOptions: stats.totalOptions || 0,
    error,
    timestamp: Date.now()
  };
  
  // Отправляем статус в калькулятор через content script
  if (callerTabId) {
    chrome.tabs.sendMessage(callerTabId, {
      action: 'updateTVCStatus',
      status: statusData
    }).catch(() => {
      // Вкладка калькулятора могла быть закрыта
      console.log('[TVC] Не удалось отправить статус в калькулятор');
    });
  }
}

// При установке extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('[TVC] Extension установлен');
});

// Слушаем сообщения
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Команда от калькулятора: собрать полную цепочку опционов
  if (message.action === 'collectFullChain') {
    console.log('[TVC] Получена команда collectFullChain:', message);
    handleCollectFullChain(message, sender.tab?.id).then(sendResponse);
    return true;
  }
  
  // Запуск сбора данных (из popup)
  if (message.action === 'startDataCollection') {
    startDataCollection(message.tabId).then(sendResponse);
    return true; // Асинхронный ответ
  }
  
  if (message.type === 'GET_POSITIONS') {
    chrome.storage.local.get(['tvc_positions'], (result) => {
      sendResponse(result.tvc_positions || {});
    });
    return true;
  }
  
  // Открыть pinned вкладку для загрузки данных другой экспирации
  if (message.action === 'openPinnedTab') {
    const { url, expiration, ticker, strike, type, posId } = message;
    const sourceTabId = sender.tab?.id;
    
    // Создаём новую вкладку
    chrome.tabs.create({ 
      url: url,
      pinned: true,
      active: false
    }, (tab) => {
      console.log('[TVC] Открыта pinned вкладка', tab.id, 'для', expiration);
      
      // Сохраняем запрос для этой вкладки
      pendingRequests[tab.id] = {
        sourceTabId,
        posId,
        ticker,
        strike,
        type,
        newExp: expiration
      };
      
      sendResponse({ success: true, tabId: tab.id });
    });
    
    return true;
  }
  
  // Pinned вкладка загрузилась и отправляет данные
  if (message.action === 'pinnedTabData') {
    const pinnedTabId = sender.tab?.id;
    const request = pendingRequests[pinnedTabId];
    
    if (request) {
      console.log('[TVC] Получены данные от pinned вкладки', pinnedTabId);
      
      // Отправляем данные в исходную вкладку
      chrome.tabs.sendMessage(request.sourceTabId, {
        action: 'updatePositionData',
        posId: request.posId,
        ticker: request.ticker,
        strike: request.strike,
        type: request.type,
        newExp: request.newExp,
        data: message.data
      });
      
      // Удаляем запрос
      delete pendingRequests[pinnedTabId];
      
      // Закрываем pinned вкладку
      chrome.tabs.remove(pinnedTabId);
    }
    
    return true;
  }
  
  // Открыть вкладку optioner.online с калькулятором и инжектить данные
  if (message.action === 'openOptionerTab') {
    const { url, ticker, positions, underlyingPrice } = message;
    
    // Функция для инжекта данных в localStorage калькулятора
    function injectDataIntoCalculator(tabId, positionsData, tickerName, price) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (positions, ticker, underlyingPrice) => {
          // Конвертируем позиции в формат калькулятора
          function convertToCalculatorFormat(position, tickerName) {
            // Получаем короткий тикер (ESH2026 → ESH6)
            const shortTicker = tickerName.replace(/(\d{4})$/, (m) => m.slice(-1));
            
            return {
              id: String(Date.now() + Math.random() * 1000),
              action: 'Buy',
              type: position.type,
              strike: position.strike,
              date: position.expirationISO || position.expiration,
              quantity: position.qty || 1,
              premium: position.price || (position.bid + position.ask) / 2,
              bid: position.bid || 0,
              ask: position.ask || 0,
              volume: position.volume || 0,
              oi: 0,
              visible: true,
              isLoadingDetails: false,
              ticker: shortTicker,
              lastUpdated: new Date().toISOString(),
              delta: position.delta || 0,
              gamma: position.gamma || 0,
              theta: position.theta || 0,
              vega: position.vega || 0,
              rho: position.rho || 0,
              impliedVolatility: position.iv || 0
            };
          }
          
          // Читаем текущее состояние
          let calcState = localStorage.getItem('calculatorState');
          if (calcState) {
            calcState = JSON.parse(calcState);
          } else {
            calcState = {
              selectedTicker: `CME_MINI:${ticker}`,
              options: [],
              positions: [],
              selectedExpirationDate: null
            };
          }
          
          // Конвертируем и добавляем опционы
          const newOptions = positions.map(pos => convertToCalculatorFormat(pos, ticker));
          calcState.options = newOptions;
          calcState.selectedTicker = `CME_MINI:${ticker}`;
          
          if (newOptions.length > 0 && newOptions[0].date) {
            calcState.selectedExpirationDate = newOptions[0].date;
          }
          
          // Добавляем цену underlying если есть
          if (underlyingPrice) {
            calcState.underlyingPrice = underlyingPrice;
          }
          
          // Сохраняем
          localStorage.setItem('calculatorState', JSON.stringify(calcState));
          console.log('[Optioner Bridge] ✅ Инжектировано опционов:', newOptions.length, 'цена:', underlyingPrice);
          
          // Перезагружаем страницу чтобы React прочитал новые данные
          window.location.reload();
        },
        args: [positionsData, tickerName, price]
      });
    }
    
    // Формируем короткий тикер для URL (ESH2026 -> ESH26)
    const shortTicker = ticker.replace(/20(\d{2})$/, '$1');
    
    // Пробуем сначала production, потом localhost
    const productionUrl = `https://futures.optioner.online/tools/universal-calculator?contract=${shortTicker}`;
    const localhostUrl = `http://localhost:3000/tools/universal-calculator?contract=${shortTicker}`;
    
    // Ищем существующую вкладку калькулятора (production или localhost)
    chrome.tabs.query({ url: ['http://localhost:3000/tools/universal-calculator*', 'https://futures.optioner.online/tools/universal-calculator*'] }, (tabs) => {
      // Определяем какой URL использовать
      let calculatorUrl = localhostUrl;
      if (tabs.length > 0 && tabs[0].url?.includes('futures.optioner.online')) {
        calculatorUrl = productionUrl;
      }
      if (tabs.length > 0) {
        // Используем существующую вкладку, обновляем URL с параметром
        const tabId = tabs[0].id;
        chrome.tabs.update(tabId, { url: calculatorUrl, active: true }, () => {
          console.log('[TVC] Используем существующую вкладку Optioner:', tabId, 'URL:', calculatorUrl);
          // Инжектим данные после обновления URL
          chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              setTimeout(() => {
                injectDataIntoCalculator(tabId, positions, ticker, underlyingPrice);
              }, 500);
            }
          });
        });
      } else {
        // Создаём новую вкладку с параметром контракта
        chrome.tabs.create({ url: calculatorUrl, active: true }, (tab) => {
          console.log('[TVC] Создана вкладка Optioner:', tab.id);
          
          // Ждём загрузки страницы
          chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === tab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              // Инжектим данные после загрузки
              setTimeout(() => {
                injectDataIntoCalculator(tab.id, positions, ticker, underlyingPrice);
              }, 1000); // Даём React время инициализироваться
            }
          });
        });
      }
    });
    
    return true;
  }
  
  return true;
});
