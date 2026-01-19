/**
 * Интеграция с калькулятором Optioner.online
 * ЗАЧЕМ: Открытие калькулятора и передача позиций
 */

// Открыть калькулятор и передать позиции (если есть)
function openOptionerCalculator(ticker) {
  const tickerPositions = tvc_positions[ticker] || [];

  // Получаем цену underlying
  const underlyingPrice = getUnderlyingPrice();

  console.log('[TVC] Открываем Optioner Calculator, позиций:', tickerPositions.length, 'цена:', underlyingPrice);

  // Проверяем валидность контекста расширения
  if (!chrome.runtime?.id) {
    console.log('[TVC] Extension context invalidated, cannot open Optioner');
    // Fallback: открываем напрямую
    window.open('http://localhost:3000/tools/universal-calculator', '_blank');
    return;
  }

  // Открываем вкладку и передаём позиции через background script
  chrome.runtime.sendMessage({
    action: 'openOptionerTab',
    ticker: ticker,
    positions: tickerPositions,
    underlyingPrice: underlyingPrice
  });
}

console.log('[TVC] optioner-bridge.js загружен');
