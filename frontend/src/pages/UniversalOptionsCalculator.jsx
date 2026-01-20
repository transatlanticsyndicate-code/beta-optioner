/**
 * Универсальный Калькулятор Опционов
 * ЗАЧЕМ: Поддержка двух режимов (Акции/Фьючерсы) с источником данных TradingView Extension
 * Затрагивает: Расчёты P&L, сохранение конфигураций, интеграция с TradingView
 * 
 * Отличия от оригинального калькулятора:
 * - Два режима: Акции (multiplier=100) и Фьючерсы (multiplier=pointValue)
 * - Источник данных: TradingView Extension (не Polygon API)
 * - БЕЗ AI модели прогнозирования волатильности
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { Calculator, ChevronUp, ChevronDown, Save, RotateCcw, TrendingUp, Activity, BarChart3, Target, Bitcoin, LineChart, Layers } from 'lucide-react';
// УБРАНО: NewTikerFinder не используется — данные приходят от расширения
// import NewTikerFinder from '../components/NewTikerFinder';
import { useLocation } from 'react-router-dom';
import { useLocalStorageValue } from '../hooks/useLocalStorage';
import { getActiveBlocks, isBlockEnabled } from '../config/calculatorV3Blocks';
import { applyStrategy, getAllStrategies } from '../config/optionsStrategies';
import { saveCustomStrategy, getCustomStrategies, deleteCustomStrategy, applyCustomStrategy } from '../utils/customStrategies';
import { detectInstrumentType } from '../utils/instrumentTypeDetector';
import { Card, CardContent } from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
// УБРАНО: TradingViewWidget не используется в универсальном калькуляторе
// import TradingViewWidget from '../components/TradingViewWidget';

// Импорт модульных компонентов (используем те же, что и в V2)
import {
  BaseAssetPositions,
  // УБРАНО: ExpirationCalendar не используется — даты приходят от расширения
  // ExpirationCalendar,
  PriceScale,
  StrikeScale,
  OptionsMetrics,
  RiskCalculator,
  StrategyDialog,
  PLChart,
  CalculatorSettings,
  OptionsBoard,
  PositionFinancialControl,
  SaveConfigurationDialog,
  PriceAndTimeSettings
} from '../components/CalculatorV2';
import OptionsTableV3 from '../components/CalculatorV2/OptionsTableV3';
import FinancialControl from '../components/CalculatorV2/FinancialControl';
import ExitCalculator from '../components/CalculatorV2/ExitCalculator';
import OptionSelectionResult from '../components/CalculatorV2/OptionSelectionResult';
import { getDaysUntilExpirationUTC, calculateDaysRemainingUTC } from '../utils/dateUtils';
import { WhatsNewModal, shouldShowModal } from '../components/WhatsNewModal';
import { useIVSurface } from '../hooks/useIVSurface';
// УБРАНО: AI модель не используется в универсальном калькуляторе
// import aiPredictionService from '../services/aiPredictionService';

// Импорт утилиты для работы с настройками фьючерсов
// ЗАЧЕМ: Получение pointValue для расчётов P&L в режиме фьючерсов
import { loadFuturesSettings, getPointValue, getFutureByTicker, isFuturesTicker } from '../utils/futuresSettings';

// Импорт хука для работы с данными от Chrome Extension TradingView Parser
// ЗАЧЕМ: Получение опционов, тикера и цены из localStorage и URL параметров
import { useExtensionData } from '../hooks/useExtensionData';

// УБРАНО: AI модель не используется в универсальном калькуляторе
// const AI_SUPPORTED_TICKERS = [...];

// Режимы калькулятора
// ЗАЧЕМ: Определяет тип инструмента и соответствующую математику P&L
const CALCULATOR_MODES = {
  STOCKS: 'stocks',
  FUTURES: 'futures'
};

// Демо-данные для опционов (вынесены за пределы компонента для оптимизации)
const demoOptions = [
  { id: "1", action: "Buy", type: "CALL", strike: 250, date: "2025-10-25", quantity: 1, premium: 5.9, bid: 5.8, ask: 6.0, volume: 2164, oi: 134514, visible: true },
  { id: "2", action: "Buy", type: "PUT", strike: 240, date: "2025-10-25", quantity: 1, premium: 14.7, bid: 14.5, ask: 16.0, volume: 12164, oi: 234514, visible: true },
  { id: "3", action: "Sell", type: "CALL", strike: 260, date: "2025-11-15", quantity: -1, premium: 8.1, bid: 8.0, ask: 8.2, volume: 5164, oi: 184514, visible: true },
  { id: "4", action: "Sell", type: "PUT", strike: 230, date: "2025-11-15", quantity: -1, premium: 5.0, bid: 4.8, ask: 5.2, volume: 3164, oi: 94514, visible: true },
  { id: "5", action: "Buy", type: "CALL", strike: 255, date: "2025-12-20", quantity: 2, premium: 12.5, bid: 12.3, ask: 12.7, volume: 8164, oi: 324514, visible: true },
  { id: "6", action: "Sell", type: "CALL", strike: 245, date: "2025-12-20", quantity: -2, premium: 18.2, bid: 18.0, ask: 18.4, volume: 9164, oi: 424514, visible: true },
];

// No conversion needed - use ISO dates directly

function UniversalOptionsCalculator() {
  // === ИНТЕГРАЦИЯ С CHROME EXTENSION ===
  // ЗАЧЕМ: Получение данных опционов от TradingView Parser через localStorage
  const {
    contractCode,           // Код контракта из URL (?contract=)
    urlPrice,               // Цена из URL (?price=)
    underlyingPrice: extensionPrice,  // Цена базового актива
    ticker: extensionTicker,          // Тикер от расширения
    expirationDate: extensionExpirationDate,  // Дата экспирации
    options: extensionOptions,        // Массив опционов от расширения
    isFromExtension,        // Флаг: данные от расширения
    lastUpdated: extensionLastUpdated,  // Timestamp последнего обновления
    refreshFromStorage,     // Функция ручного обновления
    clearExtensionData      // Функция очистки данных расширения
  } = useExtensionData();

  // Установка заголовка страницы
  useEffect(() => {
    document.title = 'Универсальный Калькулятор Опционов | SYNDICATE Platform';
    return () => {
      document.title = 'SYNDICATE Platform';
    };
  }, []);

  // === НОВОЕ: Режим калькулятора (Акции/Фьючерсы) ===
  // ЗАЧЕМ: Определяет тип инструмента и соответствующую математику P&L
  const [calculatorMode, setCalculatorMode] = useState(CALCULATOR_MODES.FUTURES);
  
  // Информация о выбранном фьючерсе (для режима фьючерсов)
  // ЗАЧЕМ: Хранит pointValue и название фьючерса для расчётов
  const [selectedFuture, setSelectedFuture] = useState(null);
  
  // Множитель контракта (100 для акций, pointValue для фьючерсов)
  // ЗАЧЕМ: Используется в расчётах P&L
  const contractMultiplier = useMemo(() => {
    if (calculatorMode === CALCULATOR_MODES.FUTURES && selectedFuture) {
      return selectedFuture.pointValue || 1;
    }
    return 100; // Стандартный множитель для акций
  }, [calculatorMode, selectedFuture]);
  
  // Статус подключения к TradingView Extension
  // ЗАЧЕМ: Отображение статуса в UI
  const [tradingViewConnected, setTradingViewConnected] = useState(false);
  
  // Проверка статуса TradingView Extension при монтировании
  useEffect(() => {
    const checkTradingViewStatus = async () => {
      try {
        const response = await fetch('/api/universal/tradingview/status');
        if (response.ok) {
          const data = await response.json();
          setTradingViewConnected(data.connected || false);
        }
      } catch (error) {
        console.log('TradingView Extension не подключен');
        setTradingViewConnected(false);
      }
    };
    checkTradingViewStatus();
    // Проверяем каждые 30 секунд
    const interval = setInterval(checkTradingViewStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Все блоки всегда включены
  const activeBlocks = getActiveBlocks();

  // Функция проверки, должен ли блок отображаться (всегда true)
  const shouldShowBlock = (blockId) => {
    return true; // Все блоки всегда отображаются
  };

  // State для выбранного тикера
  const [selectedTicker, setSelectedTicker] = useState("");
  const [isDataCleared, setIsDataCleared] = useState(false);
  const [showDemoData, setShowDemoData] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(0); // Начальное значение 0, обновляется при выборе тикера
  const [priceChange, setPriceChange] = useState({ value: 0, percent: 0 }); // Начальное значение
  
  // State для зафиксированных позиций
  // ЗАЧЕМ: Если isLocked=true, данные НЕ обновляются с API при загрузке конфигурации
  const [isLocked, setIsLocked] = useState(false);
  
  // State для даты сохранения конфигурации (для зафиксированных позиций)
  // ЗАЧЕМ: Ползунок дат должен начинаться с даты сохранения, а не с сегодня
  const [savedConfigDate, setSavedConfigDate] = useState(null);
  
  // State для текущей рыночной цены (для зафиксированных позиций)
  // ЗАЧЕМ: Кнопка сброса цены должна сбрасывать на текущую цену, а не на цену при сохранении
  const [livePrice, setLivePrice] = useState(null);
  
  // State для отслеживания загруженной конфигурации
  // ЗАЧЕМ: Позволяет автоматически сохранять изменения (новые опционы) в localStorage
  const [loadedConfigId, setLoadedConfigId] = useState(null);
  
  // State для режима редактирования конфигурации
  // ЗАЧЕМ: Позволяет редактировать сохраненную конфигурацию в разблокированном виде
  const [isEditMode, setIsEditMode] = useState(false);
  
  // State для отслеживания изменений в режиме редактирования
  // ЗАЧЕМ: Показывать кнопку "Сохранить изменения" только при наличии изменений
  const [hasChanges, setHasChanges] = useState(false);

  // State для настроек калькулятора
  // IMPORTANT: daysPassed - прошедшие дни от сегодня (новая логика для корректной работы с разными сроками экспирации)
  // Каждый опцион имеет свой initialDaysToExpiration, а actualDaysRemaining = max(0, initialDaysToExpiration - daysPassed)
  const [daysPassed, setDaysPassed] = useState(0); // Начальное значение - 0 дней (сегодня)
  const [userAdjustedDays, setUserAdjustedDays] = useState(false); // Флаг что пользователь изменил бегунок
  const [chartDisplayMode, setChartDisplayMode] = useState('profit-loss-dollar');
  const [showOptionLines, setShowOptionLines] = useState(() => {
    // Загружаем из localStorage при инициализации
    const saved = localStorage.getItem('showOptionLines');
    return saved !== null ? JSON.parse(saved) : true; // По умолчанию true
  });

  const [showProbabilityZones, setShowProbabilityZones] = useState(() => {
    // Загружаем из localStorage при инициализации
    const saved = localStorage.getItem('showProbabilityZones');
    return saved !== null ? JSON.parse(saved) : true; // По умолчанию true
  });

  // State для учёта дивидендов (модель Black-Scholes-Merton)
  const [useDividends, setUseDividends] = useState(() => {
    const saved = localStorage.getItem('useDividends');
    return saved !== null ? JSON.parse(saved) : true; // По умолчанию включено
  });
  const [dividendYield, setDividendYield] = useState(0); // Дивидендная доходность в десятичном формате
  const [dividendLoading, setDividendLoading] = useState(false);

  // State для синхронизированных настроек цены
  const [targetPrice, setTargetPrice] = useState(0);

  // State для параметров подбора опционов (из AIOptionSelectorDialog)
  // ЗАЧЕМ: Хранит параметры для отображения компонента OptionSelectionResult
  const [optionSelectionParams, setOptionSelectionParams] = useState(null);

  // УБРАНО: AI модель не используется в универсальном калькуляторе
  // Оставляем переменные как заглушки для совместимости с компонентами
  const isAIEnabled = false;
  const setIsAIEnabled = () => {}; // Заглушка
  const aiVolatilityMap = {};
  const setAiVolatilityMap = () => {}; // Заглушка

  // Синхронизируем targetPrice с currentPrice при первой загрузке цены
  useEffect(() => {
    if (currentPrice > 0 && targetPrice === 0) {
      setTargetPrice(currentPrice);
    }
  }, [currentPrice, targetPrice]);

  // State для формы новой сделки
  const [dealForm, setDealForm] = useState({
    type: 'futures',
  });

  // Функции для обработки формы сделки
  const handleDealInputChange = (field, value) => {
    setDealForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Сохраняем showOptionLines в localStorage при изменении
  useEffect(() => {
    localStorage.setItem('showOptionLines', JSON.stringify(showOptionLines));
  }, [showOptionLines]);

  // Сохраняем showProbabilityZones в localStorage при изменении
  useEffect(() => {
    localStorage.setItem('showProbabilityZones', JSON.stringify(showProbabilityZones));
  }, [showProbabilityZones]);

  // Сохраняем useDividends в localStorage при изменении
  useEffect(() => {
    localStorage.setItem('useDividends', JSON.stringify(useDividends));
  }, [useDividends]);

  // УБРАНО: AI модель не используется в универсальном калькуляторе
  // useEffect для isAIEnabled удалён

  // Загрузка дивидендной доходности при выборе тикера
  // ЗАЧЕМ: Для модели Black-Scholes-Merton нужна dividend yield
  useEffect(() => {
    const fetchDividendYield = async () => {
      if (!selectedTicker) {
        setDividendYield(0);
        return;
      }
      
      setDividendLoading(true);
      try {
        const response = await fetch(`/api/polygon/dividend-yield/${selectedTicker}`);
        if (response.ok) {
          const data = await response.json();
          setDividendYield(data.dividend_yield || 0);
          console.log(`📊 Dividend yield для ${selectedTicker}: ${(data.dividend_yield * 100).toFixed(2)}%`);
        } else {
          setDividendYield(0);
        }
      } catch (error) {
        console.error('Ошибка загрузки dividend yield:', error);
        setDividendYield(0);
      } finally {
        setDividendLoading(false);
      }
    };
    
    fetchDividendYield();
  }, [selectedTicker]);

  // State для позиций
  const [positions, setPositions] = useState([]); // Убрано демо-данные AAPL

  // State для сворачивания блока симуляции
  const [isMarketSimulationCollapsed, setIsMarketSimulationCollapsed] = useState(() => {
    const saved = localStorage.getItem('isMarketSimulationCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  // Сохраняем состояние сворачивания блока симуляции
  useEffect(() => {
    localStorage.setItem('isMarketSimulationCollapsed', JSON.stringify(isMarketSimulationCollapsed));
  }, [isMarketSimulationCollapsed]);

  // State для загрузки дат экспирации
  const [isLoadingDates, setIsLoadingDates] = useState(false);
  
  // Загружаем IV Surface для точного прогнозирования волатильности
  // ЗАЧЕМ: IV Surface содержит IV для разных дат экспирации, что позволяет
  // интерполировать IV при симуляции времени вместо использования простой sqrt модели
  const { ivSurface, loading: ivSurfaceLoading } = useIVSurface(selectedTicker);
  
  // State для модального окна "Что нового?"
  // ЗАЧЕМ: Показываем пользователю нововведения при первом посещении новой версии
  const [showWhatsNew, setShowWhatsNew] = useState(() => shouldShowModal());
  
  // State для страйков по датам
  const [strikesByDate, setStrikesByDate] = useState({}); // { "2025-10-17": [195, 200, 205, ...] }
  const [loadingStrikesForDate, setLoadingStrikesForDate] = useState({}); // { "2025-10-17": true }
  
  // State для календаря экспирации (объявляем рано, чтобы использовать в addOption)
  // Используем ISO формат YYYY-MM-DD
  // ВАЖНО: Начальное значение null — дата выбирается пользователем из списка доступных
  const [selectedExpirationDate, setSelectedExpirationDate] = useState(null);
  const [expirationDates, setExpirationDates] = useState({});

  // Функция загрузки страйков для конкретной даты
  // ОТКЛЮЧЕНО: В универсальном калькуляторе данные приходят от расширения
  const loadStrikesForDate = useCallback(async (ticker, date) => {
    console.log('📡 [Universal] loadStrikesForDate отключена — данные от расширения');
    return [];
  }, []);
  
  // Функция загрузки деталей опциона (bid/ask/volume/oi) после выбора страйка
  // ОТКЛЮЧЕНО: В универсальном калькуляторе данные приходят от расширения
  const loadOptionDetails = useCallback(async (optionId, ticker, date, strike, optionType, extraFields = {}) => {
    console.log('📡 [Universal] loadOptionDetails отключена — данные от расширения');
    return null;
  }, []);
  
  // Функция загрузки дат экспирации
  // ОТКЛЮЧЕНО: В универсальном калькуляторе даты приходят от расширения
  const loadExpirationDates = useCallback(async (ticker) => {
    console.log('📡 [Universal] loadExpirationDates отключена — данные от расширения');
    setIsLoadingDates(false);
  }, []);

  // УБРАНО: AI модель не используется в универсальном калькуляторе
  // Заглушка для совместимости с компонентами
  const fetchAIVolatility = useCallback(async () => {
    return null;
  }, []);

  // Обработчик выбора тикера из NewTikerFinder
  // ЗАЧЕМ: Единая точка входа для выбора тикера с автоматическим определением типа
  // ВАЖНО: Используем priceData из NewTikerFinder, чтобы избежать дублирующего запроса к API
  const handleTickerSelect = (ticker, instrumentType = null, priceData = null) => {
    if (ticker) {
      flushSync(() => {
        setShowDemoData(false);
        setPositions([]);
        setExpirationDates({});
        setOptions([]);
        
        // Если priceData передан из NewTikerFinder — используем его сразу
        // ЗАЧЕМ: Избегаем дублирующего запроса к Polygon API
        if (priceData && priceData.price) {
          setCurrentPrice(priceData.price);
          setTargetPrice(priceData.price);
          setPriceChange({
            value: priceData.change || 0,
            percent: priceData.changePercent || 0
          });
        } else {
          // Сбрасываем цену только если данных нет
          setCurrentPrice(0);
          setPriceChange({ value: 0, percent: 0 });
        }
        
        // Используем переданный тип инструмента или определяем автоматически
        const type = instrumentType || detectInstrumentType(ticker);
        setDealForm(prev => ({
          ...prev,
          type: type
        }));
      });
      setSelectedTicker(ticker);
      // Если priceData уже есть — не нужно загружать цену заново, но даты экспирации нужны
      if (priceData && priceData.price) {
        setIsDataCleared(false);
        setNeedLoadExpirations(true);
      } else {
        setIsDataCleared(true);
      }
    } else {
      setSelectedTicker("");
      setIsDataCleared(false);
      setShowDemoData(false);
      setExpirationDates({});
      setOptions([]);
    }
  };

  // Флаг для загрузки дат экспирации (отдельно от isDataCleared)
  const [needLoadExpirations, setNeedLoadExpirations] = useState(false);
  
  // ОТКЛЮЧЕНО: В универсальном калькуляторе данные приходят от расширения
  // Не загружаем данные с внешних API (Polygon)
  useEffect(() => {
    if (selectedTicker && isDataCleared) {
      // Просто сбрасываем флаг — данные придут от расширения
      console.log('📡 [Universal] Внешние API отключены — данные от расширения');
      setIsDataCleared(false);
      setIsLoadingDates(false);
    }
    if (needLoadExpirations) {
      setNeedLoadExpirations(false);
    }
  }, [selectedTicker, isDataCleared, needLoadExpirations]);

  const [options, setOptions] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Функции для сохранения и загрузки состояния калькулятора
  const saveCalculatorState = useCallback(() => {
    const state = {
      selectedTicker,
      currentPrice,
      priceChange,
      options,
      positions,
      selectedExpirationDate,
      daysPassed,
      chartDisplayMode,
      showOptionLines,
      showProbabilityZones,
      strikesByDate,
      expirationDates,
    };
    localStorage.setItem('calculatorState', JSON.stringify(state));
  }, [selectedTicker, currentPrice, priceChange, options, positions, selectedExpirationDate, daysPassed, chartDisplayMode, showOptionLines, showProbabilityZones, strikesByDate, expirationDates]);

  const resetCalculator = useCallback(() => {
    setSelectedTicker('');
    setCurrentPrice(0);
    setTargetPrice(0);
    setPriceChange({ value: 0, percent: 0 });
    setOptions([]);
    setPositions([]);
    setSelectedExpirationDate(null);
    setDaysPassed(0);
    setChartDisplayMode('profit-loss-dollar');
    setUserAdjustedDays(false);
    setIsDataCleared(false);
    setShowDemoData(false);
    setStrikesByDate({});
    setExpirationDates({});
    setIsLocked(false); // Сбрасываем флаг фиксации
    setSavedConfigDate(null); // Сбрасываем дату сохранения конфигурации
    setLivePrice(null); // Сбрасываем текущую рыночную цену
    setOptionSelectionParams(null); // Сбрасываем параметры подбора опционов
    localStorage.removeItem('calculatorState');
    
    // НОВОЕ: Очищаем данные расширения (тикер контракта и временную метку)
    clearExtensionData();
  }, [clearExtensionData]);

  // Загружаем состояние при первой загрузке страницы
  // ПРИОРИТЕТ: Данные от расширения (URL + localStorage.calculatorState) > сохранённые конфигурации
  // ЗАЧЕМ: Универсальный калькулятор работает только с данными от Chrome Extension
  useEffect(() => {
    if (isInitialized) return;
    
    // === ИНТЕГРАЦИЯ С CHROME EXTENSION ===
    // Если есть данные от расширения — используем их
    if (isFromExtension) {
      console.log('📡 [Universal] Инициализация из данных расширения:', {
        contractCode,
        ticker: extensionTicker,
        price: extensionPrice,
        optionsCount: extensionOptions?.length || 0
      });
      
      // Устанавливаем тикер
      if (extensionTicker || contractCode) {
        setSelectedTicker(extensionTicker || contractCode);
      }
      
      // Устанавливаем цену (приоритет URL > localStorage)
      if (extensionPrice > 0) {
        setCurrentPrice(extensionPrice);
        setTargetPrice(extensionPrice);
      }
      
      // Устанавливаем дату экспирации
      if (extensionExpirationDate) {
        setSelectedExpirationDate(extensionExpirationDate);
      }
      
      // Устанавливаем опционы
      if (extensionOptions && extensionOptions.length > 0) {
        setOptions(extensionOptions);
        console.log('📡 [Universal] Загружено опционов:', extensionOptions.length);
      }
      
      // Автоматически определяем режим (фьючерсы/акции) по тикеру
      const ticker = extensionTicker || contractCode;
      if (ticker && isFuturesTicker(ticker)) {
        setCalculatorMode(CALCULATOR_MODES.FUTURES);
        const futureInfo = getFutureByTicker(ticker);
        setSelectedFuture(futureInfo);
        console.log('📊 Автоматически переключено в режим фьючерсов:', futureInfo);
      }
      
      setIsInitialized(true);
      return;
    }
    
    // === ЗАГРУЗКА СОХРАНЕННОГО СОСТОЯНИЯ ===
    // Если нет данных от расширения — пробуем загрузить сохраненное состояние
    // ЗАЧЕМ: При перезагрузке страницы без URL параметра восстанавливаем последнее состояние
    const saved = localStorage.getItem('calculatorState');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        
        // Проверяем, что это данные универсального калькулятора (есть underlyingPrice)
        if (state.underlyingPrice !== undefined || state.selectedTicker) {
          console.log('📡 [Universal] Загрузка сохраненного состояния из localStorage');
          
          setSelectedTicker(state.selectedTicker || '');
          setCurrentPrice(state.currentPrice || state.underlyingPrice || 0);
          setTargetPrice(state.currentPrice || state.underlyingPrice || 0);
          setPriceChange(state.priceChange || { value: 0, percent: 0 });
          
          // Восстанавливаем опционы
          const restoredOptions = (state.options || []).map(opt => ({
            ...opt,
            entryDate: opt.entryDate || new Date().toISOString().split('T')[0]
          }));
          setOptions(restoredOptions);
          setPositions(state.positions || []);
          setSelectedExpirationDate(state.selectedExpirationDate || null);
          setDaysPassed(state.daysPassed || 0);
          setChartDisplayMode(state.chartDisplayMode || 'profit-loss-dollar');
          setStrikesByDate(state.strikesByDate || {});
          setExpirationDates(state.expirationDates || {});
          
          console.log('✅ [Universal] Состояние восстановлено:', {
            ticker: state.selectedTicker,
            optionsCount: restoredOptions.length
          });
        }
      } catch (error) {
        console.error('❌ [Universal] Ошибка загрузки состояния:', error);
      }
    } else {
      console.log('📡 [Universal] Ожидание данных от расширения...');
    }
    
    setIsInitialized(true);
  }, [isInitialized, isFromExtension, contractCode, extensionTicker, extensionPrice, extensionExpirationDate, extensionOptions]);

  // === СИНХРОНИЗАЦИЯ С CHROME EXTENSION ===
  // ЗАЧЕМ: Автоматическое обновление при изменении данных расширением (storage event)
  useEffect(() => {
    if (!isInitialized) return;
    
    // Обновляем опционы при изменении от расширения
    if (extensionOptions && extensionOptions.length > 0) {
      setOptions(extensionOptions);
      console.log('📡 [Universal] Опционы обновлены от расширения:', extensionOptions.length);
    }
    
    // Обновляем цену
    if (extensionPrice > 0) {
      setCurrentPrice(extensionPrice);
      // Обновляем targetPrice только если она ещё не была изменена пользователем
      if (targetPrice === 0 || targetPrice === currentPrice) {
        setTargetPrice(extensionPrice);
      }
    }
    
    // Обновляем тикер
    if (extensionTicker && extensionTicker !== selectedTicker) {
      setSelectedTicker(extensionTicker);
    }
    
    // Обновляем дату экспирации
    if (extensionExpirationDate && extensionExpirationDate !== selectedExpirationDate) {
      setSelectedExpirationDate(extensionExpirationDate);
    }
  }, [isInitialized, extensionLastUpdated]); // Зависимость от extensionLastUpdated для реакции на storage event

  // УБРАНО: AI модель не используется в универсальном калькуляторе
  // useEffect для автоматического запроса AI прогнозов удалён
  
  // Автоматически устанавливаем daysPassed при изменении опционов
  // ЛОГИКА: Если пользователь установил ползунок — сохраняем его выбор (с коррекцией если нужно)
  // Если пользователь не трогал ползунок — устанавливаем в максимум (день экспирации)
  // ВАЖНО: Для зафиксированных позиций НЕ перезаписываем daysPassed
  useEffect(() => {
    if (options.length === 0) return;
    
    // Для зафиксированных позиций — не перезаписываем daysPassed
    // ЗАЧЕМ: daysPassed уже вычислен как разница между сегодня и датой сохранения
    if (savedConfigDate) {
      console.log('📅 Зафиксированная позиция — daysPassed не перезаписывается');
      return;
    }
    
    // Вычисляем самую старую дату входа (entryDate) среди всех опционов
    // ЗАЧЕМ: Ползунок должен начинать отсчет от даты входа в самую старую позицию
    let oldestEntryDate = null;
    options.forEach(opt => {
      const entryDateStr = opt.entryDate || new Date().toISOString().split('T')[0];
      const entryDate = new Date(entryDateStr + 'T00:00:00');
      if (!oldestEntryDate || entryDate < oldestEntryDate) {
        oldestEntryDate = entryDate;
      }
    });
    
    // Вычисляем максимальное количество дней от самой старой даты входа до экспирации
    // ВАЖНО: Считаем от oldestEntryDate, а не от сегодня
    const baseDate = oldestEntryDate || new Date();
    baseDate.setHours(0, 0, 0, 0);
    
    const maxDays = options.reduce((max, opt) => {
      if (!opt.date) return max;
      const expirationDate = new Date(opt.date + 'T00:00:00');
      const diffTime = expirationDate.getTime() - baseDate.getTime();
      const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(max, daysUntil);
    }, 0);
    
    if (userAdjustedDays) {
      // Пользователь установил ползунок — сохраняем его выбор
      // ЗАЧЕМ: При изменении опциона ползунок должен остаться на том же дне
      // Исключение: если новый maxDays меньше текущего daysPassed — корректируем
      if (daysPassed > maxDays) {
        console.log(`📅 Корректировка daysPassed: ${daysPassed} → ${maxDays} (новый максимум меньше)`);
        setDaysPassed(maxDays);
      }
      // Флаг userAdjustedDays НЕ сбрасываем — пользователь по-прежнему контролирует ползунок
    } else {
      // Пользователь не трогал бегунок — устанавливаем в максимум (крайнее правое положение)
      setDaysPassed(maxDays);
    }
  }, [options.length, options.map(o => o.date).join(','), options.map(o => o.entryDate).join(','), savedConfigDate]); // Добавили entryDate в зависимости
  
  const displayOptions = useMemo(() => {
    const result = showDemoData ? demoOptions : options;
    return result;
  }, [showDemoData, options]);
  
  // Шаг 2: Определяем, нужно ли показывать метки дат на флажках
  // Показываем метки, если используется более одной уникальной даты
  const forceShowDateBadges = useMemo(() => {
    // Фильтруем только опционы с датой (displayOptions уже содержит только видимые)
    const optionsWithDate = displayOptions.filter(opt => opt.date && opt.visible !== false);
    
    console.log('🏷️ forceShowDateBadges check:', {
      totalDisplayOptions: displayOptions.length,
      optionsWithDate: optionsWithDate.length,
      dates: optionsWithDate.map(opt => opt.date),
    });
    
    if (optionsWithDate.length <= 1) {
      console.log('🏷️ Result: false (only 1 or 0 options)');
      return false;
    }
    
    const uniqueDates = new Set(optionsWithDate.map(opt => opt.date));
    const shouldShow = uniqueDates.size > 1;
    
    console.log('🏷️ Result:', {
      uniqueDates: Array.from(uniqueDates),
      shouldShow
    });
    
    return shouldShow;
  }, [displayOptions]);
  
  // Шаг 3: Создаем единую карту цветов для дат
  // Каждая уникальная дата получает свой цвет
  const dateColorMap = useMemo(() => {
    const colors = [
      '#2962ff',  // Синий
      '#b84dff',  // Фиолетовый
      '#34b9fe',  // Голубой
      '#b0a10c',  // Желто-зеленый
    ];
    
    const uniqueDates = [...new Set(displayOptions.filter(opt => opt.date).map(opt => opt.date))].sort();
    const map = {};
    uniqueDates.forEach((date, index) => {
      map[date] = colors[index % colors.length];
    });
    
    console.log('🎨 dateColorMap:', map);
    return map;
  }, [displayOptions]);

  const togglePositionVisibility = (id) => {
    setPositions(positions.map((pos) => (pos.id === id ? { ...pos, visible: !pos.visible } : pos)));
  };

  const deletePosition = (id) => {
    setPositions(positions.filter((pos) => pos.id !== id));
  };

  const addPosition = (type, quantity = 100, price = 242.14) => {
    const newPosition = {
      id: Date.now().toString(),
      type,
      quantity,
      ticker: selectedTicker || "AAPL",
      price,
      visible: true,
    };
    setPositions([...positions, newPosition]);
  };

  const toggleOptionVisibility = useCallback((id) => {
    setOptions(prevOptions => prevOptions.map((opt) => (opt.id === id ? { ...opt, visible: !opt.visible } : opt)));
  }, []);

  const deleteOption = useCallback((id) => {
    setOptions(prevOptions => {
      const updated = prevOptions.filter((opt) => opt.id !== id);
      // Очищаем название стратегии при удалении опциона
      setSelectedStrategyName('');
      return updated;
    });
  }, []);

  const updateOption = useCallback((id, field, value) => {
    setOptions(prevOptions => prevOptions.map((opt) => 
      opt.id === id ? { ...opt, [field]: value } : opt
    ));
  }, []);
  
  const updatePosition = useCallback((id, field, value) => {
    setPositions(prevPositions => prevPositions.map((pos) => 
      pos.id === id ? { ...pos, [field]: value } : pos
    ));
  }, []);
  
  const handleStrikeUpdate = useCallback((optionId, updates) => {
    setOptions(prevOptions => prevOptions.map((opt) => 
      opt.id === optionId ? { ...opt, ...updates } : opt
    ));
    console.log('📍 Strike updated via Drag & Drop:', { optionId, updates });
  }, []);

  // ОТКЛЮЧЕНО: В универсальном калькуляторе страйки приходят от расширения
  // Не загружаем страйки с внешних API
  // useEffect для автозагрузки страйков отключен

  const roundedPrice = Math.round(currentPrice);
  
  const availableStrikes = useMemo(() => {
    if (!roundedPrice || roundedPrice <= 0) {
      return [200, 210, 220, 230, 240, 250, 260, 270, 280, 290, 300];
    }
    const strikes = [];
    const basePrice = roundedPrice;
    const step = basePrice > 100 ? 5 : 1;
    for (let i = -20; i <= 20; i++) {
      const strike = Math.round((basePrice + (basePrice * i * 0.01)) / step) * step;
      if (strike > 0 && !strikes.includes(strike)) {
        strikes.push(strike);
      }
    }
    return strikes.sort((a, b) => a - b);
  }, [roundedPrice]);

  // Функция для расчета автоматического страйка из доступных страйков
  const calculateAutoStrike = useCallback((type, price = currentPrice) => {
    if (!price || price <= 0 || availableStrikes.length === 0) return null;
    
    // Сортируем страйки по возрастанию
    const sortedStrikes = [...availableStrikes].sort((a, b) => a - b);
    
    // Находим ближайший страйк к текущей цене (ATM)
    let atmIndex = 0;
    let minDiff = Math.abs(sortedStrikes[0] - price);
    
    for (let i = 1; i < sortedStrikes.length; i++) {
      const diff = Math.abs(sortedStrikes[i] - price);
      if (diff < minDiff) {
        minDiff = diff;
        atmIndex = i;
      }
    }
    
    // Считаем сколько уже есть опционов этого типа
    const existingOptionsOfType = options.filter(opt => opt.type === type);
    const countOfType = existingOptionsOfType.length;
    
    // Базовая дистанция: 2 позиции от ATM
    // Дополнительная дистанция: +2 позиции за каждый существующий опцион того же типа
    const additionalDistance = countOfType * 2;
    
    if (type === 'CALL') {
      // Для CALL: берем страйк на (2 + дополнительная дистанция) позиций выше ATM
      const targetIndex = atmIndex + 2 + additionalDistance;
      return targetIndex < sortedStrikes.length ? sortedStrikes[targetIndex] : sortedStrikes[sortedStrikes.length - 1];
    } else if (type === 'PUT') {
      // Для PUT: берем страйк на (2 + дополнительная дистанция) позиций ниже ATM
      const targetIndex = atmIndex - 2 - additionalDistance;
      return targetIndex >= 0 ? sortedStrikes[targetIndex] : sortedStrikes[0];
    }
    
    return null;
  }, [currentPrice, availableStrikes, options]);

  const addOption = useCallback((action, type) => {
    // Очищаем название стратегии при добавлении опциона
    setSelectedStrategyName('');
    
    // Шаг 1: Предустанавливаем дату из выбранной на календаре (ISO формат)
    const prefilledDate = selectedExpirationDate || "";
    
    // Шаг 2: Автоматически назначаем страйк (через 2 круглых цены)
    const autoStrike = calculateAutoStrike(type);
    
    console.log('🔧 addOption called:', { 
      selectedExpirationDate, 
      prefilledDate, 
      action, 
      type,
      currentPrice,
      autoStrike
    });
    
    const newOption = {
      id: Date.now().toString(),
      action,
      type,
      strike: autoStrike,
      date: prefilledDate,
      quantity: action === "Buy" ? 1 : -1,
      premium: null,
      bid: null,
      ask: null,
      volume: null,
      oi: null,
      visible: true,
      isLoadingDetails: false,
      // Дата входа в позицию (текущая дата в ISO формате YYYY-MM-DD)
      // ЗАЧЕМ: Фиксируем момент создания опциона для отслеживания времени нахождения в позиции
      entryDate: new Date().toISOString().split('T')[0],
    };
    console.log('✅ New option created:', newOption);
    setOptions(prevOptions => [...prevOptions, newOption]);
    
    // ОТКЛЮЧЕНО: В универсальном калькуляторе данные приходят от расширения
    // Не загружаем страйки и детали опционов с внешних API
  }, [selectedExpirationDate, calculateAutoStrike, selectedTicker]);

  const [customStrategies, setCustomStrategies] = useState([]);
  useEffect(() => {
    const loaded = getCustomStrategies();
    setCustomStrategies(loaded);
  }, []);

  const handleSelectStrategy = (strategyId) => {
    if (!currentPrice) return;
    
    let strategyPositions;
    let strategyName = '';
    
    if (strategyId.startsWith('custom_')) {
      strategyPositions = applyCustomStrategy(strategyId, currentPrice);
      // Получаем название кастомной стратегии
      const customStrategy = customStrategies.find(s => s.id === strategyId);
      strategyName = customStrategy ? customStrategy.name : '';
    } else {
      strategyPositions = applyStrategy(strategyId, currentPrice);
      // Получаем название встроенной стратегии
      const allStrategies = getAllStrategies();
      const strategy = allStrategies.find(s => s.id === strategyId);
      strategyName = strategy ? strategy.nameRu : '';
    }
    
    // Сохраняем название стратегии ТОЛЬКО если было 0 опционов
    if (options.length === 0) {
      setSelectedStrategyName(strategyName);
    }
    // Шаг 1: Предустанавливаем дату из выбранной на календаре (ISO формат)
    const prefilledDate = selectedExpirationDate || "";
    
    const newOptions = strategyPositions.map((pos, index) => {
      // Если стратегия вернула страйк - используем его, иначе автоназначаем
      let strike = pos.strike;
      
      if (!strike) {
        // Считаем сколько опционов этого типа уже есть в текущей стратегии (до текущего индекса)
        const sameTypeInStrategy = strategyPositions.slice(0, index).filter(p => p.type === pos.type).length;
        // Считаем сколько опционов этого типа уже есть в существующих опционах
        const sameTypeExisting = options.filter(opt => opt.type === pos.type).length;
        // Общее количество = существующие + в текущей стратегии до этого индекса
        const totalSameType = sameTypeExisting + sameTypeInStrategy;
        
        // Вычисляем страйк с учетом offset
        if (availableStrikes.length > 0) {
          const sortedStrikes = [...availableStrikes].sort((a, b) => a - b);
          let atmIndex = 0;
          let minDiff = Math.abs(sortedStrikes[0] - currentPrice);
          
          for (let i = 1; i < sortedStrikes.length; i++) {
            const diff = Math.abs(sortedStrikes[i] - currentPrice);
            if (diff < minDiff) {
              minDiff = diff;
              atmIndex = i;
            }
          }
          
          const additionalDistance = totalSameType * 2;
          
          if (pos.type === 'CALL') {
            const targetIndex = atmIndex + 2 + additionalDistance;
            strike = targetIndex < sortedStrikes.length ? sortedStrikes[targetIndex] : sortedStrikes[sortedStrikes.length - 1];
          } else if (pos.type === 'PUT') {
            const targetIndex = atmIndex - 2 - additionalDistance;
            strike = targetIndex >= 0 ? sortedStrikes[targetIndex] : sortedStrikes[0];
          }
        }
      }
      
      return {
        id: `${Date.now()}-${index}`,
        action: pos.action,
        type: pos.type,
        strike: strike,
        date: prefilledDate,
        quantity: pos.action === "Buy" ? 1 : -1,
        premium: null,
        bid: null,
        ask: null,
        volume: null,
        oi: null,
        visible: true,
        isLoadingDetails: false,
        // Дата входа в позицию (текущая дата в ISO формате YYYY-MM-DD)
        // ЗАЧЕМ: Фиксируем момент создания опциона для отслеживания времени нахождения в позиции
        entryDate: new Date().toISOString().split('T')[0],
      };
    });
    setOptions([...options, ...newOptions]);
    
    // ОТКЛЮЧЕНО: В универсальном калькуляторе данные приходят от расширения
    // Не загружаем страйки и детали опционов с внешних API
  };

  const handleSaveCustomStrategy = (name, optionsToSave) => {
    try {
      const saved = saveCustomStrategy(name, optionsToSave);
      setCustomStrategies([saved, ...customStrategies]);
      console.log('✅ Персональная стратегия сохранена:', saved);
      return true;
    } catch (error) {
      console.error('❌ Ошибка сохранения стратегии:', error);
      alert(error.message);
      return false;
    }
  };

  const handleDeleteCustomStrategy = (strategyId) => {
    try {
      const updated = deleteCustomStrategy(strategyId);
      setCustomStrategies(updated);
      console.log('✅ Персональная стратегия удалена');
    } catch (error) {
      console.error('❌ Ошибка удаления стратегии:', error);
    }
  };

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [strategyName, setStrategyName] = useState("");
  const [strategyComment, setStrategyComment] = useState("");

  const handleSaveStrategy = () => {
    if (strategyName.trim() && strategyComment.trim()) {
      try {
        // Используем существующий механизм сохранения
        const success = handleSaveCustomStrategy(strategyName, displayOptions);
        
        if (success) {
          console.log("✅ Стратегия сохранена:", { name: strategyName, comment: strategyComment });
          // Можно сохранить комментарий отдельно, если нужно
          setSaveDialogOpen(false);
          setStrategyName("");
          setStrategyComment("");
        }
      } catch (error) {
        console.error("❌ Ошибка сохранения стратегии:", error);
        alert(error.message || "Ошибка при сохранении стратегии");
      }
    }
  };

  const expirationDatesStatic = [
    { date: "2025-10-15", month: "Oct", displayDate: "15" },
    { date: "2025-10-16", month: "Oct", displayDate: "16" },
    { date: "2025-10-17", month: "Oct", displayDate: "17" },
    { date: "2025-10-20", month: "Oct", displayDate: "20" },
    { date: "2025-10-21", month: "Oct", displayDate: "21" },
    { date: "2025-10-22", month: "Oct", displayDate: "22" },
    { date: "2025-10-23", month: "Oct", displayDate: "23" },
    { date: "2025-10-24", month: "Oct", displayDate: "24" },
    { date: "2025-10-31", month: "Oct", displayDate: "31" },
    { date: "2025-11-07", month: "Nov", displayDate: "7" },
    { date: "2025-11-14", month: "Nov", displayDate: "14" },
    { date: "2025-11-21", month: "Nov", displayDate: "21" },
    { date: "2025-11-28", month: "Nov", displayDate: "28" },
    { date: "2025-12-19", month: "Dec", displayDate: "19" },
    { date: "2025-12-31", month: "Dec", displayDate: "31" },
    { date: "2026-01-02", month: "Jan '26", displayDate: "2" },
    { date: "2026-01-09", month: "Jan '26", displayDate: "9" },
    { date: "2026-01-16", month: "Jan '26", displayDate: "16" },
    { date: "2026-01-23", month: "Jan '26", displayDate: "23" },
    { date: "2026-01-30", month: "Jan '26", displayDate: "30" },
    { date: "2026-02-20", month: "Feb '26", displayDate: "20" },
    { date: "2026-02-27", month: "Feb '26", displayDate: "27" },
    { date: "2026-03-20", month: "Mar '26", displayDate: "20" },
    { date: "2026-03-31", month: "Mar '26", displayDate: "31" },
    { date: "2026-06-18", month: "Jun '26", displayDate: "18" },
    { date: "2026-06-30", month: "Jun '26", displayDate: "30" },
    { date: "2026-09-18", month: "Sep '26", displayDate: "18" },
    { date: "2026-09-30", month: "Sep '26", displayDate: "30" },
    { date: "2026-12-18", month: "Dec '26", displayDate: "18" },
    { date: "2027-01-15", month: "Jan '27", displayDate: "15" },
    { date: "2027-01-17", month: "Jan '27", displayDate: "17" },
    { date: "2027-12-21", month: "Dec '27", displayDate: "21" },
    { date: "2028-01-21", month: "Jan '28", displayDate: "21" },
  ];

  const groupedDates = showDemoData 
    ? expirationDatesStatic.reduce((acc, date) => {
        const key = date.month;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(date);
        return acc;
      }, {})
    : expirationDates;

  const expirationDatesKeys = Object.keys(expirationDates).join(',');
  
  // availableDates теперь просто возвращает ISO даты напрямую
  const availableDates = useMemo(() => {
    let sourceDates;
    if (showDemoData) {
      sourceDates = expirationDatesStatic;
    } else {
      const realDates = Object.values(expirationDates).flat();
      sourceDates = realDates.length > 0 ? realDates : expirationDatesStatic;
    }
    const dates = sourceDates
      .filter(d => d && d.date)
      .map(d => d.date); // ISO формат YYYY-MM-DD
    console.log('📅 availableDates (ISO):', dates);
    return dates;
  }, [showDemoData, expirationDatesKeys]);

  const scrollContainerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  
  // Обработчик изменения даты в календаре
  // Если все опционы на одной дате — обновляем дату всех опционов
  const handleExpirationDateChange = useCallback(async (newDate) => {
    setSelectedExpirationDate(newDate);
    
    // Для зафиксированных позиций — не обновляем опционы
    // ЗАЧЕМ: Данные должны оставаться неизменными
    if (isLocked) {
      console.log('📅 Позиции зафиксированы — опционы не обновляются');
      return;
    }
    
    // Проверяем, есть ли опционы
    const optionsWithDate = displayOptions.filter(opt => opt.date);
    if (optionsWithDate.length === 0) {
      console.log('📅 No options with dates');
      return;
    }
    
    // Проверяем, все ли опционы на одной дате
    const uniqueDates = new Set(optionsWithDate.map(opt => opt.date));
    if (uniqueDates.size === 1) {
      const currentDate = Array.from(uniqueDates)[0];
      
      // Если выбрана другая дата — обновляем все опционы
      if (currentDate !== newDate) {
        console.log('📅 Updating all options from', currentDate, 'to', newDate);
        
        // Обновляем даты
        setOptions(prevOptions => 
          prevOptions.map(opt => 
            opt.date === currentDate ? { ...opt, date: newDate } : opt
          )
        );
        
        // ОТКЛЮЧЕНО: В универсальном калькуляторе данные приходят от расширения
        // Не загружаем страйки и детали опционов с внешних API
      }
    } else {
      console.log('📅 Multiple dates in use, not updating options');
    }
  }, [displayOptions, setOptions, selectedTicker, isLocked]);

  const handleMouseDown = (e) => {
    if (!scrollContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => setIsDragging(false);

  const priceScaleRef = useRef(null);
  const [isPriceScaleDragging, setIsPriceScaleDragging] = useState(false);
  const [priceScaleStartX, setPriceScaleStartX] = useState(0);
  const [priceScaleScrollLeft, setPriceScaleScrollLeft] = useState(0);

  const handlePriceScaleMouseDown = (e) => {
    if (!priceScaleRef.current) return;
    setIsPriceScaleDragging(true);
    setPriceScaleStartX(e.pageX - priceScaleRef.current.offsetLeft);
    setPriceScaleScrollLeft(priceScaleRef.current.scrollLeft);
  };

  const handlePriceScaleMouseMove = (e) => {
    if (!isPriceScaleDragging || !priceScaleRef.current) return;
    e.preventDefault();
    const x = e.pageX - priceScaleRef.current.offsetLeft;
    const walk = (x - priceScaleStartX) * 2;
    priceScaleRef.current.scrollLeft = priceScaleScrollLeft - walk;
  };

  const handlePriceScaleMouseUp = () => setIsPriceScaleDragging(false);
  const handlePriceScaleMouseLeave = () => setIsPriceScaleDragging(false);

  const [greenBarHeights] = useState(() => Array.from({ length: 211 }, () => Math.floor(Math.random() * 31)));
  const [redBarHeights] = useState(() => Array.from({ length: 211 }, () => Math.floor(Math.random() * 31)));

  const [selectedTrend, setSelectedTrend] = useState(null);
  const [targetLevel, setTargetLevel] = useState("264.68");
  const [riskLimit, setRiskLimit] = useState("1000");
  const [riskRewardSlider, setRiskRewardSlider] = useState(50);

  const [strategiesDialogOpen, setStrategiesDialogOpen] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState("");
  const [selectedStrategyName, setSelectedStrategyName] = useState("");
  
  // State для диалога сохранения конфигурации
  const [saveConfigDialogOpen, setSaveConfigDialogOpen] = useState(false);
  // State для диалога фиксации позиций (isLocked=true)
  const [lockConfigDialogOpen, setLockConfigDialogOpen] = useState(false);
  
  // State для сворачивания блока StrikeScale
  const [isStrikeScaleCollapsed, setIsStrikeScaleCollapsed] = useState(() => {
    const saved = localStorage.getItem('isStrikeScaleCollapsed');
    return saved ? JSON.parse(saved) : false;
  });
  
  // Сохраняем состояние сворачивания в localStorage
  useEffect(() => {
    localStorage.setItem('isStrikeScaleCollapsed', JSON.stringify(isStrikeScaleCollapsed));
  }, [isStrikeScaleCollapsed]);

  // Читаем данные финансового контроля из localStorage с автообновлением
  const financialControlEnabled = useLocalStorageValue('financialControlEnabled', false);
  const depositAmount = useLocalStorageValue('depositAmount', '');
  const instrumentCount = useLocalStorageValue('instrumentCount', '');
  const maxLossPercent = useLocalStorageValue('maxLossPercent', '');


  const selectStrategy = (strategy) => {
    console.log("Выбрана стратегия:", strategy);
  };

  // Получение location для работы с URL параметрами
  const location = useLocation();

  // Загрузка конфигурации из URL при монтировании компонента
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const configId = searchParams.get('config');
    const editMode = searchParams.get('edit') === 'true';
    
    if (configId) {
      loadConfiguration(configId, editMode);
      setLoadedConfigId(configId);
      setIsEditMode(editMode);
      // Сбрасываем флаг изменений при загрузке конфигурации
      setHasChanges(false);
    } else {
      setLoadedConfigId(null);
      setIsEditMode(false);
      setHasChanges(false);
    }
  }, [location.search]);

  // Функция загрузки конфигурации
  // ЗАЧЕМ: Восстанавливает сохранённое состояние калькулятора
  // ВАЖНО: Если config.isLocked=true — НЕ загружаем новые данные с API
  // ВАЖНО: Если editMode=true — сбрасываем флаги блокировки для редактирования
  const loadConfiguration = async (configId, editMode = false) => {
    const saved = localStorage.getItem('savedCalculatorConfigurations');
    if (saved) {
      try {
        const configurations = JSON.parse(saved);
        const config = configurations.find(c => c.id === configId);
        
        if (config && config.state) {
          // Проверяем, зафиксирована ли конфигурация
          // ЗАЧЕМ: Если режим редактирования — игнорируем флаг isLocked и разблокируем позиции
          let configIsLocked = config.isLocked === true;
          if (editMode) {
            configIsLocked = false; // Разблокируем для редактирования
          }
          setIsLocked(configIsLocked);
          
          // Сохраняем дату создания конфигурации для зафиксированных позиций
          // ЗАЧЕМ: Ползунок дат должен начинаться с даты входа (entryDate)
          // ВАЖНО: Вычисляем daysPassed сразу здесь, чтобы избежать race condition с useEffect
          let calculatedDaysPassed = config.state.daysPassed || config.state.daysRemaining || 0;
          
          // Используем entryDate для расчетов (дата входа в позицию)
          // Fallback: createdAt или id (для старых конфигураций)
          // ЗАЧЕМ: entryDate — это дата входа в позицию, а createdAt — время создания записи
          const configEntryDate = config.entryDate || config.createdAt || (config.id ? new Date(parseInt(config.id)).toISOString() : null);
          
          console.log('🔍 Config debug:', { 
            configIsLocked, 
            entryDate: config.entryDate,
            createdAt: config.createdAt, 
            id: config.id,
            configEntryDate
          });
          
          if (configIsLocked) {
            console.log('📅 configEntryDate:', configEntryDate);
            
            if (configEntryDate) {
              setSavedConfigDate(configEntryDate);
              // Вычисляем daysPassed как разницу между сегодня и датой входа
              const savedDate = new Date(configEntryDate);
              const today = new Date();
              savedDate.setHours(0, 0, 0, 0);
              today.setHours(0, 0, 0, 0);
              const diffTime = today.getTime() - savedDate.getTime();
              calculatedDaysPassed = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
              console.log(`📅 Дней с момента входа: ${calculatedDaysPassed}, savedDate: ${savedDate}, today: ${today}`);
            } else {
              console.log('⚠️ configEntryDate is null');
              setSavedConfigDate(null);
            }
          } else {
            console.log('⚠️ Config is NOT locked');
            setSavedConfigDate(null);
          }
          
          // Восстанавливаем состояние калькулятора
          const ticker = config.state.selectedTicker || '';
          
          // Сначала устанавливаем тикер
          if (ticker) {
            setSelectedTicker(ticker);
            setCurrentPrice(config.state.currentPrice || 0);
            setPriceChange(config.state.priceChange || { value: 0, percent: 0 });
            
            // Для зафиксированных позиций загружаем текущую рыночную цену
            // ЗАЧЕМ: Кнопка сброса цены должна сбрасывать на текущую цену, а не на цену при сохранении
            if (configIsLocked) {
              try {
                const priceResponse = await fetch(`/api/polygon/ticker/${ticker}`);
                if (priceResponse.ok) {
                  const priceData = await priceResponse.json();
                  if (priceData.price) {
                    setLivePrice(priceData.price);
                    console.log(`📈 Текущая рыночная цена ${ticker}: $${priceData.price}`);
                  }
                }
              } catch (error) {
                console.warn('⚠️ Не удалось загрузить текущую цену:', error);
              }
            } else {
              // Для незафиксированных позиций livePrice не нужен
              setLivePrice(null);
            }
            
            // ОТКЛЮЧЕНО: В универсальном калькуляторе даты приходят от расширения
            // Не загружаем даты экспирации с внешних API
          }
          
          // Затем восстанавливаем остальное состояние
          // Для зафиксированных позиций добавляем initialDaysToExpiration если его нет
          // ЗАЧЕМ: Старые конфигурации могут не иметь этого поля, вычисляем от даты сохранения
          let optionsToSet = config.state.options || [];
          
          // Дата для fallback entryDate (дата создания конфигурации в формате YYYY-MM-DD)
          // ЗАЧЕМ: Для старых конфигураций без entryDate используем дату создания
          const fallbackEntryDate = configEntryDate 
            ? new Date(configEntryDate).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];
          
          if (configIsLocked && configEntryDate) {
            const savedDate = new Date(configEntryDate);
            savedDate.setHours(0, 0, 0, 0);
            optionsToSet = optionsToSet.map(opt => {
              // Если initialDaysToExpiration уже есть — не перезаписываем
              if (opt.initialDaysToExpiration !== undefined) {
                // Сохраняем entryDate если его нет
                return {
                  ...opt,
                  entryDate: opt.entryDate || fallbackEntryDate
                };
              }
              // Вычисляем дни от даты сохранения до экспирации
              if (opt.date) {
                const [year, month, day] = opt.date.split('-').map(Number);
                const expDateUTC = Date.UTC(year, month - 1, day);
                const savedDateUTC = Date.UTC(savedDate.getFullYear(), savedDate.getMonth(), savedDate.getDate());
                const initialDaysToExpiration = Math.ceil((expDateUTC - savedDateUTC) / (1000 * 60 * 60 * 24));
                return { 
                  ...opt, 
                  initialDaysToExpiration, 
                  isLockedPosition: true,
                  entryDate: opt.entryDate || fallbackEntryDate
                };
              }
              return { 
                ...opt, 
                isLockedPosition: true,
                entryDate: opt.entryDate || fallbackEntryDate
              };
            });
          } else if (editMode) {
            // Если режим редактирования — удаляем флаги блокировки с опционов
            // ЗАЧЕМ: Позволяет редактировать все опционы в разблокированном виде
            optionsToSet = optionsToSet.map(opt => {
              const { isLockedPosition, ...rest } = opt;
              return {
                ...rest,
                entryDate: rest.entryDate || fallbackEntryDate
              };
            });
          } else {
            // Для обычных (незафиксированных) конфигураций также сохраняем entryDate
            // ЗАЧЕМ: Дата входа должна сохраняться при любом типе загрузки
            optionsToSet = optionsToSet.map(opt => ({
              ...opt,
              entryDate: opt.entryDate || fallbackEntryDate
            }));
          }
          setOptions(optionsToSet);
          setPositions(config.state.positions || []);
          setSelectedExpirationDate(config.state.selectedExpirationDate || '');
          
          // Устанавливаем daysPassed (вычисленный выше)
          setDaysPassed(calculatedDaysPassed);
          // Помечаем что пользователь "настроил" бегунок, чтобы useEffect не перезаписал
          setUserAdjustedDays(true);
          
          setShowOptionLines(config.state.showOptionLines !== undefined ? config.state.showOptionLines : true);
          setShowProbabilityZones(config.state.showProbabilityZones !== undefined ? config.state.showProbabilityZones : true);
          setChartDisplayMode(config.state.chartDisplayMode || 'profit-loss-dollar');
          
          console.log(`✅ Конфигурация загружена: ${config.name}${configIsLocked ? ' (🔒 зафиксирована)' : ''}`);
        } else {
          console.warn('⚠️ Конфигурация не найдена:', configId);
          setLoadedConfigId(null);
        }
      } catch (error) {
        console.error('❌ Ошибка загрузки конфигурации:', error);
        setLoadedConfigId(null);
      }
    }
  };
  
  // Отслеживание изменений в режиме редактирования
  // ЗАЧЕМ: Показывать кнопку "Сохранить изменения" только при наличии изменений
  useEffect(() => {
    if (!isEditMode || !loadedConfigId) {
      setHasChanges(false);
      return;
    }
    
    // Если есть какие-то изменения в опционах, позициях или других параметрах — отмечаем это
    setHasChanges(true);
  }, [isEditMode, loadedConfigId, options, positions, selectedExpirationDate, daysPassed, showOptionLines, showProbabilityZones, chartDisplayMode]);

  // Автосохранение изменений в загруженную конфигурацию
  // ЗАЧЕМ: Автосохранение работает ТОЛЬКО для незафиксированных позиций И не в режиме редактирования
  // ВАЖНО: Зафиксированные позиции (isLocked=true) НИКОГДА не изменяются автоматически
  // Пользователь может только создать новую позицию на их основе
  useEffect(() => {
    // Если позиция зафиксирована — НЕ автосохраняем изменения
    // ЗАЧЕМ: Зафиксированные позиции должны быть неизменяемыми
    if (isLocked) {
      console.log('🔒 Автосохранение отключено: позиция зафиксирована');
      return;
    }
    
    // Если в режиме редактирования — НЕ автосохраняем (только ручное сохранение)
    // ЗАЧЕМ: В режиме редактирования пользователь должен явно нажать "Сохранить изменения"
    if (isEditMode) {
      console.log('✏️ Автосохранение отключено: режим редактирования');
      return;
    }
    
    if (!loadedConfigId || options.length === 0) return;
    
    const saved = localStorage.getItem('savedCalculatorConfigurations');
    if (!saved) return;
    
    try {
      const configurations = JSON.parse(saved);
      const configIndex = configurations.findIndex(c => c.id === loadedConfigId);
      
      if (configIndex === -1) return;
      
      // Дополнительная проверка: не обновляем зафиксированные конфигурации
      // ЗАЧЕМ: Защита от случайного изменения даже если isLocked state ещё не синхронизирован
      if (configurations[configIndex].isLocked) {
        console.log('🔒 Автосохранение отключено: конфигурация зафиксирована в localStorage');
        return;
      }
      
      // Обновляем состояние конфигурации (только для незафиксированных)
      configurations[configIndex].state = {
        ...configurations[configIndex].state,
        options,
        positions,
        selectedExpirationDate,
        daysPassed,
        showOptionLines,
        showProbabilityZones,
        chartDisplayMode,
      };
      
      localStorage.setItem('savedCalculatorConfigurations', JSON.stringify(configurations));
      console.log('💾 Конфигурация автосохранена:', loadedConfigId);
    } catch (error) {
      console.error('❌ Ошибка автосохранения конфигурации:', error);
    }
  }, [isLocked, isEditMode, loadedConfigId, options, positions, selectedExpirationDate, daysPassed, showOptionLines, showProbabilityZones, chartDisplayMode]);

  // Функция сохранения конфигурации
  const handleSaveConfiguration = (configuration) => {
    const saved = localStorage.getItem('savedCalculatorConfigurations');
    let configurations = [];
    
    if (saved) {
      try {
        configurations = JSON.parse(saved);
      } catch (error) {
        console.error('Ошибка парсинга сохраненных конфигураций:', error);
      }
    }
    
    configurations.push(configuration);
    localStorage.setItem('savedCalculatorConfigurations', JSON.stringify(configurations));
    
    console.log('✅ Конфигурация сохранена:', configuration.name);
    alert('Конфигурация успешно сохранена!');
  };

  // Функция генерирования названия конфигурации на основе текущих данных
  // ЗАЧЕМ: Автоматически создает название из тикера, опционов и даты экспирации
  const generateConfigurationName = () => {
    if (!selectedTicker) return 'Конфигурация';
    
    // Формируем строку с опционами
    const optionsStr = options
      .filter(opt => opt.visible !== false)
      .map(opt => {
        const action = opt.action === 'Buy' ? 'B' : 'S';
        const type = opt.type === 'CALL' ? 'C' : 'P';
        return `${action}${type}${opt.strike}`;
      })
      .join('_');
    
    // Формируем дату экспирации в формате DD.MM.YY
    let dateStr = '';
    if (selectedExpirationDate) {
      const [year, month, day] = selectedExpirationDate.split('-');
      dateStr = `${day}.${month}.${year.slice(-2)}`;
    }
    
    // Собираем название: TICKER_OPCS_DATE
    let name = selectedTicker;
    if (optionsStr) {
      name += `_${optionsStr}`;
    }
    if (dateStr) {
      name += `_${dateStr}`;
    }
    
    return name;
  };

  // Функция сохранения изменений в режиме редактирования
  // ЗАЧЕМ: Обновляет существующую конфигурацию с обновленным названием на основе новых данных
  // ВАЖНО: Сохраняет флаг isLocked если конфигурация была зафиксирована
  const handleSaveEditedConfiguration = () => {
    if (!loadedConfigId) return;
    
    const saved = localStorage.getItem('savedCalculatorConfigurations');
    if (!saved) return;
    
    try {
      const configurations = JSON.parse(saved);
      const configIndex = configurations.findIndex(c => c.id === loadedConfigId);
      
      if (configIndex === -1) return;
      
      const config = configurations[configIndex];
      
      // Генерируем новое название на основе текущих данных
      // ЗАЧЕМ: Название должно отражать новые данные после редактирования
      const generatedName = generateConfigurationName();
      
      // Добавляем эмодзи ✍️ в начало названия если его еще нет
      let updatedName = generatedName;
      if (!updatedName.startsWith('✍️')) {
        updatedName = `✍️ ${updatedName}`;
      }
      
      // Восстанавливаем флаги блокировки для опционов если конфигурация была зафиксирована
      // ЗАЧЕМ: После редактирования зафиксированная позиция должна остаться зафиксированной
      let optionsToSave = options;
      if (config.isLocked) {
        optionsToSave = options.map(opt => ({
          ...opt,
          isLockedPosition: true
        }));
      }
      
      // Обновляем конфигурацию
      configurations[configIndex] = {
        ...config,
        name: updatedName,
        isLocked: config.isLocked, // Сохраняем флаг isLocked
        state: {
          selectedTicker,
          currentPrice,
          priceChange,
          options: optionsToSave,
          positions,
          selectedExpirationDate,
          daysPassed,
          showOptionLines,
          showProbabilityZones,
          chartDisplayMode,
        },
      };
      
      localStorage.setItem('savedCalculatorConfigurations', JSON.stringify(configurations));
      
      // Сбрасываем флаг изменений
      setHasChanges(false);
      
      console.log('✅ Изменения сохранены:', updatedName);
      alert('Изменения успешно сохранены!');
    } catch (error) {
      console.error('❌ Ошибка сохранения изменений:', error);
      alert('Ошибка при сохранении изменений');
    }
  };

  // Функция получения текущего состояния для сохранения
  const getCurrentState = () => {
    return {
      selectedTicker,
      currentPrice,
      priceChange,
      options,
      positions,
      selectedExpirationDate,
      daysPassed,
      showOptionLines,
      showProbabilityZones,
      chartDisplayMode,
    };
  };

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ minWidth: '1570px', maxWidth: '1570px' }}>
      <div className="p-6">
        {/* === ХЕДЕР С ДАННЫМИ ОТ РАСШИРЕНИЯ === */}
        {/* ЗАЧЕМ: Отображение контракта, цены и метаданных от TradingView Parser */}
        {isFromExtension && (contractCode || selectedTicker) && (
          <div className="mb-6">
            <div className={`inline-flex items-center gap-4 p-3 border rounded-lg ${
                calculatorMode === CALCULATOR_MODES.FUTURES 
                  ? 'border-purple-400 bg-purple-50 dark:bg-purple-950/30' 
                  : 'border-teal-400 bg-teal-50 dark:bg-teal-950/30'
              }`}>
              {/* Переключатель режимов Акции/Фьючерсы */}
              {/* ЗАЧЕМ: Определяет тип инструмента и соответствующую математику P&L */}
              <div className="flex items-center gap-1 bg-white/50 dark:bg-gray-800/50 rounded-md p-0.5">
                <button
                  onClick={() => {
                    setCalculatorMode(CALCULATOR_MODES.STOCKS);
                    setSelectedFuture(null);
                  }}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    calculatorMode === CALCULATOR_MODES.STOCKS 
                      ? 'bg-teal-500 text-white' 
                      : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
                  }`}
                >
                  Акции
                </button>
                <button
                  onClick={() => setCalculatorMode(CALCULATOR_MODES.FUTURES)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    calculatorMode === CALCULATOR_MODES.FUTURES 
                      ? 'bg-purple-500 text-white' 
                      : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
                  }`}
                >
                  Фьючерсы
                </button>
              </div>
              
              {/* Логотип TradingView */}
              <div className="flex items-center">
                <img 
                  src="/images/black-full-logo.svg" 
                  alt="TradingView" 
                  style={{ height: '20px', width: 'auto' }}
                />
              </div>
              
              {/* Код актива */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Актив:</span>
                <span className="text-lg font-bold">{contractCode || selectedTicker}</span>
              </div>
              
              {/* Цена базового актива */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Цена:</span>
                <span className="text-lg font-bold">
                  ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ' ')}
                </span>
              </div>
              
              {/* Количество опционов */}
              {options.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Опционов:</span>
                  <span className="text-lg font-bold text-purple-600 dark:text-purple-400">{options.length}</span>
                </div>
              )}
              
              {/* Время последнего обновления */}
              {extensionLastUpdated && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Обновлено:</span>
                  <span>{new Date(extensionLastUpdated).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
              )}
              
              {/* Кнопка ручного обновления */}
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshFromStorage}
                className="ml-2"
                title="Обновить данные из расширения"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        
        {/* Сообщение если нет данных от расширения */}
        {!isFromExtension && isInitialized && (
          <div className="mb-6">
            <div className="p-4 border border-yellow-500 rounded-lg bg-yellow-50 dark:bg-yellow-950/30">
              <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
                <span className="text-lg">⏳</span>
                <span className="font-medium">Ожидание данных от TradingView Extension</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Откройте страницу опционов на TradingView и нажмите кнопку "📱 Открыть калькулятор" в расширении.
                Или просто добавьте любой опцион через кнопку +С или +Р, калькулятор откроется автоматически.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-6">
          <div className="flex gap-6">
            <div className="flex-[1] space-y-6" style={{ minWidth: '400px', maxWidth: '400px' }}>
              <Card 
                className="flex-[1]" 
                style={{ borderColor: '#b8b8b8' }}
              >
                <CardContent className="pt-[20px] pb-[20px] space-y-4">
                  {selectedTicker && shouldShowBlock('ticker-selector-advanced') && (
                    <>
                      <BaseAssetPositions
                        positions={positions}
                        togglePositionVisibility={togglePositionVisibility}
                        deletePosition={deletePosition}
                        addPosition={addPosition}
                        selectedTicker={selectedTicker}
                        currentPrice={currentPrice}
                        updatePosition={updatePosition}
                        options={options}
                        isAIEnabled={isAIEnabled}
                        isTickerSupported={false}
                        onAddOption={(option) => {
                          // Добавляем опцион из ИИ подбора (PUT или CALL)
                          const newOptionId = Date.now().toString();
                          // Извлекаем bestExitDay из selectionParams если есть
                          const bestExitDay = option.selectionParams?.bestExitDay || null;
                          console.log('🎯 ИИ подбор: добавление опциона с bestExitDay =', bestExitDay, 'selectionParams =', option.selectionParams);
                          const newOption = {
                            id: newOptionId,
                            action: option.action || 'Buy',
                            type: option.type || 'PUT', // Используем тип из опциона (CALL или PUT)
                            strike: option.strike,
                            date: option.expirationDate,
                            quantity: 1,
                            premium: option.premium || 0,
                            bid: option.bid || 0,
                            ask: option.ask || 0,
                            volume: option.volume || 0,
                            oi: option.openInterest || 0,
                            delta: option.delta || 0,
                            // ВАЖНО: Передаём IV из подбора для согласованности P/L
                            // ЗАЧЕМ: IV из подбора должна совпадать с IV в таблице
                            impliedVolatility: option.iv || option.impliedVolatility || 0,
                            visible: true,
                            isLoadingDetails: true, // Показываем что загружаем детали
                            bestExitDay: bestExitDay, // Индивидуальный лучший день выхода для этого опциона
                            // Дата входа в позицию (текущая дата в ISO формате YYYY-MM-DD)
                            // ЗАЧЕМ: Фиксируем момент создания опциона для отслеживания времени нахождения в позиции
                            entryDate: new Date().toISOString().split('T')[0],
                          };
                          setOptions(prevOptions => [...prevOptions, newOption]);
                          
                          // Устанавливаем параметры симуляции из ИИ подбора
                          if (option.daysAfterEntry) {
                            setDaysPassed(option.daysAfterEntry);
                            setUserAdjustedDays(true);
                            console.log('🤖 ИИ подбор: установлено daysPassed =', option.daysAfterEntry);
                          }
                          if (option.targetUpPrice) {
                            setTargetPrice(option.targetUpPrice);
                            console.log('🤖 ИИ подбор: установлена targetPrice =', option.targetUpPrice);
                          }
                          if (option.expirationDate) {
                            setSelectedExpirationDate(option.expirationDate);
                            console.log('🤖 ИИ подбор: установлена дата экспирации =', option.expirationDate);
                          }
                          
                          // Сохраняем параметры подбора для компонента OptionSelectionResult
                          // ЗАЧЕМ: Отображаем результат подбора с расчётом P&L по целевым ценам
                          if (option.selectionParams) {
                            setOptionSelectionParams(option.selectionParams);
                            console.log('🤖 ИИ подбор: сохранены параметры для OptionSelectionResult', option.selectionParams);
                          }
                          
                          // ОТКЛЮЧЕНО: В универсальном калькуляторе данные приходят от расширения
                          // Не загружаем детали опционов с внешних API
                        }}
                        isLocked={isLocked}
                      />
                      <PositionFinancialControl
                        positions={positions}
                        options={displayOptions}
                        currentPrice={currentPrice}
                        daysPassed={daysPassed}
                        financialControlEnabled={financialControlEnabled}
                        depositAmount={depositAmount}
                        instrumentCount={instrumentCount}
                        maxLossPercent={maxLossPercent}
                        ivSurface={ivSurface}
                        isAIEnabled={isAIEnabled}
                        aiVolatilityMap={aiVolatilityMap}
                        fetchAIVolatility={fetchAIVolatility}
                        targetPrice={targetPrice}
                      />
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Синхронизированный блок настроек цены и времени */}
              {selectedTicker && (
                <Card 
                  className={`w-full relative overflow-hidden ${
                    displayOptions.length === 0 ? 'opacity-20 pointer-events-none' : ''
                  }`} 
                  style={{ borderColor: '#b8b8b8' }}
                >
                  <div className="flex items-center justify-between px-6 py-3 border-b border-border">
                    <h3 className="text-sm font-medium">Симуляция изменения рынка</h3>
                    <button
                      onClick={() => setIsMarketSimulationCollapsed(!isMarketSimulationCollapsed)}
                      className="p-1 hover:bg-muted rounded transition-colors"
                      title={isMarketSimulationCollapsed ? 'Развернуть' : 'Свернуть'}
                    >
                      {isMarketSimulationCollapsed ? (
                        <ChevronDown size={20} />
                      ) : (
                        <ChevronUp size={20} />
                      )}
                    </button>
                  </div>
                  {!isMarketSimulationCollapsed && (
                    <CardContent className="pt-[20px] pb-[20px]">
                      <PriceAndTimeSettings
                        currentPrice={currentPrice}
                        targetPrice={targetPrice}
                        setTargetPrice={setTargetPrice}
                        daysPassed={daysPassed}
                        setDaysPassed={(value) => {
                          setDaysPassed(value);
                          setUserAdjustedDays(true);
                        }}
                        options={displayOptions}
                        minPrice={currentPrice * 0.5}
                        maxPrice={currentPrice * 1.5}
                        compact={true}
                        savedConfigDate={savedConfigDate}
                        livePrice={livePrice}
                      />
                    </CardContent>
                  )}
                </Card>
              )}

              {shouldShowBlock('calculator-settings') && (
                <Card 
                  className={`w-full relative ${
                    displayOptions.length === 0 ? 'opacity-20 pointer-events-none' : ''
                  }`} 
                  style={{ borderColor: '#b8b8b8' }}
                >
                  <CalculatorSettings
                    showOptionLines={showOptionLines}
                    setShowOptionLines={setShowOptionLines}
                    useDividends={useDividends}
                    setUseDividends={setUseDividends}
                    dividendYield={dividendYield}
                    dividendLoading={dividendLoading}
                    isAIEnabled={isAIEnabled}
                    setIsAIEnabled={setIsAIEnabled}
                    calculatorMode={calculatorMode}
                  />
                </Card>
              )}

              {/* Финансовый контроль */}
              <FinancialControl selectedTicker={selectedTicker} />
            </div>

            <div className="flex-[3] space-y-6">
              {/* УБРАНО: ExpirationCalendar не используется — даты приходят от расширения */}

              <Card className="w-full relative" style={{ borderColor: '#b8b8b8' }}>
                <CardContent className="pt-[20px] pb-[20px] space-y-4">
                  {selectedTicker ? (
                    <OptionsTableV3
                      options={displayOptions}
                      toggleOptionVisibility={toggleOptionVisibility}
                      deleteOption={deleteOption}
                      addOption={addOption}
                      setSaveDialogOpen={setSaveDialogOpen}
                      onSelectStrategy={handleSelectStrategy}
                      onUpdateOption={updateOption}
                      onSaveCustomStrategy={handleSaveCustomStrategy}
                      onDeleteCustomStrategy={handleDeleteCustomStrategy}
                      customStrategies={customStrategies}
                      availableDates={availableDates}
                      availableStrikes={availableStrikes}
                      selectedTicker={selectedTicker}
                      currentPrice={currentPrice}
                      loadStrikesForDate={loadStrikesForDate}
                      loadOptionDetails={loadOptionDetails}
                      strikesByDate={strikesByDate}
                      loadingStrikesForDate={loadingStrikesForDate}
                      isLoadingDates={isLoadingDates}
                      selectedStrategyName={selectedStrategyName}
                      onSaveConfiguration={() => setSaveConfigDialogOpen(true)}
                      onLockConfiguration={() => setLockConfigDialogOpen(true)}
                      onResetCalculator={resetCalculator}
                      daysPassed={daysPassed}
                      targetPrice={targetPrice}
                      isLocked={isLocked}
                      selectedExpirationDate={selectedExpirationDate}
                      ivSurface={ivSurface}
                      dividendYield={useDividends ? dividendYield : 0}
                      isEditMode={isEditMode}
                      hasChanges={hasChanges}
                      onSaveEditedConfiguration={handleSaveEditedConfiguration}
                      positions={positions}
                      isAIEnabled={isAIEnabled}
                      aiVolatilityMap={aiVolatilityMap}
                      fetchAIVolatility={fetchAIVolatility}
                      hideColumns={['premium', 'oi']}
                      isFromExtension={isFromExtension}
                      calculatorMode={calculatorMode}
                      contractMultiplier={contractMultiplier}
                      onAddMagicOption={(option) => {
                        // Добавляем опцион из волшебного подбора
                        console.log('👑 OptionsCalculatorBasic: Получен опцион в onAddMagicOption:', option.isGoldenOption, option);
                        const newOptionId = Date.now().toString();
                        const newOption = {
                          id: newOptionId,
                          action: option.action || 'Buy',
                          type: option.type || 'PUT',
                          strike: option.strike,
                          date: option.expirationDate,
                          quantity: 1,
                          premium: option.premium || 0,
                          bid: option.bid || 0,
                          ask: option.ask || 0,
                          volume: option.volume || 0,
                          oi: option.openInterest || 0,
                          delta: option.delta || 0,
                          impliedVolatility: option.iv || option.impliedVolatility || 0,
                          visible: true,
                          isLoadingDetails: true,
                          isGoldenOption: option.isGoldenOption || false, // Флаг для визуальной индикации золотой короны
                        };
                        console.log('👑 OptionsCalculatorBasic: Создан новый опцион с isGoldenOption:', newOption.isGoldenOption, newOption);
                        setOptions(prevOptions => [...prevOptions, newOption]);
                        
                        // ОТКЛЮЧЕНО: В универсальном калькуляторе данные приходят от расширения
                        // Не загружаем детали опционов с внешних API
                      }}
                      onMagicSelectionComplete={(params) => {
                        // Сохраняем параметры волшебного подбора для OptionSelectionResult
                        setOptionSelectionParams(params);
                        console.log('🔮 Волшебный подбор завершён, параметры сохранены:', params);
                      }}
                      onSetSimulationParams={(params) => {
                        // Устанавливаем параметры симуляции из Золотой кнопки (Сценарий 3)
                        if (params.targetPrice) {
                          setTargetPrice(params.targetPrice);
                          console.log('👑 Золотая кнопка: установлена targetPrice =', params.targetPrice);
                        }
                        if (params.daysPassed !== undefined) {
                          setDaysPassed(params.daysPassed);
                          setUserAdjustedDays(true);
                          console.log('👑 Золотая кнопка: установлено daysPassed =', params.daysPassed);
                        }
                      }}
                    />
                  ) : (
                    <div className="w-full h-[80px] flex items-center justify-center text-muted-foreground text-sm">
                      {/* ЗАЧЕМ: Калькулятор работает только с данными от расширения */}
                      Ожидание данных от TradingView Extension...
                    </div>
                  )}
                </CardContent>
              </Card>

              {shouldShowBlock('strike-scale') && (
                <Card className="w-full relative border-0" style={{ maxWidth: '1200px', borderColor: '#b8b8b8', overflow: 'visible' }}>
                  <div className="flex items-center justify-between px-6 py-3 border-b border-border">
                    <h3 className="text-sm font-medium">Шкала страйков</h3>
                    <button
                      onClick={() => setIsStrikeScaleCollapsed(!isStrikeScaleCollapsed)}
                      className="p-1 hover:bg-muted rounded transition-colors"
                      title={isStrikeScaleCollapsed ? 'Развернуть' : 'Свернуть'}
                    >
                      {isStrikeScaleCollapsed ? (
                        <ChevronDown size={20} />
                      ) : (
                        <ChevronUp size={20} />
                      )}
                    </button>
                  </div>
                  {!isStrikeScaleCollapsed && (
                    <CardContent className="pt-[20px] pb-[20px] px-0" style={{ overflow: 'visible' }}>
                      {selectedTicker ? (
                        <StrikeScale
                          options={displayOptions}
                          currentPrice={currentPrice}
                          positions={positions}
                          ticker={selectedTicker}
                          strikesByDate={strikesByDate}
                          onPositionUpdate={handleStrikeUpdate}
                          loadOptionDetails={loadOptionDetails}
                          forceShowDateBadges={forceShowDateBadges}
                          dateColorMap={dateColorMap}
                          selectedExpirationDate={selectedExpirationDate}
                          isLocked={isLocked}
                        />
                      ) : (
                        <div className="w-full h-[220px]" />
                      )}
                    </CardContent>
                  )}
                </Card>
              )}

              {shouldShowBlock('metrics-block') && (
                <Card className="w-full relative" style={{ borderColor: '#b8b8b8' }}>
                  <OptionsMetrics 
                    options={displayOptions}
                    currentPrice={currentPrice}
                    positions={positions}
                    daysPassed={daysPassed}
                    ivSurface={ivSurface}
                    dividendYield={useDividends ? dividendYield : 0}
                    isAIEnabled={isAIEnabled}
                    aiVolatilityMap={aiVolatilityMap}
                    fetchAIVolatility={fetchAIVolatility}
                    targetPrice={targetPrice}
                    selectedTicker={selectedTicker}
                    calculatorMode={calculatorMode}
                    contractMultiplier={contractMultiplier}
                  />
                </Card>
              )}

              <Tabs defaultValue="chart" className="w-full">
                <TabsList className="w-full grid grid-cols-2" style={{ backgroundColor: '#e5e7eb' }}>
                  <TabsTrigger value="chart">График</TabsTrigger>
                  <TabsTrigger value="board">Доска</TabsTrigger>
                </TabsList>

                <TabsContent value="chart">
                  <Card className="w-full relative" style={{ borderColor: '#b8b8b8' }}>
                    <CardContent className="pt-4 pb-4 px-6">
                      <PLChart 
                        options={displayOptions}
                        currentPrice={currentPrice}
                        positions={positions}
                        showOptionLines={showOptionLines}
                        daysPassed={daysPassed}
                        showProbabilityZones={showProbabilityZones}
                        targetPrice={targetPrice}
                        ivSurface={ivSurface}
                        dividendYield={useDividends ? dividendYield : 0}
                        isAIEnabled={isAIEnabled}
                        aiVolatilityMap={aiVolatilityMap}
                        fetchAIVolatility={fetchAIVolatility}
                        selectedTicker={selectedTicker}
                        calculatorMode={calculatorMode}
                        contractMultiplier={contractMultiplier}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="board">
                  <OptionsBoard
                    selectedTicker={selectedTicker}
                    currentPrice={currentPrice}
                    selectedDate={selectedExpirationDate}
                    onAddOption={(option) => {
                      if (!selectedTicker) {
                        return;
                      }
                      // Шаг 1: Используем дату из календаря напрямую (ISO формат)
                      const prefilledDate = selectedExpirationDate || "";
                      
                      const newOption = {
                        id: Date.now().toString(),
                        action: option.type === 'CALL' ? 'Buy' : 'Sell',
                        type: option.type,
                        strike: option.strike,
                        date: prefilledDate,
                        quantity: 1,
                        premium: option.last || option.premium || 0,
                        bid: option.bid || 0,
                        ask: option.ask || 0,
                        volume: option.volume || 0,
                        oi: option.open_interest || 0,
                        delta: option.delta || 0,
                        gamma: option.gamma || 0,
                        theta: option.theta || 0,
                        vega: option.vega || 0,
                        impliedVolatility: option.implied_volatility || 0,
                        visible: true,
                        // Дата входа в позицию (текущая дата в ISO формате YYYY-MM-DD)
                        // ЗАЧЕМ: Фиксируем момент создания опциона для отслеживания времени нахождения в позиции
                        entryDate: new Date().toISOString().split('T')[0],
                      };
                      setOptions(prevOptions => [...prevOptions, newOption]);
                    }}
                  />
                </TabsContent>
              </Tabs>

              {/* Результат подбора опционов - появляется после выбора опциона в ИИ подборе */}
              <OptionSelectionResult
                selectionParams={optionSelectionParams}
                options={displayOptions}
                positions={positions}
                currentPrice={currentPrice}
                ivSurface={ivSurface}
                dividendYield={useDividends ? dividendYield : 0}
                targetPrice={targetPrice}
                daysPassed={daysPassed}
                calculatorMode={calculatorMode}
                contractMultiplier={contractMultiplier}
              />

              {/* Калькулятор выхода из позиции */}
              <ExitCalculator
                options={displayOptions}
                positions={positions}
                currentPrice={currentPrice}
                daysPassed={daysPassed}
                setDaysPassed={(value) => {
                  setDaysPassed(value);
                  setUserAdjustedDays(true);
                }}
                selectedExpirationDate={selectedExpirationDate}
                showOptionLines={showOptionLines}
                targetPrice={targetPrice}
                setTargetPrice={setTargetPrice}
                savedConfigDate={savedConfigDate}
                ivSurface={ivSurface}
                dividendYield={useDividends ? dividendYield : 0}
                isAIEnabled={isAIEnabled}
                aiVolatilityMap={aiVolatilityMap}
                fetchAIVolatility={fetchAIVolatility}
                selectedTicker={selectedTicker}
                calculatorMode={calculatorMode}
                contractMultiplier={contractMultiplier}
              />
            </div>
          </div>
        </div>

        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogContent className="sm:max-w-[500px] z-[9999]">
            <DialogHeader>
              <DialogTitle>Сохранение стратегии</DialogTitle>
              <DialogDescription>Введите оригинальное название и краткий комментарий</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="strategy-name">Название <span className="text-red-500">*</span></Label>
                <Input
                  id="strategy-name"
                  placeholder="Введите название стратегии"
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="strategy-comment">Комментарий <span className="text-red-500">*</span></Label>
                <Textarea
                  id="strategy-comment"
                  placeholder="Введите краткий комментарий"
                  value={strategyComment}
                  onChange={(e) => setStrategyComment(e.target.value)}
                  rows={4}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Отмена</Button>
              <Button
                onClick={handleSaveStrategy}
                disabled={!strategyName.trim() || !strategyComment.trim()}
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                Сохранить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {shouldShowBlock('strategy-builder') && (
          <StrategyDialog
            strategiesDialogOpen={strategiesDialogOpen}
            setStrategiesDialogOpen={setStrategiesDialogOpen}
            selectedStrategy={selectedStrategy}
            setSelectedStrategy={setSelectedStrategy}
            selectStrategy={selectStrategy}
          />
        )}

        {/* Диалог сохранения конфигурации */}
        <SaveConfigurationDialog
          isOpen={saveConfigDialogOpen}
          onClose={() => setSaveConfigDialogOpen(false)}
          onSave={handleSaveConfiguration}
          currentState={getCurrentState()}
        />
        
        {/* Диалог фиксации позиций (isLocked=true) */}
        <SaveConfigurationDialog
          isOpen={lockConfigDialogOpen}
          onClose={() => setLockConfigDialogOpen(false)}
          onSave={handleSaveConfiguration}
          currentState={getCurrentState()}
          isLocked={true}
        />
        
        {/* Модальное окно "Что нового?" */}
        {showWhatsNew && (
          <WhatsNewModal onClose={() => setShowWhatsNew(false)} />
        )}
      </div>
    </div>
  );
}

export default UniversalOptionsCalculator;
