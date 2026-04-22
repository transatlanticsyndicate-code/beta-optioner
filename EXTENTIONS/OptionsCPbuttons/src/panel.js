/**
 * ext2 — Нижняя панель позиций
 */

function showPanel() {
  let panel = document.querySelector('.ext2-panel');
  if (!panel) panel = createPanel();
  if (panel.dataset.userClosed === 'true') return;
  panel.style.setProperty('display', 'flex', 'important');
  renderPanel();
  // Обновляем плашку health-warnings при каждом показе панели
  try { refreshHealthBanner(); } catch (e) {}
}

function hidePanel() {
  const panel = document.querySelector('.ext2-panel');
  if (panel) panel.style.setProperty('display', 'none', 'important');
}

function createPanel() {
  const panel = document.createElement('div');
  panel.className = 'ext2-panel';
  panel.style.height = '270px';

  const version = chrome.runtime?.getManifest?.()?.version || '?';
  const header = document.createElement('div');
  header.className = 'ext2-panel-header';
  // Title
  const title = document.createElement('div');
  title.className = 'ext2-panel-title';
  title.innerHTML = `<span>Options CP v${version}</span>`;

  // Close button — создаём программно с addEventListener
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.title = 'Закрыть панель';
  closeBtn.style.cssText = 'background:none!important;border:none!important;color:#d1d4dc!important;cursor:pointer!important;font-size:20px!important;padding:2px 8px!important;pointer-events:auto!important;position:relative!important;z-index:999999!important;';
  closeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
    const p = document.querySelector('.ext2-panel');
    if (p) {
      p.style.setProperty('display', 'none', 'important');
      p.dataset.userClosed = 'true';
    }
  });

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Плашка health-warnings — скрыта по умолчанию, показывается через updateHealthBanner()
  // ЗАЧЕМ: Отдельный блок, чтобы не исчезал при перерисовке content (которая идёт через innerHTML)
  const banner = document.createElement('div');
  banner.className = 'ext2-panel-banner';
  banner.style.display = 'none';

  const content = document.createElement('div');
  content.className = 'ext2-panel-content';

  panel.appendChild(header);
  panel.appendChild(banner);
  panel.appendChild(content);
  document.body.appendChild(panel);

  return panel;
}

// Показать/обновить плашку health-warnings
// health: { severity: 'ok'|'warning'|'critical', issues: [{ level, msg }] }
function updateHealthBanner(health) {
  const panel = document.querySelector('.ext2-panel');
  if (!panel) return;
  const banner = panel.querySelector('.ext2-panel-banner');
  if (!banner) return;

  if (!health || health.severity === 'ok') {
    banner.style.display = 'none';
    banner.innerHTML = '';
    return;
  }

  const isCritical = health.severity === 'critical';
  const title = isCritical
    ? 'TradingView изменил вёрстку — расширение не может корректно считать данные. Требуется обновление расширения.'
    : 'Внимание: часть данных может считываться неточно — возможно, TradingView изменил вёрстку или в DOM присутствуют элементы других тикеров.';

  const items = (health.issues || [])
    .map(i => `<li class="ext2-banner-item ext2-banner-${i.level}">${i.msg}</li>`)
    .join('');

  banner.className = `ext2-panel-banner ext2-banner-${health.severity}`;
  banner.style.display = 'block';
  banner.innerHTML = `
    <div class="ext2-banner-title">${title}</div>
    <ul class="ext2-banner-list">${items}</ul>
    <div class="ext2-banner-footer">Сообщите разработчику и приложите содержимое этого блока.</div>
  `;
}

// Запустить health-check и отрисовать плашку
function refreshHealthBanner() {
  if (typeof ext2RunHealthCheck !== 'function') return;
  const health = ext2RunHealthCheck();
  updateHealthBanner(health);
  return health;
}

function renderPanel() {
  const panel = document.querySelector('.ext2-panel');
  if (!panel) return;
  const content = panel.querySelector('.ext2-panel-content');
  if (!content) return;

  const tickers = Object.keys(tvc_positions);
  if (tickers.length === 0) {
    content.innerHTML = '<div class="ext2-empty">Нет позиций. Нажмите +C или +P для добавления.</div>';
    return;
  }

  // Tabs
  let html = '<div class="ext2-tabs">';
  tickers.forEach(ticker => {
    const active = ticker === tvc_activeTab ? 'active' : '';
    const count = tvc_positions[ticker].length;
    html += `<button class="ext2-tab ${active}" data-ticker="${ticker}">${ticker} (${count})</button>`;
  });
  html += '</div>';

  // Actions
  html += `
    <div class="ext2-actions">
      <button class="ext2-act-btn ext2-btn-open-calc" title="Открыть калькулятор">Калькулятор</button>
      <button class="ext2-act-btn ext2-btn-open-calc-new" title="Новая вкладка">+</button>
      <button class="ext2-act-btn ext2-btn-clear" data-ticker="${tvc_activeTab}">Очистить ${tvc_activeTab}</button>
      <button class="ext2-act-btn ext2-btn-clear-all">Очистить всё</button>
    </div>
  `;

  // Table
  const positions = tvc_positions[tvc_activeTab] || [];
  html += '<div class="ext2-positions">';
  if (positions.length > 0) {
    html += `<table class="ext2-table"><thead><tr>
      <th>Тикер</th><th>Тип</th><th>Дата эксп.</th><th>Страйк</th><th>Кол.</th>
      <th>BID</th><th>ASK</th><th>VOL</th><th>IV</th><th>Цена</th><th></th>
    </tr></thead><tbody>`;
    positions.forEach(pos => {
      const cls = pos.type === 'CALL' ? 'call' : 'put';
      const uPrice = pos.underlyingPrice ? pos.underlyingPrice.toLocaleString() : '-';
      html += `<tr class="ext2-row-${cls}">
        <td>${tvc_activeTab}</td>
        <td>${pos.action || 'Buy'} ${pos.type}</td>
        <td>${pos.expiration}</td>
        <td>${pos.strike}</td>
        <td>${pos.qty || 1}</td>
        <td>${pos.bid || '-'}</td>
        <td>${pos.ask || '-'}</td>
        <td>${pos.volume || '-'}</td>
        <td>${pos.iv || '-'}</td>
        <td>${uPrice}</td>
        <td><button class="ext2-remove-btn" data-ticker="${tvc_activeTab}" data-id="${pos.id}">×</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
  }
  html += '</div>';

  content.innerHTML = html;

  // Event handlers
  content.querySelectorAll('.ext2-tab').forEach(tab => {
    tab.onclick = () => {
      const ticker = tab.dataset.ticker;
      const currentTicker = getTickerFromUrl();

      // Если тот же тикер — просто переключаем таб
      if (ticker === currentTicker) {
        tvc_activeTab = ticker;
        renderPanel();
        return;
      }

      // Другой тикер — переходим на его страницу доски опционов
      const positions = tvc_positions[ticker] || [];
      if (positions.length > 0 && positions[0].sourceUrl) {
        tvc_activeTab = ticker;
        window.location.href = positions[0].sourceUrl;
      } else {
        tvc_activeTab = ticker;
        renderPanel();
      }
    };
  });

  content.querySelectorAll('.ext2-remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      const ticker = btn.dataset.ticker;
      const id = parseFloat(btn.dataset.id);
      await removePosition(ticker, id);
      renderPanel();
    });
  });

  content.querySelector('.ext2-btn-open-calc')?.addEventListener('click', () => {
    const ticker = getTickerFromUrl() || tvc_activeTab;
    if (ticker) openOptionerCalculator(ticker);
  });

  content.querySelector('.ext2-btn-open-calc-new')?.addEventListener('click', () => {
    const ticker = getTickerFromUrl() || tvc_activeTab;
    if (!ticker) return;
    const priceInfo = typeof ext2GetUnderlyingPriceWithConfidence === 'function'
      ? ext2GetUnderlyingPriceWithConfidence()
      : { price: getUnderlyingPrice(), confidence: 'high' };
    chrome.runtime.sendMessage({
      action: 'ext2_openOptionerTabNew',
      ticker,
      positions: tvc_positions[ticker] || [],
      underlyingPrice: priceInfo.price,
      underlyingPriceConfidence: priceInfo.confidence
    });
  });

  content.querySelector('.ext2-btn-clear')?.addEventListener('click', (e) => {
    const ticker = e.target.dataset.ticker;
    if (confirm(`Очистить все позиции для ${ticker}?`)) {
      clearPositions(ticker);
      renderPanel();
      refreshAllButtonStates();
    }
  });

  content.querySelector('.ext2-btn-clear-all')?.addEventListener('click', () => {
    if (!confirm('Удалить ВСЕ данные расширения и калькулятора?')) return;

    // 1. Очищаем RAM
    tvc_positions = {};
    tvc_activeTab = null;
    tvc_panelCollapsed = false;

    // 2. Очищаем chrome.storage (позиции)
    chrome.storage.local.set({ [STORAGE_KEY]: {} });

    // 3. Очищаем localStorage панели
    try { localStorage.removeItem('tvc_panel_state'); } catch (e) {}

    // 4. Очищаем калькулятор через background (content script не может делать tabs.query + scripting)
    if (chrome.runtime?.id) {
      chrome.runtime.sendMessage({ action: 'ext2_clearCalculator' });
    }

    // 5. Перерисовка панели (покажет "Нет позиций") и сброс кнопок
    renderPanel();
    refreshAllButtonStates();
  });
}

