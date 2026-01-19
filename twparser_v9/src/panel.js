/**
 * UI панели позиций
 * ЗАЧЕМ: Отображение добавленных опционов и управление ими
 */

// Показать панель
function showPanel() {
  let panel = document.querySelector('.tvc-panel');
  if (!panel) {
    panel = createPanel();
  }
  panel.style.display = 'block';
  renderPanel();
}

// Скрыть панель
function hidePanel() {
  const panel = document.querySelector('.tvc-panel');
  if (panel) {
    panel.style.display = 'none';
  }
}

// Создать панель
function createPanel() {
  const panel = document.createElement('div');
  panel.className = 'tvc-panel';
  
  // Применяем сохранённую высоту
  if (tvc_panelHeight) {
    panel.style.height = tvc_panelHeight + 'px';
  }
  
  // Заголовок панели
  const header = document.createElement('div');
  header.className = 'tvc-panel-header';
  header.innerHTML = `
    <div class="tvc-panel-title">
      <span class="tvc-panel-drag">⋮⋮</span>
      <span>Options Calculator</span>
      <span class="tvc-version">v5.0</span>
    </div>
    <div class="tvc-panel-controls">
      <button class="tvc-btn tvc-btn-collapse" title="Свернуть/Развернуть">−</button>
      <button class="tvc-btn tvc-btn-close" title="Закрыть">×</button>
    </div>
  `;
  
  // Контент панели
  const content = document.createElement('div');
  content.className = 'tvc-panel-content';
  
  panel.appendChild(header);
  panel.appendChild(content);
  document.body.appendChild(panel);
  
  // Обработчики
  header.querySelector('.tvc-btn-close').onclick = () => {
    panel.style.display = 'none';
  };
  
  header.querySelector('.tvc-btn-collapse').onclick = () => {
    tvc_panelCollapsed = !tvc_panelCollapsed;
    content.style.display = tvc_panelCollapsed ? 'none' : 'block';
    header.querySelector('.tvc-btn-collapse').textContent = tvc_panelCollapsed ? '+' : '−';
    savePanelState();
  };
  
  // Применяем сохранённое состояние свёрнутости
  if (tvc_panelCollapsed) {
    content.style.display = 'none';
    header.querySelector('.tvc-btn-collapse').textContent = '+';
  }
  
  // Ресайз панели
  setupPanelResize(panel, header);
  
  return panel;
}

// Настройка ресайза панели
function setupPanelResize(panel, header) {
  let isResizing = false;
  let startY = 0;
  let startHeight = 0;
  
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('.tvc-btn')) return;
    isResizing = true;
    startY = e.clientY;
    startHeight = panel.offsetHeight;
    document.body.style.userSelect = 'none';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const delta = startY - e.clientY;
    const newHeight = Math.min(Math.max(startHeight + delta, 100), window.innerHeight * 0.7);
    panel.style.height = newHeight + 'px';
  });
  
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.userSelect = '';
      savePanelState();
    }
  });
}

// Рендер содержимого панели
function renderPanel() {
  const panel = document.querySelector('.tvc-panel');
  if (!panel) return;
  
  const content = panel.querySelector('.tvc-panel-content');
  if (!content) return;
  
  const tickers = Object.keys(tvc_positions);
  
  if (tickers.length === 0) {
    content.innerHTML = '<div class="tvc-empty">Нет позиций. Нажмите +C или +P для добавления.</div>';
    return;
  }
  
  // Табы для инструментов
  let tabsHtml = '<div class="tvc-tabs">';
  tickers.forEach(ticker => {
    const isActive = ticker === tvc_activeTab;
    const count = tvc_positions[ticker].length;
    tabsHtml += `<button class="tvc-tab ${isActive ? 'active' : ''}" data-ticker="${ticker}">${ticker} (${count})</button>`;
  });
  tabsHtml += '</div>';
  
  // Таблица позиций
  const currentPositions = tvc_positions[tvc_activeTab] || [];
  let tableHtml = '<div class="tvc-positions">';
  
  if (currentPositions.length > 0) {
    tableHtml += `
      <table class="tvc-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Strike</th>
            <th>Exp</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
    `;
    
    currentPositions.forEach(pos => {
      const typeClass = pos.type === 'CALL' ? 'call' : 'put';
      tableHtml += `
        <tr class="tvc-row-${typeClass}">
          <td>${pos.type}</td>
          <td>${pos.strike}</td>
          <td>${pos.expiration}</td>
          <td><button class="tvc-remove-btn" data-ticker="${tvc_activeTab}" data-id="${pos.id}">×</button></td>
        </tr>
      `;
    });
    
    tableHtml += '</tbody></table>';
  }
  
  tableHtml += '</div>';
  
  // Кнопки действий
  const actionsHtml = `
    <div class="tvc-actions">
      <button class="tvc-btn tvc-btn-clear" data-ticker="${tvc_activeTab}">Очистить ${tvc_activeTab}</button>
      <button class="tvc-btn tvc-btn-optioner">Открыть Optioner</button>
    </div>
  `;
  
  content.innerHTML = tabsHtml + tableHtml + actionsHtml;
  
  // Обработчики событий
  content.querySelectorAll('.tvc-tab').forEach(tab => {
    tab.onclick = () => {
      tvc_activeTab = tab.dataset.ticker;
      renderPanel();
    };
  });
  
  content.querySelectorAll('.tvc-remove-btn').forEach(btn => {
    btn.onclick = () => {
      const ticker = btn.dataset.ticker;
      const id = parseInt(btn.dataset.id);
      removePosition(ticker, id);
      renderPanel();
    };
  });
  
  content.querySelector('.tvc-btn-clear')?.addEventListener('click', (e) => {
    const ticker = e.target.dataset.ticker;
    if (confirm(`Очистить все позиции для ${ticker}?`)) {
      clearPositions(ticker);
      renderPanel();
    }
  });
  
  content.querySelector('.tvc-btn-optioner')?.addEventListener('click', () => {
    openOptionerCalculator(tvc_activeTab);
  });
}

console.log('[TVC] panel.js загружен');
