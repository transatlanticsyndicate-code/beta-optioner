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
 * ЗАЧЕМ: Получение contract и price из URL при открытии калькулятора
 */
function parseUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  return {
    contractCode: urlParams.get('contract') || null,
    urlPrice: urlParams.get('price') ? parseFloat(urlParams.get('price')) : null
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
    impliedVolatility: option.impliedVolatility || option.iv || 0,
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
  // ВАЖНО: Читаем localStorage ТОЛЬКО если есть URL параметр ?contract=
  // ЗАЧЕМ: Изоляция от старого калькулятора — данные читаются только при открытии из расширения
  const [state, setState] = useState(() => {
    const { contractCode, urlPrice } = urlParamsRef.current;
    
    // Читаем localStorage только если есть URL параметр ?contract=
    // ЗАЧЕМ: Без URL параметра калькулятор не должен показывать данные от расширения
    const storageState = contractCode ? readStorageState() : null;
    
    return {
      // Код контракта из URL
      contractCode: contractCode,
      // Цена из URL (приоритет над localStorage)
      urlPrice: urlPrice,
      // Цена базового актива (URL > localStorage)
      underlyingPrice: urlPrice || storageState?.underlyingPrice || 0,
      // Тикер контракта
      ticker: storageState?.selectedTicker || contractCode || '',
      // Дата экспирации
      expirationDate: storageState?.selectedExpirationDate || '',
      // Массив опционов (адаптированный формат)
      options: (storageState?.options || []).map(adaptOption),
      // Флаг: данные получены от расширения (только если есть URL параметр)
      isFromExtension: !!contractCode,
      // Timestamp последнего обновления
      lastUpdated: Date.now()
    };
  });

  /**
   * Обновление состояния из localStorage
   * ЗАЧЕМ: Вызывается при storage event или вручную
   */
  const updateFromStorage = useCallback(() => {
    const storageState = readStorageState();
    if (!storageState) return;

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
