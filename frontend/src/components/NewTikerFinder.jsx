import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TrendingUp, BarChart3, LineChart, Circle, Bitcoin, Search, Trash2, Clock, X } from 'lucide-react';
import StockGroupSelector from './StockGroupSelector';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

/**
 * Компонент NewTikerFinder - универсальный поиск тикеров с отображением цены
 * ЗАЧЕМ: Единый компонент для поиска тикеров разных типов инструментов на всех страницах
 * Затрагивает: калькулятор опционов, новая сделка, аналитика
 * 
 * Типы инструментов: 'stock' | 'futures' | 'index' | 'options' | 'crypto'
 * Статусы цены: 'realtime' | 'delayed' | 'cached' | 'closed'
 */

// ============================================================================
// КОНСТАНТЫ
// ============================================================================

/** Конфигурация типов инструментов с цветными иконками */
const INSTRUMENT_TYPES = [
  { value: 'stock', label: 'Акции', icon: <TrendingUp className="h-4 w-4 text-green-500" /> },
  { value: 'futures', label: 'Фьючерсы', icon: <BarChart3 className="h-4 w-4 text-blue-500" /> },
  { value: 'index', label: 'Индексы', icon: <LineChart className="h-4 w-4 text-purple-500" /> },
  { value: 'options', label: 'Опционы', icon: <Circle className="h-4 w-4 text-orange-500" /> },
  { value: 'crypto', label: 'Криптовалюта', icon: <Bitcoin className="h-4 w-4 text-yellow-500" /> },
];


/** Ключ для localStorage истории тикеров */
const TICKER_HISTORY_KEY = 'new_ticker_finder_history';


// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/** Получить историю тикеров из localStorage */
const getTickerHistory = () => {
  try {
    const history = localStorage.getItem(TICKER_HISTORY_KEY);
    return history ? JSON.parse(history) : [];
  } catch {
    return [];
  }
};

/** Сохранить тикер в историю и вернуть обновленный список */
const saveTickerToHistory = (ticker, instrumentType) => {
  try {
    const history = getTickerHistory();
    const newEntry = { ticker, instrumentType };

    // Удалить дубликаты
    const filtered = history.filter(item => item.ticker !== ticker);

    // Добавить в начало, максимум 10 записей
    const updated = [newEntry, ...filtered].slice(0, 10);
    localStorage.setItem(TICKER_HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error('Ошибка сохранения истории тикеров:', error);
    return [];
  }
};

/** Удалить тикер из истории */
const removeTickerFromHistory = (ticker) => {
  try {
    const history = getTickerHistory();
    const filtered = history.filter(item => item.ticker !== ticker);
    localStorage.setItem(TICKER_HISTORY_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (error) {
    console.error('Ошибка удаления тикера из истории:', error);
    return [];
  }
};


/** Автоопределение типа инструмента по тикеру */
const detectInstrumentType = (ticker) => {
  const upperTicker = ticker.toUpperCase();

  // Фьючерсы начинаются с /
  if (ticker.startsWith('/')) return 'futures';

  // Криптовалюты
  const cryptoSymbols = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'LINK'];
  if (cryptoSymbols.includes(upperTicker) || upperTicker.endsWith('USD') || upperTicker.endsWith('USDT')) {
    return 'crypto';
  }

  // Индексы
  const indexSymbols = ['SPX', 'NDX', 'DJI', 'VIX', 'RUT'];
  if (indexSymbols.includes(upperTicker)) return 'index';

  // По умолчанию - акции
  return 'stock';
};

// ============================================================================
// КОМПОНЕНТ
// ============================================================================

const NewTikerFinder = ({
  onTickerSelect,
  onClassificationChange,
  initialTicker = '',
  initialInstrumentType,
  placeholder = 'Введите тикер и Enter',
  disabled = false,
}) => {
  // Ref для отслеживания кликов вне компонента
  const wrapperRef = useRef(null);

  // Используем initialTicker от родителя (калькулятор сам сохраняет состояние)
  const startTicker = initialTicker || '';
  const startType = initialInstrumentType || (startTicker ? detectInstrumentType(startTicker) : 'stock');

  // Состояние инпута тикера
  const [inputValue, setInputValue] = useState(startTicker);
  const [confirmedTicker, setConfirmedTicker] = useState(startTicker);

  // Состояние выпадающего списка истории
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [tickerHistory, setTickerHistory] = useState([]);

  // Состояние типа инструмента
  const [instrumentType, setInstrumentType] = useState(startType);

  // Состояние цены
  const [priceData, setPriceData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Состояние классификации акции
  // ЗАЧЕМ: Для определения группы акции и применения коэффициентов P&L
  const [stockClassification, setStockClassification] = useState(null);
  const [isClassificationLoading, setIsClassificationLoading] = useState(false);

  // Загрузка истории тикеров при монтировании
  useEffect(() => {
    setTickerHistory(getTickerHistory());
  }, []);

  // Закрытие выпадающего списка при клике вне компонента
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsHistoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Загрузка классификации акции
  // ЗАЧЕМ: Определяем группу акции для корректировки P&L прогнозов
  const fetchClassification = useCallback(async (ticker) => {
    if (!ticker) {
      setStockClassification(null);
      return null;
    }

    setIsClassificationLoading(true);

    try {
      const response = await fetch(`/api/stock/classify?symbol=${ticker}`);

      if (response.ok) {
        const data = await response.json();
        // Добавляем originalGroup для отслеживания исходной группы из API
        // ЗАЧЕМ: При ручном переопределении группы нужно знать, какая была исходная
        const classificationWithOriginal = {
          ...data,
          originalGroup: data.group
        };
        setStockClassification(classificationWithOriginal);
        console.log(`📊 Классификация ${ticker}:`, classificationWithOriginal);
        return classificationWithOriginal;
      } else {
        console.warn(`Ошибка классификации ${ticker}:`, response.status);
        setStockClassification(null);
        return null;
      }
    } catch (error) {
      console.error('Ошибка загрузки классификации:', error);
      setStockClassification(null);
      return null;
    } finally {
      setIsClassificationLoading(false);
    }
  }, []);

  // Принудительное обновление классификации (очистка кэша + повторный запрос)
  // ЗАЧЕМ: Позволяет пользователю обновить авто-определение группы
  const refreshClassification = useCallback(async () => {
    if (!confirmedTicker || instrumentType !== 'stock') return;

    setIsClassificationLoading(true);

    try {
      // Очищаем кэш для этого тикера
      await fetch(`/api/stock/clear-cache?symbol=${confirmedTicker}`, { method: 'POST' });

      // Запрашиваем классификацию заново
      await fetchClassification(confirmedTicker);

      console.log(`🔄 Классификация ${confirmedTicker} обновлена`);
    } catch (error) {
      console.error('Ошибка обновления классификации:', error);
    }
  }, [confirmedTicker, instrumentType, fetchClassification]);

  // Загрузка цены от API
  // ЗАЧЕМ: Получаем актуальную цену после подтверждения тикера
  // ВАЖНО: Возвращает priceData для передачи в onTickerSelect
  const fetchPrice = useCallback(async (ticker, type) => {
    if (!ticker) {
      setPriceData(null);
      return null;
    }

    setIsLoading(true);

    try {
      // Проверяем кеш в localStorage
      const cacheKey = `price_cache_${ticker}`;
      const cached = localStorage.getItem(cacheKey);

      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const cacheAge = Date.now() - timestamp;

        // Если кеш свежий (< 1 минуты), используем его
        if (cacheAge < 60000) {
          const cachedData = { ...data, status: 'cached' };
          setPriceData(cachedData);
          setIsLoading(false);
          return cachedData;
        }
      }

      // Пока реализован только Finnhub API для акций
      if (type === 'stock') {
        const response = await fetch(`/api/finnhub/quote?symbol=${ticker}`);

        if (response.ok) {
          const data = await response.json();

          // Определяем статус цены на основе timestamp
          // ЗАЧЕМ: Показываем актуальность данных - realtime/delayed/closed
          const now = Date.now() / 1000; // timestamp в секундах
          const timeDiff = now - data.t;

          let status = 'realtime';
          if (timeDiff > 3600 || timeDiff < -3600) { // более 1 часа в прошлое или будущее - закрыт
            status = 'closed';
          } else if (timeDiff > 300) { // более 5 минут - задержка
            status = 'delayed';
          }
          const price = data.c || 0;
          const previousClose = data.pc || price;
          const change = price - previousClose;
          const changePercent = previousClose ? (change / previousClose) * 100 : 0;

          const newPriceData = {
            price,
            status,
            change,
            changePercent,
            timestamp: data.t,
          };

          setPriceData(newPriceData);

          console.log(`💰 Цена для ${ticker} получена из Finnhub:`, {
            price: newPriceData.price,
            change: newPriceData.change,
            changePercent: newPriceData.changePercent,
            timestamp: data.t,
            timestampReadable: new Date(data.t * 1000).toLocaleString(),
            timeDiff: timeDiff,
            status: status,
            source: 'Finnhub API'
          });

          // Сохраняем в кеш
          localStorage.setItem(cacheKey, JSON.stringify({
            data: newPriceData,
            timestamp: Date.now(),
          }));

          return newPriceData;
        } else {
          // Пробуем получить из кеша при ошибке
          if (cached) {
            const { data } = JSON.parse(cached);
            const cachedData = { ...data, status: 'cached' };
            setPriceData(cachedData);
            return cachedData;
          } else {
            setPriceData(null);
            return null;
          }
        }
      } else {
        // Для других типов инструментов пока заглушка
        setPriceData(null);
        console.log(`API для ${type} пока не реализован`);
        return null;
      }
    } catch (error) {
      console.error('Ошибка загрузки цены:', error);

      // Пробуем получить из кеша при ошибке
      const cacheKey = `price_cache_${ticker}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data } = JSON.parse(cached);
        const cachedData = { ...data, status: 'cached' };
        setPriceData(cachedData);
        return cachedData;
      } else {
        setPriceData(null);
        return null;
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Флаг чтобы не повторять загрузку при ошибке
  const hasAttemptedLoad = useRef(false);

  // ЗАЧЕМ: Загружаем цену при монтировании, если есть начальный тикер
  // ВАЖНО: Загружаем только ОДИН раз, не повторяем при ошибке!
  useEffect(() => {
    if (confirmedTicker && !priceData && !isLoading && !hasAttemptedLoad.current) {
      hasAttemptedLoad.current = true;
      fetchPrice(confirmedTicker, instrumentType);

      // Добавлена автоматическая загрузка классификации для акций
      // ЗАЧЕМ: Чтобы группа акции определялась сразу при загрузке страницы
      if (instrumentType === 'stock' && !stockClassification && !isClassificationLoading) {
        fetchClassification(confirmedTicker).then(classification => {
          if (classification && onClassificationChange) {
            onClassificationChange(classification);
          }
        });
      }
    }
  }, [confirmedTicker, instrumentType, fetchPrice, priceData, isLoading, stockClassification, isClassificationLoading, fetchClassification, onClassificationChange]);

  // Сбрасываем флаг при смене тикера
  useEffect(() => {
    hasAttemptedLoad.current = false;
  }, [confirmedTicker]);

  // Общая функция выбора тикера (используется и для Enter, и для клика по истории)
  // ЗАЧЕМ: Единая логика выбора тикера для всех способов ввода
  // ВАЖНО: Асинхронная функция — ждём загрузку цены перед уведомлением родителя
  const selectTicker = useCallback(async (ticker, type = null) => {
    const upperTicker = ticker.toUpperCase();
    const detectedType = type || detectInstrumentType(upperTicker);

    setConfirmedTicker(upperTicker);
    setInputValue(upperTicker);
    setInstrumentType(detectedType);
    setIsHistoryOpen(false);

    // Сохраняем в историю и обновляем локальный state
    const updatedHistory = saveTickerToHistory(upperTicker, detectedType);
    setTickerHistory(updatedHistory);

    // Загружаем цену и классификацию параллельно
    // ЗАЧЕМ: Передаём priceData и classification в onTickerSelect
    const [loadedPriceData, loadedClassification] = await Promise.all([
      fetchPrice(upperTicker, detectedType),
      detectedType === 'stock' ? fetchClassification(upperTicker) : Promise.resolve(null)
    ]);

    // Уведомляем родителя с загруженными данными о цене и классификации
    if (onTickerSelect) {
      onTickerSelect(upperTicker, detectedType, loadedPriceData, loadedClassification);
    }
  }, [fetchPrice, fetchClassification, onTickerSelect]);

  // Обработка нажатия Enter
  // ЗАЧЕМ: Подтверждение тикера и запуск загрузки цены
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      selectTicker(inputValue.trim());
    }
    if (e.key === 'Escape') {
      setIsHistoryOpen(false);
    }
  };

  // Обработка выбора тикера из истории
  // ЗАЧЕМ: Быстрый выбор без необходимости нажимать Enter
  const handleHistorySelect = (historyItem) => {
    selectTicker(historyItem.ticker, historyItem.instrumentType);
  };

  // Удаление тикера из истории
  const handleRemoveFromHistory = (e, ticker) => {
    e.stopPropagation(); // Не закрывать dropdown и не выбирать тикер
    const updatedHistory = removeTickerFromHistory(ticker);
    setTickerHistory(updatedHistory);
  };

  // Обработка изменения типа инструмента
  // ЗАЧЕМ: Пользователь может вручную изменить автоопределенный тип
  const handleInstrumentTypeChange = (value) => {
    setInstrumentType(value);

    // Перезагружаем цену с новым типом
    if (confirmedTicker) {
      fetchPrice(confirmedTicker, value);

      // Обновляем историю с новым типом
      saveTickerToHistory(confirmedTicker, value);

      // Уведомляем родителя
      if (onTickerSelect) {
        onTickerSelect(confirmedTicker, value, priceData);
      }
    }
  };

  // Загрузка цены при инициализации с начальным тикером
  // ЗАЧЕМ: Показываем цену для восстановленного тикера
  // НЕ уведомляем родителя — калькулятор уже загрузил состояние из localStorage
  useEffect(() => {
    if (startTicker) {
      fetchPrice(startTicker, startType);
    }
  }, []);

  // Фильтрация истории по введенному тексту
  // ЗАЧЕМ: При клике на выбранный тикер показываем всю историю, а не только текущий
  const filteredHistory = confirmedTicker && inputValue === confirmedTicker
    ? tickerHistory // Показываем всю историю при клике на выбранный тикер
    : tickerHistory.filter(item =>
      item.ticker.toLowerCase().includes(inputValue.toLowerCase())
    );

  // Очистка инпута
  // ЗАЧЕМ: Сбрасываем состояние и уведомляем родителя
  const handleClear = () => {
    setInputValue('');
    setConfirmedTicker('');
    setPriceData(null);
    setStockClassification(null);
    setIsHistoryOpen(true);
    // Уведомляем родителя об очистке
    if (onTickerSelect) {
      onTickerSelect('', 'stock', null, null);
    }
  };

  // Обработчик изменения группы акции
  // ЗАЧЕМ: Позволяет пользователю вручную переопределить автоматическую классификацию
  // ВАЖНО: Используем onClassificationChange вместо onTickerSelect, чтобы не сбрасывать опционы
  const handleGroupChange = useCallback((newGroup, multipliers) => {
    // Обновляем локальное состояние с новой группой
    // ВАЖНО: Сохраняем originalGroup для корректного определения "авто" в селекторе
    const originalGroup = stockClassification?.originalGroup || stockClassification?.group || 'growth';
    const updatedClassification = {
      ...stockClassification,
      group: newGroup,
      down_mult: multipliers.down_mult,
      up_mult: multipliers.up_mult,
      originalGroup: originalGroup,
      overridden: newGroup !== originalGroup
    };
    setStockClassification(updatedClassification);

    // Уведомляем родителя об изменении классификации (без сброса опционов)
    if (onClassificationChange) {
      onClassificationChange(updatedClassification);
    }
  }, [stockClassification, onClassificationChange]);

  return (
    <div className="inline-flex flex-col gap-2 p-3 border border-cyan-500 rounded-lg">
      {/* Основная строка: Селект - Инпут - Цена */}
      <div className="flex items-center gap-4">
        {/* Селект типа инструмента */}
        {/* <Select value={instrumentType} onValueChange={handleInstrumentTypeChange} disabled={disabled}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INSTRUMENT_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                <div className="flex items-center gap-2">
                  {type.icon}
                  <span>{type.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select> */}

        {/* Инпут тикера с выпадающим списком истории */}
        <div className="relative" ref={wrapperRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
            <Input
              type="text"
              placeholder={placeholder}
              value={inputValue}
              onChange={(e) => {
                // Фильтруем только английские буквы, цифры и допустимые символы (/, ., -)
                // ЗАЧЕМ: Тикеры всегда в верхнем регистре на английском
                const filtered = e.target.value
                  .replace(/[^A-Za-z0-9/.\-]/g, '') // Убираем всё кроме латиницы, цифр и /.-
                  .toUpperCase();
                setInputValue(filtered);
                setIsHistoryOpen(true);
              }}
              onFocus={() => setIsHistoryOpen(true)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              className={`w-60 pl-9 pr-8 font-mono font-bold border-2 border-cyan-500 placeholder:text-xs placeholder:font-normal placeholder:text-gray-400`}
              style={confirmedTicker ? {} : { animation: 'ticker-pulse 0.8s ease-in-out infinite' }}
            />
            {/* Кнопка очистки */}
            {inputValue && (
              <button
                onClick={handleClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded transition-colors z-10"
                title="Очистить"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>

          {/* Выпадающий список истории тикеров */}
          {isHistoryOpen && filteredHistory.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-60 overflow-auto">
              <div className="p-1">
                <div className="px-2 py-1.5 text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Недавние
                </div>
                {filteredHistory.map((item) => (
                  <div
                    key={item.ticker}
                    onClick={() => handleHistorySelect(item)}
                    className="flex items-center justify-between px-2 py-1.5 hover:bg-accent rounded cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium">{item.ticker}</span>
                      <span className="text-xs text-muted-foreground">
                        {INSTRUMENT_TYPES.find(t => t.value === item.instrumentType)?.label || item.instrumentType}
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleRemoveFromHistory(e, item.ticker)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded transition-all"
                      title="Удалить из истории"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Цена от поставщика */}
        <div className="flex items-center gap-3 min-w-[80px]">
          {isLoading ? (
            <span className="text-muted-foreground text-sm">Загрузка...</span>
          ) : priceData ? (
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <span className="text-xl font-bold">${priceData.price.toFixed(2)}</span>
                <img
                  src="https://finnhub.io/static/img/webp/finnhub-logo.webp"
                  alt="Finnhub"
                  className="w-6 h-6 cursor-pointer"
                  style={{
                    filter: priceData.status === 'closed' ? 'grayscale(100%)' :
                      priceData.status === 'delayed' ? 'sepia(100%) hue-rotate(45deg)' :
                        'invert(21%) sepia(96%) saturate(748%) hue-rotate(94deg) brightness(102%) contrast(105%)' // realtime - яркий зеленый
                  }}
                  onClick={() => window.open('https://finnhub.io', '_blank')}
                  title="Finnhub - источник данных"
                />
              </div>
              <span className="text-xs text-gray-500">{new Date(priceData.timestamp * 1000).toLocaleString()}</span>
            </div>
          ) : confirmedTicker ? (
            <span className="text-muted-foreground text-sm">Нет данных</span>
          ) : null}
        </div>

        {/* Селектор группы акции */}
        {confirmedTicker && instrumentType === 'stock' && (
          <>
            {console.log('[NewTikerFinder] Rendering StockGroupSelector:', {
              confirmedTicker,
              instrumentType,
              hasClassification: !!stockClassification,
              isLoading: isClassificationLoading
            })}
            <StockGroupSelector
              symbol={confirmedTicker}
              classification={stockClassification}
              onGroupChange={handleGroupChange}
              onRefreshClassification={refreshClassification}
              isLoading={isClassificationLoading}
              compact={false}
              disabled={false}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default NewTikerFinder;
