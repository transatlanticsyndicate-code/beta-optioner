/**
 * Утилита для автоматического определения типа инструмента по тикеру
 * ЗАЧЕМ: Упрощает UX, автоматически определяя тип инструмента
 * Затрагивает: калькулятор опционов, форма новой сделки
 */

// Списки известных тикеров по категориям
const KNOWN_INSTRUMENTS = {
  // Популярные акции
  stocks: [
    'AAPL', 'GOOGL', 'GOOG', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD',
    'NFLX', 'DIS', 'BABA', 'V', 'MA', 'JPM', 'BAC', 'WMT', 'PG', 'KO',
    'PEP', 'INTC', 'CSCO', 'VZ', 'T', 'MRK', 'PFE', 'JNJ', 'UNH', 'HD',
    'MCD', 'NKE', 'SBUX', 'BA', 'CAT', 'GE', 'GM', 'F', 'UBER', 'LYFT',
    'SNAP', 'TWTR', 'SQ', 'PYPL', 'SHOP', 'ZM', 'DOCU', 'CRM', 'ORCL',
    'IBM', 'HPQ', 'DELL', 'ADBE', 'INTU', 'NOW', 'SNOW', 'PLTR', 'COIN',
    'HOOD', 'RBLX', 'ABNB', 'DASH', 'DKNG', 'PENN', 'MGM', 'LVS', 'WYNN',
    'MSTR', 'RIOT', 'MARA', 'CLSK', 'HUT', 'BITF', 'ARBK', 'CIFR'
  ],
  
  // ETF и индексные фонды
  indices: [
    'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'VEA', 'VWO', 'AGG', 'BND',
    'GLD', 'SLV', 'USO', 'UNG', 'XLE', 'XLF', 'XLK', 'XLV', 'XLI', 'XLP',
    'XLY', 'XLU', 'XLB', 'XLRE', 'XLC', 'VNQ', 'EEM', 'EFA', 'TLT', 'IEF',
    'SHY', 'LQD', 'HYG', 'JNK', 'EMB', 'MBB', 'VCIT', 'VCSH', 'BNDX', 'VXUS'
  ],
  
  // Фьючерсы (обычно содержат цифры месяца/года)
  futures: [
    'ES', 'NQ', 'YM', 'RTY', 'MES', 'MNQ', 'M2K', 'MYM', // E-mini индексы
    'CL', 'NG', 'RB', 'HO', 'BZ', // Энергия
    'GC', 'SI', 'HG', 'PA', 'PL', // Металлы
    'ZC', 'ZW', 'ZL', 'ZM', 'ZO', 'ZR', 'KE', // Зерновые (ZS исключена - это акция Zscaler)
    'LE', 'GF', 'HE', // Животноводство
    'ZB', 'ZN', 'ZF', 'ZT', 'UB', // Казначейские облигации
    '6E', '6B', '6J', '6A', '6C', '6S', '6N', '6M', // Валюты
    'BTC', 'ETH', 'MBT', 'MET' // Крипто фьючерсы
  ],
  
  // Криптовалюты (обычно заканчиваются на USD, USDT и т.д.)
  crypto: [
    'BTCUSD', 'ETHUSD', 'BNBUSD', 'ADAUSD', 'SOLUSD', 'XRPUSD', 'DOTUSD',
    'DOGEUSD', 'AVAXUSD', 'MATICUSD', 'LINKUSD', 'UNIUSD', 'LTCUSD',
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'SOLUSDT', 'XRPUSDT'
  ]
};

/**
 * Определяет тип инструмента по тикеру
 * @param {string} ticker - Тикер инструмента
 * @returns {string} - Тип инструмента: 'stocks', 'futures', 'indices', 'crypto', 'options'
 */
export const detectInstrumentType = (ticker) => {
  if (!ticker || typeof ticker !== 'string') {
    return 'stocks'; // По умолчанию акции
  }
  
  const upperTicker = ticker.toUpperCase().trim();
  
  // Проверка на опционы (содержат дату и страйк, например: AAPL250117C00150000)
  if (/^[A-Z]{1,5}\d{6}[CP]\d{8}$/.test(upperTicker)) {
    return 'options';
  }
  
  // Проверка на криптовалюты (заканчиваются на USD, USDT, BUSD и т.д.)
  if (/(USD|USDT|BUSD|USDC)$/.test(upperTicker)) {
    return 'crypto';
  }
  
  // Проверка в известных списках
  if (KNOWN_INSTRUMENTS.stocks.includes(upperTicker)) {
    return 'stocks';
  }
  
  if (KNOWN_INSTRUMENTS.indices.includes(upperTicker)) {
    return 'indices';
  }
  
  if (KNOWN_INSTRUMENTS.futures.includes(upperTicker)) {
    return 'futures';
  }
  
  if (KNOWN_INSTRUMENTS.crypto.includes(upperTicker)) {
    return 'crypto';
  }
  
  // Эвристики для фьючерсов
  // Фьючерсы часто имеют формат: символ + месяц + год (например: ESH24, NQM23)
  if (/^[A-Z]{1,3}[FGHJKMNQUVXZ]\d{2,4}$/.test(upperTicker)) {
    return 'futures';
  }
  
  // Фьючерсы с цифрами в конце (например: ES1!, NQ1!)
  if (/^[A-Z]{1,3}\d[!]?$/.test(upperTicker)) {
    return 'futures';
  }
  
  // По умолчанию считаем акцией
  return 'stocks';
};

/**
 * Получает иконку для типа инструмента
 * @param {string} type - Тип инструмента
 * @returns {string} - Название иконки из lucide-react
 */
export const getInstrumentIcon = (type) => {
  const icons = {
    stocks: 'TrendingUp',
    futures: 'Activity',
    indices: 'BarChart3',
    options: 'Target',
    crypto: 'Bitcoin'
  };
  return icons[type] || 'TrendingUp';
};

/**
 * Получает цвет для типа инструмента
 * @param {string} type - Тип инструмента
 * @returns {string} - CSS класс цвета
 */
export const getInstrumentColor = (type) => {
  const colors = {
    stocks: 'text-green-500',
    futures: 'text-blue-500',
    indices: 'text-purple-500',
    options: 'text-orange-500',
    crypto: 'text-yellow-500'
  };
  return colors[type] || 'text-green-500';
};

/**
 * Получает название типа инструмента на русском
 * @param {string} type - Тип инструмента
 * @returns {string} - Название на русском
 */
export const getInstrumentName = (type) => {
  const names = {
    stocks: 'Акции',
    futures: 'Фьючерсы',
    indices: 'Индексы',
    options: 'Опционы',
    crypto: 'Криптовалюта'
  };
  return names[type] || 'Акции';
};
