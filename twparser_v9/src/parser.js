/**
 * Парсинг данных из таблицы TradingView
 * ЗАЧЕМ: Извлечение данных опционов, греков, экспираций
 */

// Парсим заголовки таблицы для определения позиций колонок греков
function parseTableHeaders(table) {
  // Если таблица не передана, ищем её на странице
  if (!table) {
    table = document.querySelector('table, [role="table"], .tv-data-table');
  }
  if (!table) return null;
  
  const headerRow = table.querySelector('[role="row"]:has([role="columnheader"]), tr:has(th)');
  if (!headerRow) return null;
  
  const headers = headerRow.querySelectorAll('[role="columnheader"], th');
  const columnMap = { call: {}, put: {} };
  let foundStrike = false;
  
  headers.forEach((header, idx) => {
    const text = header.textContent?.trim().toLowerCase();
    
    // До Strike — это Call колонки, после Strike — Put колонки
    if (text === 'strike') {
      foundStrike = true;
      columnMap.strikeIndex = idx;
      return;
    }
    
    const side = foundStrike ? 'put' : 'call';
    
    if (text === 'delta') columnMap[side].delta = idx;
    else if (text === 'gamma') columnMap[side].gamma = idx;
    else if (text === 'theta') columnMap[side].theta = idx;
    else if (text === 'vega') columnMap[side].vega = idx;
    else if (text === 'rho') columnMap[side].rho = idx;
    else if (text === 'price') columnMap[side].price = idx;
    else if (text === 'ask') columnMap[side].ask = idx;
    else if (text === 'bid') columnMap[side].bid = idx;
    else if (text === 'volume') columnMap[side].volume = idx;
    else if (text.includes('iv')) columnMap[side].iv = idx;
  });
  
  console.log('[TVC] Карта колонок:', columnMap);
  return columnMap;
}

// Парсинг данных строки опциона
function parseOptionRow(cells, strikeIndex, columnMap) {
  // Логируем все ячейки для отладки
  const cellValues = Array.from(cells).map((c, i) => `[${i}]=${c.textContent?.trim()}`);
  console.log('[TVC] Ячейки строки:', cellValues.join(' | '));
  console.log('[TVC] strikeIndex:', strikeIndex);
  
  // Функция для безопасного получения значения из ячейки
  const getCellValue = (colIdx) => {
    if (colIdx === undefined || colIdx === null) return 0;
    return parseNumber(cells[colIdx]?.textContent) || 0;
  };
  
  // Данные Call и Put
  let callData = { bid: 0, ask: 0, price: 0, volume: 0, iv: 0 };
  let callGreeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  let putData = { bid: 0, ask: 0, price: 0, volume: 0, iv: 0 };
  let putGreeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  
  // Всегда используем относительные индексы от страйка (более надёжно)
  // TradingView структура: Price | Ask | Bid | Volume | Strike | IV% | Volume | Bid | Ask | Price
  // Индексы от Strike:      -4    -3    -2     -1       0       +1     +2      +3    +4     +5
  
  // Call данные (слева от страйка)
  callData.price = parseNumber(cells[strikeIndex - 4]?.textContent) || 0;
  callData.ask = parseNumber(cells[strikeIndex - 3]?.textContent) || 0;
  callData.bid = parseNumber(cells[strikeIndex - 2]?.textContent) || 0;
  callData.volume = parseNumber(cells[strikeIndex - 1]?.textContent) || 0;
  
  // IV% (общая колонка справа от страйка)
  const iv = parseNumber(cells[strikeIndex + 1]?.textContent) || 0;
  callData.iv = iv;
  putData.iv = iv;
  
  // Put данные (справа от страйка)
  putData.volume = parseNumber(cells[strikeIndex + 2]?.textContent) || 0;
  putData.bid = parseNumber(cells[strikeIndex + 3]?.textContent) || 0;
  putData.ask = parseNumber(cells[strikeIndex + 4]?.textContent) || 0;
  putData.price = parseNumber(cells[strikeIndex + 5]?.textContent) || 0;
  
  // Греки — парсим по относительным индексам
  // Структура TradingView (28 колонок): 
  // Call: [0]Price [1]Ask [2]Bid [3]Vol [4]Rho [5]Vega [6]Theta [7]Gamma [8]Delta [9]OI [10]Vol [11]Bid [12]Ask [13]Strike...
  // Но реальная структура может отличаться, поэтому ищем греки рядом с bid/ask
  
  // Греки Call находятся в колонках 4-8 (до страйка)
  // Порядок: Rho, Vega, Theta, Gamma, Delta (справа налево к страйку)
  callGreeks.delta = parseNumber(cells[strikeIndex - 5]?.textContent) || 0; // [8] = 0.94
  callGreeks.gamma = parseNumber(cells[strikeIndex - 6]?.textContent) || 0; // [7] = 0.004
  callGreeks.theta = parseNumber(cells[strikeIndex - 7]?.textContent) || 0; // [6] = -5647.62
  callGreeks.vega = parseNumber(cells[strikeIndex - 8]?.textContent) || 0;  // [5] = 0.009
  callGreeks.rho = parseNumber(cells[strikeIndex - 9]?.textContent) || 0;   // [4] = 0.000062
  
  // Греки Put находятся в колонках после страйка
  // Порядок: Delta, Gamma, Theta, Vega, Rho (слева направо от страйка)
  putGreeks.delta = parseNumber(cells[strikeIndex + 7]?.textContent) || 0;  // [20]
  putGreeks.gamma = parseNumber(cells[strikeIndex + 8]?.textContent) || 0;  // [21]
  putGreeks.theta = parseNumber(cells[strikeIndex + 9]?.textContent) || 0;  // [22]
  putGreeks.vega = parseNumber(cells[strikeIndex + 10]?.textContent) || 0;  // [23]
  putGreeks.rho = parseNumber(cells[strikeIndex + 11]?.textContent) || 0;   // [24]
  
  console.log('[TVC] parseOptionRow результат:', { callData, callGreeks, putData, putGreeks });
  return { callData, callGreeks, putData, putGreeks };
}

// Получить текущую экспирацию из UI
function getCurrentExpiration() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Метод 0: Ищем выбранную кнопку даты (с фокусом или aria-selected)
  // и определяем месяц по ближайшему StaticText слева
  const dateButtons = document.querySelectorAll('button');
  for (const btn of dateButtons) {
    const text = btn.textContent?.trim();
    // Кнопка с числом 1-31 и она выбрана (focused, aria-selected, или имеет особый стиль)
    if (text && /^\d{1,2}$/.test(text)) {
      const isSelected = btn.getAttribute('aria-selected') === 'true' || 
                         btn.matches(':focus') ||
                         btn.className.includes('black-') || // TradingView использует black для выбранной
                         btn.className.includes('primary-');
      if (isSelected) {
        const day = text;
        // Ищем месяц — это текст "Jan", "Feb" и т.д. перед группой кнопок
        let prevSibling = btn.previousElementSibling;
        let monthFound = null;
        
        // Идём назад по DOM ища месяц
        let current = btn;
        for (let i = 0; i < 50 && current; i++) {
          const prev = current.previousElementSibling;
          if (prev) {
            const prevText = prev.textContent?.trim();
            if (prevText && /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i.test(prevText)) {
              monthFound = prevText;
              break;
            }
            current = prev;
          } else {
            // Переходим к родителю
            current = current.parentElement?.previousElementSibling;
          }
        }
        
        if (monthFound) {
          console.log('[TVC] Экспирация из выбранной кнопки:', monthFound, day);
          return `${monthFound} ${day}`;
        }
      }
    }
  }
  
  // Метод 1: Ищем кнопку с aria-selected="true" в календаре TradingView
  const selectedBtn = document.querySelector('button[aria-selected="true"]');
  if (selectedBtn) {
    // Проверяем title кнопки (формат: "Jan 20, 2026 (4) ESH26 E3B")
    const title = selectedBtn.getAttribute('title');
    if (title) {
      const titleMatch = title.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+\d{4}/);
      if (titleMatch) {
        console.log('[TVC] Экспирация из title выбранной кнопки:', titleMatch[1], titleMatch[2]);
        return `${titleMatch[1]} ${titleMatch[2]}`;
      }
    }
    // Если title нет, берём день из кнопки и ищем месяц в соседних кнопках
    const day = selectedBtn.textContent?.trim();
    if (day && /^\d{1,2}$/.test(day)) {
      // Ищем месяц в title соседних кнопок
      const container = selectedBtn.closest('.items-jBbUvk85, div[class*="items"]') || selectedBtn.parentElement;
      if (container) {
        const siblingBtns = container.querySelectorAll('button[title]');
        for (const btn of siblingBtns) {
          const sibTitle = btn.getAttribute('title');
          if (sibTitle) {
            const monthMatch = sibTitle.match(/^([A-Za-z]{3})\s+\d{1,2},\s+\d{4}/);
            if (monthMatch) {
              console.log('[TVC] Экспирация из aria-selected + месяц соседа:', monthMatch[1], day);
              return `${monthMatch[1]} ${day}`;
            }
          }
        }
      }
    }
  }
  
  // Метод 1: Ищем активную кнопку с классом isActive, active, selected
  const calendarButtons = document.querySelectorAll('button');
  for (const btn of calendarButtons) {
    const className = btn.className || '';
    const text = btn.textContent?.trim();
    // Ищем кнопку с числом (день) и классом active/isActive/selected
    if (text && /^\d{1,2}$/.test(text) && (className.includes('Active') || className.includes('active') || className.includes('selected'))) {
      const day = parseInt(text);
      // Ищем месяц в title соседних кнопок
      const container = btn.parentElement;
      if (container) {
        const siblingBtns = container.querySelectorAll('button[title]');
        for (const sibBtn of siblingBtns) {
          const sibTitle = sibBtn.getAttribute('title');
          if (sibTitle) {
            const monthMatch = sibTitle.match(/^([A-Za-z]{3})\s+\d{1,2},\s+\d{4}/);
            if (monthMatch) {
              console.log('[TVC] Экспирация из активной кнопки + месяц соседа:', monthMatch[1], day);
              return `${monthMatch[1]} ${day}`;
            }
          }
        }
      }
      // Fallback на текущий/следующий месяц
      const now = new Date();
      const monthIdx = day < now.getDate() ? (now.getMonth() + 1) % 12 : now.getMonth();
      console.log('[TVC] Экспирация из активной даты:', months[monthIdx], day);
      return `${months[monthIdx]} ${day}`;
    }
  }
  
  // Метод 1: Ищем активную кнопку даты в календаре (атрибут aria-current или класс active)
  const activeButton = document.querySelector('button[class*="isActive"], button[aria-current="true"]');
  if (activeButton) {
    const day = activeButton.textContent?.trim();
    if (day && /^\d+$/.test(day)) {
      // Ищем месяц в родительском контейнере
      let parent = activeButton.parentElement;
      while (parent && parent !== document.body) {
        const monthEl = parent.previousElementSibling;
        if (monthEl) {
          const monthText = monthEl.textContent?.trim();
          if (monthText && /^[A-Za-z]{3}$/.test(monthText)) {
            console.log('[TVC] Экспирация из активной кнопки:', monthText, day);
            return `${monthText} ${day}`;
          }
        }
        // Ищем внутри того же контейнера
        const monthLabel = parent.querySelector('div:first-child');
        if (monthLabel) {
          const monthText = monthLabel.textContent?.trim();
          if (monthText && /^[A-Za-z]{3}$/.test(monthText)) {
            console.log('[TVC] Экспирация из контейнера:', monthText, day);
            return `${monthText} ${day}`;
          }
        }
        parent = parent.parentElement;
      }
    }
  }
  
  // Метод 2: Парсим из URL (series параметр содержит дату)
  const urlParams = new URLSearchParams(window.location.search);
  const series = urlParams.get('series');
  if (series) {
    // Формат: CME_MINI:ESH2026;EW3;20260116
    const dateMatch = series.match(/(\d{4})(\d{2})(\d{2})$/);
    if (dateMatch) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[parseInt(dateMatch[2]) - 1];
      const day = parseInt(dateMatch[3]);
      console.log('[TVC] Экспирация из URL:', month, day);
      return `${month} ${day}`;
    }
  }
  
  // Метод 3: Ищем в tooltip внизу страницы (формат: "Jan 16, 2026 (1) ESH26 EW3")
  const allDivs = document.querySelectorAll('div');
  for (const div of allDivs) {
    const text = div.textContent;
    if (text) {
      const match = text.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+\d{4}\s+\(\d+\)/);
      if (match) {
        console.log('[TVC] Экспирация из tooltip:', match[1], match[2]);
        return `${match[1]} ${match[2]}`;
      }
    }
  }
  
  // Метод 4: Берём первую доступную дату из календаря
  const firstDateBtn = document.querySelector('button[class*="day"], div[class*="calendar"] button');
  if (firstDateBtn) {
    const day = firstDateBtn.textContent?.trim();
    if (day && /^\d+$/.test(day)) {
      // Предполагаем текущий месяц
      const now = new Date();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      console.log('[TVC] Экспирация из первой даты:', months[now.getMonth()], day);
      return `${months[now.getMonth()]} ${day}`;
    }
  }
  
  // Метод 5: Ищем любую кнопку с числом 15-31 (скорее всего это дата экспирации)
  const allButtons = document.querySelectorAll('button');
  for (const btn of allButtons) {
    const text = btn.textContent?.trim();
    if (text && /^(1[5-9]|2[0-9]|3[01])$/.test(text)) {
      const day = parseInt(text);
      const now = new Date();
      // Определяем месяц: если день уже прошёл — следующий месяц
      const monthIdx = day < now.getDate() ? (now.getMonth() + 1) % 12 : now.getMonth();
      console.log('[TVC] Экспирация из кнопки с датой:', months[monthIdx], day);
      return `${months[monthIdx]} ${day}`;
    }
  }
  
  // Если ничего не найдено — возвращаем N/A
  console.log('[TVC] Экспирация не найдена, возвращаем N/A');
  return 'N/A';
}

// Получить все доступные экспирации
function getAllExpirations() {
  const expirations = [];
  
  // Ищем кнопки с датами в календаре
  const dateButtons = document.querySelectorAll('[class*="calendar"] button, [class*="expiration"] button');
  
  dateButtons.forEach(btn => {
    const day = btn.textContent?.trim();
    if (day && /^\d+$/.test(day)) {
      // Находим месяц
      const monthContainer = btn.closest('[class*="month"]') || btn.parentElement?.parentElement;
      if (monthContainer) {
        const monthLabel = monthContainer.querySelector('[class*="label"]');
        if (monthLabel) {
          const month = monthLabel.textContent?.trim();
          if (month) {
            expirations.push(`${month} ${day}`);
          }
        }
      }
    }
  });
  
  return expirations;
}

console.log('[TVC] parser.js загружен');
