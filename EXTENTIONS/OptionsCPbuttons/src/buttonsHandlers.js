/**
 * ext2 — Обработчики кликов и MutationObserver
 */

// Обработка клика по кнопке +C/-C/+P/-P
function handleOptionClick(btn, optionType, action, strike) {
  const ticker = getTickerFromUrl();
  const expiration = btn.dataset.expiration || getCurrentExpiration();
  const label = `${action === 'Buy' ? '+' : '-'}${optionType === 'CALL' ? 'C' : 'P'}`;


  if (!chrome.runtime?.id) {
    console.error(LOG_TAG, 'Extension context invalidated');
    return;
  }

  // При фильтре ±N strikes одновременно видны строки разных экспираций с одинаковым страйком,
  // поэтому querySelector вернул бы всегда первую — ищем строку, совпадающую по экспирации из кнопки
  const allRows = document.querySelectorAll(`tr[data-strike="${strike}"]`);
  let row = null;
  for (const candidate of allRows) {
    const cellId = candidate.querySelector('td[data-cell-id]')?.dataset.cellId;
    if (cellId && getExpirationFromCellId(cellId) === expiration) {
      row = candidate;
      break;
    }
  }
  // Fallback: берём первую строку, как было раньше
  if (!row) row = allRows[0] || null;
  if (!row) {
    console.error(LOG_TAG, 'Строка не найдена для strike:', strike);
    return;
  }

  // Парсим данные строки
  const columnMap = buildColumnMap();
  const parsed = parseOptionRow(row, columnMap);
  const data = optionType === 'CALL' ? parsed.callData : parsed.putData;

  const greeks = {
    delta: data.delta,
    gamma: data.gamma,
    theta: data.theta,
    vega: data.vega,
    rho: data.rho
  };

  const extraData = {
    bidIV: data.bidIV,
    askIV: data.askIV,
    intrinsicValue: data.intrinsicValue,
    timeValue: data.timeValue
  };

  // Блокируем кнопку от двойного клика
  btn.disabled = true;

  const added = addPosition(
    ticker, optionType, strike,
    expiration || parsed.expiration,
    data.bid, data.ask, data.price, data.volume, data.iv,
    greeks, extraData, action
  );

  if (!added) {
    console.warn(LOG_TAG, 'Дубликат — не добавлено');
    btn.disabled = false;
    return;
  }

  showPanel();
  updateButtonState(btn, true);
  openOptionerCalculator(ticker);
}

// Event delegation для кнопок
let _ext2DelegationInstalled = false;
function setupButtonDelegation() {
  if (_ext2DelegationInstalled) return;
  _ext2DelegationInstalled = true;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.ext2-btn');
    if (!btn) return;

    e.stopPropagation();

    const optionType = btn.dataset.type;
    const action = btn.dataset.action;
    const strike = parseFloat(btn.dataset.strike);

    if (!optionType || !action || !strike) return;

    handleOptionClick(btn, optionType, action, strike);
  });

}

// MutationObserver — на контейнер таблицы, не на body
let _ext2ObserverDebounce = null;
function setupObserver() {
  const tableContainer = document.querySelector('table')?.closest('[class]')
    || document.querySelector('tr[data-strike]')?.closest('table')?.parentElement;

  const target = tableContainer || document.body;

  const observer = new MutationObserver((mutations) => {
    let shouldInject = false;

    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && (
            node.matches?.('tr[data-strike]') ||
            node.querySelector?.('tr[data-strike]')
          )) {
            shouldInject = true;
            break;
          }
        }
      }
      if (shouldInject) break;
    }

    if (shouldInject) {
      // Debounce 100ms
      clearTimeout(_ext2ObserverDebounce);
      _ext2ObserverDebounce = setTimeout(() => {
        injectButtons();
        injectCalculatorButton();
      }, 100);
    }
  });

  observer.observe(target, { childList: true, subtree: true });

}

