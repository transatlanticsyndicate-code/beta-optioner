/**
 * TradingView Options Calculator - Popup Script
 * ЗАЧЕМ: Показывает статистику позиций и управление панелью
 */

function loadStats() {
  chrome.storage.local.get(['tvc_positions'], (result) => {
    const positions = result.tvc_positions || {};
    const instruments = Object.keys(positions).length;
    let totalPositions = 0;
    
    for (const ticker in positions) {
      totalPositions += positions[ticker].length;
    }
    
    document.getElementById('instruments').textContent = instruments;
    document.getElementById('positions').textContent = totalPositions;
  });
}

// Кнопка "Показать панель"
document.getElementById('showPanel').onclick = async () => {
  // Получаем активную вкладку
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (tab && tab.url && tab.url.includes('tradingview.com')) {
    // Отправляем сообщение в content script
    chrome.tabs.sendMessage(tab.id, { action: 'showPanel' });
    window.close();
  } else {
    alert('Откройте страницу опционов на TradingView');
  }
};

// Кнопка "Открыть Optioner"
document.getElementById('openOptioner').onclick = async () => {
  // Получаем первый контракт из storage
  chrome.storage.local.get(['tvc_positions'], (result) => {
    const positions = result.tvc_positions || {};
    const tickers = Object.keys(positions);
    
    if (tickers.length > 0) {
      // Берём первый контракт
      const ticker = tickers[0];
      const shortTicker = ticker.replace(/20(\d{2})$/, '$1');
      const url = `http://localhost:3000/tools/universal-calculator?contract=${shortTicker}`;
      chrome.tabs.create({ url: url });
    } else {
      // Открываем без параметра
      chrome.tabs.create({ url: 'http://localhost:3000/tools/universal-calculator' });
    }
    window.close();
  });
};

// Кнопка "Собрать все данные"
document.getElementById('collectAll').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab || !tab.url || !tab.url.includes('tradingview.com/options')) {
    alert('Откройте страницу опционов на TradingView');
    return;
  }
  
  // Показываем прогресс
  document.getElementById('collectProgress').style.display = 'block';
  document.getElementById('collectAll').disabled = true;
  document.getElementById('collectAll').textContent = '⏳ Сбор...';
  
  // Отправляем команду на сбор
  chrome.runtime.sendMessage({ 
    action: 'startDataCollection',
    tabId: tab.id 
  }, (response) => {
    if (response?.success) {
      document.getElementById('progressText').textContent = 'Сбор запущен...';
    } else {
      document.getElementById('collectAll').disabled = false;
      document.getElementById('collectAll').textContent = '📊 Собрать все данные';
      document.getElementById('collectProgress').style.display = 'none';
      alert(response?.error || 'Ошибка запуска сбора');
    }
  });
};

// Слушаем обновления прогресса
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'collectionProgress') {
    document.getElementById('progressBar').style.width = `${message.progress}%`;
    document.getElementById('progressText').textContent = message.text;
  }
  
  if (message.action === 'collectionComplete') {
    document.getElementById('collectAll').disabled = false;
    document.getElementById('collectAll').textContent = '📊 Собрать все данные';
    document.getElementById('progressBar').style.width = '100%';
    document.getElementById('progressText').textContent = message.success 
      ? `✅ Собрано: ${message.options} опционов` 
      : `⚠️ ${message.error}`;
    
    // Обновляем статистику
    loadStats();
    
    // Скрываем прогресс через 3 секунды
    setTimeout(() => {
      document.getElementById('collectProgress').style.display = 'none';
      document.getElementById('progressBar').style.width = '0%';
    }, 3000);
  }
});

loadStats();
