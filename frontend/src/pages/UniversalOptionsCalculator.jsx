/**
 * Универсальный Калькулятор Опционов vU9
 * ЗАЧЕМ: Поддержка двух режимов (Акции/Фьючерсы) с источником данных TradingView Extension
 * Затрагивает: Расчёты P&L, сохранение конфигураций, интеграция с TradingView
 * 
 * vU9: Применение коэффициента группы акции в блоке расчета выхода из позиции
 * - Коэффициент группы акции теперь применяется ко всем сценариям выхода
 * - Исправлена логика расчета P&L для позиций акций (унифицирована с деталями)
 * - Итоговый P&L в блоке выхода теперь совпадает с таблицей опционов
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
import { useLocation, useNavigate, useBeforeUnload } from 'react-router-dom';
import { useLocalStorageValue } from '../hooks/useLocalStorage';
import { getActiveBlocks, isBlockEnabled } from '../config/calculatorV3Blocks';
import { applyStrategy, getAllStrategies } from '../config/optionsStrategies';
import { saveCustomStrategy, getCustomStrategies, deleteCustomStrategy, applyCustomStrategy } from '../utils/customStrategies';
import { detectInstrumentType } from '../utils/instrumentTypeDetector';
import { createConfiguration, getConfiguration, updateConfiguration } from '../services/configurationsApi';
import { supabase } from '../services/supabase';
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
import NorthStrategyDialog from '../components/CalculatorV2/NorthStrategy/NorthStrategyDialog';
import FinancialControl from '../components/CalculatorV2/FinancialControl';
import ExitCalculator from '../components/CalculatorV2/ExitCalculator';
import { ScenarioCard, LiquidityWarning, GreeksWarning } from '../components/CalculatorV2/ExitCalculator/components';
import OptionSelectionResult from '../components/CalculatorV2/OptionSelectionResult';
import CalculatorDealTabs from '../components/CalculatorV2/CalculatorDealTabs';
import VolatilityGauge from '../components/CalculatorV2/VolatilityGauge';
import { fetchVolatilityMetrics } from '../services/barchartApi';
import { getDaysUntilExpirationUTC, calculateDaysRemainingUTC, parseDateAtStartOfDay } from '../utils/dateUtils';
import { WhatsNewModal, shouldShowModal } from '../components/WhatsNewModal';
import { buildIVSurface } from '../utils/volatilitySurface';
import { calculateTotalGreeks, calculatePLMetrics } from '../utils/metricsCalculator';
import { usePositionExitCalculator } from '../hooks/usePositionExitCalculator';
// УБРАНО: AI модель не используется в универсальном калькуляторе
// import aiPredictionService from '../services/aiPredictionService';

// Импорт утилиты для работы с настройками фьючерсов
// ЗАЧЕМ: Получение pointValue для расчётов P&L в режиме фьючерсов
import { loadFuturesSettings, getPointValue, getFutureByTicker, isFuturesTicker, detectInstrumentTypeByPattern, isFuturesTickerByPattern } from '../utils/futuresSettings';

// Импорт хука для работы с данными от Chrome Extension TradingView Parser
// ЗАЧЕМ: Получение опционов, тикера и цены из localStorage и URL параметров
import { useExtensionData, useExtensionRefreshCommand, writeRefreshResult } from '../hooks/useExtensionData';

// УБРАНО: AI модель не используется в универсальном калькуляторе
// const AI_SUPPORTED_TICKERS = [...];

// Режимы калькулятора
// ЗАЧЕМ: Определяет тип инструмента и соответствующую математику P&L.
// ETF использует ту же математику, что и STOCKS — отличается только визуально
// (синий бейдж в шапке и синий бейдж в карточках сохранённых позиций).
const CALCULATOR_MODES = {
  STOCKS: 'stocks',
  FUTURES: 'futures',
  CRYPTO: 'crypto',
  ETF: 'etf'
};

// Крипто-тикеры — для них не показываем группы акций и не запрашиваем классификацию
const CRYPTO_TICKERS = ['BTCUSDT', 'ETHUSDT'];

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
  // React Router navigate — используется вместо window.history.replaceState,
  // чтобы внутренний state React Router (и useLocation()) тоже обновлялся;
  // иначе зависимые useEffect видят устаревший location.search и перезапускают
  // загрузку только что сброшенной конфигурации.
  const navigate = useNavigate();

  // === ИНТЕГРАЦИЯ С CHROME EXTENSION ===
  // ЗАЧЕМ: Получение данных опционов от TradingView Parser через localStorage
  const {
    contractCode,           // Код контракта из URL (?contract=)
    urlPrice,               // Цена из URL (?price=)
    exchange: extensionExchange,      // Биржа от расширения (NYSE, NASDAQ, CBOT и т.д.)
    underlyingPrice: extensionPrice,  // Цена базового актива
    underlyingPriceConfidence: extensionPriceConfidence, // Уверенность в цене: 'high'|'low'|'none'
    ticker: extensionTicker,          // Тикер от расширения
    expirationDate: extensionExpirationDate,  // Дата экспирации
    options: extensionOptions,        // Массив опционов от расширения
    isFromExtension,        // Флаг: данные от расширения
    lastUpdated: extensionLastUpdated,  // Timestamp последнего обновления
    refreshFromStorage,     // Функция ручного обновления
    clearExtensionData      // Функция очистки данных расширения
  } = useExtensionData();

  // Безопасная цена для «запекания» в assetPriceAtEntry сохраняемых опционов.
  // ЗАЧЕМ: Если расширение не смогло однозначно привязать цену к текущему тикеру
  // (уверенность 'low' или 'none'), не сохраняем её в БД — чтобы в сделке не осталась
  // цена чужого тикера из watchlist/popup/сравнения. Текущая цена (currentPrice)
  // при этом продолжает обновляться — её пользователь видит и может исправить вручную.
  const safeExtensionPriceForEntry = (extensionPriceConfidence === 'high' || !extensionPriceConfidence)
    ? extensionPrice
    : 0;

  // Ref для отслеживания предыдущего тикера
  // ЗАЧЕМ: Позволяет определить, когда тикер изменился, и очистить позиции базового актива
  const prevTickerRef = useRef(null);
  // Ref-флаг: идёт сброс калькулятора
  // ЗАЧЕМ: Блокирует автосохранение и sync useEffect в том же рендер-цикле,
  // где resetCalculator очистил localStorage — иначе они перезаписывают данные обратно
  const isResettingRef = useRef(false);
  const needExtRefreshSaveRef = useRef(false);
  // Таймстамп завершения инициализации
  // ЗАЧЕМ: Игнорируем tvc_refresh_command, отправленные одновременно с начальной загрузкой опциона,
  // чтобы IV оставалась в impliedVolatility (колонка IV), а не попадала в manualIvOverride (Fact IV)
  const initCompletedAtRef = useRef(0);

  // Установка заголовка страницы
  useEffect(() => {
    document.title = 'Универсальный Калькулятор Опционов | SYNDICATE Platform';
    return () => {
      document.title = 'SYNDICATE Platform';
    };
  }, []);

  // === НОВОЕ: Режим калькулятора (Акции/Фьючерсы/Крипто) ===
  // ЗАЧЕМ: Определяет тип инструмента и соответствующую математику P&L
  // ВАЖНО: Инициализируется синхронно из URL-параметров, чтобы первый рендер уже знал правильный режим
  // (иначе при сохранённой сделке для CRYPTO показывался бы ScenarioBlock до детекции тикера)
  const [calculatorMode, setCalculatorMode] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ticker = params.get('contract') || params.get('ticker') || '';
      if (ticker) {
        const detectedType = detectInstrumentTypeByPattern(ticker);
        if (detectedType === 'futures') return CALCULATOR_MODES.FUTURES;
        if (detectedType === 'crypto') return CALCULATOR_MODES.CRYPTO;
        if (detectedType === 'etf') return CALCULATOR_MODES.ETF;
      }
    } catch {}
    return CALCULATOR_MODES.STOCKS;
  });

  // Информация о выбранном фьючерсе (для режима фьючерсов)
  // ЗАЧЕМ: Хранит pointValue и название фьючерса для расчётов
  const [selectedFuture, setSelectedFuture] = useState(null);

  // Множитель контракта (100 для акций, 1 для крипто, pointValue для фьючерсов)
  // ЗАЧЕМ: Используется в расчётах P&L
  const contractMultiplier = useMemo(() => {
    if (calculatorMode === CALCULATOR_MODES.FUTURES && selectedFuture) {
      return selectedFuture.pointValue || 1;
    }
    if (calculatorMode === CALCULATOR_MODES.CRYPTO) {
      return 1; // Крипто-опционы не умножаются на 100
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

  // State для данных волатильности (barchart.com)
  const [volatilityData, setVolatilityData] = useState(null);
  const [volatilityLoading, setVolatilityLoading] = useState(false);
  const [volatilityLastUpdated, setVolatilityLastUpdated] = useState(null);
  const lastVolatilityTickerRef = useRef(null);

  // State для отслеживания завершения инициализации
  // ЗАЧЕМ: Предотвращает мигание предупреждений до загрузки данных
  const [isInitialized, setIsInitialized] = useState(false);

  // Проверка наличия настроек фьючерса
  // ЗАЧЕМ: Если фьючерс не найден в настройках — блокируем расчёты и показываем предупреждение
  // ВАЖНО: Проверяем isInitialized, чтобы не показывать плашку до завершения инициализации
  const isFuturesMissingSettings = useMemo(() => {
    return isInitialized && calculatorMode === CALCULATOR_MODES.FUTURES && !selectedFuture && (extensionTicker || contractCode || selectedTicker);
  }, [isInitialized, calculatorMode, selectedFuture, extensionTicker, contractCode, selectedTicker]);
  // Загрузка данных волатильности с barchart.com
  const loadVolatilityData = useCallback(async (ticker) => {
    if (!ticker) return;
    setVolatilityLoading(true);
    try {
      const data = await fetchVolatilityMetrics(ticker);
      setVolatilityData(data);
      if (data) setVolatilityLastUpdated(Date.now());
    } catch (e) {
      console.error('❌ [Volatility] Ошибка загрузки:', e);
    } finally {
      setVolatilityLoading(false);
    }
  }, []);

  // Автозагрузка волатильности при смене тикера
  useEffect(() => {
    if (selectedTicker && selectedTicker !== lastVolatilityTickerRef.current) {
      lastVolatilityTickerRef.current = selectedTicker;
      loadVolatilityData(selectedTicker);
    }
  }, [selectedTicker, loadVolatilityData]);

  const handleVolatilityRefresh = useCallback(() => {
    if (selectedTicker) loadVolatilityData(selectedTicker);
  }, [selectedTicker, loadVolatilityData]);

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
  // ВАЖНО: Инициализируем из localStorage — при перезагрузке расширением TradingView
  // React state теряется, но localStorage сохраняется
  const [loadedConfigId, setLoadedConfigIdRaw] = useState(() => {
    return localStorage.getItem('universalCalc_loadedConfigId') || null;
  });

  // Обёртка для setLoadedConfigId — синхронно сохраняет в localStorage
  // ЗАЧЕМ: Расширение TradingView может перезагрузить страницу в любой момент (window.location),
  // useEffect не успеет выполниться. Синхронная запись в localStorage гарантирует сохранение.
  const setLoadedConfigId = useCallback((value) => {
    setLoadedConfigIdRaw(value);
    if (value) {
      localStorage.setItem('universalCalc_loadedConfigId', value);
    } else {
      localStorage.removeItem('universalCalc_loadedConfigId');
    }
  }, []);

  // State для режима редактирования конфигурации
  // ЗАЧЕМ: Позволяет редактировать сохраненную конфигурацию в разблокированном виде
  // ВАЖНО: Инициализируем из localStorage — при перезагрузке расширением режим редактирования должен сохраняться
  const [isEditMode, setIsEditModeRaw] = useState(() => {
    return localStorage.getItem('universalCalc_isEditMode') === 'true';
  });

  // Обёртка для setIsEditMode — синхронно сохраняет в localStorage
  // ЗАЧЕМ: Расширение TradingView перезагружает страницу мгновенно,
  // режим редактирования должен восстановиться после перезагрузки
  const setIsEditMode = useCallback((value) => {
    setIsEditModeRaw(value);
    if (value) {
      localStorage.setItem('universalCalc_isEditMode', 'true');
    } else {
      localStorage.removeItem('universalCalc_isEditMode');
    }
  }, []);

  // State для отслеживания изменений в режиме редактирования
  // ЗАЧЕМ: Показывать кнопку "Сохранить изменения" только при наличии изменений
  const [hasChanges, setHasChanges] = useState(false);

  // State для отслеживания исходного состояния конфигурации из БД
  // ЗАЧЕМ: Сравнивать текущее состояние с исходным для определения наличия изменений
  const [originalDBConfig, setOriginalDBConfig] = useState(null);

  // State для отслеживания источника загруженной конфигурации (БД или localStorage)
  // ЗАЧЕМ: Определить, какую функцию сохранения использовать
  const [configSource, setConfigSource] = useState(null); // 'db' или 'localStorage'

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

  // ЗАЧЕМ: на брокерском счёте акции покупаются с плечом, реально блокируется notional/leverage.
  // Применяется к строке «Стоимость позиций» в блоке БА, к «Итого» и к проверке лимита на инструмент.
  const [baseAssetLeverage, setBaseAssetLeverage] = useState(() => {
    const saved = localStorage.getItem('baseAssetLeverage');
    const parsed = parseFloat(saved);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 4;
  });

  // Ref для хранения ручных изменений опционов
  // ЗАЧЕМ: Расширение перезаписывает localStorage.calculatorState при добавлении новых опционов,
  // теряя ручные изменения (quantity, customPremium, entryDate). Храним их отдельно.
  // Ключ: optionKey (strike-type-date), значение: {quantity, customPremium, entryDate, ...}
  const userOptionOverridesRef = useRef((() => {
    try {
      const saved = localStorage.getItem('optioner_user_overrides');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  })());
  
  // Функция для создания ключа опциона (для идентификации)
  const getOptionKey = useCallback((option) => {
    const strike = option.strike || 0;
    const type = (option.type || '').toUpperCase();
    const date = (option.date || '').split('T')[0];
    return `${strike}-${type}-${date}`;
  }, []);
  
  // Функция для сохранения ручных изменений опциона
  const saveUserOverride = useCallback((option, field, value) => {
    const key = getOptionKey(option);
    const overrides = userOptionOverridesRef.current;
    if (!overrides[key]) {
      overrides[key] = {};
    }
    overrides[key][field] = value;
    userOptionOverridesRef.current = overrides;
    
    // Сохраняем в localStorage
    try {
      localStorage.setItem('optioner_user_overrides', JSON.stringify(overrides));
      console.log('💾 [UserOverrides] Сохранено:', { key, field, value });
    } catch (error) {
      console.error('❌ [UserOverrides] Ошибка сохранения:', error);
    }
  }, [getOptionKey]);
  
  // Функция для получения ручных изменений опциона
  const getUserOverride = useCallback((option) => {
    const key = getOptionKey(option);
    return userOptionOverridesRef.current[key] || {};
  }, [getOptionKey]);


  // State для синхронизированных настроек цены
  const [targetPrice, setTargetPrice] = useState(0);
  // ЗАЧЕМ: Пока флаг false — ползунок/поле цены БА следуют за currentPrice (текущей ценой из шапки).
  // Любое ручное изменение взводит флаг в true и отключает авто-синхронизацию до перезагрузки страницы.
  const [userAdjustedTargetPrice, setUserAdjustedTargetPrice] = useState(false);

  // State для параметров подбора опционов (из AIOptionSelectorDialog)
  // ЗАЧЕМ: Хранит параметры для отображения компонента OptionSelectionResult
  const [optionSelectionParams, setOptionSelectionParams] = useState(null);

  // State для сделки
  // ЗАЧЕМ: Управление созданной сделкой и переключением табов
  // Восстанавливаем из localStorage при загрузке страницы
  const [dealInfo, setDealInfo] = useState(() => {
    try {
      const saved = localStorage.getItem('optioner_deal_info');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [activeCalculatorTab, setActiveCalculatorTab] = useState(() => {
    // Если есть сохранённая сделка — открываем таб "Сделка"
    try {
      const saved = localStorage.getItem('optioner_deal_info');
      return saved ? 'deal' : 'calculator';
    } catch {
      return 'calculator';
    }
  });
  
  // State для сохранения настроек таба Сделка
  // ЗАЧЕМ: Передать настройки в диалог сохранения позиции
  const [dealSettings, setDealSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('optioner_deal_settings');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // УБРАНО: AI модель не используется в универсальном калькуляторе
  // Оставляем переменные как заглушки для совместимости с компонентами
  const isAIEnabled = false;
  const setIsAIEnabled = () => { }; // Заглушка
  const aiVolatilityMap = {};
  const setAiVolatilityMap = () => { }; // Заглушка

  // Синхронизируем targetPrice с currentPrice, пока пользователь сам не вмешался.
  // ЗАЧЕМ: При открытии страницы (новый калькулятор / редактирование / просмотр) ползунок цены БА
  // должен встать на текущую цену из шапки и продолжать следовать её обновлениям, пока пользователь
  // не подвинет его вручную. После ручного изменения авто-синхронизация выключается до перезагрузки.
  useEffect(() => {
    if (currentPrice > 0 && !userAdjustedTargetPrice) {
      setTargetPrice(currentPrice);
    }
  }, [currentPrice, userAdjustedTargetPrice]);

  // Сохраняем dealInfo в localStorage при изменении
  // ЗАЧЕМ: Сделка не сбрасывается после перезагрузки страницы
  useEffect(() => {
    if (dealInfo) {
      localStorage.setItem('optioner_deal_info', JSON.stringify(dealInfo));
    } else {
      localStorage.removeItem('optioner_deal_info');
    }
  }, [dealInfo]);

  // Сохраняем dealSettings в localStorage при изменении
  // ЗАЧЕМ: Настройки таба Сделка (срезки, целевые цены) не сбрасываются после перезагрузки
  useEffect(() => {
    if (dealSettings) {
      localStorage.setItem('optioner_deal_settings', JSON.stringify(dealSettings));
    } else {
      localStorage.removeItem('optioner_deal_settings');
    }
  }, [dealSettings]);

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

  // Сохраняем плечо БА в localStorage при изменении
  useEffect(() => {
    localStorage.setItem('baseAssetLeverage', String(baseAssetLeverage));
  }, [baseAssetLeverage]);

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
  // ВАЖНО: Используем priceData и classification из NewTikerFinder
  const handleTickerSelect = (ticker, instrumentType = null, priceData = null, classification = null) => {
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

  // ИТОГО опционов из таблицы — единое число для P&L TOTAL карточки «Базовый актив».
  // ЗАЧЕМ: P&L TOTAL = P&L актива + ИТОГО таблицы. Значение приходит снизу из OptionsTableV3
  // через callback onOptionsTotalPLChange — никаких параллельных пересчётов.
  const [optionsTableTotalPL, setOptionsTableTotalPL] = useState(0);

  // Карта текущего P&L по optionId — снимается из таблицы и используется при фиксации позиции
  // для записи поля startPL у каждой ноги (см. handlePromotePendingToStandard).
  const [optionsPLMap, setOptionsPLMap] = useState({});

  // Миграция якорной P&L: для старых опционов, у которых заполнен actualPL, но не сохранён actualPLQuantity
  // (фикс масштабирования якоря по количеству был добавлен 2026-05-04, ранее это поле не сохранялось).
  // ЗАЧЕМ: Без actualPLQuantity формула якоря возвращается к старому (некорректному) поведению при смене количества.
  // Миграция фиксирует actualPLQuantity = текущее quantity один раз при обнаружении, дальше формула работает корректно.
  useEffect(() => {
    if (!options || options.length === 0) return;
    const needsMigration = options.some(opt =>
      opt && opt.actualPL !== null && opt.actualPL !== undefined &&
      (opt.actualPLQuantity === null || opt.actualPLQuantity === undefined)
    );
    if (!needsMigration) return;
    setOptions(prev => prev.map(opt => {
      if (opt.actualPL !== null && opt.actualPL !== undefined &&
          (opt.actualPLQuantity === null || opt.actualPLQuantity === undefined)) {
        const qty = Number(opt.quantity) > 0 ? Number(opt.quantity) : 1;
        // Также сохраняем в overrides, чтобы миграция не повторялась при перезагрузке
        try {
          saveUserOverride(opt, 'actualPLQuantity', qty);
        } catch (e) { /* мягкий fallback на случай отсутствия saveUserOverride в момент монтажа */ }
        return { ...opt, actualPLQuantity: qty };
      }
      return opt;
    }));
  }, [options]);


  // Динамический расчёт количества опционов для отображения в хедере
  // ЗАЧЕМ: При изменении quantity в таблице опционов — название сделки автоматически обновляется
  const currentOptionsCount = useMemo(() => {
    const visibleOptions = options.filter(opt => opt.visible !== false);
    return visibleOptions.reduce((sum, opt) => sum + Math.abs(opt.quantity || 1), 0);
  }, [options]);

  // Строим IV Surface из опционов, полученных от расширения TradingView
  // ЗАЧЕМ: IV Surface содержит IV для разных страйков и дат экспирации, что позволяет
  // интерполировать IV при симуляции времени вместо использования простой sqrt модели
  // ВАЖНО: В универсальном калькуляторе НЕ используем Polygon API — данные только от расширения
  const ivSurface = useMemo(() => {
    if (!options || options.length === 0) return null;

    // Преобразуем опционы в формат для buildIVSurface
    const optionsForSurface = options.map(opt => ({
      strike: Number(opt.strike) || 0,
      daysToExpiration: getDaysUntilExpirationUTC(opt.date),
      impliedVolatility: opt.impliedVolatility || opt.implied_volatility || 0
    })).filter(opt => opt.strike > 0 && opt.daysToExpiration > 0 && opt.impliedVolatility > 0);

    if (optionsForSurface.length === 0) return null;

    const surface = buildIVSurface(optionsForSurface);
    console.log('📊 [Universal] IV Surface построен из опционов расширения:', {
      optionsCount: optionsForSurface.length,
      strikesCount: Object.keys(surface).length
    });
    return surface;
  }, [options]);

  // Снимок текущего состояния открытого калькулятора
  // ЗАЧЕМ: Внешние потребители (расширение или иной сервис) могут забирать все ключевые данные
  // открытой в данный момент конфигурации калькулятора из одного ключа localStorage
  const calculatorSnapshot = useMemo(() => {
    try {
      const completeOptions = options.filter(opt => {
        const hasPrice = (opt.premium !== undefined && opt.premium !== null)
          || (opt.bid !== undefined && opt.bid !== null)
          || (opt.ask !== undefined && opt.ask !== null);
        return opt.date && opt.strike && hasPrice && opt.visible !== false;
      });

      const greeks = completeOptions.length > 0
        ? calculateTotalGreeks(completeOptions)
        : { delta: 0, gamma: 0, theta: 0, vega: 0 };

      const plMetrics = completeOptions.length > 0
        ? calculatePLMetrics(
            completeOptions,
            currentPrice,
            positions,
            daysPassed,
            ivSurface,
            dividendYield,
            isAIEnabled,
            aiVolatilityMap,
            targetPrice,
            selectedTicker,
            calculatorMode,
            contractMultiplier
          )
        : { maxLoss: 0, maxProfit: 0, breakevens: [], riskReward: '—' };

      return {
        ticker: selectedTicker,
        assetPrice: currentPrice,
        optionsTable: options,
        plMetrics: {
          maxLoss: plMetrics.maxLoss,
          maxProfit: plMetrics.maxProfit,
          breakevens: plMetrics.breakevens,
          riskReward: plMetrics.riskReward,
          greeks
        },
        volatility: volatilityData,
        updatedAt: new Date().toISOString()
      };
    } catch (err) {
      console.error('Ошибка при построении снимка калькулятора:', err);
      return null;
    }
  }, [
    selectedTicker,
    currentPrice,
    options,
    positions,
    daysPassed,
    ivSurface,
    dividendYield,
    isAIEnabled,
    aiVolatilityMap,
    targetPrice,
    calculatorMode,
    contractMultiplier,
    volatilityData
  ]);

  // Запись снимка в localStorage при любом изменении входных данных
  // ЗАЧЕМ: Потребителям всегда нужен актуальный срез открытого калькулятора в едином ключе
  useEffect(() => {
    try {
      if (calculatorSnapshot) {
        localStorage.setItem('currentCalculatorSnapshot', JSON.stringify(calculatorSnapshot));
      }
    } catch (err) {
      console.error('Ошибка сохранения снимка калькулятора в localStorage:', err);
    }
  }, [calculatorSnapshot]);

  // Функции для сохранения и загрузки состояния калькулятора
  const saveCalculatorState = useCallback(() => {
    // Читаем текущее состояние из localStorage для объединения
    // ЗАЧЕМ: Чтобы не затереть данные от расширения (например, rangeOptions), 
    // которые не хранятся в React state калькулятора.
    const savedState = localStorage.getItem('calculatorState');
    const existingState = savedState ? JSON.parse(savedState) : {};

    const newState = {
      ...existingState, // Сохраняем все существующие поля (включая те, что от расширения)
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
    localStorage.setItem('calculatorState', JSON.stringify(newState));
    console.log('💾 [Universal] Сохранение состояния (merged):', {
      positionsCount: positions.length,
      optionsCount: options.length,
      hasRangeOptions: !!newState.rangeOptions,
      superOptions: options.filter(o => o.isSuperOption).length
    });
  }, [selectedTicker, currentPrice, priceChange, options, positions, selectedExpirationDate, daysPassed, chartDisplayMode, showOptionLines, showProbabilityZones, strikesByDate, expirationDates]);

  // === ПРИЁМ ОБНОВЛЁННЫХ ДАННЫХ ОТ РАСШИРЕНИЯ (sendPrIV_tocallc) ===
  // Поведение зависит от статуса загруженной сделки (universalCalc_loadedConfigStatus):
  //   pending  → обновляем IV, bid, ask, volume каждого опциона + currentPrice в шапке;
  //              цена базового актива в строке опциона (assetPriceAtEntry) приравнивается
  //              к новой currentPrice; ручные правки bid/ask перетираются (сделка ещё не зафиксирована).
  //   standard → обновляем только IV каждого опциона и currentPrice в шапке;
  //              bid / ask / volume / assetPriceAtEntry опционов НЕ трогаем (это снимок входа в сделку).
  // Греки delta/gamma/theta/vega из команды игнорируются — калькулятор пересчитывает их сам из IV.
  const { pendingRefresh, markProcessed } = useExtensionRefreshCommand();

  useEffect(() => {
    if (!pendingRefresh) return;
    if (options.length === 0) return;

    // Гейт №1: сделка не загружена — обновлять нечего, реагировать тоже не нужно.
    // ЗАЧЕМ: команды sendPrIV_tocallc адресованы конкретной сохранённой позиции.
    // Если в калькуляторе сделки нет — это команда для другой вкладки или мусор из localStorage.
    const currentLoadedConfigId = localStorage.getItem('universalCalc_loadedConfigId') || null;
    if (!currentLoadedConfigId) return;

    // Гейт №2: команда адресована другой вкладке — НЕ помечаем processed и НЕ пишем
    // в tvc_refresh_result, чтобы не затереть статус «правильной» вкладки.
    if (pendingRefresh.dbConfigId && pendingRefresh.dbConfigId !== currentLoadedConfigId) {
      console.log('⏭️ [ExtRefresh] Пропуск — dbConfigId не совпадает:', {
        cmd: pendingRefresh.dbConfigId, current: currentLoadedConfigId
      });
      return;
    }

    // Гейт №3: 3-секундная защита от дребезга при инициализации калькулятора.
    // ЗАЧЕМ: при добавлении опциона расширение шлёт И calculatorState (IV → impliedVolatility),
    // И tvc_refresh_command (IV → manualIvOverride). Если обработать оба сразу — IV попадёт
    // в Fact IV вместо колонки IV.
    if (pendingRefresh.timestamp && initCompletedAtRef.current &&
        pendingRefresh.timestamp <= initCompletedAtRef.current + 3000) {
      console.log('⏭️ [ExtRefresh] Пропуск — команда пришла одновременно с инициализацией');
      markProcessed();
      return;
    }

    // Гейт №4: тикер не совпадает с текущим. dbConfigId-проверка выше уже отсеивает чужие вкладки;
    // этот фильтр — страховка от устаревшей записи в localStorage от другого тикера.
    if (pendingRefresh.ticker && selectedTicker &&
        pendingRefresh.ticker.toUpperCase() !== selectedTicker.toUpperCase()) {
      console.log('⚠️ [ExtRefresh] Пропуск — тикер не совпадает:', {
        refresh: pendingRefresh.ticker, current: selectedTicker
      });
      markProcessed();
      return;
    }

    try {
      writeRefreshResult({ status: 'collecting', progress: 50, message: 'Применяем обновление…' });

      const { currentPrice: newPrice, options: refreshedOptions } = pendingRefresh;
      const hasNewPrice = typeof newPrice === 'number' && newPrice > 0;

      if (hasNewPrice) {
        setCurrentPrice(newPrice);
      }

      // Читаем статус прямо из localStorage — он всегда актуален и не зависит от React state-cycle.
      const currentStatus = localStorage.getItem('universalCalc_loadedConfigStatus');
      const isPending = currentStatus === 'pending';

      let updatedCount = 0;

      if (refreshedOptions && refreshedOptions.length > 0) {
        const now = new Date();
        const todayISO = now.toISOString().split('T')[0];
        const todayDisplay = now.toLocaleDateString('ru-RU') + ' ' +
          now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        const updatedOptions = options.map(opt => {
          const match = refreshedOptions.find(ref => {
            const typeMatch = (ref.type || '').toUpperCase() === (opt.type || '').toUpperCase();
            const strikeMatch = Math.abs(parseFloat(ref.strike) - parseFloat(opt.strike)) < 0.5;
            let dateMatch = false;
            try {
              const d1 = (opt.date || '').toString().split('T')[0];
              const d2 = (ref.date || '').toString().split('T')[0];
              dateMatch = d1 === d2;
            } catch { dateMatch = false; }
            return typeMatch && strikeMatch && dateMatch;
          });

          if (!match) return opt;

          let next = opt;
          let touched = false;

          // IV — обновляем в обоих режимах (pending и standard).
          if (match.newIV != null && !isNaN(match.newIV)) {
            next = {
              ...next,
              manualIvOverride: match.newIV,
              manualIvOverrideDate: todayISO,
              manualIvOverrideDisplayDate: todayDisplay,
              ivUpdatedFromExtension: true
            };
            touched = true;
          }

          // bid/ask/volume/assetPriceAtEntry — только в режиме pending.
          // В standard эти поля — снимок входа в позицию, расширение их не должно перетирать.
          if (isPending) {
            const patch = {};
            if (match.bid != null) {
              patch.bid = match.bid;
              patch.customBid = null;
              patch.isBidModified = false;
            }
            if (match.ask != null) {
              patch.ask = match.ask;
              patch.customAsk = null;
              patch.isAskModified = false;
            }
            if (match.volume != null) {
              patch.volume = match.volume;
            }
            // Цена базового актива в строке опциона приравнивается к новой цене в шапке.
            if (hasNewPrice) {
              patch.assetPriceAtEntry = newPrice;
              patch.isAssetPriceModified = false;
            }
            if (Object.keys(patch).length > 0) {
              next = { ...next, ...patch };
              touched = true;
            }
          }

          if (touched) updatedCount++;
          return next;
        });

        if (updatedCount > 0) {
          setOptions(updatedOptions);
        }
      }

      writeRefreshResult({
        status: 'complete',
        progress: 100,
        message: updatedCount > 0
          ? `Обновлено опционов: ${updatedCount}${hasNewPrice ? ' + цена БА' : ''}`
          : (hasNewPrice ? 'Обновлена цена базового актива' : 'Команда обработана, изменений нет')
      });

      if (currentLoadedConfigId) {
        needExtRefreshSaveRef.current = true;
      }
    } catch (e) {
      console.error('❌ [ExtRefresh] Ошибка применения команды:', e);
      writeRefreshResult({
        status: 'error',
        progress: 0,
        message: e?.message || 'Ошибка применения обновления'
      });
    } finally {
      markProcessed();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRefresh, options.length, selectedTicker]);

  // Пересохранение конфигурации после обновления от расширения
  useEffect(() => {
    if (!needExtRefreshSaveRef.current || !loadedConfigId) return;
    needExtRefreshSaveRef.current = false;

    if (configSource === 'db') {
      (async () => {
        try {
          let userId = null;
          if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) userId = session.user.id;
          }
          await updateConfiguration(loadedConfigId, {
            state: {
              selectedTicker, currentPrice, priceChange, options, positions,
              selectedExpirationDate, daysPassed, showOptionLines, showProbabilityZones,
              chartDisplayMode, calculatorMode,
            },
          }, userId);
          console.log('💾 [ExtRefresh] Конфигурация пересохранена в БД:', loadedConfigId);
        } catch (error) {
          console.error('❌ [ExtRefresh] Ошибка пересохранения в БД:', error);
        }
      })();
    } else {
      try {
        const saved = localStorage.getItem('universalCalculatorConfigurations');
        if (!saved) return;
        const configurations = JSON.parse(saved);
        const idx = configurations.findIndex(c => c.id === loadedConfigId);
        if (idx === -1) return;
        configurations[idx].state = { ...configurations[idx].state, options, currentPrice };
        localStorage.setItem('universalCalculatorConfigurations', JSON.stringify(configurations));
      } catch (error) {
        console.error('❌ [ExtRefresh] Ошибка пересохранения в localStorage:', error);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, currentPrice, loadedConfigId]);

  // Функция генерации ссылки на TradingView для тикера
  // ЗАЧЕМ: Создаёт правильную ссылку на страницу опционов в TradingView с учётом биржи
  // ПРИОРИТЕТ: exchange из расширения > паттерны тикера > NASDAQ по умолчанию
  const getTradingViewLink = useCallback((ticker, exchangeFromExtension) => {
    if (!ticker) return null;

    // ЗАЧЕМ: крипто-USDT-пары (BTCUSDT, ETHUSDT, …) живут на Binance Options,
    // на TradingView их нет — клик по тикеру ведёт на Binance eoptions.
    // Расширение Binance → Optioner Bridge обновляет такие сделки автоматически.
    const cryptoMatch = /^([A-Z]+)USDT$/.exec(ticker);
    if (cryptoMatch) {
      return `https://www.binance.com/en/eoptions/${ticker}`;
    }

    // Если расширение явно передало биржу — уважаем её (расширение спарсило
    // символ прямо со страницы TradingView и знает точный префикс).
    // Иначе оставляем голый тикер — TV сам резолвит:
    //   акции:     ABT → NYSE:ABT, AAPL → NASDAQ:AAPL, SPY → AMEX:SPY
    //   фьючерсы:  ESU2026 → CME_MINI, ZCN2026 → CBOT, YMM2026 → CBOT_MINI,
    //              6EH2026 → CME, CLF2026 → NYMEX, GCG2026 → COMEX
    // Раньше тут была ручная карта (ES → CME, GC → NYMEX, YM → CME) с
    // ошибочными биржами, которая ломала половину фьючерсных сохранений
    // (ESU2026: CME → 404, а правильно CME_MINI).
    const symbol = exchangeFromExtension ? `${exchangeFromExtension}:${ticker}` : ticker;
    const encodedSymbol = encodeURIComponent(symbol);
    return `https://www.tradingview.com/options/chain/?symbol=${encodedSymbol}`;
  }, []);

  const resetCalculator = useCallback(() => {
    // ВАЖНО: Устанавливаем флаг СИНХРОННО, до любых setState
    // ЗАЧЕМ: Блокирует автосохранение и sync в текущем рендер-цикле,
    // которые ещё видят старый isInitialized=true и перезаписали бы localStorage
    isResettingRef.current = true;
    setSelectedTicker('');
    setCurrentPrice(0);
    setPriceChange({ value: 0, percent: 0 });
    setOptions([]);
    setPositions([]);
    setSelectedExpirationDate(null);
    setDaysPassed(0);
    setChartDisplayMode('profit-loss-dollar');
    setUserAdjustedDays(false);
    setTargetPrice(0);
    setUserAdjustedTargetPrice(false);
    setIsDataCleared(false);
    setShowDemoData(false);
    setStrikesByDate({});
    setExpirationDates({});
    setIsLocked(false); // Сбрасываем флаг фиксации
    setSavedConfigDate(null); // Сбрасываем дату сохранения конфигурации
    setLivePrice(null); // Сбрасываем текущую рыночную цену
    setOptionSelectionParams(null); // Сбрасываем параметры подбора опционов
    setIsInitialized(false); // ВАЖНО: Сбрасываем флаг инициализации для повторной загрузки при обновлении страницы
    setCalculatorMode(CALCULATOR_MODES.STOCKS); // Сбрасываем режим калькулятора на акции
    setSelectedFuture(null); // Сбрасываем выбранный фьючерс
    setLoadedConfigId(null); // Сбрасываем ID загруженной конфигурации
    setLoadedConfigStatus(null); // Сбрасываем статус загруженной позиции
    setLoadedConfigName(null);
    setIsEditMode(false); // Сбрасываем режим редактирования
    setHasChanges(false); // Сбрасываем флаг изменений

    // ВАЖНО: Очищаем localStorage ПЕРЕД очисткой данных расширения
    // ЗАЧЕМ: Предотвращаем восстановление старой selectedExpirationDate из кэша
    localStorage.removeItem('calculatorState');
    console.log('🧹 [Universal] localStorage.calculatorState очищен');
    
    // ВАЖНО: Очищаем сохраненные ручные изменения опционов
    // ЗАЧЕМ: После полного сброса калькулятора старые изменения не должны применяться
    localStorage.removeItem('optioner_user_overrides');
    userOptionOverridesRef.current = {};
    console.log('🧹 [Universal] optioner_user_overrides очищен');

    // ВАЖНО: Очищаем сохранённые данные сделки и настроек вкладки «Сделка»
    // ЗАЧЕМ: После полного сброса ни сделка, ни настройки (включая exitPlanSteps)
    // не должны переноситься в следующий сеанс
    localStorage.removeItem('optioner_deal_info');
    localStorage.removeItem('optioner_deal_settings');
    // Снимки для внешних потребителей (расширение TradingView) — иначе они видят устаревший план
    localStorage.removeItem('currentExitPlanSnapshot');
    localStorage.removeItem('currentCalculatorSnapshot');
    console.log('🧹 [Universal] optioner_deal_info, optioner_deal_settings и снимки очищены');

    // Очищаем URL параметры (contract, price, config, dbConfig, edit)
    // ЗАЧЕМ: Предотвращаем восстановление данных из URL при обновлении страницы
    // ВАЖНО: используем navigate(), а не window.history.replaceState — иначе
    // React Router сохраняет старый location.search и useEffect немедленно
    // перезапускает загрузку только что сброшенной конфигурации
    const url = new URL(window.location.href);
    url.searchParams.delete('contract');
    url.searchParams.delete('price');
    url.searchParams.delete('config');
    url.searchParams.delete('dbConfig');
    url.searchParams.delete('edit');
    navigate(url.pathname + (url.search ? url.search : ''), { replace: true });
    console.log('🧹 [Universal] URL параметры очищены');

    // Очищаем данные расширения (тикер контракта и временную метку)
    clearExtensionData();

    // Сбрасываем сделку и настройки вкладки «Сделка»
    setDealInfo(null);
    setDealSettings(null);
    setActiveCalculatorTab('calculator');

    // ✅ Принудительная перезагрузка страницы
    // ЗАЧЕМ: Гарантируем полную очистку состояния, предотвращаем восстановление данных из useEffect
    setTimeout(() => {
      console.log('🔄 [Universal] Перезагрузка страницы после сброса...');
      window.location.reload();
    }, 100);
  }, [clearExtensionData, navigate]);

  // Функция создания сделки
  // ЗАЧЕМ: Создаёт сделку с текущим количеством опционов (без автоподбора по лимиту)
  const handleCreateDeal = useCallback(() => {
    // Для крипто-режима (Binance) — пропускаем проверку таблицы опционов
    // ЗАЧЕМ: BinanceDealTab использует собственные поля ввода, таблица опционов не нужна
    if (calculatorMode === CALCULATOR_MODES.CRYPTO) {
      const ticker = loadedConfigId ? (selectedTicker || contractCode) : (contractCode || selectedTicker);
      const deal = {
        ticker,
        optionsCount: 0,
        createdAt: new Date().toISOString()
      };
      setDealInfo(deal);
      setDealSettings(null);
      setActiveCalculatorTab('deal');
      console.log('✅ [Deal][Binance] Сделка создана:', deal);
      return;
    }

    // Подсчитываем количество видимых опционов
    const visibleOptions = options.filter(opt => opt.visible !== false);
    
    // Проверяем допустимые комбинации опционов для сделки
    // ЗАЧЕМ: Сделка поддерживает один Buy CALL (позитивный сценарий) + опционально один Buy PUT (негативный сценарий)
    const buyCallOptions = visibleOptions.filter(opt => opt.action === 'Buy' && opt.type === 'CALL');
    const buyPutOptions = visibleOptions.filter(opt => opt.action === 'Buy' && opt.type === 'PUT');
    const otherOptions = visibleOptions.filter(opt => !(opt.action === 'Buy' && (opt.type === 'CALL' || opt.type === 'PUT')));
    
    if (visibleOptions.length === 0) {
      alert('Добавьте опцион в таблицу для создания сделки');
      console.warn('⚠️ [Deal] Нет опционов для создания сделки');
      return;
    }
    
    // Ограничение: не более 4 опционов для Мультисделки
    if (visibleOptions.length > 4) {
      alert('Функционал Сделки поддерживает не более 4 различных опционов');
      console.warn('⚠️ [Deal] Превышено ограничение в 4 опциона:', visibleOptions.length);
      return;
    }
    
    // Берём текущее количество контрактов без автоподбора по лимиту
    // ЗАЧЕМ: Количество меняется только вручную пользователем
    const finalOptionsCount = visibleOptions.reduce((sum, opt) => sum + Math.abs(opt.quantity || 1), 0);

    // Создаём информацию о сделке
    const ticker = loadedConfigId ? (selectedTicker || contractCode) : (contractCode || selectedTicker);
    const isMultiDeal = visibleOptions.length > 1;
    
    const deal = {
      ticker,
      optionsCount: finalOptionsCount,
      options: visibleOptions, // Передаем массив опционов
      isMultiDeal,
      createdAt: new Date().toISOString()
    };
    
    setDealInfo(deal);
    
    // Сбрасываем настройки таба Сделка при создании новой сделки
    // ЗАЧЕМ: Старый frozenExitPlan и slicesSent от предыдущей сделки не должны показываться
    setDealSettings(null);
    
    setActiveCalculatorTab('deal'); // Переключаемся на таб "Сделка"
    
    // Устанавливаем целевую цену актива в блок симуляции
    // ЗАЧЕМ: При нажатии кнопки "+ СДЕЛКА" targetPrice должен быть = currentPrice * 1.5 (50% по умолчанию).
    // Это явное пользовательское действие — взводим флаг ручной правки, чтобы авто-синхронизация
    // не откатывала только что выставленное значение обратно к currentPrice.
    const defaultTargetAssetPrice = currentPrice * 1.5; // 50% от текущей цены
    setTargetPrice(defaultTargetAssetPrice);
    setUserAdjustedTargetPrice(true);
    
    console.log('✅ [Deal] Сделка создана:', deal);
  }, [options, contractCode, selectedTicker, currentPrice, calculatorMode, setTargetPrice, setDealSettings]);

  // Загружаем состояние при первой загрузке страницы
  // ПРИОРИТЕТ: config в URL > Данные от расширения > localStorage.calculatorState
  // ЗАЧЕМ: Универсальный калькулятор работает только с данными от Chrome Extension
  useEffect(() => {
    if (isInitialized) return;

    // Сбрасываем флаг сброса при новой инициализации
    // ЗАЧЕМ: После reload флаг должен быть false, чтобы эффекты работали нормально
    isResettingRef.current = false;

    // === ДИАГНОСТИКА: Логируем полное состояние при инициализации ===
    // ЗАЧЕМ: Понять что именно видит калькулятор при добавлении опциона из TradingView
    const diagSearchParams = new URLSearchParams(window.location.search);
    const diagSessionConfigId = localStorage.getItem('universalCalc_loadedConfigId');
    console.log('🔍 [ДИАГНОСТИКА INIT] Полное состояние при инициализации:', {
      url: window.location.href,
      hasConfig: diagSearchParams.has('config'),
      configId: diagSearchParams.get('config'),
      hasContract: diagSearchParams.has('contract'),
      contract: diagSearchParams.get('contract'),
      price: diagSearchParams.get('price'),
      isFromExtension,
      extensionTicker,
      extensionOptionsCount: extensionOptions?.length || 0,
      sessionStorageConfigId: diagSessionConfigId,
      loadedConfigId,
      isInitialized
    });

    // === ПРОВЕРКА: Есть ли config в URL ===
    // ЗАЧЕМ: Если есть config в URL — пропускаем инициализацию из localStorage/расширения
    // Конфигурация будет загружена отдельным useEffect через loadConfiguration
    const searchParams = new URLSearchParams(window.location.search);
    const configId = searchParams.get('config');
    if (configId) {
      console.log('⏭️ [Universal] Пропускаем инициализацию — есть config в URL:', configId);
      initCompletedAtRef.current = Date.now();
      setIsInitialized(true);
      return;
    }

    // === ЗАЩИТА: Восстановление конфигурации после перезагрузки расширением ===
    // ЗАЧЕМ: Расширение TradingView при добавлении опциона перенаправляет страницу
    // (window.location.href = '?contract=XXX&price=YYY'), что уничтожает React state.
    // Если в localStorage сохранён loadedConfigId — значит до перезагрузки была открыта конфигурация.
    // Восстанавливаем конфигурацию СИНХРОННО из localStorage, затем sync useEffect добавит новые опционы.
    // ВАЖНО: НЕ проверяем isFromExtension — при первом рендере он может быть false
    const savedConfigId = localStorage.getItem('universalCalc_loadedConfigId');
    const hasContract = searchParams.has('contract');
    if (savedConfigId && hasContract) {
      console.log('🛡️ [Universal] Восстановление конфигурации после перезагрузки расширением:', savedConfigId);
      
      // Синхронно загружаем конфигурацию из localStorage
      // ЗАЧЕМ: Избегаем race condition с async loadConfiguration — 
      // опционы конфигурации должны быть в state ДО setIsInitialized(true)
      try {
        const savedConfigs = localStorage.getItem('universalCalculatorConfigurations');
        if (savedConfigs) {
          const configurations = JSON.parse(savedConfigs);
          const config = configurations.find(c => c.id === savedConfigId);
          
          if (config && config.state) {
            // Восстанавливаем основные данные конфигурации
            // Восстанавливаем режим редактирования из localStorage
            // ЗАЧЕМ: Если пользователь был в режиме редактирования до перезагрузки — сохраняем его
            const savedEditMode = localStorage.getItem('universalCalc_isEditMode') === 'true';
            setIsEditMode(savedEditMode);
            
            // В режиме редактирования конфигурация разблокирована для редактирования
            let configIsLocked = config.isLocked === true;
            if (savedEditMode) configIsLocked = false;
            setIsLocked(configIsLocked);
            
            const ticker = config.state.selectedTicker || '';
            if (ticker) setSelectedTicker(ticker);
            if (config.state.currentPrice) setCurrentPrice(config.state.currentPrice);
            if (config.state.priceChange) setPriceChange(config.state.priceChange);
            
            // Восстанавливаем опционы конфигурации
            const configEntryDate = config.entryDate || config.createdAt || 
              (config.id ? new Date(parseInt(config.id)).toISOString() : null);
            const fallbackEntryDate = configEntryDate
              ? new Date(configEntryDate).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0];
            
            let optionsToSet = (config.state.options || []).map(opt => {
              // Если у опциона нет entryDate — это либо новый опцион от расширения, либо старая конфигурация
              // ЗАЧЕМ: Новые опционы должны получать сегодняшнюю дату, старые — дату конфигурации
              if (!opt.entryDate) {
                const todayDateInit = new Date().toISOString().split('T')[0];
                console.log('📅 [Init] Опцион без entryDate, ставим сегодняшнюю дату:', { 
                  optionKey: getOptionKey(opt), 
                  date: todayDateInit 
                });
                return { ...opt, entryDate: todayDateInit };
              }
              return opt;
            });
            
            // Сохраняем исходный список опционов из конфигурации
            // ЗАЧЕМ: Для последующих проверок при применении savedOverrides
            const originalOptionKeys = new Set(optionsToSet.map(opt => getOptionKey(opt)));
            
            // Для зафиксированных позиций вычисляем daysPassed и initialDaysToExpiration
            if (configIsLocked && configEntryDate) {
              setSavedConfigDate(configEntryDate);
              const savedDate = new Date(configEntryDate);
              savedDate.setHours(0, 0, 0, 0);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const diffTime = today.getTime() - savedDate.getTime();
              const calculatedDaysPassed = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
              setDaysPassed(calculatedDaysPassed);
              
              optionsToSet = optionsToSet.map(opt => {
                if (opt.date) {
                  const [year, month, day] = opt.date.split('-').map(Number);
                  const expDateUTC = Date.UTC(year, month - 1, day);
                  const savedDateUTC = Date.UTC(savedDate.getFullYear(), savedDate.getMonth(), savedDate.getDate());
                  return {
                    ...opt,
                    initialDaysToExpiration: Math.ceil((expDateUTC - savedDateUTC) / (1000 * 60 * 60 * 24)),
                    isLockedPosition: true
                  };
                }
                return { ...opt, isLockedPosition: true };
              });
            } else if (savedEditMode) {
              // В режиме редактирования удаляем флаги блокировки с опционов
              // ЗАЧЕМ: Позволяет редактировать все опционы в разблокированном виде
              optionsToSet = optionsToSet.map(opt => {
                const { isLockedPosition, ...rest } = opt;
                return rest;
              });
            }
            
            // Применяем savedOverrides из userOptionOverridesRef к загруженным опционам
            // ЗАЧЕМ: При перезагрузке расширением ручные изменения (actualPL, manualIvOverride, customAsk) терялись
            const todayDateRestore = new Date().toISOString().split('T')[0];
            optionsToSet = optionsToSet.map(opt => {
              const optionKey = getOptionKey(opt);
              const savedOverrides = userOptionOverridesRef.current[optionKey] || {};
              
              // Исключаем entryDate из savedOverrides
              // ЗАЧЕМ: entryDate не должен перезаписываться из savedOverrides, только из конфигурации
              const { entryDate: _, ...overridesWithoutEntryDate } = savedOverrides;
              const hasSavedOverrides = Object.keys(overridesWithoutEntryDate).length > 0;
              
              if (hasSavedOverrides) {
                console.log('🔄 [Restore] Применяем savedOverrides:', { optionKey, savedOverrides: overridesWithoutEntryDate });
                return { ...opt, ...overridesWithoutEntryDate };
              }
              
              // Проверяем, был ли этот опцион в исходной конфигурации
              // ЗАЧЕМ: Отличить "новый опцион от расширения" от "старого сохраненного опциона"
              // Новый опцион = его нет в originalOptionKeys, старый = есть в originalOptionKeys
              const isNewOptionFromExtension = !originalOptionKeys.has(optionKey);
              
              if (isNewOptionFromExtension && opt.entryDate === fallbackEntryDate) {
                console.log('📅 [Restore] Новый опцион от расширения, ставим сегодняшнюю дату:', { optionKey, old: opt.entryDate, new: todayDateRestore });
                return { ...opt, entryDate: todayDateRestore };
              }
              
              return opt;
            });
            
            setOptions(optionsToSet);
            setPositions(config.state.positions || []);
            if (config.state.selectedExpirationDate) setSelectedExpirationDate(config.state.selectedExpirationDate);
            if (config.state.chartDisplayMode) setChartDisplayMode(config.state.chartDisplayMode);
            
            // Восстанавливаем режим калькулятора
            if (config.state.calculatorMode) {
              setCalculatorMode(config.state.calculatorMode);
            } else if (ticker) {
              const detectedType = detectInstrumentTypeByPattern(ticker);
              if (detectedType === 'futures') {
                setCalculatorMode(CALCULATOR_MODES.FUTURES);
              } else if (detectedType === 'crypto') {
                setCalculatorMode(CALCULATOR_MODES.CRYPTO);
              } else if (detectedType === 'etf') {
                setCalculatorMode(CALCULATOR_MODES.ETF);
              } else {
                setCalculatorMode(CALCULATOR_MODES.STOCKS);
              }
            }

            // Настройки фьючерса
            if ((config.state.calculatorMode === CALCULATOR_MODES.FUTURES ||
                 detectInstrumentTypeByPattern(ticker) === 'futures') && ticker) {
              setSelectedFuture(getFutureByTicker(ticker));
            }
            
            setLoadedConfigId(savedConfigId);
            console.log('✅ [Universal] Конфигурация восстановлена после перезагрузки расширением:', {
              ticker, optionsCount: optionsToSet.length, configIsLocked
            });
            
            // Новые опционы от расширения будут добавлены через sync useEffect (Шаг 3)
            initCompletedAtRef.current = Date.now();
            setIsInitialized(true);
            return;
          }
        }
      } catch (error) {
        console.error('❌ [Universal] Ошибка восстановления конфигурации:', error);
      }
      // Если конфигурация не найдена — очищаем localStorage и продолжаем обычную инициализацию
      localStorage.removeItem('universalCalc_loadedConfigId');
      localStorage.removeItem('universalCalc_loadedConfigStatus');
    }

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

      // Загружаем сохраненное состояние из localStorage для восстановления позиций и ручных изменений
      // ЗАЧЕМ: При перезагрузке страницы восстанавливаем позиции базового актива и ручные изменения цен
      const saved = localStorage.getItem('calculatorState');
      let savedOptions = [];
      let savedPositions = [];
      let savedTicker = null;
      if (saved) {
        try {
          const state = JSON.parse(saved);
          savedOptions = state.options || [];
          savedPositions = state.positions || [];
          savedTicker = state.selectedTicker;
          console.log('📡 [Universal] Загружено из localStorage:', {
            savedTicker,
            optionsCount: savedOptions.length,
            positionsCount: savedPositions.length
          });
        } catch (error) {
          console.error('❌ Ошибка чтения сохраненного состояния:', error);
        }
      }

      // Определяем текущий тикер от расширения
      const currentTicker = extensionTicker || contractCode;

      // Устанавливаем опционы с сохранением ручных изменений Bid/Ask
      if (extensionOptions && extensionOptions.length > 0) {
        // Сливаем данные: берем свежие данные от расширения, но сохраняем ручные изменения
        const mergedOptions = extensionOptions.map(extOption => {
          // Ищем соответствующий опцион в сохраненных данных с более гибким сравнением
          const savedOption = savedOptions.find(saved => {
            const savedType = saved.type || saved.optionType || '';
            const extType = extOption.type || extOption.optionType || '';
            const typeMatch = savedType.toUpperCase() === extType.toUpperCase();

            const strikeMatch = Math.abs(parseFloat(saved.strike) - parseFloat(extOption.strike)) < 0.001;

            // Сравнение дат с учетом возможных смещений часовых поясов (допуск 48 часов)
            let dateMatch = false;
            try {
              // Пытаемся сравнить как объекты Date
              const t1 = new Date(saved.date).getTime();
              const t2 = new Date(extOption.date).getTime();

              if (!isNaN(t1) && !isNaN(t2)) {
                // Разница в часах
                const diffHours = Math.abs(t1 - t2) / (1000 * 60 * 60);
                // Считаем совпадением, если разница меньше 48 часов (чтобы покрыть смену суток из-за TZ)
                dateMatch = diffHours < 48;
              } else {
                // Fallback на смелое строковое стравнение (prefix)
                const s1 = (saved.date || '').toString().split('T')[0];
                const s2 = (extOption.date || '').toString().split('T')[0];
                dateMatch = s1 === s2;
              }
            } catch (e) {
              console.warn('Date comparison error:', e);
              dateMatch = false;
            }

            return typeMatch && strikeMatch && dateMatch;
          });

          // DEBUG: Логируем если опцион найден или если это супер опцион
          if (extOption.isSuperOption || (savedOption && savedOption.isSuperOption)) {
            console.log('💎 Super Option merge check:', {
              extHasFlag: !!extOption.isSuperOption,
              savedHasFlag: !!savedOption?.isSuperOption,
              foundSaved: !!savedOption,
              extDate: extOption.date,
              savedDate: savedOption?.date
            });
          }

          // Если найден сохраненный опцион с ручными изменениями - используем их
          if (savedOption) {
            return {
              ...extOption,
              // Сохраняем ручные изменения Bid
              customBid: savedOption.customBid,
              isBidModified: savedOption.isBidModified,
              // Сохраняем ручные изменения Ask
              customAsk: savedOption.customAsk,
              isAskModified: savedOption.isAskModified,
              // Сохраняем ручные изменения премии
              isPremiumModified: savedOption.isPremiumModified,
              // Сохраняем флаги происхождения опциона (Super/Golden)
              isSuperOption: savedOption.isSuperOption,
              isGoldenOption: savedOption.isGoldenOption,
              // Сохраняем дополнительные параметры
              entryDate: savedOption.entryDate,
              simulationTargetPrice: savedOption.simulationTargetPrice,
              // Цена базового актива на момент входа
              assetPriceAtEntry: savedOption.assetPriceAtEntry || extOption.assetPriceAtEntry || safeExtensionPriceForEntry || 0,
              isAssetPriceModified: savedOption.isAssetPriceModified,
            };
          }

          return {
            ...extOption,
            // Цена базового актива на момент входа
            // Приоритет: assetPriceAtEntry с расширения → safeExtensionPriceForEntry (валидированная health-check)
            // → fallback на currentPrice/extensionPrice (на случай старых билдов расширения)
            assetPriceAtEntry: extOption.assetPriceAtEntry || safeExtensionPriceForEntry || currentPrice || extensionPrice || 0,
          };
        });

        setOptions(mergedOptions);
        console.log('📡 [Universal] Загружено опционов:', mergedOptions.length, '(с сохранением ручных изменений)');
      }

      // Восстанавливаем позиции базового актива ТОЛЬКО если их тикер совпадает с текущим
      // ЗАЧЕМ: При переключении на другой инструмент позиции от предыдущего тикера должны очищаться
      if (savedPositions.length > 0) {
        // Фильтруем позиции: оставляем только те, у которых ticker совпадает с текущим
        const matchingPositions = savedPositions.filter(pos => pos.ticker === currentTicker);

        if (matchingPositions.length > 0) {
          setPositions(matchingPositions);
          console.log('📡 [Universal] Восстановлено позиций базового актива:', matchingPositions.length);
        } else {
          setPositions([]);
          console.log('🔄 [Universal] Позиции не совпадают с текущим тикером', currentTicker, '- позиции очищены');
        }
      }

      // Инициализируем prevTickerRef для отслеживания последующих изменений
      // ЗАЧЕМ: Позволяет определить смену тикера в useEffect
      prevTickerRef.current = currentTicker;
      console.log('📝 [Universal] prevTickerRef инициализирован:', currentTicker);

      // Автоматически определяем режим (фьючерсы/крипто/акции) по тикеру
      // ЗАЧЕМ: Паттерн-детекция работает даже для фьючерсов без настроек
      const ticker = extensionTicker || contractCode;

      if (ticker) {
        const detectedType = detectInstrumentTypeByPattern(ticker);

        if (detectedType === 'futures') {
          setCalculatorMode(CALCULATOR_MODES.FUTURES);

          // Пытаемся найти настройки фьючерса
          const futureInfo = getFutureByTicker(ticker);
          setSelectedFuture(futureInfo);

          if (futureInfo) {
            console.log('📊 Автоматически переключено в режим фьючерсов (найдены настройки):', futureInfo);
          } else {
            console.log('⚠️ Автоматически переключено в режим фьючерсов (настройки НЕ найдены):', ticker);
          }
        } else if (detectedType === 'crypto') {
          // Режим крипто (множитель = 1)
          setCalculatorMode(CALCULATOR_MODES.CRYPTO);
          setSelectedFuture(null);
          console.log('📊 Автоматически переключено в режим крипто:', ticker);
        } else if (detectedType === 'etf') {
          // Режим ETF — математика как у акций, отличается только бейдж в шапке
          setCalculatorMode(CALCULATOR_MODES.ETF);
          setSelectedFuture(null);
          console.log('📊 Автоматически переключено в режим ETF:', ticker);
        } else {
          // Режим акций
          setCalculatorMode(CALCULATOR_MODES.STOCKS);
          setSelectedFuture(null);
          console.log('📊 Автоматически переключено в режим акций:', ticker);
        }
      }

      initCompletedAtRef.current = Date.now();
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

          // Восстанавливаем опционы с применением savedOverrides
          // ЗАЧЕМ: При перезагрузке ручные изменения (actualPL, manualIvOverride и др.) могут отсутствовать в localStorage
          const restoredOptions = (state.options || []).map(opt => {
            const base = { ...opt, entryDate: opt.entryDate || new Date().toISOString().split('T')[0] };
            const optionKey = getOptionKey(base);
            const savedOverrides = userOptionOverridesRef.current[optionKey] || {};
            if (Object.keys(savedOverrides).length > 0) {
              return { ...base, ...savedOverrides };
            }
            return base;
          });
          setOptions(restoredOptions);
          setPositions(state.positions || []);
          setSelectedExpirationDate(state.selectedExpirationDate || null);
          // ЗАЧЕМ: При перезагрузке страницы ползунок дней всегда стартует с «сегодня».
          // Реальная позиция «сегодня» вычислится автоматически в эффекте, как только подгрузятся опционы.
          setDaysPassed(0);
          setUserAdjustedDays(false);
          setUserAdjustedTargetPrice(false);
          setChartDisplayMode(state.chartDisplayMode || 'profit-loss-dollar');
          setStrikesByDate(state.strikesByDate || {});
          setExpirationDates(state.expirationDates || {});

          console.log('✅ [Universal] Состояние восстановлено:', {
            ticker: state.selectedTicker,
            optionsCount: restoredOptions.length,
            positionsCount: (state.positions || []).length,
            positions: state.positions
          });
        }
      } catch (error) {
        console.error('❌ [Universal] Ошибка загрузки состояния:', error);
      }
    } else {
      console.log('📡 [Universal] Ожидание данных от расширения...');
    }

    initCompletedAtRef.current = Date.now();
    setIsInitialized(true);
  }, [isInitialized, isFromExtension, contractCode, extensionTicker, extensionPrice, extensionExpirationDate, extensionOptions]);

  // === ОТСЛЕЖИВАНИЕ ИЗМЕНЕНИЯ ТИКЕРА ДЛЯ ОЧИСТКИ ПОЗИЦИЙ ===
  // ЗАЧЕМ: При переключении на другой инструмент очищаем позиции базового актива
  useEffect(() => {
    if (!isInitialized) return;

    const currentTicker = extensionTicker || contractCode || selectedTicker;

    console.log('🔍 [Universal] Проверка тикера:', {
      prevTicker: prevTickerRef.current,
      currentTicker,
      extensionTicker,
      contractCode,
      selectedTicker,
      positionsCount: positions.length
    });

    // Если тикер изменился и это не первая инициализация
    if (prevTickerRef.current && prevTickerRef.current !== currentTicker && currentTicker) {
      console.log('🔄 [Universal] Смена тикера с', prevTickerRef.current, 'на', currentTicker, '- мягкий сброс');

      // Мягкий сброс: очищаем старое состояние калькулятора, но НЕ трогаем данные расширения
      // ЗАЧЕМ: Расширение уже записало новые данные (новый тикер) в localStorage и URL.
      // Если вызвать полный resetCalculator — он удалит и новые данные, и при reload
      // калькулятор окажется пустым. Мягкий сброс лишь обнуляет React state и
      // перезапускает инициализацию, которая подхватит новые данные расширения.
      isResettingRef.current = true;
      setSelectedTicker('');
      setCurrentPrice(0);
      setPriceChange({ value: 0, percent: 0 });
      setOptions([]);
      setPositions([]);
      setSelectedExpirationDate(null);
      setDaysPassed(0);
      setUserAdjustedDays(false);
      setTargetPrice(0);
      setUserAdjustedTargetPrice(false);
      setIsDataCleared(false);
      setShowDemoData(false);
      setStrikesByDate({});
      setExpirationDates({});
      setIsLocked(false);
      setSavedConfigDate(null);
      setLivePrice(null);
      setOptionSelectionParams(null);
      setCalculatorMode(CALCULATOR_MODES.STOCKS);
      setSelectedFuture(null);
      setLoadedConfigId(null);
      setLoadedConfigStatus(null);
      setLoadedConfigName(null);
      setIsEditMode(false);
      setHasChanges(false);
      setDealInfo(null);
      setActiveCalculatorTab('calculator');
      // Очищаем ручные изменения опционов (от старого тикера)
      localStorage.removeItem('optioner_user_overrides');
      userOptionOverridesRef.current = {};
      // Очищаем сохранённый loadedConfigId (если был)
      localStorage.removeItem('universalCalc_loadedConfigId');
      localStorage.removeItem('universalCalc_loadedConfigStatus');
      // Очищаем pending refresh от расширения
      // ЗАЧЕМ: Расширение могло отправить sendPrIV_tocallc одновременно с добавлением опциона,
      // и без очистки IV попадёт в Fact IV вместо колонки IV
      markProcessed();
      // Обновляем prevTickerRef на новый тикер
      // ЗАЧЕМ: Предотвращаем повторный сброс при следующей инициализации
      prevTickerRef.current = currentTicker;
      // Сбрасываем isInitialized → init useEffect подхватит данные расширения
      setIsInitialized(false);
      return;
    }

    // Обновляем ref для следующей проверки
    if (currentTicker) {
      prevTickerRef.current = currentTicker;
      console.log('📝 [Universal] prevTickerRef обновлен на:', currentTicker);
    }
  }, [isInitialized, extensionTicker, contractCode, selectedTicker, positions.length, resetCalculator]);

  // === СИНХРОНИЗАЦИЯ С CHROME EXTENSION ===
  // ЗАЧЕМ: Автоматическое обновление при изменении данных расширением (storage event)
  // ВАЖНО: НЕ синхронизируем если загружена конфигурация из URL — данные конфигурации имеют приоритет
  useEffect(() => {
    if (!isInitialized) return;
    // ВАЖНО: Не синхронизируем если идёт сброс калькулятора
    // ЗАЧЕМ: Предотвращаем запись данных в state после очистки resetCalculator
    if (isResettingRef.current) return;

    console.log('🔔 [SYNC TRIGGERED]', {
      loadedConfigId,
      isLocked,
      extensionOptionsCount: extensionOptions?.length || 0,
      extensionLastUpdated,
      extensionOptions: extensionOptions?.map(o => ({ strike: o.strike, type: o.type, date: o.date }))
    });
    
    // Если загружена конфигурация — НЕ заменяем опционы данными расширения,
    // но ДОБАВЛЯЕМ новые опционы от расширения к существующим
    // ЗАЧЕМ: Позволяет добавлять опционы из TradingView к зафиксированной конфигурации
    // без потери существующих опционов
    if (loadedConfigId) {
      // Гейт: тикер расширения не совпадает с тикером загруженной сделки.
      // ЗАЧЕМ: Без этого опционы и цена из открытой TradingView-вкладки с ДРУГОЙ
      // акцией попадают в текущую сохранённую сделку при любой пересборке эффекта —
      // в частности, при нажатии «Зафиксировать» меняется isLocked → useEffect
      // перезапускается и затягивает чужие опционы в позицию.
      if (extensionTicker && selectedTicker &&
          extensionTicker.toUpperCase() !== selectedTicker.toUpperCase()) {
        console.log('⏭️ [Sync] Пропуск — тикер расширения не совпадает с сохранённой сделкой:', {
          extension: extensionTicker, loaded: selectedTicker
        });
        return;
      }

      if (extensionOptions && extensionOptions.length > 0) {
        setOptions(prevOptions => {
          // Применяем savedOverrides к существующим опционам
          // ЗАЧЕМ: Сохраняем actualPL, manualIvOverride и другие ручные изменения
          const updatedPrevOptions = prevOptions.map(prevOpt => {
            const optionKey = getOptionKey(prevOpt);
            const savedOverrides = userOptionOverridesRef.current[optionKey] || {};
            
            if (Object.keys(savedOverrides).length > 0) {
              console.log('🔄 [Config] Применяем savedOverrides к существующему опциону:', {
                optionKey,
                savedOverrides
              });
              return {
                ...prevOpt,
                ...savedOverrides
              };
            }
            return prevOpt;
          });
          
          // Находим опционы от расширения, которых ещё нет в калькуляторе
          // ЗАЧЕМ: Добавляем только НОВЫЕ опционы, не дублируя существующие
          const newOptions = extensionOptions.filter(extOpt => {
            return !updatedPrevOptions.some(existing => {
              const existingType = (existing.type || '').toUpperCase();
              const extType = (extOpt.type || '').toUpperCase();
              const typeMatch = existingType === extType;
              const strikeMatch = Math.abs(parseFloat(existing.strike) - parseFloat(extOpt.strike)) < 0.001;
              
              // Сравнение дат с допуском 48 часов (часовые пояса)
              let dateMatch = false;
              try {
                const t1 = new Date(existing.date).getTime();
                const t2 = new Date(extOpt.date).getTime();
                if (!isNaN(t1) && !isNaN(t2)) {
                  dateMatch = Math.abs(t1 - t2) / (1000 * 60 * 60) < 48;
                } else {
                  const s1 = (existing.date || '').toString().split('T')[0];
                  const s2 = (extOpt.date || '').toString().split('T')[0];
                  dateMatch = s1 === s2;
                }
              } catch (e) {
                dateMatch = false;
              }
              
              return typeMatch && strikeMatch && dateMatch;
            });
          });
          
          if (newOptions.length > 0) {
            // Добавляем entryDate и assetPriceAtEntry к новым опционам
            // Приоритет цены: explicit → safeExtensionPriceForEntry (health-check) → currentPrice → extensionPrice
            const enrichedNewOptions = newOptions.map(opt => ({
              ...opt,
              entryDate: new Date().toISOString().split('T')[0],
              assetPriceAtEntry: opt.assetPriceAtEntry || safeExtensionPriceForEntry || currentPrice || extensionPrice || 0
            }));
            console.log('➕ [Universal] Добавлено новых опционов к конфигурации:', enrichedNewOptions.length);
            return [...updatedPrevOptions, ...enrichedNewOptions];
          }
          
          return updatedPrevOptions; // Возвращаем обновлённые опционы с savedOverrides
        });
      }
      // Обновляем цену от расширения даже при загруженной конфигурации,
      // включая залоченные позиции — ползунок цены БА должен следовать за live-ценой из шапки.
      // P&L рассчитывается по assetPriceAtEntry, сохранённому per-leg, поэтому исторический якорь не теряется.
      if (extensionPrice > 0) {
        setCurrentPrice(extensionPrice);
      }
      return;
    }

    // Обновляем опционы при изменении от расширения с сохранением ручных изменений
    if (extensionOptions && extensionOptions.length > 0) {
      setOptions(prevOptions => {
        console.log('🔍 [Sync] Начало синхронизации с расширением:');
        console.log('  prevOptionsCount:', prevOptions.length);
        console.log('  extensionOptionsCount:', extensionOptions.length);
        console.log('  prevOptions:', prevOptions.map(o => ({
          strike: o.strike,
          type: o.type,
          quantity: o.quantity,
          entryDate: o.entryDate,
          customPremium: o.customPremium,
          isPremiumModified: o.isPremiumModified
        })));
        console.log('  extensionOptions:', extensionOptions.map(o => ({
          strike: o.strike,
          type: o.type,
          quantity: o.quantity,
          entryDate: o.entryDate
        })));
        
        // Проверяем, изменились ли опционы (по ключевым полям)
        // ЗАЧЕМ: Предотвращаем бесконечный цикл обновлений
        const prevHash = prevOptions.map(o => `${o.strike}-${o.type}-${o.date}`).sort().join(',');
        const extHash = extensionOptions.map(o => `${o.strike}-${o.type}-${o.date}`).sort().join(',');
        
        // Проверяем, есть ли сохраненные overrides для применения
        const hasOverrides = Object.keys(userOptionOverridesRef.current).length > 0;
        console.log('🔍 [Sync] Проверка overrides:', { 
          hasOverrides, 
          overridesKeys: Object.keys(userOptionOverridesRef.current),
          overridesData: userOptionOverridesRef.current
        });
        
        if (prevHash === extHash && prevOptions.length === extensionOptions.length && !hasOverrides) {
          // Опционы не изменились и нет overrides — возвращаем предыдущее состояние без изменений
          console.log('⏭️ [Sync] Опционы не изменились и нет overrides, пропускаем обновление');
          return prevOptions;
        }

        // Сливаем данные: берем свежие данные от расширения, но применяем сохраненные ручные изменения
        const mergedOptions = extensionOptions.map(extOption => {
          // Получаем сохраненные ручные изменения для этого опциона
          const optionKey = getOptionKey(extOption);
          const savedOverrides = userOptionOverridesRef.current[optionKey] || {};
          
          // Ищем соответствующий опцион в текущих данных с более гибким сравнением
          const existingOption = prevOptions.find(existing => {
            const existingType = existing.type || existing.optionType || '';
            const extType = extOption.type || extOption.optionType || '';
            const typeMatch = existingType.toUpperCase() === extType.toUpperCase();

            const strikeMatch = Math.abs(parseFloat(existing.strike) - parseFloat(extOption.strike)) < 0.001;

            // Сравнение дат с учетом возможных смещений часовых поясов (допуск 48 часов)
            let dateMatch = false;
            try {
              const t1 = new Date(existing.date).getTime();
              const t2 = new Date(extOption.date).getTime();

              if (!isNaN(t1) && !isNaN(t2)) {
                const diffHours = Math.abs(t1 - t2) / (1000 * 60 * 60);
                dateMatch = diffHours < 48;
              } else {
                const s1 = (existing.date || '').toString().split('T')[0];
                const s2 = (extOption.date || '').toString().split('T')[0];
                dateMatch = s1 === s2;
              }
            } catch (e) {
              dateMatch = false;
            }

            return typeMatch && strikeMatch && dateMatch;
          });

          // Применяем сохраненные ручные изменения (приоритет: savedOverrides > existingOption > extOption)
          // ЗАЧЕМ: savedOverrides хранятся в отдельном localStorage, который расширение не перезаписывает
          const quantity = savedOverrides.quantity ?? existingOption?.quantity ?? extOption.quantity;
          const customBid = savedOverrides.customBid ?? existingOption?.customBid;
          const customAsk = savedOverrides.customAsk ?? existingOption?.customAsk;
          const customPremium = savedOverrides.customPremium ?? existingOption?.customPremium;
          const entryDate = savedOverrides.entryDate ?? existingOption?.entryDate ?? extOption.entryDate;
          const actualPL = savedOverrides.actualPL ?? existingOption?.actualPL;
          const actualPLDate = savedOverrides.actualPLDate ?? existingOption?.actualPLDate;
          const actualPLPrice = savedOverrides.actualPLPrice ?? existingOption?.actualPLPrice;
          const actualPLQuantity = savedOverrides.actualPLQuantity ?? existingOption?.actualPLQuantity;
          const manualIvOverride = savedOverrides.manualIvOverride ?? existingOption?.manualIvOverride;

          console.log('🔍 [Merge Debug]:', {
            optionKey,
            strike: extOption.strike,
            type: extOption.type,
            hasSavedOverrides: Object.keys(savedOverrides).length > 0,
            savedOverrides,
            hasExistingOption: !!existingOption,
            existingActualPL: existingOption?.actualPL,
            existingManualIvOverride: existingOption?.manualIvOverride,
            resultActualPL: actualPL,
            resultActualPLDate: actualPLDate,
            resultActualPLPrice: actualPLPrice,
            resultActualPLQuantity: actualPLQuantity,
            resultManualIvOverride: manualIvOverride
          });
          
          if (Object.keys(savedOverrides).length > 0) {
            console.log('🔄 [Merge] Применяем сохраненные изменения:', {
              optionKey,
              savedOverrides,
              resultQuantity: quantity,
              resultEntryDate: entryDate,
              resultActualPL: actualPL,
              resultManualIvOverride: manualIvOverride
            });
          }

          // Если найден опцион с ручными изменениями - сохраняем их
          if (existingOption || Object.keys(savedOverrides).length > 0) {
            const merged = {
              ...extOption,
              // Применяем ручные изменения количества
              quantity: quantity,
              // Сохраняем ручные изменения Bid
              customBid: customBid,
              isBidModified: savedOverrides.isBidModified ?? existingOption?.isBidModified,
              // Сохраняем ручные изменения Ask
              customAsk: customAsk,
              isAskModified: savedOverrides.isAskModified ?? existingOption?.isAskModified,
              // Сохраняем ручные изменения премии
              customPremium: customPremium,
              isPremiumModified: savedOverrides.isPremiumModified ?? existingOption?.isPremiumModified,
              // Сохраняем якорные значения P&L
              actualPL: actualPL,
              actualPLDate: actualPLDate,
              actualPLPrice: actualPLPrice,
              actualPLQuantity: actualPLQuantity,
              // Сохраняем ручную коррекцию IV
              manualIvOverride: manualIvOverride,
              // Сохраняем флаги происхождения опциона (Super/Golden)
              isSuperOption: existingOption?.isSuperOption,
              isGoldenOption: existingOption?.isGoldenOption,
              // Сохраняем дополнительные параметры
              entryDate: entryDate,
              simulationTargetPrice: existingOption?.simulationTargetPrice,
              // Цена базового актива на момент входа
              assetPriceAtEntry: savedOverrides.assetPriceAtEntry ?? existingOption?.assetPriceAtEntry ?? (safeExtensionPriceForEntry || 0),
              isAssetPriceModified: savedOverrides.isAssetPriceModified ?? existingOption?.isAssetPriceModified,
            };
            console.log('🔄 [Merge] Опцион с ручными изменениями:', {
              strike: extOption.strike,
              type: extOption.type,
              extQuantity: extOption.quantity,
              savedOverridesQuantity: savedOverrides.quantity,
              existingQuantity: existingOption?.quantity,
              mergedQuantity: merged.quantity,
              mergedEntryDate: merged.entryDate
            });
            return merged;
          }

          return {
            ...extOption,
            // Для новых опционов от расширения добавляем entryDate
            entryDate: extOption.entryDate || new Date().toISOString().split('T')[0],
            // Цена базового актива на момент входа.
            // Приоритет: explicit → safeExtensionPriceForEntry (health-check) → currentPrice → extensionPrice
            assetPriceAtEntry: extOption.assetPriceAtEntry || safeExtensionPriceForEntry || currentPrice || extensionPrice || 0,
          };
        });

        // ВАЖНО: Добавляем опционы из prevOptions, которых нет в extensionOptions
        // ЗАЧЕМ: Сохраняем вручную добавленные опционы и их изменения
        const manualOptions = prevOptions.filter(prevOpt => {
          return !extensionOptions.some(extOpt => {
            const typeMatch = (prevOpt.type || '').toUpperCase() === (extOpt.type || '').toUpperCase();
            const strikeMatch = Math.abs(parseFloat(prevOpt.strike) - parseFloat(extOpt.strike)) < 0.001;
            
            let dateMatch = false;
            try {
              const t1 = new Date(prevOpt.date).getTime();
              const t2 = new Date(extOpt.date).getTime();
              if (!isNaN(t1) && !isNaN(t2)) {
                dateMatch = Math.abs(t1 - t2) / (1000 * 60 * 60) < 48;
              } else {
                const s1 = (prevOpt.date || '').toString().split('T')[0];
                const s2 = (extOpt.date || '').toString().split('T')[0];
                dateMatch = s1 === s2;
              }
            } catch (e) {
              dateMatch = false;
            }
            
            return typeMatch && strikeMatch && dateMatch;
          });
        });

        const finalOptions = [...mergedOptions, ...manualOptions];
        console.log('📡 [Universal] Опционы обновлены от расширения:', {
          fromExtension: mergedOptions.length,
          manual: manualOptions.length,
          total: finalOptions.length
        });
        return finalOptions;
      });
    }

    // Обновляем цену из шапки.
    // ЗАЧЕМ: targetPrice (ползунок) подхватывается отдельным эффектом sync-by-userAdjustedTargetPrice,
    // здесь достаточно держать актуальное значение currentPrice.
    if (extensionPrice > 0) {
      setCurrentPrice(extensionPrice);
    }

    // Обновляем тикер
    if (extensionTicker && extensionTicker !== selectedTicker) {
      setSelectedTicker(extensionTicker);
    }

    // ИСПРАВЛЕНИЕ: Обновляем дату экспирации при КАЖДОМ изменении от расширения
    // ЗАЧЕМ: Предотвращаем использование закэшированной даты при добавлении новых опционов
    if (extensionExpirationDate) {
      if (extensionExpirationDate !== selectedExpirationDate) {
        console.log('📡 [Universal] Обновление даты экспирации:', {
          old: selectedExpirationDate,
          new: extensionExpirationDate
        });
        setSelectedExpirationDate(extensionExpirationDate);
      }
    }
  }, [isInitialized, extensionLastUpdated, loadedConfigId, isLocked]); // Зависимость от extensionLastUpdated для реакции на storage event

  // === АВТОСОХРАНЕНИЕ СОСТОЯНИЯ ПРИ ИЗМЕНЕНИИ ОПЦИОНОВ И ПОЗИЦИЙ ===
  // ЗАЧЕМ: При удалении/добавлении опционов или позиций сохраняем актуальное состояние в localStorage
  // Это гарантирует, что после перезагрузки страницы восстановится правильный набор опционов и позиций
  // ВАЖНО: НЕ сохраняем если загружена конфигурация из URL — это предотвращает конфликты между вкладками
  useEffect(() => {
    if (!isInitialized) return;
    // ВАЖНО: Не сохраняем если идёт сброс калькулятора
    // ЗАЧЕМ: resetCalculator очищает localStorage, но эффекты текущего рендер-цикла
    // ещё видят старый isInitialized=true и перезаписали бы данные обратно → бесконечный цикл
    if (isResettingRef.current) return;
    // НЕ сохраняем в calculatorState если загружена конфигурация
    // ЗАЧЕМ: Предотвращает перезапись данных другой вкладки при открытии сохранённой конфигурации
    if (loadedConfigId) {
      console.log('⏭️ [Universal] Пропускаем автосохранение в calculatorState — загружена конфигурация');
      return;
    }
    // Сохраняем только если есть тикер (калькулятор активен)
    if (selectedTicker) {
      saveCalculatorState();
    }
  }, [isInitialized, options, positions, selectedTicker, saveCalculatorState, loadedConfigId]);

  // УБРАНО: AI модель не используется в универсальном калькуляторе
  // useEffect для автоматического запроса AI прогнозов удалён

  // Автоматически выставляем daysPassed на «сегодня» при изменении опционов и базовой даты.
  // ЛОГИКА: Если пользователь не трогал ползунок — держим его на «сегодня» (для нового калькулятора это 0,
  // для сохранённой позиции — разница между сегодня и датой входа/сохранения). Если пользователь уже
  // двигал ползунок — оставляем его выбор; корректируем только если новый maxDays стал меньше.
  // ВАЖНО: Правило применяется ко всем режимам, включая залоченный просмотр сохранённой позиции.
  useEffect(() => {
    if (options.length === 0) return;

    // Самая старая дата входа среди опционов — основа для расчётов.
    // ЗАЧЕМ: parseDateAtStartOfDay даёт LOCAL midnight нормализованной по UTC даты;
    // важно использовать ту же функцию, что и кнопка «С» в PriceAndTimeSettings,
    // чтобы расчёт «сегодня» совпадал и не отъезжал на день из-за timezone.
    let oldestEntryDate = null;
    options.forEach(opt => {
      const entryDate = parseDateAtStartOfDay(opt.entryDate || new Date().toISOString().split('T')[0]);
      if (entryDate && (!oldestEntryDate || entryDate < oldestEntryDate)) {
        oldestEntryDate = entryDate;
      }
    });

    // Базовая дата: дата сохранения (для зафиксированных) или самая старая дата входа.
    let baseDate = null;
    if (savedConfigDate) {
      baseDate = parseDateAtStartOfDay(savedConfigDate);
    }
    if (!baseDate) baseDate = oldestEntryDate || new Date();
    baseDate.setHours(0, 0, 0, 0);

    const maxDays = options.reduce((max, opt) => {
      if (!opt.date) return max;
      const expirationDate = parseDateAtStartOfDay(opt.date);
      if (!expirationDate) return max;
      const diffTime = expirationDate.getTime() - baseDate.getTime();
      const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(max, daysUntil);
    }, 0);

    if (userAdjustedDays) {
      // Пользователь сам установил ползунок — оставляем его выбор, но не выше нового максимума.
      if (daysPassed > maxDays) {
        setDaysPassed(maxDays);
      }
    } else {
      // Пользователь ещё не двигал ползунок — держим «сегодня».
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffToToday = Math.floor((today.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
      const todayDays = Math.max(0, Math.min(diffToToday, maxDays));
      if (todayDays !== daysPassed) {
        setDaysPassed(todayDays);
      }
    }
    // daysPassed намеренно вне зависимостей — иначе ручная установка тут же откатывалась бы.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.length, options.map(o => o.date).join(','), options.map(o => o.entryDate).join(','), savedConfigDate, userAdjustedDays]);

  const displayOptions = useMemo(() => {
    const result = showDemoData ? demoOptions : options;
    return result;
  }, [showDemoData, options]);

  // Шаг 2: Определяем, нужно ли показывать метки дат на флажках
  // Показываем метки, если используется более одной уникальной даты
  const forceShowDateBadges = useMemo(() => {
    // Фильтруем только опционы с датой (displayOptions уже содержит только видимые)
    const optionsWithDate = displayOptions.filter(opt => opt.date && opt.visible !== false);

    // DEBUG: Закомментировано для production
    // console.log('🏷️ forceShowDateBadges check:', {
    //   totalDisplayOptions: displayOptions.length,
    //   optionsWithDate: optionsWithDate.length,
    //   dates: optionsWithDate.map(opt => opt.date),
    // });

    if (optionsWithDate.length <= 1) {
      // console.log('🏷️ Result: false (only 1 or 0 options)');
      return false;
    }

    const uniqueDates = new Set(optionsWithDate.map(opt => opt.date));
    const shouldShow = uniqueDates.size > 1;

    // console.log('🏷️ Result:', {
    //   uniqueDates: Array.from(uniqueDates),
    //   shouldShow
    // });

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

    // DEBUG: Закомментировано для production
    // console.log('🎨 dateColorMap:', map);
    return map;
  }, [displayOptions]);

  const togglePositionVisibility = useCallback((id) => {
    setPositions(prevPositions => prevPositions.map((pos) => (pos.id === id ? { ...pos, visible: !pos.visible } : pos)));
  }, []);

  const deletePosition = useCallback((id) => {
    setPositions(prevPositions => prevPositions.filter((pos) => pos.id !== id));
  }, []);

  const addPosition = useCallback((type, quantity = 100, price = 242.14) => {
    const newPosition = {
      id: Date.now().toString(),
      type,
      quantity,
      ticker: selectedTicker || "AAPL",
      price,
      visible: true,
    };
    console.log('➕ [Universal] Добавление позиции:', newPosition);
    setPositions(prevPositions => {
      const updated = [...prevPositions, newPosition];
      console.log('➕ [Universal] Новый массив позиций:', updated);
      return updated;
    });
  }, [selectedTicker]);

  const toggleOptionVisibility = useCallback((id) => {
    setOptions(prevOptions => prevOptions.map((opt) => (opt.id === id ? { ...opt, visible: !opt.visible } : opt)));
  }, []);

  const deleteOption = useCallback((id) => {
    setOptions(prevOptions => {
      const updated = prevOptions.filter((opt) => opt.id !== id);
      // Очищаем название стратегии при удалении опциона
      setSelectedStrategyName('');

      // Сигнал крипто-расширению (binance_parser): убери этот опцион из bnb_positions.
      // ЗАЧЕМ: автосохранение в calculatorState пропускается при loadedConfigId,
      // поэтому расширение не узнаёт об удалении в режиме редактирования сохранённой сделки.
      // Пишем минимальный снапшот options текущего тикера прямо в localStorage —
      // optioner.js content-script перехватит setItem и пробросит в background,
      // где обработчик calculatorStateUpdated диффит и удаляет из bnb_positions.
      try {
        if (selectedTicker) {
          const raw = localStorage.getItem('calculatorState');
          const cs = raw ? JSON.parse(raw) : {};
          // Защита от чужой вкладки: пишем только если в storage наш тикер или пусто.
          if (!cs.selectedTicker || cs.selectedTicker === selectedTicker) {
            cs.selectedTicker = selectedTicker;
            cs.options = updated.map(o => ({ type: o.type, strike: o.strike, date: o.date }));
            localStorage.setItem('calculatorState', JSON.stringify(cs));
          }
        }
      } catch (e) {
        // Не падаем на ошибках JSON/storage — основное удаление в React state уже произошло.
      }

      return updated;
    });
  }, [selectedTicker]);

  const updateOption = useCallback((id, field, value) => {
    console.log('🔄 [Universal] updateOption вызван:', { id, field, value });
    setOptions(prevOptions => {
      // Находим опцион для сохранения override
      const targetOption = prevOptions.find(opt => opt.id === id);

      // ВАЖНО: Сохраняем ручные изменения в отдельное хранилище
      // ЗАЧЕМ: Расширение перезаписывает localStorage.calculatorState, теряя изменения
      // Поля, которые нужно сохранять: quantity, customPremium, customBid, customAsk, entryDate, actualPL, actualPLDate, actualPLPrice, actualPLQuantity, manualIvOverride, manualIvOverrideDate
      const fieldsToOverride = ['quantity', 'customPremium', 'customBid', 'customAsk', 'entryDate', 'isPremiumModified', 'isBidModified', 'isAskModified', 'actualPL', 'actualPLDate', 'actualPLPrice', 'actualPLQuantity', 'manualIvOverride', 'manualIvOverrideDate', 'assetPriceAtEntry', 'isAssetPriceModified'];
      if (targetOption && fieldsToOverride.includes(field)) {
        saveUserOverride(targetOption, field, value);
      }
      
      const updated = prevOptions.map((opt) => {
        if (opt.id === id) {
          const updatedOpt = { ...opt, [field]: value };
          console.log('📝 [Universal] Опцион обновлен:', {
            id,
            field,
            value,
            isAskModified: updatedOpt.isAskModified,
            customAsk: updatedOpt.customAsk,
            isBidModified: updatedOpt.isBidModified,
            customBid: updatedOpt.customBid
          });
          return updatedOpt;
        }
        return opt;
      });
      console.log('✅ [Universal] Опционы обновлены, всего:', updated.length);
      
      // ВАЖНО: Сохраняем обновленные опционы в localStorage
      // ЗАЧЕМ: При добавлении нового опциона через расширение, оно обновит localStorage,
      // но если мы предварительно сохранили ручные изменения, они будут учтены при слиянии
      try {
        const storageState = JSON.parse(localStorage.getItem('calculatorState') || '{}');
        storageState.options = updated;
        localStorage.setItem('calculatorState', JSON.stringify(storageState));
        console.log('💾 [Universal] Опционы сохранены в localStorage');
      } catch (error) {
        console.error('❌ [Universal] Ошибка сохранения в localStorage:', error);
      }
      
      return updated;
    });
  }, [saveUserOverride]);

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
      // Цена базового актива на момент добавления опциона
      // ЗАЧЕМ: Используется в расчётах P&L и целевой цены в Плане выхода
      assetPriceAtEntry: currentPrice || 0,
    };
    console.log('✅ New option created:', newOption);
    setOptions(prevOptions => [...prevOptions, newOption]);

    // ОТКЛЮЧЕНО: В универсальном калькуляторе данные приходят от расширения
    // Не загружаем страйки и детали опционов с внешних API
  }, [selectedExpirationDate, calculateAutoStrike, selectedTicker, currentPrice]);

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

  // === Стратегия СЕВЕР: state и обработчики ===
  // ЗАЧЕМ: Подбор пары Buy Call + Buy Put для лонг-позиции. Кэшируем параметры
  // и результаты, чтобы возврат к выбору не запускал анализ заново.
  const [northDialogOpen, setNorthDialogOpen] = useState(false);
  const [northDialogStep, setNorthDialogStep] = useState('params');
  const [northState, setNorthState] = useState(null); // { params, combinations, weights }

  // Точка входа в БА — средневзвешенная по лонг-позициям
  const longPositionsEntry = useMemo(() => {
    const longs = (positions || []).filter(p => p.type === 'LONG' && p.visible !== false && Number(p.quantity) > 0);
    if (longs.length === 0) return null;
    const totalQty = longs.reduce((s, p) => s + Number(p.quantity), 0);
    const totalNotional = longs.reduce((s, p) => s + Number(p.price) * Number(p.quantity), 0);
    return totalQty > 0 ? { price: totalNotional / totalQty, quantity: totalQty } : null;
  }, [positions]);

  const northActive = useMemo(() => options.some(o => o.fromNorthStrategy), [options]);

  // Режим СЕВЕР определяется наличием позиции в БА:
  //   есть лонг   → WITH_STOCK   (кнопка «СЕВЕР актив + опционы»)
  //   нет лонга   → OPTIONS_ONLY (кнопка «СЕВЕР только опционы»)
  const northMode = useMemo(
    () => (longPositionsEntry ? 'WITH_STOCK' : 'OPTIONS_ONLY'),
    [longPositionsEntry],
  );

  // Кнопка СЕВЕР: режим Акции/ETF, нет ни одного видимого опциона, цена БА известна.
  // Условие на позицию убрано: теперь без позиции включается режим OPTIONS_ONLY.
  const canShowNorthButton = useMemo(() => (
    (calculatorMode === CALCULATOR_MODES.STOCKS || calculatorMode === CALCULATOR_MODES.ETF) &&
    options.filter(o => o.visible !== false).length === 0 &&
    Number(currentPrice) > 0
  ), [calculatorMode, options, currentPrice]);

  // Список экспираций и сама цепочка опционов теперь запрашиваются внутри
  // NorthStrategyDialog напрямую у расширения (refresh_range), чтобы данные
  // были свежими и не зависели от того, что калькулятор успел восстановить
  // из localStorage. См. NorthStrategyDialog.jsx.

  const handleOpenNorthStrategy = useCallback(() => {
    setNorthDialogStep('params');
    setNorthDialogOpen(true);
  }, []);

  const handleReopenNorthResults = useCallback(() => {
    if (!northState || !northState.combinations || northState.combinations.length === 0) {
      setNorthDialogStep('params');
    } else {
      setNorthDialogStep('results');
    }
    setNorthDialogOpen(true);
  }, [northState]);

  const handleNorthStateChange = useCallback((next) => {
    setNorthState(next);
  }, []);

  const handleApplyNorthCombination = useCallback(({ combination, params, combinations, weights }) => {
    if (!combination || !Array.isArray(combination.positions)) return;
    const stamped = combination.positions.map(opt => ({
      ...opt,
      id: `north-${opt.type}-${opt.strike}-${opt.date}-${opt.quantity}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fromNorthStrategy: true,
    }));
    setOptions(prev => [...prev.filter(o => !o.fromNorthStrategy), ...stamped]);
    setNorthState({ params, combinations, weights });
    setNorthDialogOpen(false);

    // Двигаем ползунок «дней до экспирации» на дату расчёта из параметров стратегии.
    // ЗАЧЕМ: пользователь подбирал комбинации именно под этот день — в калькуляторе
    // он должен сразу увидеть P&L на ту же дату, без ручной подстройки бегунка.
    if (params?.calcDate) {
      const calcDateParsed = parseDateAtStartOfDay(params.calcDate);
      let baseDate = null;
      stamped.forEach(opt => {
        const ed = parseDateAtStartOfDay(opt.entryDate || new Date().toISOString().split('T')[0]);
        if (ed && (!baseDate || ed < baseDate)) baseDate = ed;
      });
      if (calcDateParsed && baseDate) {
        const diff = Math.round((calcDateParsed.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
        const clamped = Math.max(0, diff);
        setDaysPassed(clamped);
        setUserAdjustedDays(true);
      }
    }
  }, []);

  const handleCancelNorthSelection = useCallback(() => {
    setOptions(prev => prev.filter(o => !o.fromNorthStrategy));
  }, []);

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
    // DEBUG: Закомментировано для production
    // console.log('📅 availableDates (ISO):', dates);
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

  // State для диалога сохранения в БД (единственный режим сохранения позиции)
  // ЗАЧЕМ: Старые localStorage-диалоги «Сохранить» и «Зафиксировать» убраны —
  // вся логика теперь идёт через одну кнопку «💾 Сохранить в БД» с выбором статуса
  // («В ожидании» / «Зафиксирована») внутри диалога.
  const [saveToDBDialogOpen, setSaveToDBDialogOpen] = useState(false);

  // Метаданные загруженной из БД конфигурации для отображения в шапке калькулятора
  // ЗАЧЕМ: Лейбл статуса (жёлтый / голубой) рисуется рядом с названием позиции.
  // Статус зеркалится в localStorage.universalCalc_loadedConfigStatus, чтобы расширение
  // TradingView могло отличить pending-позицию (нужен авто-рефреш котировок) от standard.
  const [loadedConfigStatus, setLoadedConfigStatusRaw] = useState(() => {
    const v = localStorage.getItem('universalCalc_loadedConfigStatus');
    return v === 'pending' || v === 'standard' ? v : null;
  });
  const setLoadedConfigStatus = useCallback((value) => {
    setLoadedConfigStatusRaw(value);
    if (value === 'pending' || value === 'standard') {
      localStorage.setItem('universalCalc_loadedConfigStatus', value);
    } else {
      localStorage.removeItem('universalCalc_loadedConfigStatus');
    }
  }, []);
  const [loadedConfigName, setLoadedConfigName] = useState(null);

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
  // ЗАЩИТА: Не сбрасываем loadedConfigId если расширение изменило URL (добавило ?contract=)
  // ЗАЧЕМ: Расширение TradingView при добавлении опциона обновляет URL вкладки,
  // заменяя ?config=XXX на ?contract=YYY — это не должно сбрасывать загруженную конфигурацию
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const configId = searchParams.get('config');
    const dbConfigId = searchParams.get('dbConfig');
    const editMode = searchParams.get('edit') === 'true';
    const hasContract = searchParams.has('contract');

    if (dbConfigId) {
      // ЗАЩИТА: Не загружаем конфигурацию повторно, если она уже загружена
      // ЗАЧЕМ: Избегаем дублирования запросов к БД и перезаписи состояния
      if (loadedConfigId === dbConfigId && configSource === 'db') {
        console.log('🛡️ [Universal] Конфигурация из БД уже загружена:', dbConfigId);
        return;
      }

      // ВАЖНО: Очищаем старые опционы и calculatorState ДО асинхронной загрузки
      // ЗАЧЕМ: Без этого старый опцион из localStorage мелькает на экране (~1 сек)
      // пока идёт загрузка конфигурации из БД
      setOptions([]);
      localStorage.removeItem('calculatorState');

      // Загрузка конфигурации из БД
      console.log('📥 [Universal] Загрузка конфигурации из БД:', dbConfigId);
      loadConfigurationFromDB(dbConfigId, editMode);
      setLoadedConfigId(dbConfigId);
      setIsEditMode(editMode);
      setHasChanges(false);
    } else if (configId) {
      // ЗАЩИТА: Не загружаем конфигурацию повторно, если она уже загружена
      if (loadedConfigId === configId && configSource === 'localStorage') {
        console.log('🛡️ [Universal] Конфигурация из localStorage уже загружена:', configId);
        return;
      }
      
      // ВАЖНО: Очищаем старые опционы ДО загрузки конфигурации
      // ЗАЧЕМ: Предотвращаем мелькание старого опциона из calculatorState
      setOptions([]);

      // Загрузка конфигурации из localStorage
      console.log('📥 [Universal] Загрузка конфигурации из localStorage:', configId);
      loadConfiguration(configId, editMode);
      setLoadedConfigId(configId);
      setIsEditMode(editMode);
      setHasChanges(false);
    } else {
      // Проверяем localStorage — при полной перезагрузке расширением
      // loadedConfigId в React state может быть устаревшим (батчинг setState),
      // но в localStorage он уже сохранён синхронно
      const sessionConfigId = localStorage.getItem('universalCalc_loadedConfigId');
      const hasActiveConfig = loadedConfigId || sessionConfigId;
      
      if (!hasActiveConfig || !hasContract) {
        // Сбрасываем ТОЛЬКО если:
        // 1. Конфигурация НЕ загружена (ни в state, ни в localStorage)
        // 2. ИЛИ URL изменился НЕ из-за расширения (нет ?contract= в URL)
        setLoadedConfigId(null);
        setLoadedConfigStatus(null);
        setLoadedConfigName(null);
        setIsEditMode(false);
        setHasChanges(false);
      } else {
        console.log('🛡️ [Universal] Защита: loadedConfigId сохранён при изменении URL расширением:', hasActiveConfig);
      }
    }
  }, [location.search, loadedConfigId, configSource]);

  // Функция загрузки конфигурации
  // ЗАЧЕМ: Восстанавливает сохранённое состояние калькулятора
  // ВАЖНО: Если config.isLocked=true — НЕ загружаем новые данные с API
  // ВАЖНО: Если editMode=true — сбрасываем флаги блокировки для редактирования
  const loadConfiguration = async (configId, editMode = false) => {
    console.log('🔔 [LOAD CONFIG CALLED]', { configId, editMode, stack: new Error().stack?.split('\n')[2]?.trim() });
    // localStorage-позиции не имеют системы статусов — гарантируем, что бейдж
    // от предыдущей БД-позиции исчезнет, если пользователь открыл localStorage-позицию.
    setLoadedConfigStatus(null);
    setLoadedConfigName(null);
    // ЗАЧЕМ: Каждое открытие конфигурации сбрасывает «ручные» флаги ползунков, чтобы цена БА
    // снова выставлялась на текущую цену из шапки, а ползунок дней — на «сегодня».
    setUserAdjustedTargetPrice(false);
    setUserAdjustedDays(false);
    const saved = localStorage.getItem('universalCalculatorConfigurations');
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

          // Сохранённое значение config.state.daysPassed намеренно игнорируется:
          // правило — при любом открытии конфигурации ползунок дней встаёт на «сегодня».
          // ВАЖНО: парсим даты через parseDateAtStartOfDay — те же правила, что в кнопке «С»
          // в PriceAndTimeSettings, иначе из-за timezone у даты сохранённой UTC-меткой расчёт
          // отъезжает на день и ползунок встаёт на «вчера».
          const configEntryDate = config.entryDate || config.createdAt || (config.id ? new Date(parseInt(config.id)).toISOString() : null);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          let baseDate = null;
          if (configIsLocked && configEntryDate) {
            setSavedConfigDate(configEntryDate);
            baseDate = parseDateAtStartOfDay(configEntryDate);
          } else {
            setSavedConfigDate(null);
            // Для pending / edit-режима: базовая дата — самая старая entryDate среди сохранённых опционов.
            const savedOpts = config.state.options || [];
            savedOpts.forEach(opt => {
              const ed = parseDateAtStartOfDay(opt.entryDate || new Date().toISOString().split('T')[0]);
              if (ed && (!baseDate || ed < baseDate)) {
                baseDate = ed;
              }
            });
          }
          if (!baseDate) baseDate = today;
          baseDate.setHours(0, 0, 0, 0);

          const calculatedDaysPassed = Math.max(
            0,
            Math.floor((today.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24))
          );

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
          
          // Сохраняем исходный список опционов из конфигурации
          // ЗАЧЕМ: Отличить "новый опцион от расширения" от "старого сохраненного опциона"
          const originalOptionKeys = new Set(optionsToSet.map(opt => getOptionKey(opt)));

          // Дата для fallback entryDate (дата создания конфигурации в формате YYYY-MM-DD)
          // ЗАЧЕМ: Для старых конфигураций без entryDate используем дату создания
          const fallbackEntryDate = configEntryDate
            ? new Date(configEntryDate).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];

          if (configIsLocked && configEntryDate) {
            const savedDate = new Date(configEntryDate);
            savedDate.setHours(0, 0, 0, 0);
            const todayDateLocked = new Date().toISOString().split('T')[0];
            
            optionsToSet = optionsToSet.map(opt => {
              // Определяем entryDate для опциона
              let optionEntryDate = opt.entryDate;
              
              // Если у опциона нет entryDate — проверяем, новый ли это опцион
              if (!optionEntryDate) {
                const optionKey = getOptionKey(opt);
                const isNewOption = !originalOptionKeys.has(optionKey);
                
                if (isNewOption) {
                  // Новый опцион — ставим сегодняшнюю дату
                  optionEntryDate = todayDateLocked;
                  console.log('📅 [LoadConfig-Locked] Новый опцион, ставим сегодняшнюю дату:', { optionKey, date: todayDateLocked });
                } else {
                  // Старый опцион без даты — используем fallback
                  optionEntryDate = fallbackEntryDate;
                }
              }
              
              // Вычисляем дни от даты сохранения до экспирации (всегда пересчитываем)
              // ЗАЧЕМ: Старые конфигурации могли хранить неправильное значение (от new Date вместо от entryDate)
              if (opt.date) {
                const [year, month, day] = opt.date.split('-').map(Number);
                const expDateUTC = Date.UTC(year, month - 1, day);
                const savedDateUTC = Date.UTC(savedDate.getFullYear(), savedDate.getMonth(), savedDate.getDate());
                const initialDaysToExpiration = Math.ceil((expDateUTC - savedDateUTC) / (1000 * 60 * 60 * 24));
                return {
                  ...opt,
                  initialDaysToExpiration,
                  isLockedPosition: true,
                  entryDate: optionEntryDate
                };
              }
              return {
                ...opt,
                isLockedPosition: true,
                entryDate: optionEntryDate
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
            optionsToSet = optionsToSet.map(opt => {
              const originalEntryDate = opt.entryDate;
              const finalEntryDate = opt.entryDate || fallbackEntryDate;
              if (!originalEntryDate) {
                console.log('⚠️ [LoadConfig] Опцион без entryDate, используем fallback:', { 
                  optionKey: getOptionKey(opt), 
                  fallbackEntryDate 
                });
              }
              return {
                ...opt,
                entryDate: finalEntryDate
              };
            });
          }
          // Применяем savedOverrides из userOptionOverridesRef к загруженным опционам
          // ЗАЧЕМ: При повторном вызове loadConfiguration (перезагрузка расширением)
          // ручные изменения (actualPL, manualIvOverride, customAsk и др.) терялись
          const todayDate = new Date().toISOString().split('T')[0];
          optionsToSet = optionsToSet.map(opt => {
            const optionKey = getOptionKey(opt);
            const savedOverrides = userOptionOverridesRef.current[optionKey] || {};
            
            // Исключаем entryDate из savedOverrides
            // ЗАЧЕМ: entryDate не должен перезаписываться из savedOverrides, только из конфигурации
            const { entryDate: _, ...overridesWithoutEntryDate } = savedOverrides;
            const hasSavedOverrides = Object.keys(overridesWithoutEntryDate).length > 0;
            
            if (hasSavedOverrides) {
              console.log('🔄 [LoadConfig] Применяем savedOverrides:', { optionKey, savedOverrides: overridesWithoutEntryDate });
              return { ...opt, ...overridesWithoutEntryDate };
            }
            
            // Проверяем, был ли этот опцион в исходной конфигурации
            // ЗАЧЕМ: Отличить "новый опцион от расширения" от "старого сохраненного опциона"
            // Новый опцион = его нет в originalOptionKeys, старый = есть в originalOptionKeys
            const isNewOptionFromExtension = !originalOptionKeys.has(optionKey);
            
            if (isNewOptionFromExtension && opt.entryDate === fallbackEntryDate) {
              console.log('📅 [LoadConfig] Новый опцион от расширения, ставим сегодняшнюю дату:', { optionKey, old: opt.entryDate, new: todayDate });
              return { ...opt, entryDate: todayDate };
            }
            
            return opt;
          });
          
          setOptions(optionsToSet);
          // В режиме редактирования снимаем блокировку с позиций базового актива,
          // чтобы пользователь мог менять количество акций и цену покупки.
          let positionsToSet = config.state.positions || [];
          if (editMode) {
            positionsToSet = positionsToSet.map(pos => {
              const { isLockedPosition, ...rest } = pos;
              return rest;
            });
          }
          setPositions(positionsToSet);
          setSelectedExpirationDate(config.state.selectedExpirationDate || '');

          // Устанавливаем daysPassed (вычисленный выше)
          setDaysPassed(calculatedDaysPassed);
          // Для сохраненной сделки ползунок должен быть в крайнем правом положении
          // ЗАЧЕМ: При открытии сохраненной конфигурации useEffect установит daysPassed на максимум
          setUserAdjustedDays(false);

          setShowOptionLines(config.state.showOptionLines !== undefined ? config.state.showOptionLines : true);
          setShowProbabilityZones(config.state.showProbabilityZones !== undefined ? config.state.showProbabilityZones : true);
          setChartDisplayMode(config.state.chartDisplayMode || 'profit-loss-dollar');

          // Восстанавливаем режим калькулятора (акции/фьючерсы)
          // ЗАЧЕМ: Предотвращает неправильное определение типа актива при загрузке конфигурации
          // ВАЖНО: Если calculatorMode не сохранён — определяем по тикеру
          let restoredMode = CALCULATOR_MODES.STOCKS;
          if (config.state.calculatorMode) {
            restoredMode = config.state.calculatorMode;
            setCalculatorMode(restoredMode);
            console.log('📊 Режим калькулятора восстановлен из конфигурации:', restoredMode);
          } else if (ticker) {
            // Fallback: определяем режим по тикеру для старых конфигураций
            const detectedType = detectInstrumentTypeByPattern(ticker);
            if (detectedType === 'futures') {
              restoredMode = CALCULATOR_MODES.FUTURES;
            } else if (detectedType === 'crypto') {
              restoredMode = CALCULATOR_MODES.CRYPTO;
            } else if (detectedType === 'etf') {
              restoredMode = CALCULATOR_MODES.ETF;
            } else {
              restoredMode = CALCULATOR_MODES.STOCKS;
            }
            setCalculatorMode(restoredMode);
            console.log('📊 Режим калькулятора определён по тикеру:', detectedType);
          }

          // Загружаем настройки фьючерса (pointValue) если режим фьючерсов
          // ЗАЧЕМ: Для корректного расчёта P&L фьючерсов нужен pointValue
          if (restoredMode === CALCULATOR_MODES.FUTURES && ticker) {
            const futureInfo = getFutureByTicker(ticker);
            setSelectedFuture(futureInfo);
            if (futureInfo) {
              console.log('📊 Настройки фьючерса загружены:', futureInfo);
            } else {
              console.warn('⚠️ Настройки фьючерса не найдены для:', ticker);
            }
          } else {
            setSelectedFuture(null);
          }

          // Если в конфигурации есть информация о сделке — восстанавливаем её
          // ЗАЧЕМ: При открытии сохраненной сделки восстанавливаем dealInfo в калькуляторе.
          // ВАЖНО: Ползунки цены БА и дней до экспирации больше не подменяются на сохранённые
          // значения — правило «открытие = текущая цена + сегодня» одинаково для всех режимов.
          if (config.dealInfo && config.dealInfo.ticker) {
            setDealInfo(config.dealInfo);
            // Активируем таб "Сделка" при загрузке конфигурации с dealInfo
            setActiveCalculatorTab('deal');
          } else {
            // Если в конфигурации НЕТ информации о сделке — сбрасываем dealInfo
            // ЗАЧЕМ: Старые сохранения без сделки должны открываться без сделки
            setDealInfo(null);
            setActiveCalculatorTab('calculator');
          }

          // Если в конфигурации есть настройки таба Сделка — восстанавливаем их
          // ЗАЧЕМ: При открытии сохраненной сделки восстанавливаем все настройки таба (план выхода и т.п.).
          // targetPrice (ползунок цены БА) при этом НЕ переопределяется — он подтягивается к live currentPrice
          // через общий эффект синхронизации, согласно правилу «открытие = текущая цена».
          if (config.dealSettings) {
            setDealSettings(config.dealSettings);
          } else {
            // ЗАЧЕМ: Если у новой позиции нет dealSettings — явно зануляем,
            // иначе старые настройки (и план выхода) «переедут» в новую позицию
            setDealSettings(null);
          }

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

  // Нормализация dealSettings для сравнения
  // ЗАЧЕМ: Сравнивать только user-editable поля, игнорируя derived (exitPlan) и авто-сохраняемые (slicesSent/frozenExitPlan)
  const normalizeDealSettingsForCompare = (ds) => {
    if (!ds) return null;
    return JSON.stringify({
      targetAssetPricePercent: ds.targetAssetPricePercent ?? null,
      targetAssetPricePercentPut: ds.targetAssetPricePercentPut ?? null,
      targetAssetPricePercentPutExit: ds.targetAssetPricePercentPutExit ?? null,
      exitStepsCount: ds.exitStepsCount ?? null,
      tradingViewUrl: ds.tradingViewUrl ?? null,
      tradingViewUrlPut: ds.tradingViewUrlPut ?? null,
      exitPlanSteps: ds.exitPlanSteps ?? null,
    });
  };

  // Функция проверки наличия изменений в конфигурации из БД
  // ЗАЧЕМ: Определить, изменилась ли позиция после открытия из БД
  const checkDBConfigChanges = () => {
    if (!originalDBConfig || configSource !== 'db') {
      return false;
    }

    const currentState = {
      selectedTicker,
      currentPrice,
      priceChange,
      options: JSON.stringify(options),
      positions: JSON.stringify(positions),
      selectedExpirationDate,
      daysPassed,
      showOptionLines,
      showProbabilityZones,
      chartDisplayMode,
      calculatorMode,
      dealSettings: normalizeDealSettingsForCompare(dealSettings),
    };

    // Сравниваем текущее состояние с исходным
    return (
      currentState.selectedTicker !== originalDBConfig.selectedTicker ||
      currentState.currentPrice !== originalDBConfig.currentPrice ||
      JSON.stringify(currentState.priceChange) !== JSON.stringify(originalDBConfig.priceChange) ||
      currentState.options !== originalDBConfig.options ||
      currentState.positions !== originalDBConfig.positions ||
      currentState.selectedExpirationDate !== originalDBConfig.selectedExpirationDate ||
      currentState.daysPassed !== originalDBConfig.daysPassed ||
      currentState.showOptionLines !== originalDBConfig.showOptionLines ||
      currentState.showProbabilityZones !== originalDBConfig.showProbabilityZones ||
      currentState.chartDisplayMode !== originalDBConfig.chartDisplayMode ||
      currentState.calculatorMode !== originalDBConfig.calculatorMode ||
      currentState.dealSettings !== originalDBConfig.dealSettings
    );
  };

  // Отслеживание изменений в режиме редактирования
  // ЗАЧЕМ: Показывать кнопку "Сохранить изменения" только при наличии изменений
  useEffect(() => {
    if (!isEditMode || !loadedConfigId) {
      setHasChanges(false);
      return;
    }

    // Для конфигураций из БД проверяем, изменилась ли позиция
    if (configSource === 'db') {
      setHasChanges(checkDBConfigChanges());
    } else {
      // Для конфигураций из localStorage просто отмечаем, что есть изменения
      setHasChanges(true);
    }
  }, [isEditMode, loadedConfigId, configSource, originalDBConfig, options, positions, selectedExpirationDate, daysPassed, showOptionLines, showProbabilityZones, chartDisplayMode, calculatorMode, selectedTicker, currentPrice, priceChange, dealSettings]);

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

    const saved = localStorage.getItem('universalCalculatorConfigurations');
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
        calculatorMode,
      };

      localStorage.setItem('universalCalculatorConfigurations', JSON.stringify(configurations));
      console.log('💾 Конфигурация автосохранена:', loadedConfigId);
    } catch (error) {
      console.error('❌ Ошибка автосохранения конфигурации:', error);
    }
  }, [isLocked, isEditMode, loadedConfigId, options, positions, selectedExpirationDate, daysPassed, showOptionLines, showProbabilityZones, chartDisplayMode, calculatorMode]);

  // Точечное обновление dealSettings в сохранённой конфигурации
  // ЗАЧЕМ: При нажатии "Отправить срезки" / "Удалить срезки" dealSettings обновляется в памяти,
  // но автосохранение отключено для зафиксированных позиций. Этот useEffect обновляет ТОЛЬКО dealSettings
  // в сохранённой конфигурации, не затрагивая зафиксированные данные позиции (options, positions и т.д.)
  useEffect(() => {
    if (!loadedConfigId || !dealSettings) return;

    const saved = localStorage.getItem('universalCalculatorConfigurations');
    if (!saved) return;

    try {
      const configurations = JSON.parse(saved);
      const configIndex = configurations.findIndex(c => c.id === loadedConfigId);
      if (configIndex === -1) return;

      // Обновляем только dealSettings, не трогая остальные поля конфигурации
      configurations[configIndex].dealSettings = dealSettings;
      localStorage.setItem('universalCalculatorConfigurations', JSON.stringify(configurations));
    } catch (error) {
      console.error('❌ Ошибка обновления dealSettings в конфигурации:', error);
    }
  }, [loadedConfigId, dealSettings]);

  // Предупреждение при несохранённых изменениях (закрытие вкладки)
  // ЗАЧЕМ: Защита от потери данных при закрытии вкладки
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasChanges && loadedConfigId) {
        e.preventDefault();
        e.returnValue = 'Позиция была изменена! Сохранить изменения?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasChanges, loadedConfigId]);

  // Блокировка навигации при несохранённых изменениях (переход на другую страницу)
  // ЗАЧЕМ: Предотвращение потери данных при клике по ссылкам в Sidebar/TopNav
  useEffect(() => {
    const handleClick = (e) => {
      if (hasChanges && loadedConfigId) {
        // Проверяем, является ли цель клика ссылкой или находится внутри ссылки
        const link = e.target.closest('a[href]');
        if (link && link.href) {
          // Проверяем, является ли это внутренней навигацией (не внешняя ссылка)
          const url = new URL(link.href);
          const currentUrl = new URL(window.location.href);
          
          if (url.origin === currentUrl.origin && url.pathname !== currentUrl.pathname) {
            // Это внутренняя навигация на другую страницу
            const confirmLeave = window.confirm('Позиция была изменена! Вы уверены, что хотите покинуть страницу без сохранения?');
            if (!confirmLeave) {
              e.preventDefault();
              e.stopPropagation();
            }
          }
        }
      }
    };

    // Добавляем обработчик на фазе capture для перехвата кликов раньше
    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, [hasChanges, loadedConfigId]);

  // Функция загрузки конфигурации из БД
  // ЗАЧЕМ: Загружает конфигурацию из базы данных вместо localStorage
  const loadConfigurationFromDB = async (configId, editMode = false) => {
    try {
      console.log('🔔 [LOAD DB CONFIG]', { configId, editMode });
      // ЗАЧЕМ: При каждом открытии конфигурации сбрасываем «ручные» флаги ползунков, чтобы
      // цена БА снова шла за currentPrice, а ползунок дней — за «сегодня».
      setUserAdjustedTargetPrice(false);
      setUserAdjustedDays(false);
      
      // Загружаем конфигурацию с API
      const result = await getConfiguration(configId);
      
      if (result.status !== 'success' || !result.data) {
        alert('Ошибка загрузки конфигурации из БД');
        return;
      }

      const config = result.data;
      
      if (!config.state) {
        alert('Конфигурация повреждена');
        return;
      }

      // Проверяем, зафиксирована ли конфигурация
      let configIsLocked = config.isLocked === true;
      if (editMode) {
        configIsLocked = false; // Разблокируем для редактирования
      }
      setIsLocked(configIsLocked);

      // Запоминаем статус и название позиции для отображения в шапке калькулятора
      // ЗАЧЕМ: Лейбл «В ожидании» (жёлтый) / «Зафиксирована» (голубой) рядом с названием.
      // Fallback на 'standard' — старые записи до миграции не имеют поля status,
      // и по правилу миграции считаются зафиксированными.
      const positionStatus = config.status === 'pending' ? 'pending' : 'standard';
      setLoadedConfigStatus(positionStatus);
      setLoadedConfigName(config.name || null);

      // Вычисляем daysPassed как «сегодня» по правилу: при любом открытии конфигурации
      // (pending / standard, edit / view) ползунок дней встаёт на сегодняшний день.
      // Сохранённое значение config.state.daysPassed намеренно игнорируется.
      // ВАЖНО: парсим даты через parseDateAtStartOfDay — те же правила, что в кнопке «С»
      // в PriceAndTimeSettings, иначе из-за timezone у даты сохранённой UTC-меткой расчёт
      // отъезжает на день и ползунок встаёт на «вчера».
      const configEntryDate = config.entryDate || config.createdAt;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let baseDate = null;
      if (configIsLocked && configEntryDate) {
        setSavedConfigDate(configEntryDate);
        baseDate = parseDateAtStartOfDay(configEntryDate);
      } else {
        setSavedConfigDate(null);
        // Для pending / edit-режима: базовая дата — самая старая entryDate среди сохранённых опционов.
        const savedOpts = config.state.options || [];
        savedOpts.forEach(opt => {
          const ed = parseDateAtStartOfDay(opt.entryDate || new Date().toISOString().split('T')[0]);
          if (ed && (!baseDate || ed < baseDate)) {
            baseDate = ed;
          }
        });
      }
      if (!baseDate) baseDate = today;
      baseDate.setHours(0, 0, 0, 0);

      const calculatedDaysPassed = Math.max(
        0,
        Math.floor((today.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24))
      );

      // Восстанавливаем состояние калькулятора
      const ticker = config.state.selectedTicker || '';

      if (ticker) {
        setSelectedTicker(ticker);
        setCurrentPrice(config.state.currentPrice || 0);
        setPriceChange(config.state.priceChange || { value: 0, percent: 0 });

        // Для зафиксированных позиций загружаем текущую рыночную цену
        if (configIsLocked) {
          try {
            const priceResponse = await fetch(`/api/polygon/ticker/${ticker}`);
            if (priceResponse.ok) {
              const priceData = await priceResponse.json();
              if (priceData.price) {
                setLivePrice(priceData.price);
              }
            }
          } catch (error) {
            console.warn('⚠️ Не удалось загрузить текущую цену:', error);
          }
        } else {
          setLivePrice(null);
        }
      }

      // Восстанавливаем опционы и позиции
      let optionsToSet = config.state.options || [];
      
      // В режиме редактирования убираем флаги блокировки
      if (editMode) {
        optionsToSet = optionsToSet.map(opt => ({
          ...opt,
          isLockedPosition: false
        }));
      }

      setOptions(optionsToSet);
      // В режиме редактирования снимаем блокировку с позиций базового актива,
      // чтобы пользователь мог менять количество акций и цену покупки.
      let positionsToSet = config.state.positions || [];
      if (editMode) {
        positionsToSet = positionsToSet.map(pos => {
          const { isLockedPosition, ...rest } = pos;
          return rest;
        });
      }
      setPositions(positionsToSet);
      setSelectedExpirationDate(config.state.selectedExpirationDate || '');
      setDaysPassed(calculatedDaysPassed);
      setUserAdjustedDays(false);

      setShowOptionLines(config.state.showOptionLines !== undefined ? config.state.showOptionLines : true);
      setShowProbabilityZones(config.state.showProbabilityZones !== undefined ? config.state.showProbabilityZones : true);
      setChartDisplayMode(config.state.chartDisplayMode || 'profit-loss-dollar');

      // Восстанавливаем режим калькулятора
      let restoredMode = CALCULATOR_MODES.STOCKS;
      if (config.state.calculatorMode) {
        restoredMode = config.state.calculatorMode;
        setCalculatorMode(restoredMode);
      } else if (ticker) {
        const detectedType = detectInstrumentTypeByPattern(ticker);
        if (detectedType === 'futures') {
          restoredMode = CALCULATOR_MODES.FUTURES;
        } else if (detectedType === 'crypto') {
          restoredMode = CALCULATOR_MODES.CRYPTO;
        } else if (detectedType === 'etf') {
          restoredMode = CALCULATOR_MODES.ETF;
        }
        setCalculatorMode(restoredMode);
      }

      // Загружаем настройки фьючерса если нужно
      if (restoredMode === CALCULATOR_MODES.FUTURES && ticker) {
        const futureInfo = getFutureByTicker(ticker);
        setSelectedFuture(futureInfo);
      } else {
        setSelectedFuture(null);
      }

      // Восстанавливаем dealInfo и dealSettings
      if (config.dealInfo) {
        setDealInfo(config.dealInfo);
        setActiveCalculatorTab('deal');
      } else {
        setDealInfo(null);
        setActiveCalculatorTab('calculator');
      }

      // ЗАЧЕМ: targetPrice (ползунок цены БА) при открытии конфигурации не переопределяется
      // на сохранённый процент — он подтягивается к live currentPrice через общий sync-эффект.
      // Само значение dealSettings (включая targetAssetPricePercent) восстанавливается для таба «Сделка».
      if (config.dealSettings) {
        setDealSettings(config.dealSettings);
      } else {
        // ЗАЧЕМ: Если у новой позиции нет dealSettings — явно зануляем,
        // иначе старые настройки (и план выхода) «переедут» в новую позицию
        setDealSettings(null);
      }

      // Сохраняем исходное состояние конфигурации для отслеживания изменений
      // ЗАЧЕМ: Сравнивать текущее состояние с исходным для определения наличия изменений
      setOriginalDBConfig({
        selectedTicker: config.state.selectedTicker || '',
        currentPrice: config.state.currentPrice || 0,
        priceChange: config.state.priceChange || { value: 0, percent: 0 },
        options: JSON.stringify(optionsToSet),
        positions: JSON.stringify(config.state.positions || []),
        selectedExpirationDate: config.state.selectedExpirationDate || '',
        daysPassed: calculatedDaysPassed,
        showOptionLines: config.state.showOptionLines !== undefined ? config.state.showOptionLines : true,
        showProbabilityZones: config.state.showProbabilityZones !== undefined ? config.state.showProbabilityZones : true,
        chartDisplayMode: config.state.chartDisplayMode || 'profit-loss-dollar',
        calculatorMode: restoredMode,
        dealSettings: normalizeDealSettingsForCompare(config.dealSettings),
      });
      setConfigSource('db');

      initCompletedAtRef.current = Date.now();
      setIsInitialized(true);
      console.log('✅ Конфигурация из БД загружена:', config.name);
    } catch (error) {
      console.error('❌ Ошибка загрузки конфигурации из БД:', error);
      alert(`Ошибка загрузки: ${error.message}`);
    }
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

    const saved = localStorage.getItem('universalCalculatorConfigurations');
    if (!saved) return;

    try {
      const configurations = JSON.parse(saved);
      const configIndex = configurations.findIndex(c => c.id === loadedConfigId);

      if (configIndex === -1) return;

      const config = configurations[configIndex];

      // Генерируем новое название на основе текущих данных
      // ЗАЧЕМ: Название должно отражать новые данные после редактирования
      const updatedName = generateConfigurationName();

      // Восстанавливаем флаги блокировки для опционов если конфигурация была зафиксирована
      // ЗАЧЕМ: После редактирования зафиксированная позиция должна остаться зафиксированной
      // Одновременно фиксируем startPL для ног без снимка (нужно для колонки Start P&L).
      let optionsToSave = options;
      if (config.isLocked) {
        optionsToSave = options.map(opt => {
          const updated = { ...opt, isLockedPosition: true };
          if (updated.startPL === null || updated.startPL === undefined) {
            const currentPL = optionsPLMap[opt.id];
            if (currentPL !== null && currentPL !== undefined) {
              updated.startPL = currentPL;
            }
          }
          return updated;
        });
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
          calculatorMode,
        },
        dealSettings: dealSettings || null,
        dealInfo: dealInfo || null,
      };

      localStorage.setItem('universalCalculatorConfigurations', JSON.stringify(configurations));

      // Сбрасываем флаг изменений
      setHasChanges(false);

      console.log('✅ Изменения сохранены:', updatedName);
      alert('Изменения успешно сохранены!');
    } catch (error) {
      console.error('❌ Ошибка сохранения изменений:', error);
      alert('Ошибка при сохранении изменений');
    }
  };

  // Функция сохранения изменений конфигурации из БД
  // ЗАЧЕМ: Обновляет существующую конфигурацию в БД с новыми данными
  const handleSaveDBConfiguration = async () => {
    console.log('🔔 [handleSaveDBConfiguration] Вызвана функция', { loadedConfigId, configSource });
    
    if (!loadedConfigId || configSource !== 'db') {
      console.warn('⚠️ [handleSaveDBConfiguration] Функция вернулась:', { loadedConfigId, configSource });
      return;
    }

    try {
      console.log('📝 [handleSaveDBConfiguration] Начинаем сохранение...');
      
      // Получаем userId из Supabase если пользователь залогинен
      let userId = null;
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          userId = session.user.id;
        }
      }

      // Генерируем новое название на основе текущих данных
      const updatedName = generateConfigurationName();

      // Snapshot Start P&L для зафиксированной позиции: если конфигурация уже standard,
      // новые ноги (добавленные после первой фиксации) получают свой снимок сейчас.
      // Существующие startPL не пересчитываются.
      const optionsForSave = loadedConfigStatus === 'standard'
        ? options.map(opt => {
            if (opt.startPL !== null && opt.startPL !== undefined) return opt;
            const currentPL = optionsPLMap[opt.id];
            if (currentPL === null || currentPL === undefined) return opt;
            return { ...opt, startPL: currentPL };
          })
        : options;

      // Подготавливаем данные для API
      const configData = {
        name: updatedName,
        state: {
          selectedTicker,
          currentPrice,
          priceChange,
          options: optionsForSave,
          positions,
          selectedExpirationDate,
          daysPassed,
          showOptionLines,
          showProbabilityZones,
          chartDisplayMode,
          calculatorMode,
        },
        dealSettings: dealSettings || null,
        dealInfo: dealInfo || null,
      };

      console.log('📤 [handleSaveDBConfiguration] Отправляем на сервер:', { loadedConfigId, dealSettingsTargetPercent: configData.dealSettings?.targetAssetPricePercent, configData });

      // Отправляем на сервер
      const result = await updateConfiguration(loadedConfigId, configData, userId);

      console.log('✅ [handleSaveDBConfiguration] Ответ сервера:', result);

      // Локально применяем зафиксированный startPL, если он был добавлен
      if (loadedConfigStatus === 'standard' && optionsForSave !== options) {
        setOptions(optionsForSave);
      }

      // Обновляем исходное состояние после сохранения
      setOriginalDBConfig({
        selectedTicker,
        currentPrice,
        priceChange,
        options: JSON.stringify(optionsForSave),
        positions: JSON.stringify(positions),
        selectedExpirationDate,
        daysPassed,
        showOptionLines,
        showProbabilityZones,
        chartDisplayMode,
        calculatorMode,
        dealSettings: normalizeDealSettingsForCompare(dealSettings),
      });

      // Сбрасываем флаг изменений
      setHasChanges(false);

      console.log('✅ Конфигурация в БД обновлена:', result.data);
      alert('Изменения успешно сохранены в БД!');
    } catch (error) {
      console.error('❌ Ошибка сохранения в БД:', error);
      alert(`Ошибка при сохранении в БД: ${error.message}`);
    }
  };

  // Перевод pending-позиции в standard («Зафиксировать»)
  // ЗАЧЕМ: По задаче — переход pending → standard происходит через редактирование.
  // Реализовано как отдельная кнопка «Зафиксировать» в шапке калькулятора, которая
  // вызывает PUT /api/configurations/{id} с полем status='standard'. Бэкенд
  // фиксирует даты входа и обновляет state с флагами isLockedPosition.
  const handlePromotePendingToStandard = async () => {
    if (!loadedConfigId || configSource !== 'db') {
      alert('Эта функция доступна только для позиций, сохранённых в БД');
      return;
    }
    if (loadedConfigStatus !== 'pending') {
      return;
    }
    const confirmed = window.confirm(
      'Перевести позицию в статус «Зафиксирована»?\n\n' +
      'Даты входа будут зафиксированы на текущий момент. Откатить переход обратно в «В ожидании» нельзя.'
    );
    if (!confirmed) return;

    try {
      let userId = null;
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          userId = session.user.id;
        }
      }

      // Snapshot Start P&L: каждой ноге без startPL записываем текущее значение P&L из таблицы.
      // ЗАЧЕМ: Колонка Start P&L хранит P&L в момент фиксации позиции — это значение
      // должно остаться неизменным навсегда для последующего сравнения с динамической P&L.
      const optionsWithStartPL = options.map(opt => {
        if (opt.startPL !== null && opt.startPL !== undefined) return opt;
        const currentPL = optionsPLMap[opt.id];
        if (currentPL === null || currentPL === undefined) return opt;
        return { ...opt, startPL: currentPL };
      });

      const configData = {
        status: 'standard',
        isLocked: true,
        // Передаём свежее состояние, чтобы бэкенд накатил флаги
        // isLockedPosition поверх актуальных данных, а не устаревшего state.
        state: {
          selectedTicker,
          currentPrice,
          priceChange,
          options: optionsWithStartPL,
          positions,
          selectedExpirationDate,
          daysPassed,
          showOptionLines,
          showProbabilityZones,
          chartDisplayMode,
          calculatorMode,
        },
        dealSettings: dealSettings || null,
        dealInfo: dealInfo || null,
      };

      const result = await updateConfiguration(loadedConfigId, configData, userId);
      console.log('✅ Позиция переведена в Зафиксирована:', result?.data);

      // Локально обновляем состояние UI без перезагрузки
      setLoadedConfigStatus('standard');
      setIsLocked(true);

      // Применяем флаги isLockedPosition к опционам в локальном state, чтобы
      // не было визуального рассинхрона до следующей загрузки.
      // Одновременно сохраняем зафиксированный startPL.
      setOptions(prev => prev.map(opt => {
        const updated = { ...opt, isLockedPosition: true };
        if (updated.startPL === null || updated.startPL === undefined) {
          const currentPL = optionsPLMap[opt.id];
          if (currentPL !== null && currentPL !== undefined) {
            updated.startPL = currentPL;
          }
        }
        return updated;
      }));
      setPositions(prev => prev.map(pos => ({ ...pos, isLockedPosition: true })));

      alert('Позиция зафиксирована.');
    } catch (error) {
      console.error('❌ Ошибка перевода в зафиксирована:', error);
      alert(`Не удалось зафиксировать позицию: ${error.message}`);
    }
  };

  // Функция сохранения конфигурации в БД
  // ЗАЧЕМ: Сохранение позиции в базу данных для доступа всем пользователям
  const handleSaveToDB = async (configuration) => {
    try {
      // Получаем userId из Supabase если пользователь залогинен
      let userId = null;
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          userId = session.user.id;
        }
      }

      const targetStatus = configuration.status || 'standard';

      // Snapshot Start P&L: если позиция сохраняется в standard (зафиксирована),
      // каждой ноге без startPL записываем текущее значение P&L.
      // ЗАЧЕМ: Start P&L — снимок прибыли/убытка в момент фиксации позиции,
      // не меняется во времени. Для нового сохранения сразу в standard это
      // первый и единственный момент захвата.
      let configState = configuration.state;
      if (targetStatus === 'standard' && configState && Array.isArray(configState.options)) {
        const optionsWithStartPL = configState.options.map(opt => {
          if (opt.startPL !== null && opt.startPL !== undefined) return opt;
          const currentPL = optionsPLMap[opt.id];
          if (currentPL === null || currentPL === undefined) return opt;
          return { ...opt, startPL: currentPL };
        });
        configState = { ...configState, options: optionsWithStartPL };
      }

      // Подготавливаем данные для API
      // ЗАЧЕМ: Поле status управляет дальнейшим поведением:
      // - 'pending' → при открытии калькулятор автообновит котировки от расширения
      // - 'standard' → даты входа заморожены, открывается без обновления
      const configData = {
        name: configuration.name,
        description: configuration.description,
        author: configuration.author,
        ticker: configuration.ticker,
        entryDate: configuration.entryDate,
        isLocked: configuration.isLocked,
        status: targetStatus,
        state: configState,
        dealSettings: configuration.dealSettings,
        dealInfo: configuration.dealInfo,
        userId: userId
      };

      // Отправляем на сервер
      const result = await createConfiguration(configData);

      console.log('✅ Конфигурация сохранена в БД:', result.data);

      // Локально обновляем options, чтобы зафиксированные значения
      // сразу появились в колонке Start P&L без перезагрузки страницы.
      if (targetStatus === 'standard') {
        setOptions(prev => prev.map(opt => {
          if (opt.startPL !== null && opt.startPL !== undefined) return opt;
          const currentPL = optionsPLMap[opt.id];
          if (currentPL === null || currentPL === undefined) return opt;
          return { ...opt, startPL: currentPL };
        }));
      }

      const statusLabel = configData.status === 'standard' ? 'Зафиксирована' : 'В ожидании';
      alert(`Позиция сохранена со статусом «${statusLabel}»!\nID: ${result.data.id}`);
    } catch (error) {
      console.error('❌ Ошибка сохранения в БД:', error);
      alert(`Ошибка при сохранении в БД: ${error.message}`);
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
      calculatorMode,
    };
  };

  // Расчет P&L для сценария "Закрыть всё в выбранную дату"
  // ЗАЧЕМ: Отображение блока в левой колонке с результатами выхода из позиции
  const { plCloseAll, details, liquidityWarnings, greeksWarnings } = usePositionExitCalculator({
    underlyingPrice: targetPrice,
    daysPassed: daysPassed,
    options: displayOptions,
    positions: positions,
    currentPrice: currentPrice,
    ivSurface: ivSurface,
    dividendYield: useDividends ? dividendYield : 0,
    isAIEnabled: false,
    aiVolatilityMap: {},
    selectedTicker: selectedTicker,
    calculatorMode: calculatorMode,
    contractMultiplier: contractMultiplier,
    stockClassification: null
  });

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ minWidth: '1570px', maxWidth: '1570px' }}>
      <div className="p-6">
        {/* === ПРЕДУПРЕЖДЕНИЕ О НЕДОСТОВЕРНОЙ ЦЕНЕ БАЗОВОГО АКТИВА === */}
        {/* ЗАЧЕМ: Если расширение не смогло однозначно привязать цену к текущему тикеру
            (TradingView изменил вёрстку или в DOM присутствуют элементы других тикеров) —
            показываем плашку, чтобы пользователь проверил цену перед сохранением сделки */}
        {isFromExtension && extensionPriceConfidence && extensionPriceConfidence !== 'high' && (
          <div className={`mb-4 border-2 rounded-lg p-3 ${
            extensionPriceConfidence === 'none'
              ? 'border-red-400 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
              : 'border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-900 dark:text-yellow-200'
          }`}>
            <div className="font-semibold text-sm mb-1">
              {extensionPriceConfidence === 'none'
                ? 'TradingView изменил вёрстку — цена базового актива не получена. Требуется обновление расширения.'
                : 'Цена базового актива от расширения недостоверна.'}
            </div>
            <div className="text-xs opacity-90">
              {extensionPriceConfidence === 'none'
                ? 'Сохранённая сделка не будет содержать цену входа — задайте её вручную в таблице опционов. Сообщите разработчику о проблеме.'
                : 'Возможно, в момент добавления позиции на странице TradingView был активен элемент другого тикера (watchlist, сравнение, всплывающая подсказка). Цена не будет автоматически сохранена в «Цену актива на момент входа» — проверьте и введите её вручную в таблице опционов.'}
            </div>
          </div>
        )}

        {/* === ХЕДЕР С ДАННЫМИ ОТ РАСШИРЕНИЯ ИЛИ КОНФИГУРАЦИИ === */}
        {/* ЗАЧЕМ: Отображение контракта, цены и метаданных от TradingView Parser или загруженной конфигурации */}
        {/* ВАЖНО: Показываем если данные от расширения ИЛИ загружена конфигурация */}
        {isInitialized && (isFromExtension || loadedConfigId) && (contractCode || selectedTicker) && (
          <div className="mb-6 flex items-center gap-4">
            <div className={`inline-flex items-center gap-4 p-3 border-2 rounded-lg ${
              calculatorMode === CALCULATOR_MODES.FUTURES
                ? 'border-purple-400 bg-purple-50 dark:bg-purple-950/30'
                : calculatorMode === CALCULATOR_MODES.ETF
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
                  : CRYPTO_TICKERS.includes((selectedTicker || '').toUpperCase())
                    ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30'
                    : 'border-teal-400 bg-teal-50 dark:bg-teal-950/30'
              }`}>
              {/* Индикатор режима Акции/ETF/Фьючерсы/Крипто */}
              {/* ЗАЧЕМ: Отображает текущий тип инструмента; ETF — синий бейдж,
                  математика как у акций, отличается только визуальный маркер */}
              <div className="flex items-center gap-1 bg-white/50 dark:bg-gray-800/50 rounded-md p-0.5">
                <div className={`px-2 py-1 text-xs font-medium rounded ${
                  calculatorMode === CALCULATOR_MODES.FUTURES
                    ? 'bg-purple-500 text-white'
                    : calculatorMode === CALCULATOR_MODES.ETF
                      ? 'bg-blue-500 text-white'
                      : CRYPTO_TICKERS.includes((selectedTicker || '').toUpperCase())
                        ? 'bg-orange-500 text-white'
                        : 'bg-teal-500 text-white'
                }`}>
                  {calculatorMode === CALCULATOR_MODES.FUTURES
                    ? 'Фьючерсы'
                    : calculatorMode === CALCULATOR_MODES.ETF
                      ? 'ETF'
                      : CRYPTO_TICKERS.includes((selectedTicker || '').toUpperCase())
                        ? 'Крипто'
                        : 'Акции'}
                </div>
              </div>

              {/* Логотип источника данных (TradingView или Binance для крипто) */}
              <div className="flex items-center">
                {CRYPTO_TICKERS.includes((selectedTicker || '').toUpperCase()) ? (
                  <img
                    src="/images/Binance_logo.svg"
                    alt="Binance"
                    style={{ height: '20px', width: 'auto' }}
                  />
                ) : (
                  <img
                    src="/images/black-full-logo.svg"
                    alt="TradingView"
                    style={{ height: '20px', width: 'auto' }}
                  />
                )}
              </div>

              {/* Код актива */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Актив:</span>
                {(() => {
                  // ЗАЧЕМ: При загруженной конфигурации selectedTicker имеет приоритет,
                  // иначе contractCode из расширения (calculatorState) может показать стейл-тикер
                  const ticker = loadedConfigId ? (selectedTicker || contractCode) : (contractCode || selectedTicker);
                  const tvLink = getTradingViewLink(ticker, extensionTicker ? extensionExchange : null);
                  
                  if (tvLink) {
                    return (
                      <a
                        href={tvLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lg font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline transition-colors"
                        title="Открыть опционы на TradingView"
                      >
                        {ticker}
                      </a>
                    );
                  }
                  
                  return <span className="text-lg font-bold">{ticker}</span>;
                })()}
              </div>

              {/* Цена базового актива */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Цена:</span>
                <span className="text-lg font-bold">
                  ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ' ')}
                </span>
              </div>

              {/* Цена пункта для фьючерсов */}
              {calculatorMode === CALCULATOR_MODES.FUTURES && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Цена пункта:</span>
                  <span className="text-lg text-muted-foreground">
                    {selectedFuture ? `$${contractMultiplier}` : '—'}
                  </span>
                </div>
              )}
            </div>

            {/* Лейбл статуса сохранённой позиции (для загруженных из БД)
                ЗАЧЕМ: По задаче — рядом с названием позиции в шапке калькулятора
                жёлтый бейдж «В ожидании» / голубой бейдж «Зафиксирована». */}
            {loadedConfigId && loadedConfigStatus && (
              <div className="inline-flex items-center gap-2 p-3 border-2 rounded-lg"
                   style={{
                     borderColor: loadedConfigStatus === 'pending' ? '#eab308' : '#06b6d4',
                     backgroundColor: loadedConfigStatus === 'pending' ? 'rgba(254, 252, 232, 1)' : 'rgba(236, 254, 255, 1)',
                     minHeight: '57px',
                   }}>
                {loadedConfigName && (
                  <span className="text-sm font-semibold text-foreground max-w-[280px] truncate" title={loadedConfigName}>
                    {loadedConfigName}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  loadedConfigStatus === 'pending'
                    ? 'bg-yellow-100 text-yellow-800 border-yellow-400 dark:bg-yellow-900/30 dark:text-yellow-300'
                    : 'bg-cyan-100 text-cyan-800 border-cyan-400 dark:bg-cyan-900/30 dark:text-cyan-300'
                }`}>
                  {loadedConfigStatus === 'pending' ? '⏳ В ожидании' : '🔒 Зафиксирована'}
                </span>

                {/* Кнопка перевода pending → standard
                    ЗАЧЕМ: По задаче — смена статуса возможна через редактирование.
                    Кнопка доступна только для pending-позиций из БД. */}
                {loadedConfigStatus === 'pending' && configSource === 'db' && (
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-cyan-500 hover:bg-cyan-600 text-white"
                    onClick={handlePromotePendingToStandard}
                    title="Перевести позицию в статус «Зафиксирована»"
                  >
                    🔒 Зафиксировать
                  </Button>
                )}
              </div>
            )}

            {/* Кнопка "+ СДЕЛКА" или название созданной сделки */}
            {!dealInfo ? (
              <Button
                className="bg-green-500 hover:bg-green-600 active:bg-green-700 active:scale-95 text-white font-medium px-4 py-2 h-auto transition-all duration-100"
                onClick={handleCreateDeal}
              >
                + СДЕЛКА
              </Button>
            ) : (
              (() => {
                const isFutures = calculatorMode === CALCULATOR_MODES.FUTURES;
                const bgColor = isFutures ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-green-100 dark:bg-green-900/30';
                const borderColor = isFutures ? 'border-purple-500' : 'border-green-500';
                const textColor = isFutures ? 'text-purple-700 dark:text-purple-300' : 'text-green-700 dark:text-green-300';
                
                return (
                  <div className={`inline-flex items-center gap-4 p-3 ${bgColor} border-2 ${borderColor} rounded-lg`} style={{ minHeight: '57px' }}>
                    <span className={`text-lg font-bold ${textColor}`}>
                      {dealInfo.isMultiDeal ? 'Мультисделка' : 'Сделка'} - {dealInfo.ticker}
                    </span>
                  </div>
                );
              })()
            )}
          </div>
        )}

        {/* Сообщение если нет данных от расширения */}
        {/* ВАЖНО: Не показываем если загружена конфигурация из URL */}
        {!isFromExtension && isInitialized && !loadedConfigId && (
          <div className="mb-6">
            <div className="p-4 border border-yellow-500 rounded-lg bg-yellow-50 dark:bg-yellow-950/30">
              <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
                <span className="text-lg">⏳</span>
                <span className="font-medium">Ожидание данных от TradingView Extension</span>
              </div>
              <div className="text-sm text-muted-foreground mt-2 space-y-2">
                <p>
                  Откройте страницу опционов на TradingView и нажмите кнопку ОТКРЫТЬ КАЛЬКУЛЯТОР в расширении.
                  Или просто добавьте любой опцион через кнопку +С или +Р, калькулятор откроется автоматически.
                </p>
                <p className="font-medium">
                  ВНИМАНИЕ! Сайт TradingView должен отображаться <span className="text-red-600">на английском</span>. В настройках страницы Options должны быть выбраны <span className="text-red-600">All rows</span> и <span className="text-red-600">все Customize columns</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Предупреждение об отсутствии настроек фьючерса */}
        {isFuturesMissingSettings && (
          <div className="mb-6">
            <div className="p-4 border border-red-500 rounded-lg bg-red-50 dark:bg-red-950/30">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <span className="text-lg">⚠️</span>
                <span className="font-medium">
                  Для данного фьючерса отсутствует настройка цены пункта! Перейдите в{' '}
                  <a href="/settings?section=futures" className="underline hover:text-red-900 dark:hover:text-red-100">
                    Настройки
                  </a>
                  {' '}и добавьте фьючерс.
                </span>
              </div>
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
                        calculatorMode={calculatorMode}
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
                            isLoadingDetails: false, // Показываем что загружаем детали
                            bestExitDay: bestExitDay, // Индивидуальный лучший день выхода для этого опциона
                            // Дата входа в позицию (текущая дата в ISO формате YYYY-MM-DD)
                            // ЗАЧЕМ: Фиксируем момент создания опциона для отслеживания времени нахождения в позиции
                            entryDate: new Date().toISOString().split('T')[0],
                            // Цена базового актива на момент добавления опциона
                            assetPriceAtEntry: currentPrice || 0,
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

                          // УДАЛЕНО: Автоматическая установка optionSelectionParams после ИИ подбора
                          // ЗАЧЕМ: ИИ подбора больше нет, расчёты должны запускаться только по явному действию пользователя
                          // (через волшебную/золотую кнопку в onMagicSelectionComplete)

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
                        calculatorMode={calculatorMode}
                        contractMultiplier={contractMultiplier}
                        leverage={baseAssetLeverage}
                        stockClassification={null}
                        optionsTotalPL={optionsTableTotalPL}
                      />
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Синхронизированный блок настроек цены и времени */}
              {selectedTicker && (
                <Card
                  className={`w-full relative overflow-hidden ${displayOptions.length === 0 ? 'opacity-20 pointer-events-none' : ''
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
                        setDaysPassed={setDaysPassed}
                        userAdjustedDays={userAdjustedDays}
                        setUserAdjustedDays={setUserAdjustedDays}
                        userAdjustedTargetPrice={userAdjustedTargetPrice}
                        setUserAdjustedTargetPrice={setUserAdjustedTargetPrice}
                        options={displayOptions}
                        minPrice={currentPrice * 0}
                        maxPrice={currentPrice * 2}
                        compact={true}
                        savedConfigDate={savedConfigDate}
                        livePrice={livePrice}
                      />
                    </CardContent>
                  )}
                </Card>
              )}

              {/* Предупреждение о низкой ликвидности */}
              {selectedTicker && displayOptions.length > 0 && liquidityWarnings && (
                <LiquidityWarning warnings={liquidityWarnings} />
              )}

              {/* Предупреждения по грекам */}
              {selectedTicker && displayOptions.length > 0 && greeksWarnings && (
                <GreeksWarning warnings={greeksWarnings} />
              )}

              {/* СКРЫТО: Сценарий "Закрыть всё в выбранную дату" */}
              {/* {selectedTicker && displayOptions.length > 0 && plCloseAll !== undefined && details && (
                <ScenarioCard
                  title="Закрыть всё в выбранную дату"
                  pl={plCloseAll}
                  details={details.closeAll}
                  headerBgColor="#10b981"
                  tooltip="Закрытие всех опционов по рыночной цене и всех позиций базового актива по целевой цене"
                />
              )} */}

              {shouldShowBlock('calculator-settings') && (
                <Card
                  className={`w-full relative ${displayOptions.length === 0 ? 'opacity-20 pointer-events-none' : ''
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
                    baseAssetLeverage={baseAssetLeverage}
                    setBaseAssetLeverage={setBaseAssetLeverage}
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
                      onSaveToDB={() => setSaveToDBDialogOpen(true)}
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
                      configSource={configSource}
                      onSaveDBConfiguration={handleSaveDBConfiguration}
                      positions={positions}
                      isAIEnabled={isAIEnabled}
                      aiVolatilityMap={aiVolatilityMap}
                      fetchAIVolatility={fetchAIVolatility}
                      hideColumns={['premium', 'oi']}
                      isFromExtension={isFromExtension}
                      calculatorMode={calculatorMode}
                      contractMultiplier={contractMultiplier}
                      isFuturesMissingSettings={isFuturesMissingSettings}
                      onAddMagicOption={(option) => {
                        // Добавляем опцион из волшебного подбора
                        console.log('👑 OptionsCalculatorBasic: Получен опцион в onAddMagicOption:', option.isGoldenOption, option);
                        // Используем ID из опциона если есть, иначе генерируем уникальный
                        // ЗАЧЕМ: При добавлении нескольких опционов из SuperSelection Date.now() может вернуть одинаковое значение
                        const newOptionId = option.id || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        const newOption = {
                          id: newOptionId,
                          action: option.action || 'Buy',
                          type: option.type || 'PUT',
                          strike: option.strike,
                          date: option.expirationDate || option.date, // Поддержка date из SuperSelection
                          quantity: 1,
                          premium: option.premium || 0,
                          bid: option.bid || 0,
                          ask: option.ask || 0,
                          volume: option.volume || 0,
                          oi: option.openInterest || 0,
                          delta: option.delta || 0,
                          gamma: option.gamma || 0,
                          theta: option.theta || 0,
                          vega: option.vega || 0,
                          impliedVolatility: option.iv || option.impliedVolatility || 0,
                          visible: true,
                          isLoadingDetails: false,
                          isGoldenOption: option.isGoldenOption || false, // Флаг для визуальной индикации золотой короны
                          isSuperOption: option.isSuperOption || false, // Флаг для визуальной индикации бриллианта (Super Selection)
                          entryDate: option.entryDate || new Date().toISOString().split('T')[0], // Дата входа
                          // Цена базового актива на момент добавления опциона
                          assetPriceAtEntry: option.assetPriceAtEntry || currentPrice || 0,
                        };
                        console.log('👑 OptionsCalculatorBasic: Создан новый опцион с isGoldenOption:', newOption.isGoldenOption, newOption);
                        setOptions(prevOptions => [...prevOptions, newOption]);

                        // Если передана целевая цена симуляции (например, из SuperSelection), устанавливаем её
                        if (option.simulationTargetPrice) {
                          setTargetPrice(option.simulationTargetPrice);
                          console.log('💎 SuperSelection: установлена targetPrice =', option.simulationTargetPrice);
                        }

                        // Если передано количество дней для симуляции, устанавливаем его
                        if (option.simulationDaysPassed !== undefined) {
                          setDaysPassed(option.simulationDaysPassed);
                          setUserAdjustedDays(true);
                          console.log('💎 SuperSelection: установлено daysPassed =', option.simulationDaysPassed);
                        }

                        // ОТКЛЮЧЕНО: В универсальном калькуляторе данные приходят от расширения
                        // Не загружаем детали опционов с внешних API
                      }}
                      stockClassification={null}
                      onOptionsTotalPLChange={setOptionsTableTotalPL}
                      onOptionsPLMapChange={setOptionsPLMap}
                      onOpenNorthStrategy={handleOpenNorthStrategy}
                      canShowNorthButton={canShowNorthButton}
                      northMode={northMode}
                      northActive={northActive}
                      onReopenNorthResults={handleReopenNorthResults}
                      onCancelNorthSelection={handleCancelNorthSelection}
                    />
                  ) : (
                    <div className="w-full h-[80px] flex items-center justify-center text-muted-foreground text-sm">
                      {/* ЗАЧЕМ: Калькулятор работает только с данными от расширения */}
                      Ожидание данных от TradingView Extension...
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* СКРЫТО: Блок "Шкала страйков" */}
              {/* {shouldShowBlock('strike-scale') && (
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
              )} */}

              {/* Блок табов "Калькулятор" / "Сделка" */}
              <CalculatorDealTabs
                options={displayOptions}
                positions={positions}
                currentPrice={currentPrice}
                selectedTicker={selectedTicker}
                daysPassed={daysPassed}
                setDaysPassed={setDaysPassed}
                targetPrice={targetPrice}
                setTargetPrice={setTargetPrice}
                ivSurface={ivSurface}
                dividendYield={useDividends ? dividendYield : 0}
                calculatorMode={calculatorMode}
                contractMultiplier={contractMultiplier}
                stockClassification={null}
                shouldShowBlock={shouldShowBlock}
                isFuturesMissingSettings={isFuturesMissingSettings}
                isAIEnabled={isAIEnabled}
                aiVolatilityMap={aiVolatilityMap}
                fetchAIVolatility={fetchAIVolatility}
                showOptionLines={showOptionLines}
                showProbabilityZones={showProbabilityZones}
                optionSelectionParams={optionSelectionParams}
                selectedExpirationDate={selectedExpirationDate}
                savedConfigDate={savedConfigDate}
                setUserAdjustedDays={setUserAdjustedDays}
                activeTab={activeCalculatorTab}
                onTabChange={setActiveCalculatorTab}
                dealInfo={dealInfo}
                dealSettings={dealSettings}
                setDealSettings={setDealSettings}
                volatilityData={volatilityData}
                volatilityLoading={volatilityLoading}
                volatilityLastUpdated={volatilityLastUpdated}
                onVolatilityRefresh={handleVolatilityRefresh}
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

        {/* Поп-ап "Стратегия СЕВЕР" — подбор пары Buy Call + Buy Put.
            Список экспираций мгновенно читается из tvc_expirations_list (расширение
            пишет по DTE-бейджам), полная цепочка опционов — после выбора экспирации
            (расширение раскрывает группу в TV и дампит в tvc_full_chain). Если
            таба TV нет — расширение открывает по tradingViewUrl. */}
        <NorthStrategyDialog
          isOpen={northDialogOpen}
          initialStep={northDialogStep}
          mode={northMode}
          currentPrice={currentPrice}
          entryPrice={longPositionsEntry?.price || currentPrice}
          assetQuantity={longPositionsEntry?.quantity || 0}
          leverage={baseAssetLeverage}
          ivSurface={ivSurface}
          calculatorMode={calculatorMode}
          dividendYield={useDividends ? dividendYield : 0}
          stockClassification={null}
          ticker={selectedTicker}
          tradingViewUrl={selectedTicker ? (() => {
            // Окно дат для TV: сегодня → +150 дней. Гарантирует, что в таблице будут
            // и серии вокруг +60 дней (дефолт для СЕВЕР), и соседние справа.
            const fmt = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
            const today = new Date();
            const to = new Date(today.getTime() + 150 * 24 * 60 * 60 * 1000);
            return `${getTradingViewLink(selectedTicker, extensionTicker ? extensionExchange : null)}&series_date_from=${fmt(today)}&series_date_to=${fmt(to)}&strikes_filter_condition=all`;
          })() : null}
          initialState={northState}
          onClose={() => setNorthDialogOpen(false)}
          onApply={handleApplyNorthCombination}
          onStateChange={handleNorthStateChange}
        />

        {/* Диалог сохранения в БД (единственный режим сохранения)
            ЗАЧЕМ: Внутри диалога — выбор статуса позиции «В ожидании» / «Зафиксирована».
            Старые localStorage-диалоги «Сохранить» и «Зафиксировать» удалены. */}
        <SaveConfigurationDialog
          isOpen={saveToDBDialogOpen}
          onClose={() => setSaveToDBDialogOpen(false)}
          onSave={handleSaveToDB}
          currentState={getCurrentState()}
          dealInfo={dealInfo}
          dealSettings={dealSettings}
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
