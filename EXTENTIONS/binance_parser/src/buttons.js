/**
 * Инжект кнопок +C/-C/+P/-P в таблицу Binance eoptions
 * ЗАЧЕМ: Добавление кнопок для быстрого добавления опционов в калькулятор
 *
 * Стратегия инжекта для Binance:
 * - Таблица содержит строки с Call (слева) и Put (справа) для каждого страйка
 * - Кнопки вставляются в ячейку со страйком (центр строки)
 * - Данные берутся из API кэша (greeksCache + tickerCache)
 */

// Кэш ticker данных (bid/ask)
let tickerCache = {};
let tickerCacheTime = 0;
const TICKER_CACHE_TTL = 5000; // 5 секунд


/**
 * Обновить кэш ticker данных
 */
async function refreshTickerCache(underlying) {
  const now = Date.now();
  if (now - tickerCacheTime < TICKER_CACHE_TTL && Object.keys(tickerCache).length > 0) {
    return tickerCache;
  }
  const fresh = await fetchTickerFromAPI(underlying);
  if (Object.keys(fresh).length > 0) {
    tickerCache = fresh;
    tickerCacheTime = now;
  }
  return tickerCache;
}

/**
 * Проверить, добавлен ли опцион в калькулятор
 */
function isOptionAdded(underlying, type, strike, expDateCode, action) {
  return isOptionInCalculator(underlying, type, strike, expDateCode, action);
}

/**
 * Обновить вид кнопки (галочка или текст)
 */
function updateButtonState(btn, isAdded) {
  if (isAdded) {
    btn.textContent = '✔';
    btn.style.background = '#6b7280';
    btn.style.color = '#fff';
    btn.title = 'Уже добавлено';
  } else {
    btn.textContent = btn.dataset.label || '+C';
    btn.style.background = '';
    btn.style.color = '';
    btn.title = btn.dataset.title || '';
  }
}

/**
 * Обновить состояние всех кнопок на странице
 */
function refreshAllButtonStates() {
  const underlying = getCurrentUnderlying();
  const expDateCode = getCurrentExpiration();

  const allButtons = document.querySelectorAll('.bnb-add-btn');
  allButtons.forEach(btn => {
    const strike = parseFloat(btn.dataset.strike);
    const type = btn.dataset.type;
    const action = btn.dataset.action;
    if (!strike || !type || !action) return;

    const isAdded = isOptionAdded(underlying, type, strike, expDateCode, action);
    updateButtonState(btn, isAdded);
  });
}

/**
 * Получить данные опциона из кэшей API
 * @param {string} underlying - BTCUSDT
 * @param {number} strike - страйк
 * @param {string} type - CALL или PUT
 * @param {string} expDateCode - YYMMDD
 */
function getOptionData(underlying, strike, type, expDateCode) {
  // Формируем символ: BTC-250117-95000-C
  const base = underlying.replace('USDT', '').replace('BUSD', '');
  const typeChar = type === 'CALL' ? 'C' : 'P';
  const symbol = `${base}-${expDateCode}-${strike}-${typeChar}`;

  const greeks = greeksCache[symbol] || {};
  const ticker = tickerCache[symbol] || {};

  const markPrice = greeks.markPrice || ticker.lastPrice || 0;

  return {
    symbol,
    bid: markPrice,
    ask: markPrice,
    markPrice,
    iv: greeks.markIV || 0,
    bidIV: greeks.bidIV || 0,
    askIV: greeks.askIV || 0,
    greeks: {
      delta: greeks.delta || 0,
      gamma: greeks.gamma || 0,
      theta: greeks.theta || 0,
      vega: greeks.vega || 0
    }
  };
}

/**
 * Инжектировать кнопки в строку таблицы
 * @param {Element} strikeCell - ячейка со страйком
 * @param {number} strike - значение страйка
 * @param {string} underlying - BTCUSDT
 * @param {string} expDateCode - YYMMDD
 */
function injectButtonsIntoRow(strikeCell, strike, underlying, expDateCode) {
  // Проверяем, не добавлены ли уже кнопки
  if (strikeCell.dataset.bnbInjected === '1') return;
  if (strikeCell.querySelector('.bnb-add-btn')) return;
  strikeCell.dataset.bnbInjected = '1';

  const buttonConfigs = [
    { label: '+C', title: 'Buy Call',  type: 'CALL', action: 'Buy',  color: '#16a34a' },
    { label: '-C', title: 'Sell Call', type: 'CALL', action: 'Sell', color: '#dc2626' },
    { label: '+P', title: 'Buy Put',   type: 'PUT',  action: 'Buy',  color: '#16a34a' },
    { label: '-P', title: 'Sell Put',  type: 'PUT',  action: 'Sell', color: '#dc2626' }
  ];

  const createdButtons = {};

  for (const cfg of buttonConfigs) {
    const btn = document.createElement('button');
    btn.className = `bnb-add-btn bnb-btn-${cfg.action.toLowerCase()}`;
    btn.textContent = cfg.label;
    btn.title = cfg.title;
    btn.dataset.label = cfg.label;
    btn.dataset.title = cfg.title;
    btn.dataset.type = cfg.type;
    btn.dataset.action = cfg.action;
    btn.dataset.strike = String(strike);

    btn.onclick = async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await handleOptionClick(btn, underlying, strike, cfg.type, cfg.action, expDateCode);
    };

    createdButtons[cfg.label] = btn;
  }

  // Настраиваем layout ячейки страйка
  strikeCell.style.setProperty('display', 'flex', 'important');
  strikeCell.style.setProperty('align-items', 'center', 'important');
  strikeCell.style.setProperty('justify-content', 'center', 'important');
  strikeCell.style.setProperty('gap', '2px', 'important');
  strikeCell.style.setProperty('flex-wrap', 'nowrap', 'important');

  // Находим текстовый элемент со страйком внутри ячейки
  const strikeText = strikeCell.firstChild;

  // Вставляем: [+C] [-C] [страйк] [+P] [-P]
  strikeCell.insertBefore(createdButtons['-C'], strikeText || null);
  strikeCell.insertBefore(createdButtons['+C'], createdButtons['-C']);

  createdButtons['-C'].style.marginRight = '6px';

  strikeCell.appendChild(createdButtons['+P']);
  strikeCell.appendChild(createdButtons['-P']);

  createdButtons['+P'].style.marginLeft = '6px';

  // Проверяем начальное состояние кнопок
  for (const cfg of buttonConfigs) {
    const isAdded = isOptionAdded(underlying, cfg.type, strike, expDateCode, cfg.action);
    if (isAdded) updateButtonState(createdButtons[cfg.label], true);
  }
}

/**
 * Обработчик клика по кнопке +C/-C/+P/-P
 */
async function handleOptionClick(btn, underlying, strike, type, action, expDateCode) {
  const label = `${action === 'Buy' ? '+' : '-'}${type === 'CALL' ? 'C' : 'P'}`;
  console.log(`[Binance] Клик ${label} | ${underlying} | Strike: ${strike} | Exp: ${expDateCode}`);

  // При клике всегда берём свежие данные — сбрасываем TTL ticker
  tickerCacheTime = 0;
  await Promise.all([
    refreshGreeksCache(underlying),
    refreshTickerCache(underlying),
    fetchUnderlyingPriceFromAPI(underlying)
  ]);

  const data = getOptionData(underlying, strike, type, expDateCode);
  const expISO = convertBinanceExpToISO(expDateCode);

  console.log(`[Binance] Данные опциона:`, data);

  // Добавляем позицию
  addPosition(
    underlying, type, strike,
    expDateCode, expISO,
    data.bid, data.ask, data.markPrice,
    data.iv, data.bidIV, data.askIV,
    data.greeks, action
  );

  // Меняем кнопку на галочку
  updateButtonState(btn, true);

  // Открываем калькулятор
  const optionData = {
    type,
    strike,
    expiration: formatExpiration(expDateCode),
    expirationISO: expISO,
    bid: data.bid,
    ask: data.ask,
    iv: data.iv,
    bidIV: data.bidIV,
    askIV: data.askIV,
    delta: data.greeks.delta,
    gamma: data.greeks.gamma,
    theta: data.greeks.theta,
    vega: data.greeks.vega,
    rho: 0
  };

  openOptionerCalculator(underlying, optionData);
}

/**
 * Открыть калькулятор Optioner с данными позиций
 * ЗАЧЕМ: Отправляем сообщение в background.js для открытия/обновления вкладки
 */
function openOptionerCalculator(underlying, optionData) {
  if (!chrome.runtime?.id) {
    console.warn('[Binance] Extension context invalidated');
    return;
  }

  const positions = bnb_positions[underlying] || [];

  chrome.runtime.sendMessage({
    action: 'openOptionerTab',
    ticker: underlying,
    positions: positions,
    underlyingPrice: getUnderlyingPrice()
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[Binance] Ошибка отправки сообщения:', chrome.runtime.lastError.message);
    }
  });
}

/**
 * Получить текущую цену базового актива
 * ЗАЧЕМ: Передаём в калькулятор для расчётов
 */
function getUnderlyingPrice() {
  // Приоритет 1: цена из API кэша (Greeks) — точная цена для текущего underlying
  const apiPrice = getCachedUnderlyingPrice();
  if (apiPrice > 0) return apiPrice;

  // Приоритет 2: DOM-селекторы на странице Binance
  const priceSelectors = [
    '[class*="price"][class*="last"]',
    '[class*="lastPrice"]',
    '[class*="indexPrice"]',
    '[data-testid*="price"]'
  ];

  for (const sel of priceSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const price = parseNumber(el.textContent);
      if (price > 0) return price;
    }
  }

  return 0;
}

/**
 * Найти DOM-элемент содержащий точно заданное число (страйк)
 * ЗАЧЕМ: API-first подход — ищем страйки по значению, не по структуре таблицы
 *
 * Binance рендерит страйки как текст в div/span/td.
 * Ищем листовые элементы (без дочерних) с точным числовым значением.
 */
function findStrikeCellByValue(strike) {
  const strikeStr = String(strike);
  // Форматы: "95000", "95,000"
  const strikeStrComma = Number(strike).toLocaleString('en-US');

  const pageWidth = document.documentElement.clientWidth;
  const centerLeft = pageWidth * 0.3;
  const centerRight = pageWidth * 0.7;

  const candidates = document.querySelectorAll('td, [role="cell"], [role="gridcell"], div, span');
  const matches = [];

  for (const el of candidates) {
    // Пропускаем элементы у которых есть дочерние НЕ-кнопки
    const nonBtnChildren = Array.from(el.children).filter(c => !c.classList.contains('bnb-add-btn'));
    if (nonBtnChildren.length > 0) continue;

    // Читаем прямые текстовые узлы (игнорируем текст кнопок)
    let directText = '';
    for (const node of el.childNodes) {
      if (node.nodeType === 3) directText += node.textContent;
    }
    directText = directText.trim();

    // Fallback: нет дочерних элементов вообще
    if (!directText) {
      directText = el.textContent?.trim() || '';
    }

    if (!directText) continue;

    if (directText === strikeStr || directText === strikeStrComma) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        matches.push({ el, rect });
      }
    }
  }

  if (matches.length === 0) return null;

  // Предпочитаем элемент в центральной трети страницы (страйк-колонка)
  const centered = matches.find(m => {
    const midX = m.rect.left + m.rect.width / 2;
    return midX >= centerLeft && midX <= centerRight;
  });

  return centered ? centered.el : matches[0].el;
}

/**
 * Главная функция инжекта кнопок — API-first подход
 * ЗАЧЕМ: Берём список страйков из API, ищем их в DOM по значению
 *
 * Это надёжнее чем парсить структуру таблицы, т.к. не зависит
 * от классов/тегов которые Binance меняет при обновлениях
 */
async function injectButtons() {
  const underlying = getCurrentUnderlying();

  // Загружаем API кэш (заполняет apiExpirations и apiStrikesMap)
  await refreshGreeksCache(underlying);

  // Используем polling-версию: ждём пока DOM отрендерит таб с экспирацией
  const expDateCode = await waitForExpiration();
  if (!expDateCode) {
    console.warn('[Binance] injectButtons: экспирация не определена даже после polling');
    return 0;
  }

  await refreshTickerCache(underlying);

  // Получаем список страйков для текущей экспирации из API
  const strikes = getStrikesForExpiration(expDateCode);

  if (strikes.length === 0) {
    return 0;
  }

  // Стратегия 1: API-first — ищем каждый страйк в DOM по значению
  let injectedCount = 0;
  let notFoundCount = 0;

  for (const strike of strikes) {
    // Если кнопки для этого страйка уже есть в DOM — пропускаем
    if (document.querySelector(`.bnb-add-btn[data-strike="${strike}"]`)) continue;
    const cell = findStrikeCellByValue(strike);
    if (!cell) {
      notFoundCount++;
      continue;
    }
    injectButtonsIntoRow(cell, strike, underlying, expDateCode);
    injectedCount++;
  }

  // Стратегия 2 (fallback): если API-first не сработал — пробуем через таблицу
  if (injectedCount === 0) {
    const table = findOptionsTable();
    if (!table) return 0;
    const rows = getOptionRows(table);
    for (const row of rows) {
      const strikeInfo = getStrikeFromRow(row);
      if (!strikeInfo) continue;
      if (document.querySelector(`.bnb-add-btn[data-strike="${strikeInfo.strike}"]`)) continue;
      injectButtonsIntoRow(strikeInfo.cell, strikeInfo.strike, underlying, expDateCode);
      injectedCount++;
    }
  }

  return injectedCount;
}

console.log('[Binance] buttons.js загружен');
