/**
 * ext2 — Интеграция с калькулятором Optioner.online
 */

function openOptionerCalculator(ticker) {
  const tickerPositions = tvc_positions[ticker] || [];
  const underlyingPrice = getUnderlyingPrice();

  if (!chrome.runtime?.id) {
    console.warn(LOG_TAG, 'Extension context invalidated');
    getBaseUrl().then(baseUrl => {
      window.open(`${baseUrl}/tools/universal-calculator`, '_blank');
    }).catch(() => {
      window.open('https://beta.optioner.online/tools/universal-calculator', '_blank');
    });
    return;
  }


  // Биржа: сначала из сохранённых данных, потом из текущего URL как fallback
  const exchange = tvc_exchanges[ticker] || getExchangeFromUrl() || null;

  chrome.runtime.sendMessage({
    action: 'ext2_openOptionerTab',
    ticker,
    positions: tickerPositions,
    underlyingPrice,
    exchange
  });
}

