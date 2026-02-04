/**
 * Хук для работы с данными от Chrome Extension TradingView Parser
 * ЗАЧЕМ: Получение опционов, тикера и цены из localStorage и URL параметров
 * Затрагивает: UniversalOptionsCalculator, интеграция с расширением
 * 
 * Механизм работы:
 * 1. Расширение парсит данные с TradingView
 * 2. Сохраняет в localStorage.tvc_calculator_state (отдельный ключ от старого калькулятора!)
 * 3. Открывает калькулятор с URL параметрами ?contract=ESH26&price=6910.75
 * 4. Калькулятор читает данные ТОЛЬКО если есть URL параметр ?contract=
 * 5. При обновлении данных расширением — калькулятор автоматически обновляется
 * 
 * ВАЖНО: Этот хук НЕ читает данные из calculatorState старого калькулятора!
 * Данные читаются только при наличии URL параметра ?contract=
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// Ключ в localStorage, куда расширение записывает данные
// ВАЖНО: Расширение использует именно этот ключ — НЕ МЕНЯТЬ!
const STORAGE_KEY = 'calculatorState';

/**
 * Парсинг URL параметров
 * ЗАЧЕМ: Получение contract, price и config из URL при открытии калькулятора
 */
function parseUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  return {
    contractCode: urlParams.get('contract') || null,
    urlPrice: urlParams.get('price') ? parseFloat(urlParams.get('price')) : null,
    // Проверяем, есть ли config в URL — если да, НЕ восстанавливаем данные от расширения
    // ЗАЧЕМ: Конфигурация из URL имеет приоритет над данными расширения
    hasConfigInUrl: !!urlParams.get('config')
  };
}

/**
 * Чтение данных из localStorage
 * ЗАЧЕМ: Получение полного состояния калькулятора от расширения
 */
function readStorageState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved);
  } catch (error) {
    console.error('❌ [useExtensionData] Ошибка чтения localStorage:', error);
    return null;
  }
}

/**
 * Адаптация формата опциона от расширения к формату калькулятора
 * ЗАЧЕМ: Приведение данных к единому формату для совместимости с компонентами
 */
function adaptOption(option) {
  // Определяем премию: при покупке используем ask, при продаже — bid
  const isBuy = option.action === 'Buy';
  const effectivePremium = isBuy 
    ? (option.ask || option.premium || 0) 
    : (option.bid || option.premium || 0);

  // Определяем IV: при покупке используем askIV, при продаже — bidIV
  // ЗАЧЕМ: Волатильность должна соответствовать цене входа в позицию
  // askIV — волатильность по цене ask (для покупки)
  // bidIV — волатильность по цене bid (для продажи)
  const effectiveIV = isBuy 
    ? (option.askIV || option.impliedVolatility || option.iv || 0) 
    : (option.bidIV || option.impliedVolatility || option.iv || 0);

  return {
    id: option.id || Date.now().toString(),
    action: option.action || 'Buy',
    type: option.type || 'CALL',
    strike: option.strike || 0,
    date: option.date || option.expirationDate || '',
    quantity: option.quantity || 1,
    premium: effectivePremium,
    bid: option.bid || 0,
    ask: option.ask || 0,
    volume: option.volume || 0,
    // OI не используется (нет в TradingView)
    oi: 0,
    visible: option.visible !== false,
    ticker: option.ticker || '',
    lastUpdated: option.lastUpdated || new Date().toISOString(),
    // Греки
    delta: option.delta || 0,
    gamma: option.gamma || 0,
    theta: option.theta || 0,
    vega: option.vega || 0,
    impliedVolatility: effectiveIV,
    // Дата входа в позицию
    entryDate: option.entryDate || new Date().toISOString().split('T')[0]
  };
}

/**
 * Основной хук для работы с данными от расширения
 */
export function useExtensionData() {
  // URL параметры (читаются один раз при инициализации)
  const urlParamsRef = useRef(parseUrlParams());
  
  // Состояние данных
  // ЛОГИКА ИНИЦИАЛИЗАЦИИ:
  // 1. Если есть URL параметр ?config= — НЕ восстанавливаем данные от расширения (конфигурация имеет приоритет)
  // 2. Если есть URL параметр ?contract= — читаем данные от расширения (приоритет)
  // 3. Если нет URL параметра, но в localStorage есть сохранённые данные с тикером — восстанавливаем их
  // ЗАЧЕМ: При навигации между страницами URL параметры теряются, но данные должны восстанавливаться
  const [state, setState] = useState(() => {
    const { contractCode, urlPrice, hasConfigInUrl } = urlParamsRef.current;
    
    // ВАЖНО: Если есть config в URL — НЕ восстанавливаем данные от расширения
    // ЗАЧЕМ: Конфигурация из URL имеет приоритет, данные будут загружены через loadConfiguration
    if (hasConfigInUrl) {
      console.log('⏭️ [useExtensionData] Пропускаем инициализацию — есть config в URL');
      return {
        contractCode: null,
        urlPrice: null,
        underlyingPrice: 0,
        ticker: '',
        expirationDate: '',
        options: [],
        isFromExtension: false,
        lastUpdated: null
      };
    }
    
    // Всегда читаем localStorage для проверки сохранённых данных
    const storageState = readStorageState();
    
    // Определяем, есть ли валидные данные для восстановления
    // ЗАЧЕМ: Если в localStorage есть тикер и опционы — это данные от расширения, которые нужно восстановить
    const hasStoredData = storageState && 
      (storageState.selectedTicker || storageState.options?.length > 0);
    
    // isFromExtension = true если:
    // 1. Есть URL параметр ?contract= (открытие из расширения)
    // 2. ИЛИ в localStorage есть сохранённые данные с тикером/опционами (возврат на страницу)
    const shouldRestoreFromExtension = !!contractCode || hasStoredData;
    
    return {
      // Код контракта из URL (или из localStorage при восстановлении)
      contractCode: contractCode || (hasStoredData ? storageState.selectedTicker : null),
      // Цена из URL (приоритет над localStorage)
      urlPrice: urlPrice,
      // Цена базового актива (URL > localStorage)
      underlyingPrice: urlPrice || storageState?.underlyingPrice || storageState?.currentPrice || 0,
      // Тикер контракта
      ticker: storageState?.selectedTicker || contractCode || '',
      // Дата экспирации
      expirationDate: storageState?.selectedExpirationDate || '',
      // Массив опционов (адаптированный формат)
      options: (storageState?.options || []).map(adaptOption),
      // Флаг: данные получены от расширения (URL параметр ИЛИ восстановление из localStorage)
      isFromExtension: shouldRestoreFromExtension,
      // Timestamp последнего обновления
      lastUpdated: Date.now()
    };
  });

  // Ref для хранения последнего хэша данных (для предотвращения дублирующих обновлений)
  const lastDataHashRef = useRef(null);

  /**
   * Обновление состояния из localStorage
   * ЗАЧЕМ: Вызывается при storage event или вручную
   */
  const updateFromStorage = useCallback(() => {
    const storageState = readStorageState();
    if (!storageState) return;

    // Создаём хэш ключевых данных для сравнения
    // ЗАЧЕМ: Предотвращаем бесконечный цикл обновлений если данные не изменились
    const dataHash = JSON.stringify({
      ticker: storageState.selectedTicker,
      price: storageState.underlyingPrice,
      optionsCount: storageState.options?.length || 0,
      optionsHash: (storageState.options || []).map(o => `${o.strike}-${o.type}-${o.date}`).join(',')
    });

    if (lastDataHashRef.current === dataHash) {
      // Данные не изменились — пропускаем обновление
      return;
    }
    lastDataHashRef.current = dataHash;

    const { urlPrice } = urlParamsRef.current;

    setState(prev => ({
      ...prev,
      // Цена: приоритет URL > localStorage
      underlyingPrice: urlPrice || storageState.underlyingPrice || prev.underlyingPrice,
      ticker: storageState.selectedTicker || prev.ticker,
      expirationDate: storageState.selectedExpirationDate || prev.expirationDate,
      options: (storageState.options || []).map(adaptOption),
      isFromExtension: true,
      lastUpdated: Date.now()
    }));

    console.log('📡 [useExtensionData] Данные обновлены из localStorage:', {
      ticker: storageState.selectedTicker,
      price: storageState.underlyingPrice,
      optionsCount: storageState.options?.length || 0
    });
  }, []);

  /**
   * Подписка на storage event
   * ЗАЧЕМ: Автоматическое обновление при изменении данных расширением
   * ВАЖНО: storage event срабатывает только при изменении из другого контекста (расширение)
   */
  useEffect(() => {
    const handleStorageChange = (event) => {
      // Реагируем только на изменение нашего ключа
      if (event.key !== STORAGE_KEY) return;
      
      console.log('📡 [useExtensionData] Storage event получен');
      updateFromStorage();
    };

    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [updateFromStorage]);

  /**
   * Ручное обновление из localStorage
   * ЗАЧЕМ: Позволяет принудительно перечитать данные
   */
  const refreshFromStorage = useCallback(() => {
    console.log('📡 [useExtensionData] Ручное обновление из localStorage');
    updateFromStorage();
  }, [updateFromStorage]);

  /**
   * Очистка данных расширения
   * ЗАЧЕМ: Полный сброс состояния при нажатии кнопки "Полный сброс"
   */
  const clearExtensionData = useCallback(() => {
    console.log('📡 [useExtensionData] Очистка данных расширения');
    
    // Очищаем localStorage
    // ЗАЧЕМ: Предотвращаем восстановление данных при обновлении страницы после сброса
    localStorage.removeItem(STORAGE_KEY);
    console.log('📡 [useExtensionData] localStorage очищен');
    
    setState({
      contractCode: null,
      urlPrice: null,
      underlyingPrice: 0,
      ticker: '',
      expirationDate: '',
      options: [],
      isFromExtension: false,
      lastUpdated: null
    });
  }, []);

  return {
    // Код контракта из URL (?contract=)
    contractCode: state.contractCode,
    // Цена из URL (?price=)
    urlPrice: state.urlPrice,
    // Цена базового актива (URL > localStorage)
    underlyingPrice: state.underlyingPrice,
    // Тикер контракта
    ticker: state.ticker,
    // Дата экспирации
    expirationDate: state.expirationDate,
    // Массив опционов
    options: state.options,
    // Флаг: данные от расширения
    isFromExtension: state.isFromExtension,
    // Timestamp последнего обновления
    lastUpdated: state.lastUpdated,
    // Функция ручного обновления
    refreshFromStorage,
    // Функция очистки данных
    clearExtensionData
  };
}

export default useExtensionData;

// ============================================================================
// УТИЛИТЫ ДЛЯ ОТПРАВКИ КОМАНД В РАСШИРЕНИЕ
// ============================================================================

/**
 * Ключ в localStorage для команд калькулятора → расширение
 * ЗАЧЕМ: Расширение слушает этот ключ и выполняет команды
 */
const COMMAND_KEY = 'tvc_refresh_command';

/**
 * Ключ в localStorage для результатов расширение → калькулятор
 * ЗАЧЕМ: Расширение записывает прогресс и результат сюда
 */
const RESULT_KEY = 'tvc_refresh_result';

/**
 * Отправка команды refresh_specific — обновление конкретных опционов
 * ЗАЧЕМ: Кнопка обновления данных (RefreshCw) в OptionsTableV3
 * 
 * @param {Array} options - Массив опционов для обновления
 * @param {boolean} refreshUnderlyingPrice - Также обновить цену базового актива
 * 
 * Формат options: [{ date: 'YYYY-MM-DD', strike: number, optionType: 'CALL'|'PUT' }]
 */
export function sendRefreshSpecificCommand(options, refreshUnderlyingPrice = true) {
  const command = {
    type: 'refresh_specific',
    options: options.map(opt => ({
      date: opt.date,
      strike: opt.strike,
      optionType: opt.type || opt.optionType
    })),
    refreshUnderlyingPrice,
    timestamp: Date.now(),
    processed: false
  };

  localStorage.setItem(COMMAND_KEY, JSON.stringify(command));
  console.log('📤 [Extension Command] refresh_specific отправлена:', command);
  
  return command;
}

/**
 * Отправка команды refresh_range — запрос диапазона опционов
 * ЗАЧЕМ: Волшебная кнопка (Magic) — подбор BuyPUT и BuyCALL
 * 
 * @param {number} daysFrom - Минимум дней до экспирации от сегодня
 * @param {number} daysTo - Максимум дней до экспирации от сегодня
 * @param {number} strikeFrom - Нижняя граница страйков (% от текущей цены, например -20)
 * @param {number} strikeTo - Верхняя граница страйков (% от текущей цены, например +20)
 */
export function sendRefreshRangeCommand(daysFrom, daysTo, strikeFrom, strikeTo) {
  const command = {
    type: 'refresh_range',
    daysFrom,
    daysTo,
    strikeFrom,
    strikeTo,
    timestamp: Date.now(),
    processed: false
  };

  localStorage.setItem(COMMAND_KEY, JSON.stringify(command));
  console.log('📤 [Extension Command] refresh_range отправлена:', command);
  
  return command;
}

/**
 * Отправка команды refresh_single_strike — запрос одного страйка
 * ЗАЧЕМ: Золотая кнопка (Golden) — подбор с конкретным страйком
 * 
 * @param {number} daysFrom - Минимум дней до экспирации от сегодня
 * @param {number} daysTo - Максимум дней до экспирации от сегодня
 * @param {number} strikePercent - Процент от текущей цены (например +5 = currentPrice × 1.05)
 */
export function sendRefreshSingleStrikeCommand(daysFrom, daysTo, strikePercent) {
  const command = {
    type: 'refresh_single_strike',
    daysFrom,
    daysTo,
    strikePercent,
    timestamp: Date.now(),
    processed: false
  };

  localStorage.setItem(COMMAND_KEY, JSON.stringify(command));
  console.log('📤 [Extension Command] refresh_single_strike отправлена:', command);
  
  return command;
}

/**
 * Отправка команды send_slices_to_chart — отправка срезок плана выхода на график TradingView
 * ЗАЧЕМ: Кнопка "Отправить срезки на график TradingView" в табе "Сделка"
 * 
 * @param {Array} slices - Массив срезок плана выхода
 * @param {string} chartUrl - Ссылка на график TradingView
 * 
 * Формат slices: [{
 *   price: number,          // Цена опциона
 *   text: string            // Текст для отображения на графике
 * }]
 */
export function sendSlicesToTradingViewCommand(slices, chartUrl = null) {
  const command = {
    type: 'send_slices_to_chart',
    slices: slices.map(slice => ({
      price: slice.price,
      text: slice.text
    })),
    chartUrl: chartUrl,
    timestamp: Date.now(),
    processed: false
  };

  localStorage.setItem(COMMAND_KEY, JSON.stringify(command));
  console.log('📤 [Extension Command] send_slices_to_chart отправлена:', command);
  
  return command;
}

/**
 * Отправка команды clear_slices — удаление срезок из расширения
 * ЗАЧЕМ: Кнопка "Сбросить план выхода" в табе "Сделка"
 * 
 * @param {string} chartUrl - Ссылка на график TradingView
 */
export function sendClearSlicesCommand(chartUrl = null) {
  const command = {
    type: 'clear_slices',
    chartUrl: chartUrl,
    timestamp: Date.now(),
    processed: false
  };

  localStorage.setItem(COMMAND_KEY, JSON.stringify(command));
  console.log('📤 [Extension Command] clear_slices отправлена:', command);
  
  return command;
}

/**
 * Чтение результата выполнения команды
 * ЗАЧЕМ: Получение прогресса и статуса от расширения
 * 
 * @returns {Object|null} Результат: { status, progress, message, data }
 */
export function readExtensionResult() {
  try {
    const result = localStorage.getItem(RESULT_KEY);
    if (!result) return null;
    return JSON.parse(result);
  } catch (error) {
    console.error('❌ [Extension Result] Ошибка чтения:', error);
    return null;
  }
}

/**
 * Очистка результата команды
 * ЗАЧЕМ: Сброс после обработки результата
 */
export function clearExtensionResult() {
  localStorage.removeItem(RESULT_KEY);
  console.log('🗑️ [Extension Result] Очищен');
}
