/**
 * Инжект кнопок +C/+P в таблицу TradingView
 * ЗАЧЕМ: Добавление кнопок для быстрого добавления опционов
 */

// Инжектить кнопки в таблицу
function injectButtons() {
  const table = document.querySelector('table');
  if (!table) {
    console.log('[TVC] Таблица не найдена');
    return;
  }
  
  // Парсим заголовки для определения позиций колонок
  const columnMap = parseTableHeaders(table);
  
  const rows = table.querySelectorAll('[role="row"], tr');
  const ticker = getTickerFromUrl();
  
  console.log('[TVC] Найдено строк:', rows.length, 'Тикер:', ticker);
  
  let injectedCount = 0;
  
  rows.forEach((row, idx) => {
    if (row.querySelector('.tvc-add-btn')) return;
    
    const cells = row.querySelectorAll('[role="cell"], td');
    
    if (cells.length < 5) return;
    
    // Ищем ячейку со страйком
    let strikeCell = null;
    let strike = null;
    
    for (const cell of cells) {
      const btn = cell.querySelector('button');
      if (btn) {
        const text = btn.innerText?.trim();
        if (/^[\d,\.]+$/.test(text)) {
          const parsed = parseNumber(text);
          if (parsed && parsed > 10) {
            strikeCell = cell;
            strike = parsed;
            break;
          }
        }
      }
    }
    
    if (!strike || !strikeCell) return;
    
    const strikeIndex = Array.from(cells).indexOf(strikeCell);
    
    // Кнопка Call — парсим данные в момент клика для актуальности
    const btnCall = document.createElement('button');
    btnCall.className = 'tvc-add-btn tvc-add-call';
    btnCall.textContent = '+C';
    btnCall.title = 'Добавить Call';
    btnCall.onclick = (e) => {
      e.stopPropagation();
      
      // Парсим данные в момент клика (актуальные данные)
      const freshCells = row.querySelectorAll('td');
      const freshColumnMap = parseTableHeaders();
      const freshStrikeIndex = Array.from(freshCells).indexOf(strikeCell);
      const { callData, callGreeks } = parseOptionRow(freshCells, freshStrikeIndex, freshColumnMap);
      
      let currentExp = getCurrentExpiration();
      if (currentExp === 'N/A') {
        const allExp = getAllExpirations();
        if (allExp.length > 0) currentExp = allExp[0];
      }
      console.log('[TVC] Добавление CALL, strike:', strike, 'exp:', currentExp, 'bid:', callData.bid, 'ask:', callData.ask, 'iv:', callData.iv, 'delta:', callGreeks.delta);
      addPosition(ticker, 'CALL', strike, currentExp, callData.bid, callData.ask, callData.price, callData.volume, callData.iv, callGreeks);
      showPanel();
      openOptionerCalculator(ticker);
    };
    
    // Кнопка Put — парсим данные в момент клика для актуальности
    const btnPut = document.createElement('button');
    btnPut.className = 'tvc-add-btn tvc-add-put';
    btnPut.textContent = '+P';
    btnPut.title = 'Добавить Put';
    btnPut.onclick = (e) => {
      e.stopPropagation();
      
      // Парсим данные в момент клика (актуальные данные)
      const freshCells = row.querySelectorAll('td');
      const freshColumnMap = parseTableHeaders();
      const freshStrikeIndex = Array.from(freshCells).indexOf(strikeCell);
      const { putData, putGreeks } = parseOptionRow(freshCells, freshStrikeIndex, freshColumnMap);
      
      let currentExp = getCurrentExpiration();
      if (currentExp === 'N/A') {
        const allExp = getAllExpirations();
        if (allExp.length > 0) currentExp = allExp[0];
      }
      console.log('[TVC] Добавление PUT, strike:', strike, 'exp:', currentExp, 'bid:', putData.bid, 'ask:', putData.ask, 'iv:', putData.iv, 'delta:', putGreeks.delta);
      addPosition(ticker, 'PUT', strike, currentExp, putData.bid, putData.ask, putData.price, putData.volume, putData.iv, putGreeks);
      showPanel();
      openOptionerCalculator(ticker);
    };
    
    // Вставляем кнопки
    strikeCell.style.position = 'relative';
    strikeCell.style.display = 'flex';
    strikeCell.style.alignItems = 'center';
    strikeCell.style.justifyContent = 'center';
    strikeCell.style.gap = '4px';
    
    const strikeBtn = strikeCell.querySelector('button');
    if (strikeBtn) {
      strikeCell.insertBefore(btnCall, strikeBtn);
      strikeCell.appendChild(btnPut);
    }
    
    injectedCount++;
  });
  
  if (injectedCount > 0) {
    console.log('[TVC] Инжектировано кнопок:', injectedCount);
  }
}

// Наблюдатель за изменениями DOM
function setupObserver() {
  const observer = new MutationObserver((mutations) => {
    let shouldInject = false;
    
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            if (node.matches?.('[role="row"], tr') || node.querySelector?.('[role="row"], tr')) {
              shouldInject = true;
              break;
            }
          }
        }
      }
      if (shouldInject) break;
    }
    
    if (shouldInject) {
      setTimeout(() => {
        injectButtons();
        injectCalculatorButton();
      }, 100);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log('[TVC] Observer установлен');
}

// Инжект кнопки "Открыть калькулятор" слева от "By expiration"
function injectCalculatorButton() {
  // Проверяем, не добавлена ли уже кнопка
  if (document.querySelector('.tvc-calc-header-btn')) return;
  
  // Ищем radio "By expiration" 
  let byExpirationEl = null;
  const allInputs = document.querySelectorAll('input[type="radio"], [role="radio"]');
  for (const input of allInputs) {
    const label = input.closest('label') || input.parentElement;
    if (label?.textContent?.includes('By expiration')) {
      byExpirationEl = label;
      break;
    }
  }
  
  // Альтернативный поиск по тексту
  if (!byExpirationEl) {
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
        if (el.textContent?.trim() === 'By expiration') {
          byExpirationEl = el.closest('label') || el.parentElement;
          break;
        }
      }
    }
  }
  
  if (!byExpirationEl) {
    console.log('[TVC] By expiration не найден');
    return;
  }
  
  // Создаём кнопку
  const btn = document.createElement('button');
  btn.className = 'tvc-calc-header-btn';
  btn.innerHTML = '📱 Открыть калькулятор';
  btn.title = 'Открыть калькулятор опционов';
  
  // Стили кнопки - высота 30px
  btn.style.cssText = `
    background: yellow !important;
    color: #000 !important;
    border: none !important;
    border-radius: 4px !important;
    padding: 0 12px !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    height: 30px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    white-space: nowrap !important;
    box-shadow: 0 1px 4px rgba(255, 255, 0, 0.4) !important;
    transition: all 0.2s ease !important;
    margin-right: 12px !important;
  `;
  
  btn.onmouseover = () => {
    btn.style.background = '#FFE000';
  };
  btn.onmouseout = () => {
    btn.style.background = 'yellow';
  };
  
  btn.onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const ticker = getTickerFromUrl();
    
    // Получаем текущую цену underlying и сохраняем в chrome.storage
    const underlyingPrice = getUnderlyingPrice();
    if (underlyingPrice && chrome.storage?.local) {
      chrome.storage.local.set({ 
        tvc_underlying_price: underlyingPrice,
        tvc_ticker: ticker,
        tvc_price_updated: Date.now()
      });
      console.log('[TVC] Цена сохранена:', ticker, underlyingPrice);
    }
    
    // Формируем короткий код контракта
    // Фьючерсы: ESH2026 → ESH26, GCG2026 → GCG26
    // Акции: TSLA, AAPL — без изменений
    let contractCode = ticker;
    if (/\d{4}$/.test(ticker)) {
      // Это фьючерс с годом (ESH2026 → ESH26)
      contractCode = ticker.replace(/20(\d{2})$/, '$1');
    }
    const calculatorUrl = `http://localhost:3000/tools/universal-calculator?contract=${contractCode}`;
    window.open(calculatorUrl, '_blank');
  };
  
  // Вставляем кнопку перед "By expiration"
  byExpirationEl.parentElement.insertBefore(btn, byExpirationEl);
  
  console.log('[TVC] Кнопка "Открыть калькулятор" добавлена слева от By expiration');
}

console.log('[TVC] buttons.js загружен');
