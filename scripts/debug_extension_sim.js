/**
 * Скрипт для симуляции передачи данных от расширения
 * Вставить в DevTools Console на странице калькулятора
 * 
 * ШАГИ ВОСПРОИЗВЕДЕНИЯ БАГА:
 * 1. Сначала запустить step1_btc() — симулируем открытие с BTC
 * 2. Подождать 2 секунды, проверить что цена = 95000
 * 3. Запустить step2_eth() — симулируем переключение на ETH
 * 4. Проверить цену — должна стать 3200, но баг показывает 95000
 */

// ШАГ 1: Симулируем открытие с BTC опционами
window.step1_btc = function() {
  const btcState = {
    selectedTicker: 'BTCUSDT',
    selectedExpirationDate: '2026-03-28',
    underlyingPrice: 95000,
    currentPrice: 95000,
    options: [
      {
        id: '1001',
        action: 'Buy',
        type: 'CALL',
        strike: 100000,
        date: '2026-03-28',
        quantity: 1,
        premium: 2500,
        bid: 2490,
        ask: 2510,
        volume: 100,
        oi: 500,
        visible: true,
        ticker: 'BTCUSDT',
        lastUpdated: new Date().toISOString(),
        delta: 0.45,
        gamma: 0.00001,
        theta: -50,
        vega: 100,
        impliedVolatility: 0.65
      }
    ]
  };
  localStorage.setItem('calculatorState', JSON.stringify(btcState));
  console.log('✅ [SIM] BTC данные записаны в localStorage:', btcState);
  console.log('📌 [SIM] Теперь обнови страницу (F5) и проверь цену = 95000');
};

// ШАГ 2: Симулируем переключение на ETH (расширение обновляет localStorage)
window.step2_eth = function() {
  const ethState = {
    selectedTicker: 'ETHUSDT',
    selectedExpirationDate: '2026-03-28',
    underlyingPrice: 3200,
    options: [
      {
        id: '2001',
        action: 'Buy',
        type: 'CALL',
        strike: 3500,
        date: '2026-03-28',
        quantity: 1,
        premium: 150,
        bid: 148,
        ask: 152,
        volume: 200,
        oi: 1000,
        visible: true,
        ticker: 'ETHUSDT',
        lastUpdated: new Date().toISOString(),
        delta: 0.40,
        gamma: 0.0001,
        theta: -8,
        vega: 30,
        impliedVolatility: 0.70
      }
    ]
  };
  localStorage.setItem('calculatorState', JSON.stringify(ethState));
  console.log('✅ [SIM] ETH данные записаны в localStorage:', ethState);
  console.log('👀 [SIM] Проверь консоль — какая цена установлена?');
  // storage event НЕ срабатывает в той же вкладке — нужно вызвать вручную
  window.dispatchEvent(new StorageEvent('storage', {
    key: 'calculatorState',
    newValue: JSON.stringify(ethState),
    oldValue: null,
    storageArea: localStorage
  }));
};

// Читаем что сейчас в localStorage
window.checkStorage = function() {
  const state = JSON.parse(localStorage.getItem('calculatorState') || '{}');
  console.log('📦 [STORAGE] Текущее состояние calculatorState:', {
    ticker: state.selectedTicker,
    underlyingPrice: state.underlyingPrice,
    currentPrice: state.currentPrice,
    optionsCount: state.options?.length
  });
};

console.log('🛠️ Скрипт загружен. Доступные команды:');
console.log('  step1_btc()  — записать BTC данные в localStorage');
console.log('  step2_eth()  — симулировать передачу ETH от расширения');
console.log('  checkStorage() — посмотреть текущее состояние localStorage');
