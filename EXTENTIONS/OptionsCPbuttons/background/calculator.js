/**
 * ext2 Background — Calculator integration
 * ЗАЧЕМ: Управление вкладкой калькулятора и инжект позиций из tvc_positions
 */

let _pendingCalcListener = null;
let _pendingCalcTimeout = null;
let _injectionInProgress = false;
let _pendingInjection = null;

function cancelPendingCalcListener() {
  if (_pendingCalcListener) {
    chrome.tabs.onUpdated.removeListener(_pendingCalcListener);
    _pendingCalcListener = null;
  }
  if (_pendingCalcTimeout) {
    clearTimeout(_pendingCalcTimeout);
    _pendingCalcTimeout = null;
  }
}

// Re-fetch позиции из storage перед инжектом (SUPERBUG fix)
function freshFetchAndInject(tabId, stalePositions, tickerName, price, fallbackExchange) {
  if (_injectionInProgress) {
    _pendingInjection = { tabId, stalePositions, tickerName, price, fallbackExchange };
    return;
  }

  _injectionInProgress = true;
  chrome.storage.local.get(['tvc_positions', 'tvc_exchanges'], (result) => {
    try {
      const fresh = result.tvc_positions || {};
      const tickerPositions = fresh[tickerName] || [];
      // Биржа: из свежих данных storage, или fallback из сообщения
      const freshExchanges = result.tvc_exchanges || {};
      const exchange = freshExchanges[tickerName] || fallbackExchange || null;

      if (tickerPositions.length === 0 && stalePositions?.length > 0) {
        console.warn('[EXT2 BG] SUPERBUG prevented: stale data ignored');
        injectDataIntoCalculator(tabId, [], tickerName, price, exchange);
        return;
      }

      injectDataIntoCalculator(tabId, tickerPositions, tickerName, price, exchange);
    } finally {
      _injectionInProgress = false;
      if (_pendingInjection) {
        const pending = _pendingInjection;
        _pendingInjection = null;
        freshFetchAndInject(pending.tabId, pending.stalePositions, pending.tickerName, pending.price, pending.fallbackExchange);
      }
    }
  });
}

function injectDataIntoCalculator(tabId, positionsData, tickerName, price, exchange) {

  chrome.scripting.executeScript({
    target: { tabId },
    func: (positions, ticker, underlyingPrice, exchange) => {
      function convert(pos, t) {
        const shortTicker = t.replace(/20(\d{2})$/, '$1');
        return {
          id: String(Date.now() + Math.random() * 1000),
          action: pos.action || 'Buy',
          type: pos.type,
          strike: pos.strike,
          date: pos.expiration,
          quantity: pos.qty || 1,
          premium: pos.price || (pos.bid + pos.ask) / 2,
          bid: pos.bid || 0,
          ask: pos.ask || 0,
          volume: pos.volume || 0,
          oi: 0,
          visible: true,
          isLoadingDetails: false,
          ticker: shortTicker,
          entryDate: pos.addedAt ? pos.addedAt.split('T')[0] : new Date().toISOString().split('T')[0],
          lastUpdated: new Date().toISOString(),
          delta: pos.delta || 0,
          gamma: pos.gamma || 0,
          theta: pos.theta || 0,
          vega: pos.vega || 0,
          rho: pos.rho || 0,
          impliedVolatility: pos.iv || 0,
          bidIV: pos.bidIV || 0,
          askIV: pos.askIV || 0,
          intrinsicValue: pos.intrinsicValue || 0,
          timeValue: pos.timeValue || 0
        };
      }

      let calcState = localStorage.getItem('calculatorState');
      calcState = calcState ? JSON.parse(calcState) : {
        selectedTicker: ticker,
        options: [],
        positions: [],
        selectedExpirationDate: null
      };

      // Мерж: существующие опционы сохраняем как есть, новые конвертируем
      // ЗАЧЕМ: Не терять entryDate, id и другие данные уже добавленных опционов
      const existingOptions = calcState.options || [];
      // Также проверяем сохранённую конфигурацию — при загрузке config калькулятор
      // не пишет в calculatorState, поэтому existingOptions может быть пуст
      const currentConfigId = localStorage.getItem('universalCalc_loadedConfigId');
      let configOptions = [];
      if (currentConfigId && existingOptions.length === 0) {
        try {
          const configs = JSON.parse(localStorage.getItem('universalCalculatorConfigurations') || '[]');
          const cfg = configs.find(c => c.id === currentConfigId);
          if (cfg?.state?.options) configOptions = cfg.state.options;
        } catch (e) {}
      }
      // Фильтруем только по текущему тикеру — чтобы позиции других тикеров не попали в мерж
      const shortT = ticker.replace(/20(\d{2})$/, '$1');
      const allKnown = existingOptions.length > 0 ? existingOptions : configOptions;
      const knownOptions = allKnown.filter(o => !o.ticker || o.ticker === ticker || o.ticker === shortT);

      // Индекс существующих опционов по бизнес-ключу (type + strike + expiration)
      const knownByKey = {};
      knownOptions.forEach(o => { knownByKey[`${o.type}_${o.strike}_${o.date}`] = o; });

      // Мерж: начинаем с существующих опционов, добавляем новые из tvc_positions
      // ЗАЧЕМ: Не терять опционы конфигурации, даже если их нет в tvc_positions
      const mergedOptions = [...knownOptions];
      positions.forEach(p => {
        const key = `${p.type}_${p.strike}_${p.expiration}`;
        if (!knownByKey[key]) {
          mergedOptions.push(convert(p, ticker));
        }
      });

      calcState.options = mergedOptions;
      calcState.selectedTicker = ticker;
      if (mergedOptions.length > 0 && mergedOptions[0].date) {
        calcState.selectedExpirationDate = mergedOptions[0].date;
      }
      if (underlyingPrice) calcState.underlyingPrice = underlyingPrice;
      if (exchange) calcState.exchange = exchange;

      localStorage.setItem('calculatorState', JSON.stringify(calcState));

      // Триггерим событие для React вместо reload
      // ЗАЧЕМ: reload сбрасывает calculatorState — калькулятор перечитывает конфигурацию из URL
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'calculatorState',
        newValue: JSON.stringify(calcState)
      }));
    },
    args: [positionsData, tickerName, price, exchange]
  });
}

// Загрузить опционы из сохранённой конфигурации в tvc_positions
// ЗАЧЕМ: При открытии сохранённой сделки — её опционы попадают в панель ext2
function handleSyncConfigPositions(message, sendResponse) {
  const { ticker, options } = message;
  if (!ticker || !options?.length) {
    sendResponse({ success: true, added: 0 });
    return;
  }

  chrome.storage.local.get(['tvc_positions'], (result) => {
    const positions = result.tvc_positions || {};

    // Заменяем позиции для этого тикера опционами из конфигурации
    // sourceUrl — ссылка на доску опционов TradingView для навигации из панели
    const sourceUrl = `https://www.tradingview.com/options/chain/?symbol=${encodeURIComponent(ticker)}`;
    positions[ticker] = options.map(o => ({
      id: Date.now() + Math.random(),
      action: o.action || 'Buy',
      type: o.type,
      strike: o.strike,
      expiration: o.date,
      expirationISO: o.date,
      qty: o.quantity || 1,
      entry: o.premium || 0,
      bid: o.bid || 0,
      ask: o.ask || 0,
      price: o.premium || 0,
      volume: o.volume || 0,
      iv: o.impliedVolatility || 0,
      delta: o.delta || 0,
      gamma: o.gamma || 0,
      theta: o.theta || 0,
      vega: o.vega || 0,
      rho: o.rho || 0,
      addedAt: o.entryDate ? o.entryDate + 'T00:00:00.000Z' : new Date().toISOString(),
      sourceUrl: sourceUrl,
      fromConfig: true
    }));

    chrome.storage.local.set({ tvc_positions: positions }, () => {

      // Показать панель на TV с новыми позициями
      chrome.tabs.query({ url: ['https://*.tradingview.com/options/*'] }, (tvTabs) => {
        tvTabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'showPanel' }).catch(() => {});
        });
      });

      sendResponse({ success: true, added: options.length });
    });
  });
}

async function getCalculatorUrlFromConfig(shortTicker, price, exchange) {
  const result = await chrome.storage.local.get(['ext2_environment']);
  const env = result.ext2_environment || 'production';
  const base = env === 'localhost' ? 'http://localhost:3000' : 'https://beta.optioner.online';
  let url = `${base}/tools/universal-calculator`;
  if (shortTicker) url += `?contract=${encodeURIComponent(shortTicker)}`;
  if (price) url += `${shortTicker ? '&' : '?'}price=${encodeURIComponent(price)}`;
  if (exchange) url += `&exchange=${encodeURIComponent(exchange)}`;
  return url;
}

function handleOpenOptionerTab(message, sendResponse) {
  const { ticker, positions, underlyingPrice, exchange } = message;
  if (!ticker) return;

  const shortTicker = ticker.replace(/20(\d{2})$/, '$1');

  getCalculatorUrlFromConfig(shortTicker, underlyingPrice, exchange).then(calcUrl => {
    chrome.tabs.query({ url: ['https://beta.optioner.online/tools/universal-calculator*', 'http://localhost:3000/tools/universal-calculator*'] }, (tabs) => {
      cancelPendingCalcListener();

      const openAndWait = (tabId) => {
        function listener(updatedTabId, changeInfo) {
          if (updatedTabId === tabId && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            _pendingCalcListener = null;
            if (_pendingCalcTimeout) { clearTimeout(_pendingCalcTimeout); _pendingCalcTimeout = null; }
            chrome.tabs.get(tabId, (tab) => {
              if (chrome.runtime.lastError || !tab) return;
              setTimeout(() => freshFetchAndInject(tabId, positions, ticker, underlyingPrice, exchange), 500);
            });
          }
        }
        _pendingCalcListener = listener;
        chrome.tabs.onUpdated.addListener(listener);
        _pendingCalcTimeout = setTimeout(() => {
          if (_pendingCalcListener === listener) {
            chrome.tabs.onUpdated.removeListener(listener);
            _pendingCalcListener = null;
            _pendingCalcTimeout = null;
          }
        }, 30000);
      };

      if (tabs.length > 0) {
        const tabId = tabs[0].id;
        const currentUrl = tabs[0].url || '';
        console.log('[EXT2 BG] handleOpenOptionerTab: currentUrl =', currentUrl);

        // Проверяем: открыт ли калькулятор на другом тикере
        const currentContractMatch = currentUrl.match(/[?&]contract=([^&]+)/);
        const currentContract = currentContractMatch ? currentContractMatch[1] : null;
        const isSameTicker = currentContract && currentContract.toLowerCase() === shortTicker.toLowerCase();

        // Проверяем: открыта ли сохранённая конфигурация
        // Два индикатора: URL (?config= / ?dbConfig=) или localStorage (universalCalc_loadedConfigId)
        // ЗАЧЕМ: URL может быть очищен после загрузки, но loadedConfigId в localStorage остаётся
        const hasConfigInUrl = /[?&](?:config|dbConfig)=/.test(currentUrl);

        if (hasConfigInUrl || !isSameTicker) {
          // Проверяем localStorage — есть ли загруженная конфигурация
          chrome.scripting.executeScript({
            target: { tabId },
            func: () => localStorage.getItem('universalCalc_loadedConfigId')
          }).then(results => {
            const loadedConfigId = results?.[0]?.result;
            console.log('[EXT2 BG] loadedConfigId =', loadedConfigId, 'hasConfigInUrl =', hasConfigInUrl);

            if (loadedConfigId || hasConfigInUrl) {
              // Конфигурация загружена — НЕ перезагружаем, инжектим поверх через StorageEvent
              // ЗАЧЕМ: React калькулятор сам добавит новые опционы к конфигурации
              chrome.tabs.update(tabId, { active: true }, () => {
                if (chrome.runtime.lastError) return;
                freshFetchAndInject(tabId, positions, ticker, underlyingPrice, exchange);
              });
            } else {
              // Нет конфигурации, другой тикер — обновляем URL и ждём загрузки
              chrome.tabs.update(tabId, { active: true, url: calcUrl }, () => {
                if (chrome.runtime.lastError) return;
                openAndWait(tabId);
              });
            }
          }).catch(() => {
            // Если не удалось прочитать localStorage — fallback на проверку URL
            if (hasConfigInUrl) {
              chrome.tabs.update(tabId, { active: true }, () => {
                if (chrome.runtime.lastError) return;
                freshFetchAndInject(tabId, positions, ticker, underlyingPrice, exchange);
              });
            } else {
              chrome.tabs.update(tabId, { active: true, url: calcUrl }, () => {
                if (chrome.runtime.lastError) return;
                openAndWait(tabId);
              });
            }
          });
        } else {
          // Тот же тикер — просто активируем вкладку и инжектим данные
          chrome.tabs.update(tabId, { active: true }, () => {
            if (chrome.runtime.lastError) return;
            freshFetchAndInject(tabId, positions, ticker, underlyingPrice, exchange);
          });
        }
      } else {
        chrome.tabs.create({ url: calcUrl, active: true }, (tab) => {
          if (!chrome.runtime.lastError && tab) openAndWait(tab.id);
        });
      }
    });
  });
}

function handleOpenOptionerTabNew(message, sendResponse) {
  const { ticker, positions, underlyingPrice, exchange } = message;
  if (!ticker) return;

  const shortTicker = ticker.replace(/20(\d{2})$/, '$1');

  getCalculatorUrlFromConfig(shortTicker, underlyingPrice, exchange).then(calcUrl => {
    cancelPendingCalcListener();
    chrome.tabs.create({ url: calcUrl, active: true }, (tab) => {
      if (chrome.runtime.lastError || !tab) return;
      const tabId = tab.id;

      function listener(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          _pendingCalcListener = null;
          if (_pendingCalcTimeout) { clearTimeout(_pendingCalcTimeout); _pendingCalcTimeout = null; }
          chrome.tabs.get(tabId, (t) => {
            if (chrome.runtime.lastError || !t) return;
            setTimeout(() => freshFetchAndInject(tabId, positions, ticker, underlyingPrice, exchange), 1000);
          });
        }
      }
      _pendingCalcListener = listener;
      chrome.tabs.onUpdated.addListener(listener);
      _pendingCalcTimeout = setTimeout(() => {
        if (_pendingCalcListener === listener) {
          chrome.tabs.onUpdated.removeListener(listener);
          _pendingCalcListener = null;
          _pendingCalcTimeout = null;
        }
      }, 30000);
    });
  });
}

