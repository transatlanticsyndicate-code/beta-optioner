/**
 * ext2 — Инжект кнопок +C/-C/+P/-P в новую верстку TradingView
 *
 * Новая верстка: <tr data-strike="6625"> + <td data-cell-part="central">
 * Кнопки инжектятся в первую central-ячейку (Strike)
 */

function injectButtons() {
  const rows = document.querySelectorAll('tr[data-strike]');
  if (rows.length === 0) return;

  const ticker = getTickerFromUrl();
  let injectedCount = 0;

  rows.forEach(row => {
    // Пропускаем если уже инжектированы
    if (row.querySelector('.ext2-btn')) return;

    const strike = parseFloat(row.dataset.strike);
    if (!strike) return;

    // Находим Strike ячейку (первая central)
    const strikeCells = row.querySelectorAll('td[data-cell-part="central"]');
    const strikeCell = strikeCells[0];
    if (!strikeCell) return;

    // Получаем экспирацию из data-cell-id любой call/put ячейки
    const anyCell = row.querySelector('td[data-cell-id]');
    const expiration = anyCell ? getExpirationFromCellId(anyCell.dataset.cellId) : getCurrentExpiration();

    const buttonConfigs = [
      { label: '+C', title: 'Buy Call',  type: 'CALL', action: 'Buy',  css: 'ext2-buy' },
      { label: '-C', title: 'Sell Call', type: 'CALL', action: 'Sell', css: 'ext2-sell' },
      { label: '+P', title: 'Buy Put',  type: 'PUT',  action: 'Buy',  css: 'ext2-buy' },
      { label: '-P', title: 'Sell Put',  type: 'PUT',  action: 'Sell', css: 'ext2-sell' }
    ];

    const created = {};
    for (const cfg of buttonConfigs) {
      const btn = document.createElement('button');
      btn.className = `ext2-btn ${cfg.css}`;
      btn.textContent = cfg.label;
      btn.title = cfg.title;
      btn.dataset.label = cfg.label;
      btn.dataset.title = cfg.title;
      btn.dataset.type = cfg.type;
      btn.dataset.action = cfg.action;
      btn.dataset.strike = String(strike);
      btn.dataset.expiration = expiration || '';
      created[cfg.label] = btn;
    }

    // Layout: [+C] [-C] [STRIKE_TEXT] [+P] [-P]
    strikeCell.style.display = 'flex';
    strikeCell.style.alignItems = 'center';
    strikeCell.style.justifyContent = 'center';
    strikeCell.style.gap = '2px';

    // TV рендерит страйк в двух span-ах (видимый + скрытый для доступности),
    // textContent склеивает оба → "53.053.0". Берём только из видимого span-а.
    const visibleSpan = strikeCell.querySelector('[class*="ellipsis"]');
    const strikeText = visibleSpan ? visibleSpan.textContent.trim() : String(strike);
    const strikeSpan = document.createElement('span');
    strikeSpan.textContent = strikeText;
    strikeSpan.style.margin = '0 6px';

    strikeCell.innerHTML = '';
    strikeCell.appendChild(created['+C']);
    strikeCell.appendChild(created['-C']);
    strikeCell.appendChild(strikeSpan);
    strikeCell.appendChild(created['+P']);
    strikeCell.appendChild(created['-P']);

    // Обновляем состояние кнопок (галочки для уже добавленных)
    if (ticker && expiration) {
      for (const cfg of buttonConfigs) {
        if (isOptionInCalculator(ticker, cfg.type, strike, expiration, cfg.action)) {
          updateButtonState(created[cfg.label], true);
        }
      }
    }

    injectedCount++;
  });

  if (injectedCount > 0) {
  }

  // Дамп полной видимой цепочки в chrome.storage — для фичи "Стратегия СЕВЕР"
  // в калькуляторе. bridge optioner.js синкает её в localStorage tvc_full_chain.
  if (typeof dumpFullChain === 'function') {
    dumpFullChain();
  }
}

// Обновить вид кнопки
function updateButtonState(btn, isAdded) {
  if (isAdded) {
    btn.textContent = '✔';
    btn.style.cssText = 'background: #6b7280 !important; color: #fff !important;';
    btn.title = 'Уже добавлено';
  } else {
    btn.textContent = btn.dataset.label || '+C';
    btn.style.cssText = '';
    btn.title = btn.dataset.title || '';
  }
}

// Обновить состояние всех кнопок на странице
function refreshAllButtonStates() {
  const ticker = getTickerFromUrl();
  if (!ticker) return;

  document.querySelectorAll('.ext2-btn').forEach(btn => {
    const type = btn.dataset.type;
    const action = btn.dataset.action;
    const strike = parseFloat(btn.dataset.strike);
    const expiration = btn.dataset.expiration;
    if (!type || !strike) return;

    const isAdded = isOptionInCalculator(ticker, type, strike, expiration, action);
    updateButtonState(btn, isAdded);
  });
}

// Кнопка "Калькулятор" — после кнопки Volatility в навигации
function injectCalculatorButton() {
  if (document.querySelector('.ext2-calc-btn')) return;
  if (!document.querySelector('.ext2-btn')) return;

  // Ищем кнопку/таб "Volatility" в навигации опционов
  let anchor = null;
  const navButtons = document.querySelectorAll('button, a, [role="tab"]');
  for (const el of navButtons) {
    const text = el.textContent?.trim();
    if (text === 'Volatility' || text === 'Волатильность') {
      anchor = el;
      break;
    }
  }

  // Fallback: после "Strategy finder" или первого навигационного элемента
  if (!anchor) {
    for (const el of navButtons) {
      const text = el.textContent?.trim();
      if (text && (text.includes('Strategy finder') || text.includes('Spread'))) {
        anchor = el;
        break;
      }
    }
  }

  if (!anchor) return;

  const btn = document.createElement('button');
  btn.className = 'ext2-calc-btn';
  btn.textContent = 'Калькулятор';
  btn.title = 'Открыть калькулятор опционов';

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const ticker = getTickerFromUrl();
    openOptionerCalculator(ticker);
  });

  // Вставляем после anchor (Volatility)
  anchor.parentElement.insertBefore(btn, anchor.nextSibling);
}

