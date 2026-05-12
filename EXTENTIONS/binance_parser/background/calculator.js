/**
 * Background Module: Calculator
 * ЗАЧЕМ: Открытие калькулятора Optioner и инжект данных позиций
 */

/**
 * Проверить готовность React-приложения калькулятора
 * Возвращает true если приложение инициализировалось (есть DOM-маркер или прошло достаточно времени)
 */
function waitForCalculatorReady(tabId, callback, attempt) {
  attempt = attempt || 0;
  const maxAttempts = 20;
  const intervalMs = 300;

  if (attempt >= maxAttempts) {
    console.warn('[Background] Калькулятор не инициализировался за', maxAttempts * intervalMs, 'мс — инжектируем всё равно');
    callback();
    return;
  }

  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: () => {
      // Считаем приложение готовым если:
      // 1. document.readyState === 'complete'
      // 2. В DOM есть корневой React-элемент с дочерними узлами
      // 3. Нет признаков загрузки (спиннера)
      if (document.readyState !== 'complete') return false;
      const root = document.getElementById('root') || document.getElementById('__next') || document.querySelector('[data-reactroot]');
      if (!root || root.children.length === 0) return false;
      // Проверяем что страница не в состоянии загрузки
      const hasSpinner = document.querySelector('[class*="loading"],[class*="spinner"],[class*="Loading"],[class*="Spinner"]');
      if (hasSpinner) return false;
      return true;
    }
  }, (results) => {
    if (chrome.runtime.lastError) {
      setTimeout(() => waitForCalculatorReady(tabId, callback, attempt + 1), intervalMs);
      return;
    }
    const isReady = results && results[0] && results[0].result === true;
    if (isReady) {
      callback();
    } else {
      setTimeout(() => waitForCalculatorReady(tabId, callback, attempt + 1), intervalMs);
    }
  });
}

/**
 * Инжект данных позиций в localStorage калькулятора
 */
function injectDataIntoCalculator(tabId, positionsData, tickerName, price) {
  waitForCalculatorReady(tabId, () => {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (positions, ticker, underlyingPrice) => {
        function convertToCalculatorFormat(position, tickerName) {
          return {
            id: String(Date.now() + Math.random() * 1000),
            action: position.action || 'Buy',
            type: position.type,
            strike: position.strike,
            date: position.expirationISO || position.expiration,
            quantity: position.qty || 1,
            premium: position.price || position.bid || 0,
            bid: position.price || position.bid || 0,
            ask: position.price || position.ask || 0,
            volume: 0,
            oi: 0,
            visible: true,
            isLoadingDetails: false,
            ticker: tickerName,
            lastUpdated: new Date().toISOString(),
            delta: position.delta || 0,
            gamma: position.gamma || 0,
            theta: position.theta || 0,
            vega: position.vega || 0,
            rho: position.rho || 0,
            impliedVolatility: position.iv || 0,
            bidIV: position.bidIV || 0,
            askIV: position.askIV || 0,
            intrinsicValue: 0,
            timeValue: 0
          };
        }

        let calcState = localStorage.getItem('calculatorState');
        if (calcState) {
          calcState = JSON.parse(calcState);
        } else {
          calcState = {
            selectedTicker: ticker,
            options: [],
            positions: [],
            selectedExpirationDate: null
          };
        }

        const newOptions = positions.map(pos => convertToCalculatorFormat(pos, ticker));
        calcState.options = newOptions;
        calcState.selectedTicker = ticker;

        if (newOptions.length > 0 && newOptions[0].date) {
          calcState.selectedExpirationDate = newOptions[0].date;
        }

        if (underlyingPrice) {
          // Обновляем ОБА поля — underlyingPrice (читается хуком) и currentPrice (читается при восстановлении)
          // ЗАЧЕМ: После reload страницы инициализация читает state.currentPrice || state.underlyingPrice.
          // Если обновить только underlyingPrice, старый currentPrice от предыдущего актива (напр. BTC)
          // будет иметь приоритет и цена отобразится неверно.
          calcState.underlyingPrice = underlyingPrice;
          calcState.currentPrice = underlyingPrice;
        }

        localStorage.setItem('calculatorState', JSON.stringify(calcState));
        console.log('[Binance Bridge] ✅ Инжектировано опционов:', newOptions.length, 'цена:', underlyingPrice);

        // Уведомляем React через StorageEvent вместо reload()
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'calculatorState',
          newValue: JSON.stringify(calcState),
          storageArea: localStorage
        }));

        // Fallback: если React не среагировал на StorageEvent — перезагружаем через 1.5с
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      },
      args: [positionsData, tickerName, price]
    });
  });
}

/**
 * Получить URL калькулятора из конфига
 */
async function getCalculatorUrlFromConfig(ticker, underlyingPrice) {
  const result = await chrome.storage.local.get(['selectedEnvironment']);
  const env = result.selectedEnvironment || 'production';
  const baseUrl = env === 'localhost' ? 'http://localhost:3000' : 'https://beta.optioner.online';
  let url = `${baseUrl}/tools/universal-calculator?contract=${ticker}`;
  if (underlyingPrice) url += `&price=${underlyingPrice}`;
  return url;
}

/**
 * Открыть калькулятор и инжектить данные (использует существующую вкладку)
 */
function handleOpenOptionerTab(message, sendResponse) {
  const { ticker, positions, underlyingPrice } = message;

  getCalculatorUrlFromConfig(ticker, underlyingPrice).then(calculatorUrl => {
    chrome.tabs.query({
      url: [
        'https://beta.optioner.online/tools/universal-calculator*',
        'http://localhost:3000/tools/universal-calculator*'
      ]
    }, (tabs) => {
      if (tabs.length > 0) {
        const existingTabId = tabs[0].id;
        chrome.tabs.update(existingTabId, { url: calculatorUrl, active: true }, () => {
          if (chrome.runtime.lastError) return;

          chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
            if (updatedTabId === existingTabId && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              if (chrome.runtime.lastError) return;
              injectDataIntoCalculator(existingTabId, positions, ticker, underlyingPrice);
            }
          });
        });
      } else {
        chrome.tabs.create({ url: calculatorUrl, active: true }, (tab) => {
          if (chrome.runtime.lastError || !tab) return;
          const createdTabId = tab.id;

          chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === createdTabId && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              if (chrome.runtime.lastError) return;
              injectDataIntoCalculator(createdTabId, positions, ticker, underlyingPrice);
            }
          });
        });
      }
    });
  });
}

console.log('[Background] calculator.js загружен');
