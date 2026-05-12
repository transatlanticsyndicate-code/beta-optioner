/**
 * Popup UI для расширения Binance → Optioner Bridge
 */

// Загрузить и отобразить текущее состояние
async function loadState() {
  // Загружаем environment
  const result = await chrome.storage.local.get(['selectedEnvironment', 'bnb_positions']);
  const env = result.selectedEnvironment || 'production';
  const positions = result.bnb_positions || {};

  // Обновляем кнопки окружения
  document.getElementById('btn-production').classList.toggle('active', env === 'production');
  document.getElementById('btn-localhost').classList.toggle('active', env === 'localhost');

  // Отображаем позиции
  renderPositions(positions);
}

/**
 * Отобразить список позиций
 */
function renderPositions(positions) {
  const container = document.getElementById('positions-list');
  const underlyings = Object.keys(positions);

  if (underlyings.length === 0) {
    container.innerHTML = '<div class="no-positions">Нет добавленных позиций</div>';
    document.getElementById('btn-open-calc').disabled = true;
    return;
  }

  document.getElementById('btn-open-calc').disabled = false;

  container.innerHTML = underlyings.map(underlying => {
    const count = positions[underlying].length;
    const calls = positions[underlying].filter(p => p.type === 'CALL').length;
    const puts = positions[underlying].filter(p => p.type === 'PUT').length;
    return `
      <div class="position-row">
        <div>
          <div class="position-ticker">${underlying}</div>
          <div class="position-count">${count} поз. (C:${calls} P:${puts})</div>
        </div>
        <button class="btn-clear" data-underlying="${underlying}">✕</button>
      </div>
    `;
  }).join('');
}

/**
 * Установить окружение
 */
async function setEnv(env) {
  await chrome.storage.local.set({ selectedEnvironment: env });
  document.getElementById('btn-production').classList.toggle('active', env === 'production');
  document.getElementById('btn-localhost').classList.toggle('active', env === 'localhost');
  setStatus(`Окружение: ${env === 'production' ? 'Production' : 'Localhost'}`);
}

/**
 * Очистить позиции для underlying
 */
async function clearPositions(underlying) {
  const result = await chrome.storage.local.get(['bnb_positions']);
  const positions = result.bnb_positions || {};

  if (underlying) {
    delete positions[underlying];
  } else {
    Object.keys(positions).forEach(k => delete positions[k]);
  }

  await chrome.storage.local.set({ bnb_positions: positions });
  renderPositions(positions);
  setStatus('Позиции очищены');
}

/**
 * Открыть калькулятор
 */
async function openCalculator() {
  const result = await chrome.storage.local.get(['selectedEnvironment', 'bnb_positions']);
  const env = result.selectedEnvironment || 'production';
  const baseUrl = env === 'localhost' ? 'http://localhost:3000' : 'https://beta.optioner.online';
  const positions = result.bnb_positions || {};

  const underlyings = Object.keys(positions);
  const ticker = underlyings.length > 0 ? underlyings[0] : 'BTCUSDT';
  const url = `${baseUrl}/tools/universal-calculator?contract=${ticker}`;

  // Ищем существующую вкладку
  const tabs = await chrome.tabs.query({
    url: [
      'https://beta.optioner.online/tools/universal-calculator*',
      'http://localhost:3000/tools/universal-calculator*'
    ]
  });

  if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { active: true, url });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url, active: true });
  }

  setStatus('Калькулятор открыт');
  window.close();
}

/**
 * Установить статус
 */
function setStatus(text) {
  document.getElementById('status-text').textContent = text;
  setTimeout(() => {
    document.getElementById('status-text').textContent = 'Готово';
  }, 2000);
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  loadState();

  document.getElementById('btn-production').addEventListener('click', () => setEnv('production'));
  document.getElementById('btn-localhost').addEventListener('click', () => setEnv('localhost'));
  document.getElementById('btn-open-calc').addEventListener('click', openCalculator);

  // Делегирование для кнопок удаления позиций (они рендерятся динамически)
  document.getElementById('positions-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-clear');
    if (btn) clearPositions(btn.dataset.underlying);
  });
});

// Обновляем при изменении storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.bnb_positions || changes.selectedEnvironment)) {
    loadState();
  }
});
