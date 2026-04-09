/**
 * ext2 Popup — Сервер + Показать панель
 */

// Версия
document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

// Загрузка окружения
async function loadEnvironment() {
  const result = await chrome.storage.local.get(['ext2_environment']);
  const env = result.ext2_environment || 'production';
  document.getElementById('envSelect').value = env;
}
loadEnvironment();

// Переключение окружения
document.getElementById('envSelect').onchange = async (e) => {
  await chrome.storage.local.set({ ext2_environment: e.target.value });
  console.log('[EXT2 Popup] Environment:', e.target.value);
};

// Статистика позиций
async function loadStats() {
  const result = await chrome.storage.local.get(['tvc_positions']);
  const positions = result.tvc_positions || {};
  const tickers = Object.keys(positions);
  const total = tickers.reduce((sum, t) => sum + positions[t].length, 0);
  document.getElementById('posCount').textContent = total;
  document.getElementById('tickerCount').textContent = tickers.length;
}
loadStats();

// Показать панель
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';
  const isOptions = url.includes('tradingview.com/options');

  const btn = document.getElementById('showPanel');
  if (!isOptions) {
    btn.disabled = true;
    btn.textContent = 'Откройте опционы TV';
    return;
  }

  btn.onclick = async () => {
    // Отправляем showPanel во ВСЕ вкладки TV options
    const tvTabs = await chrome.tabs.query({ url: ['https://*.tradingview.com/options/*'] });
    console.log('[EXT2 Popup] TV tabs found:', tvTabs.length, tvTabs.map(t => t.id));
    // Ждём отправку всех сообщений перед закрытием popup
    const results = await Promise.allSettled(
      tvTabs.map(tvTab => chrome.tabs.sendMessage(tvTab.id, { action: 'showPanel' }))
    );
    console.log('[EXT2 Popup] sendMessage results:', results);
    window.close();
  };
})();
