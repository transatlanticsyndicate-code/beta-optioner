/**
 * ext2 Background — Синхронизация с калькулятором (один канал — StorageEvent)
 */

function handleOptionDeletedFromCalculator(message, sendResponse) {
  const { ticker, deletedOptionKeys } = message;
  console.log('[EXT2 BG] Удалено из калькулятора:', ticker, deletedOptionKeys);

  chrome.storage.local.get(['tvc_positions'], (result) => {
    const positions = result.tvc_positions || {};
    if (!positions[ticker] || !deletedOptionKeys?.length) {
      sendResponse({ success: true, deleted: 0 });
      return;
    }

    const before = positions[ticker].length;
    positions[ticker] = positions[ticker].filter(p => {
      const exp = p.expiration;
      return !deletedOptionKeys.some(key =>
        key.type === p.type && key.strike === p.strike && key.expiration === exp
      );
    });
    const deleted = before - positions[ticker].length;

    if (positions[ticker].length === 0) delete positions[ticker];

    chrome.storage.local.set({ tvc_positions: positions }, () => {
      // Обновить панель на TV
      chrome.tabs.query({ url: ['https://*.tradingview.com/options/*'] }, (tvTabs) => {
        tvTabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'refreshPanel' }).catch(() => {});
        });
      });
      sendResponse({ success: true, deleted });
    });
  });
}

function handleSyncDeleteToCalculator(message, sendResponse) {
  const { optionKey } = message;
  console.log('[EXT2 BG] syncDelete received:', optionKey);

  chrome.tabs.query({ url: ['https://beta.optioner.online/*', 'http://localhost:3000/*'] }, (tabs) => {
    if (tabs.length === 0) {
      sendResponse({ success: false });
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (key) => {
        const raw = localStorage.getItem('calculatorState');
        if (!raw) return { deleted: 0 };
        const state = JSON.parse(raw);
        const before = (state.options || []).length;
        state.options = (state.options || []).filter(o =>
          !(o.type === key.type && o.strike === key.strike && o.date === key.expiration)
        );
        const deleted = before - state.options.length;
        if (deleted > 0) {
          localStorage.setItem('calculatorState', JSON.stringify(state));
          // Reload чтобы React подхватил изменения
          setTimeout(() => location.reload(), 100);
        }
        return { deleted };
      },
      args: [optionKey]
    }).then(results => {
      sendResponse({ success: true, ...results[0]?.result });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
  });
}

function handleClearTickerFromCalculator(message, sendResponse) {
  const { ticker } = message;

  chrome.tabs.query({ url: ['https://beta.optioner.online/*', 'http://localhost:3000/*'] }, (tabs) => {
    if (tabs.length === 0) { sendResponse({ success: true }); return; }

    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (t) => {
        const raw = localStorage.getItem('calculatorState');
        if (!raw) return;
        const state = JSON.parse(raw);
        const cur = state.selectedTicker || '';
        if (cur === t || cur.startsWith(t) || t.startsWith(cur)) {
          state.options = [];
          localStorage.setItem('calculatorState', JSON.stringify(state));
          setTimeout(() => location.reload(), 100);
        }
      },
      args: [ticker]
    }).then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
  });
}

function handleClearAllFromCalculator(message, sendResponse) {
  chrome.storage.local.set({ tvc_positions: {} }, () => {
    chrome.tabs.query({ url: ['https://*.tradingview.com/options/*'] }, (tvTabs) => {
      tvTabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: 'refreshPanel' }).catch(() => {});
      });
    });
    sendResponse({ success: true });
  });
}

console.log('[EXT2 BG] sync.js loaded');
