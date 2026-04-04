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
import FinancialControl from '../components/CalculatorV2/FinancialControl';
import ExitCalculator from '../components/CalculatorV2/ExitCalculator';
import { ScenarioCard, LiquidityWarning } from '../components/CalculatorV2/ExitCalculator/components';
import OptionSelectionResult from '../components/CalculatorV2/OptionSelectionResult';
import CalculatorDealTabs from '../components/CalculatorV2/CalculatorDealTabs';
import { getDaysUntilExpirationUTC, calculateDaysRemainingUTC } from '../utils/dateUtils';
import { WhatsNewModal, shouldShowModal } from '../components/WhatsNewModal';
import { buildIVSurface } from '../utils/volatilitySurface';
import { usePositionExitCalculator } from '../hooks/usePositionExitCalculator';
// УБРАНО: AI модель не используется в универсальном калькуляторе
// import aiPredictionService from '../services/aiPredictionService';

// Импорт утилиты для работы с настройками фьючерсов
// ЗАЧЕМ: Получение pointValue для расчётов P&L в режиме фьючерсов
import { loadFuturesSettings, getPointValue, getFutureByTicker, isFuturesTicker, detectInstrumentTypeByPattern, isFuturesTickerByPattern } from '../utils/futuresSettings';

// Импорт хука для работы с данными от Chrome Extension TradingView Parser
// ЗАЧЕМ: Получение опционов, тикера и цены из localStorage и URL параметров
import { useExtensionData, useExtensionRefreshCommand } from '../hooks/useExtensionData';

// УБРАНО: AI модель не используется в универсальном калькуляторе
// const AI_SUPPORTED_TICKERS = [...];

// Режимы калькулятора
// ЗАЧЕМ: Определяет тип инструмента и соответствующую математику P&L
const CALCULATOR_MODES = {
  STOCKS: 'stocks',
  FUTURES: 'futures',
  CRYPTO: 'crypto'
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
  // === ИНТЕГРАЦИЯ С CHROME EXTENSION ===
  // ЗАЧЕМ: Получение данных опционов от TradingView Parser через localStorage
  const {
    contractCode,           // Код контракта из URL (?contract=)
    urlPrice,               // Цена из URL (?price=)
    exchange: extensionExchange,      // Биржа от расширения (NYSE, NASDAQ, CBOT и т.д.)
    underlyingPrice: extensionPrice,  // Цена базового актива
    ticker: extensionTicker,          // Тикер от расширения
    expirationDate: extensionExpirationDate,  // Дата экспирации
    options: extensionOptions,        // Массив опционов от расширения
    isFromExtension,        // Флаг: данные от расширения
    lastUpdated: extensionLastUpdated,  // Timestamp последнего обновления
    refreshFromStorage,     // Функция ручного обновления
    clearExtensionData      // Функция очистки данных расширения
  } = useExtensionData();

  // Ref для отслеживания предыдущего тикера
  // ЗАЧЕМ: Позволяет определить, когда тикер изменился, и очистить позиции базового актива
  const prevTickerRef = useRef(null);

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

  // State для отслеживания завершения инициализации
  // ЗАЧЕМ: Предотвращает мигание предупреждений до загрузки данных
  const [isInitialized, setIsInitialized] = useState(false);

  // Проверка наличия настроек фьючерса
  // ЗАЧЕМ: Если фьючерс не найден в настройках — блокируем расчёты и показываем предупреждение
  // ВАЖНО: Проверяем isInitialized, чтобы не показывать плашку до завершения инициализации
  const isFuturesMissingSettings = useMemo(() => {
    return isInitialized && calculatorMode === CALCULATOR_MODES.FUTURES && !selectedFuture && (extensionTicker || contractCode || selectedTicker);
  }, [isInitialized, calculatorMode, selectedFuture, extensionTicker, contractCode, selectedTicker]);
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

  // Синхронизируем targetPrice с currentPrice при первой загрузке цены
  useEffect(() => {
    if (currentPrice > 0 && targetPrice === 0) {
      setTargetPrice(currentPrice);
    }
  }, [currentPrice, targetPrice]);

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

  // УБРАНО: AI модель не используется в универсальном калькуляторе
  // useEffect для isAIEnabled удалён

  // Загрузка дивидендной доходности при выборе тикера
  // ЗАЧЕМ: Для модели Black-Scholes-Merton нужна dividend yield
  // 🛑 ИСПРАВЛЕНИЕ: Добавлена проверка доступности API + debounce для предотвращения частых запросов
  useEffect(() => {
    if (!selectedTicker) {
      setDividendYield(0);
      return;
    }

    // 🛑 НЕ запрашиваем dividend yield для крипто-тикеров и фьючерсов
    if (CRYPTO_TICKERS.includes(selectedTicker) || calculatorMode === CALCULATOR_MODES.FUTURES) {
      setDividendYield(0);
      return;
    }

    // 🛑 Debounce: не запрашиваем чаще чем раз в 5 секунд
    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      if (cancelled) return;

      setDividendLoading(true);
      try {
        const response = await fetch(`/api/polygon/dividend-yield/${selectedTicker}`, {
          signal: AbortSignal.timeout(3000) // 🛑 Таймаут 3 секунды
        });
        if (response.ok) {
          const data = await response.json();
          if (!cancelled) {
            setDividendYield(data.dividend_yield || 0);
            console.log(`📊 Dividend yield для ${selectedTicker}: ${(data.dividend_yield * 100).toFixed(2)}%`);
          }
        } else {
          if (!cancelled) setDividendYield(0);
        }
      } catch (error) {
        // 🛑 НЕ логируем ошибки если это AbortError или NetworkError (бета сервер может быть недоступен)
        if (error.name !== 'AbortError' && !cancelled) {
          console.warn(`⚠️ Dividend yield недоступен для ${selectedTicker}: ${error.message}`);
          setDividendYield(0);
        }
      } finally {
        if (!cancelled) setDividendLoading(false);
      }
    }, 500); // 🛑 Debounce 500ms

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [selectedTicker, calculatorMode]);

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

  // === ПРИЁМ ОБНОВЛЁННЫХ IV И ЦЕНЫ ОТ РАСШИРЕНИЯ (sendPrIV_tocallc) ===
  // ЗАЧЕМ: Расширение обновляет волатильность и цену при рефреше конфигурации.
  // Данные приходят через tvc_refresh_command с type='sendPrIV_tocallc'.
  // newIV → manualIvOverride (колонка Fact IV), currentPrice → цена тикера.
  // ВАЖНО: Используем useEffect вместо callback — ждём пока опционы загрузятся в state,
  // только после успешного применения помечаем команду как processed.
  const { pendingRefresh, markProcessed } = useExtensionRefreshCommand();

  useEffect(() => {
    if (!pendingRefresh) return;
    // Ждём пока опционы загрузятся
    if (options.length === 0) {
      console.log('⏳ [ExtRefresh] Ожидание загрузки опционов...');
      return;
    }

    const { currentPrice: newPrice, options: refreshedOptions } = pendingRefresh;

    // Обновляем цену базового актива
    if (newPrice && newPrice > 0) {
      setCurrentPrice(newPrice);
      console.log('📥 [ExtRefresh] Цена обновлена:', newPrice);
    }

    // Обновляем Fact IV (manualIvOverride) для совпавших опционов
    if (refreshedOptions && refreshedOptions.length > 0) {
      const now = new Date();
      const todayISO = now.toISOString().split('T')[0];
      const todayDisplay = now.toLocaleDateString('ru-RU') + ' ' + now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

      let updatedCount = 0;
      const updatedOptions = options.map(opt => {
        // Ищем совпадение по type + strike + date
        const match = refreshedOptions.find(ref => {
          const typeMatch = (ref.type || '').toUpperCase() === (opt.type || '').toUpperCase();
          const strikeMatch = Math.abs(parseFloat(ref.strike) - parseFloat(opt.strike)) < 0.5;
          // Сравнение дат: приводим к YYYY-MM-DD
          let dateMatch = false;
          try {
            const d1 = (opt.date || '').toString().split('T')[0];
            const d2 = (ref.date || '').toString().split('T')[0];
            dateMatch = d1 === d2;
          } catch { dateMatch = false; }
          return typeMatch && strikeMatch && dateMatch;
        });

        if (match && match.newIV != null && !isNaN(match.newIV)) {
          updatedCount++;
          return {
            ...opt,
            manualIvOverride: match.newIV,
            manualIvOverrideDate: todayISO,
            manualIvOverrideDisplayDate: todayDisplay
          };
        }
        return opt;
      });

      console.log(`📥 [ExtRefresh] Fact IV обновлён у ${updatedCount} из ${refreshedOptions.length} опционов`);

      if (updatedCount > 0) {
        setOptions(updatedOptions);
      }
    }

    // Помечаем команду как обработанную
    markProcessed();

    // Принудительное пересохранение конфигурации (включая зафиксированные)
    // ЗАЧЕМ: Обновлённые IV и цена должны сохраниться, даже если позиция isLocked
    if (loadedConfigId) {
      // setTimeout чтобы setOptions успел применить обновления
      setTimeout(() => {
        try {
          const saved = localStorage.getItem('universalCalculatorConfigurations');
          if (!saved) return;
          const configurations = JSON.parse(saved);
          const configIndex = configurations.findIndex(c => c.id === loadedConfigId);
          if (configIndex === -1) return;

          // Читаем актуальные options через setState callback (read-only)
          setOptions(currentOptions => {
            configurations[configIndex].state = {
              ...configurations[configIndex].state,
              options: currentOptions,
              currentPrice: newPrice || configurations[configIndex].state?.currentPrice
            };
            localStorage.setItem('universalCalculatorConfigurations', JSON.stringify(configurations));
            console.log('💾 [ExtRefresh] Конфигурация пересохранена:', loadedConfigId);
            return currentOptions; // Не меняем state
          });
        } catch (error) {
          console.error('❌ [ExtRefresh] Ошибка пересохранения:', error);
        }
      }, 500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRefresh, options.length]);

  // Функция генерации ссылки на TradingView для тикера
  // ЗАЧЕМ: Создаёт правильную ссылку на страницу опционов в TradingView с учётом биржи
  // ПРИОРИТЕТ: exchange из расширения > паттерны тикера > NASDAQ по умолчанию
  const getTradingViewLink = useCallback((ticker, exchangeFromExtension) => {
    if (!ticker) return null;

    let exchange = exchangeFromExtension || 'NASDAQ'; // Приоритет: расширение > паттерны > NASDAQ

    // Если расширение не передало exchange — определяем биржу на основе паттернов тикера
    // ЗАЧЕМ: Fallback для старых версий расширения, которые не передают exchange
    if (!exchangeFromExtension) {
      // Фьючерсы CBOT (зерновые: ZL, ZC, ZS, ZW, ZM и т.д.)
      if (/^Z[LCSW]|^ZM/.test(ticker)) {
        exchange = 'CBOT';
      }
      // Фьючерсы CME (энергия, металлы: CL, NG, GC, SI и т.д.)
      else if (/^(CL|NG|GC|SI|HG|RB|HO)/.test(ticker)) {
        exchange = 'NYMEX';
      }
      // Фьючерсы CME (индексы, валюты: ES, NQ, YM, 6E и т.д.)
      else if (/^(ES|NQ|YM|RTY|6[AEBCJSN])/.test(ticker)) {
        exchange = 'CME';
      }
      // Остальные считаем NASDAQ (по умолчанию)
    }

    const encodedSymbol = encodeURIComponent(`${exchange}:${ticker}`);
    return `https://www.tradingview.com/options/chain/?symbol=${encodedSymbol}`;
  }, []);

  const resetCalculator = useCallback(() => {
    setSelectedTicker('');
    setCurrentPrice(0);
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
    setIsInitialized(false); // ВАЖНО: Сбрасываем флаг инициализации для повторной загрузки при обновлении страницы
    setCalculatorMode(CALCULATOR_MODES.STOCKS); // Сбрасываем режим калькулятора на акции
    setSelectedFuture(null); // Сбрасываем выбранный фьючерс
    setLoadedConfigId(null); // Сбрасываем ID загруженной конфигурации
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

    // Очищаем URL параметры (contract, price, config, edit)
    // ЗАЧЕМ: Предотвращаем восстановление данных из URL при обновлении страницы
    const url = new URL(window.location.href);
    url.searchParams.delete('contract');
    url.searchParams.delete('price');
    url.searchParams.delete('config');
    url.searchParams.delete('edit');
    window.history.replaceState({}, '', url.pathname);
    console.log('🧹 [Universal] URL параметры очищены');

    // Очищаем данные расширения (тикер контракта и временную метку)
    clearExtensionData();

    // Сбрасываем сделку
    setDealInfo(null);
    setActiveCalculatorTab('calculator');

    // ✅ Принудительная перезагрузка страницы
    // ЗАЧЕМ: Гарантируем полную очистку состояния, предотвращаем восстановление данных из useEffect
    setTimeout(() => {
      console.log('🔄 [Universal] Перезагрузка страницы после сброса...');
      window.location.reload();
    }, 100);
  }, [clearExtensionData]);

  // Функция создания сделки
  // ЗАЧЕМ: Создаёт сделку с текущим количеством опционов (без автоподбора по лимиту)
  const handleCreateDeal = useCallback(() => {
    // Для крипто-режима (Binance) — пропускаем проверку таблицы опционов
    // ЗАЧЕМ: BinanceDealTab использует собственные поля ввода, таблица опционов не нужна
    if (calculatorMode === CALCULATOR_MODES.CRYPTO) {
      const ticker = contractCode || selectedTicker;
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
    const ticker = contractCode || selectedTicker;
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
    // ЗАЧЕМ: При нажатии кнопки "+ СДЕЛКА" targetPrice должен быть = currentPrice * 1.5 (50% по умолчанию)
    const defaultTargetAssetPrice = currentPrice * 1.5; // 50% от текущей цены
    setTargetPrice(defaultTargetAssetPrice);
    
    console.log('✅ [Deal] Сделка создана:', deal);
  }, [options, contractCode, selectedTicker, currentPrice, calculatorMode, setTargetPrice, setDealSettings]);

  // Загружаем состояние при первой загрузке страницы
  // ПРИОРИТЕТ: config в URL > Данные от расширения > localStorage.calculatorState
  // ЗАЧЕМ: Универсальный калькулятор работает только с данными от Chrome Extension
  useEffect(() => {
    if (isInitialized) return;

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
            // ВАЖНО: Если опцион пришёл от расширения и у него есть impliedVolatility — НЕ применяем manualIvOverride,
            // потому что расширение передало актуальное impliedVolatility для колонки "IV"
            const todayDateRestore = new Date().toISOString().split('T')[0];
            optionsToSet = optionsToSet.map(opt => {
              const optionKey = getOptionKey(opt);
              const savedOverrides = userOptionOverridesRef.current[optionKey] || {};

              // Исключаем entryDate из savedOverrides
              // ЗАЧЕМ: entryDate не должен перезаписываться из savedOverrides, только из конфигурации
              const { entryDate: _, ...overridesWithoutEntryDate } = savedOverrides;
              
              // Если опцион пришёл от расширения и у него есть impliedVolatility — исключаем manualIvOverride
              const isNewOptionFromExtension = !originalOptionKeys.has(optionKey);
              if (isNewOptionFromExtension && opt.impliedVolatility && opt.impliedVolatility > 0) {
                const { manualIvOverride, manualIvOverrideDate, ...otherOverrides } = overridesWithoutEntryDate;
                const hasOtherOverrides = Object.keys(otherOverrides).length > 0;
                if (hasOtherOverrides) {
                  console.log('🔄 [Restore] Применяем savedOverrides (без manualIvOverride):', { optionKey, savedOverrides: otherOverrides });
                  return { ...opt, ...otherOverrides };
                }
                return opt;
              }
              
              const hasSavedOverrides = Object.keys(overridesWithoutEntryDate).length > 0;

              if (hasSavedOverrides) {
                console.log('🔄 [Restore] Применяем savedOverrides:', { optionKey, savedOverrides: overridesWithoutEntryDate });
                return { ...opt, ...overridesWithoutEntryDate };
              }

              // Проверяем, был ли этот опцион в исходной конфигурации
              // ЗАЧЕМ: Отличить "новый опцион от расширения" от "старого сохраненного опциона"
              // Новый опцион = его нет в originalOptionKeys, старый = есть в originalOptionKeys

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
            setIsInitialized(true);
            return;
          }
        }
      } catch (error) {
        console.error('❌ [Universal] Ошибка восстановления конфигурации:', error);
      }
      // Если конфигурация не найдена — очищаем localStorage и продолжаем обычную инициализацию
      localStorage.removeItem('universalCalc_loadedConfigId');
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
            };
          }

          return extOption;
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
        } else {
          // Режим акций
          setCalculatorMode(CALCULATOR_MODES.STOCKS);
          setSelectedFuture(null);
          console.log('📊 Автоматически переключено в режим акций:', ticker);
        }
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

          // Восстанавливаем опционы с применением savedOverrides
          // ЗАЧЕМ: При перезагрузке ручные изменения (actualPL, manualIvOverride и др.) могут отсутствовать в localStorage
          // ВАЖНО: Если опцион пришёл от расширения (isFromExtension=true), НЕ применяем manualIvOverride из savedOverrides,
          // потому что расширение передало актуальное impliedVolatility, которое должно идти в колонку "IV", а не "Fact IV"
          const restoredOptions = (state.options || []).map(opt => {
            const base = { ...opt, entryDate: opt.entryDate || new Date().toISOString().split('T')[0] };
            const optionKey = getOptionKey(base);
            const savedOverrides = userOptionOverridesRef.current[optionKey] || {};
            
            // Если опцион пришёл от расширения и у него есть impliedVolatility — не применяем manualIvOverride
            if (isFromExtension && base.impliedVolatility && base.impliedVolatility > 0) {
              // Удаляем manualIvOverride из savedOverrides чтобы не затирать impliedVolatility от расширения
              const { manualIvOverride, manualIvOverrideDate, ...otherOverrides } = savedOverrides;
              if (Object.keys(otherOverrides).length > 0) {
                return { ...base, ...otherOverrides };
              }
              return base;
            }
            
            // Для опционов созданных вручную или без impliedVolatility — применяем все savedOverrides
            if (Object.keys(savedOverrides).length > 0) {
              return { ...base, ...savedOverrides };
            }
            return base;
          });
          setOptions(restoredOptions);
          setPositions(state.positions || []);
          setSelectedExpirationDate(state.selectedExpirationDate || null);
          setDaysPassed(state.daysPassed || 0);
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

    setIsInitialized(true);
  }, [isInitialized, isFromExtension, contractCode, extensionTicker, extensionPrice, extensionExpirationDate, extensionOptions]);

  // === ОТСЛЕЖИВАНИЕ ИЗМЕНЕНИЯ ТИКЕРА ДЛЯ ОЧИСТКИ ПОЗИЦИЙ ===
  // ЗАЧЕМ: При переключении на другой инструмент очищаем позиции базового актива
  // 🛑 ИСПРАВЛЕНИЕ: Используем ref для prevTicker и resetCalculatorFn чтобы избежать пересоздания эффекта
  const resetCalculatorFn = useRef(resetCalculator);
  resetCalculatorFn.current = resetCalculator;

  useEffect(() => {
    if (!isInitialized) return;

    const currentTicker = extensionTicker || contractCode || selectedTicker;
    const prevTicker = prevTickerRef.current;

    // Если тикер изменился и это не первая инициализация
    if (prevTicker && prevTicker !== currentTicker && currentTicker) {
      console.log('🔄 [Universal] Смена тикера с', prevTicker, 'на', currentTicker, '- полный сброс калькулятора');

      // 🛑 КРИТИЧНОЕ ИСПРАВЛЕНИЕ: НЕ вызываем resetCalculator напрямую
      // вместо этого очищаем только позиции и опционы, БЕЗ перезагрузки страницы
      // ЗАЧЕМ: Перезагрузка страницы приводит к повторному срабатыванию эффекта → бесконечный цикл
      
      // 🛑 НЕ очищаем данные расширения — они будут использованы для инициализации нового тикера
      // 🛑 НЕ вызываем clearExtensionData() — это вызывает storage event → бесконечный цикл
      
      // Очищаем только опционы и позиции
      setOptions([]);
      setPositions([]);
      setExpirationDates({});
      setStrikesByDate({});
      setSelectedExpirationDate(null);
      setDaysPassed(0);
      setUserAdjustedDays(false);
      setSavedConfigDate(null);
      setLoadedConfigId(null);
      setIsEditMode(false);
      setHasChanges(false);
      setDealInfo(null);
      setActiveCalculatorTab('calculator');
      setOptionSelectionParams(null);
      setIsDataCleared(false);
      setShowDemoData(false);
      
      // НЕ очищаем selectedTicker — он будет обновлён расширением при добавлении нового опциона
      // setSelectedTicker(''); // ← УБРАНО
      
      // Очищаем localStorage ТОЛЬКО calculatorState
      localStorage.removeItem('calculatorState');
      // 🛑 НЕ очищаем optioner_user_overrides — они могут понадобиться
      // 🛑 НЕ очищаем URL параметры — расширение их установило
      // 🛑 НЕ вызываем clearExtensionData()

      // Обновляем prevTickerRef ПОСЛЕ очистки
      prevTickerRef.current = currentTicker;
      console.log('📝 [Universal] prevTickerRef обновлен на:', currentTicker);
      return; // ВАЖНО: НЕ продолжаем выполнение после очистки
    }

    // Обновляем ref для следующей проверки
    if (currentTicker) {
      prevTickerRef.current = currentTicker;
      console.log('📝 [Universal] prevTickerRef обновлен на:', currentTicker);
    }
  }, [isInitialized, extensionTicker, contractCode, selectedTicker]); // 🛑 Убраны positions.length и resetCalculator из зависимостей

  // Ref для отслеживания предыдущих значений extensionOptions
  // ЗАЧЕМ: Предотвращаем бесконечный цикл — сравниваем с предыдущими данными
  const prevExtensionOptionsRef = useRef(null);

  // === СИНХРОНИЗАЦИЯ С CHROME EXTENSION ===
  // ЗАЧЕМ: Автоматическое обновление при изменении данных расширением (storage event)
  // ВАЖНО: НЕ синхронизируем если загружена конфигурация из URL — данные конфигурации имеют приоритет
  useEffect(() => {
    if (!isInitialized) return;

    // 🛑 КРИТИЧНОЕ ИСПРАВЛЕНИЕ: Сравниваем с предыдущими данными
    // ЗАЧЕМ: Предотвращаем бесконечный цикл — эффект вызывается, но setOptions НЕ срабатывает если данные идентичны
    const currentExtKey = JSON.stringify({
      options: extensionOptions?.map(o => `${o.strike}-${o.type}-${o.date}-${o.quantity}`).sort(),
      price: extensionPrice,
      ticker: extensionTicker,
      expiration: extensionExpirationDate
    });

    const prevKey = prevExtensionOptionsRef.current;

    // Если данные не изменились — пропускаем
    if (prevKey === currentExtKey) {
      // console.log('⏭️ [Sync] Данные расширения не изменились — пропускаем');
      return;
    }

    // Обновляем ref для следующей проверки
    prevExtensionOptionsRef.current = currentExtKey;

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
            // Добавляем entryDate к новым опционам (сегодняшняя дата)
            const enrichedNewOptions = newOptions.map(opt => ({
              ...opt,
              entryDate: new Date().toISOString().split('T')[0] // Всегда сегодняшняя дата для новых опционов
            }));
            console.log('➕ [Universal] Добавлено новых опционов к конфигурации:', enrichedNewOptions.length);
            return [...updatedPrevOptions, ...enrichedNewOptions];
          }
          
          return updatedPrevOptions; // Возвращаем обновлённые опционы с savedOverrides
        });
      }
      // Обновляем цену от расширения даже при загруженной конфигурации
      // ЗАЧЕМ: Актуальная цена нужна для корректного расчёта P&L
      if (extensionPrice > 0 && !isLocked) {
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
        // ВАЖНО: Если опцион пришёл от расширения и у него есть impliedVolatility — НЕ применяем manualIvOverride,
        // потому что расширение передало актуальное impliedVolatility для колонки "IV"
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
          // ВАЖНО: Если опцион от расширения имеет impliedVolatility — НЕ берём manualIvOverride из savedOverrides
          const quantity = savedOverrides.quantity ?? existingOption?.quantity ?? extOption.quantity;
          const customBid = savedOverrides.customBid ?? existingOption?.customBid;
          const customAsk = savedOverrides.customAsk ?? existingOption?.customAsk;
          const customPremium = savedOverrides.customPremium ?? existingOption?.customPremium;
          const entryDate = savedOverrides.entryDate ?? existingOption?.entryDate ?? extOption.entryDate;
          const actualPL = savedOverrides.actualPL ?? existingOption?.actualPL;
          const actualPLDate = savedOverrides.actualPLDate ?? existingOption?.actualPLDate;
          const actualPLPrice = savedOverrides.actualPLPrice ?? existingOption?.actualPLPrice;
          
          // КЛЮЧЕВОЙ МОМЕНТ: Если опцион от расширения имеет свой impliedVolatility,
          // НЕ применяем manualIvOverride из savedOverrides — пусть impliedVolatility идёт в колонку "IV"
          const hasExtensionIV = extOption.impliedVolatility && extOption.impliedVolatility > 0;
          const manualIvOverride = hasExtensionIV ? undefined : (savedOverrides.manualIvOverride ?? existingOption?.manualIvOverride);
          
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
              // Сохраняем ручную коррекцию IV
              manualIvOverride: manualIvOverride,
              // Сохраняем флаги происхождения опциона (Super/Golden)
              isSuperOption: existingOption?.isSuperOption,
              isGoldenOption: existingOption?.isGoldenOption,
              // Сохраняем дополнительные параметры
              entryDate: entryDate,
              simulationTargetPrice: existingOption?.simulationTargetPrice,
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
            entryDate: extOption.entryDate || new Date().toISOString().split('T')[0]
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

    // Обновляем цену ТОЛЬКО если она изменилась
    // 🛑 ИСПРАВЛЕНИЕ: НЕ вызываем setCurrentPrice если цена не изменилась
    if (extensionPrice > 0 && extensionPrice !== currentPrice) {
      setCurrentPrice(extensionPrice);
      // Обновляем targetPrice только если она ещё не была изменена пользователем
      if (targetPrice === 0 || targetPrice === currentPrice) {
        setTargetPrice(extensionPrice);
      }
    }

    // Обновляем тикер ТОЛЬКО если он изменился
    // 🛑 ИСПРАВЛЕНИЕ: НЕ вызываем setSelectedTicker если тикер не изменился
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

  // Автоматически устанавливаем daysPassed при изменении опционов
  // ЛОГИКА: Если пользователь установил ползунок — сохраняем его выбор (с коррекцией если нужно)
  // Если пользователь не трогал ползунок — устанавливаем в максимум (день экспирации)
  // ВАЖНО: Для зафиксированных позиций НЕ перезаписываем daysPassed
  useEffect(() => {
    if (options.length === 0) return;

    // Для зафиксированных позиций — не перезаписываем daysPassed
    // ЗАЧЕМ: daysPassed уже вычислен как разница между сегодня и датой сохранения
    if (isLocked || savedConfigDate) {
      console.log('📅 Зафиксированная позиция — daysPassed не перезаписывается (isLocked:', isLocked, ', savedConfigDate:', savedConfigDate, ')');
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
      console.log(`📅 Установка ползунка в максимум: ${maxDays} дней`);
      setDaysPassed(maxDays);
    }
  }, [options.length, options.map(o => o.date).join(','), options.map(o => o.entryDate).join(','), savedConfigDate, isLocked, userAdjustedDays]); // Добавили entryDate и isLocked в зависимости

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
      return updated;
    });
  }, []);

  const updateOption = useCallback((id, field, value) => {
    console.log('🔄 [Universal] updateOption вызван:', { id, field, value });
    setOptions(prevOptions => {
      // Находим опцион для сохранения override
      const targetOption = prevOptions.find(opt => opt.id === id);

      // ВАЖНО: Сохраняем ручные изменения в отдельное хранилище
      // ЗАЧЕМ: Расширение перезаписывает localStorage.calculatorState, теряя изменения
      // Поля, которые нужно сохранять: quantity, customPremium, customBid, customAsk, entryDate, actualPL, actualPLDate, actualPLPrice, manualIvOverride, manualIvOverrideDate
      const fieldsToOverride = ['quantity', 'customPremium', 'customBid', 'customAsk', 'entryDate', 'isPremiumModified', 'isBidModified', 'isAskModified', 'actualPL', 'actualPLDate', 'actualPLPrice', 'manualIvOverride', 'manualIvOverrideDate'];
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

  // State для диалога сохранения конфигурации
  const [saveConfigDialogOpen, setSaveConfigDialogOpen] = useState(false);
  // State для диалога фиксации позиций (isLocked=true)
  const [lockConfigDialogOpen, setLockConfigDialogOpen] = useState(false);
  // State для диалога сохранения в БД
  const [saveToDBDialogOpen, setSaveToDBDialogOpen] = useState(false);

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
          // ВАЖНО: Если опцион пришёл от расширения и у него есть impliedVolatility — НЕ применяем manualIvOverride,
          // потому что расширение передало актуальное impliedVolatility для колонки "IV"
          const todayDate = new Date().toISOString().split('T')[0];
          optionsToSet = optionsToSet.map(opt => {
            const optionKey = getOptionKey(opt);
            const savedOverrides = userOptionOverridesRef.current[optionKey] || {};

            // Исключаем entryDate из savedOverrides
            // ЗАЧЕМ: entryDate не должен перезаписываться из savedOverrides, только из конфигурации
            const { entryDate: _, ...overridesWithoutEntryDate } = savedOverrides;
            
            // Проверяем, был ли этот опцион в исходной конфигурации
            // ЗАЧЕМ: Отличить "новый опцион от расширения" от "старого сохраненного опциона"
            // Новый опцион = его нет в originalOptionKeys, старый = есть в originalOptionKeys
            const isNewOptionFromExtension = !originalOptionKeys.has(optionKey);
            
            // Если опцион от расширения и у него есть impliedVolatility — исключаем manualIvOverride
            if (isNewOptionFromExtension && opt.impliedVolatility && opt.impliedVolatility > 0) {
              const { manualIvOverride, manualIvOverrideDate, ...otherOverrides } = overridesWithoutEntryDate;
              const hasOtherOverrides = Object.keys(otherOverrides).length > 0;
              if (hasOtherOverrides) {
                console.log('🔄 [LoadConfig] Применяем savedOverrides (без manualIvOverride):', { optionKey, savedOverrides: otherOverrides });
                return { ...opt, ...otherOverrides };
              }
              return opt;
            }
            
            const hasSavedOverrides = Object.keys(overridesWithoutEntryDate).length > 0;

            if (hasSavedOverrides) {
              console.log('🔄 [LoadConfig] Применяем savedOverrides:', { optionKey, savedOverrides: overridesWithoutEntryDate });
              return { ...opt, ...overridesWithoutEntryDate };
            }
            
            if (isNewOptionFromExtension && opt.entryDate === fallbackEntryDate) {
              console.log('📅 [LoadConfig] Новый опцион от расширения, ставим сегодняшнюю дату:', { optionKey, old: opt.entryDate, new: todayDate });
              return { ...opt, entryDate: todayDate };
            }
            
            return opt;
          });
          
          setOptions(optionsToSet);
          setPositions(config.state.positions || []);
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
          // ЗАЧЕМ: При открытии сохраненной сделки восстанавливаем dealInfo в калькуляторе
          if (config.dealInfo && config.dealInfo.ticker) {
            setDealInfo(config.dealInfo);
            // Активируем таб "Сделка" при загрузке конфигурации с dealInfo
            setActiveCalculatorTab('deal');
            // Ползунок дней должен быть в крайнем правом положении (0 дней осталось)
            // ЗАЧЕМ: При открытии сохраненной сделки показываем максимальный временной распад
            // Вычисляем максимальное количество дней от даты входа до экспирации
            const baseDate = configEntryDate ? new Date(configEntryDate) : new Date();
            baseDate.setHours(0, 0, 0, 0);
            
            const maxDaysForDeal = optionsToSet.reduce((max, opt) => {
              if (!opt.date) return max;
              const expirationDate = new Date(opt.date + 'T00:00:00');
              const diffTime = expirationDate.getTime() - baseDate.getTime();
              const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              return Math.max(max, daysUntil);
            }, 0);
            
            // Устанавливаем daysPassed на максимум (ползунок в крайнее правое положение)
            setDaysPassed(maxDaysForDeal);
            setUserAdjustedDays(true); // Отмечаем что пользователь "настроил" ползунок
            console.log(`💼 Сделка восстановлена: ${config.dealInfo.ticker}, ползунок установлен на ${maxDaysForDeal} дней`);
          } else {
            // Если в конфигурации НЕТ информации о сделке — сбрасываем dealInfo
            // ЗАЧЕМ: Старые сохранения без сделки должны открываться без сделки
            setDealInfo(null);
            setActiveCalculatorTab('calculator');
            console.log('📋 Конфигурация без сделки — dealInfo сброшен');
          }

          // Если в конфигурации есть настройки таба Сделка — восстанавливаем их
          // ЗАЧЕМ: При открытии сохраненной сделки восстанавливаем все настройки включая состояние отправки срезок
          if (config.dealSettings) {
            // Восстанавливаем полный объект dealSettings
            setDealSettings(config.dealSettings);
            console.log('📊 Настройки таба Сделка восстановлены:', config.dealSettings);
            
            // Восстанавливаем целевую цену актива в блоке симуляции
            if (config.dealSettings.targetAssetPricePercent !== undefined) {
              const calculatedTargetPrice = Math.round(
                (config.state.currentPrice || 0) * (1 + config.dealSettings.targetAssetPricePercent / 100) * 100
              ) / 100;
              setTargetPrice(calculatedTargetPrice);
              console.log(`📊 Целевая цена актива восстановлена: ${calculatedTargetPrice} (${config.dealSettings.targetAssetPricePercent}%)`);
            }
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
      currentState.calculatorMode !== originalDBConfig.calculatorMode
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
  }, [isEditMode, loadedConfigId, configSource, originalDBConfig, options, positions, selectedExpirationDate, daysPassed, showOptionLines, showProbabilityZones, chartDisplayMode, calculatorMode, selectedTicker, currentPrice, priceChange]);

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

      // Вычисляем daysPassed
      let calculatedDaysPassed = config.state.daysPassed || 0;
      const configEntryDate = config.entryDate || config.createdAt;

      if (configIsLocked && configEntryDate) {
        setSavedConfigDate(configEntryDate);
        const savedDate = new Date(configEntryDate);
        const today = new Date();
        savedDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        const diffTime = today.getTime() - savedDate.getTime();
        calculatedDaysPassed = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
      } else {
        setSavedConfigDate(null);
      }

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
      setPositions(config.state.positions || []);
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

      if (config.dealSettings) {
        setDealSettings(config.dealSettings);
        if (config.dealSettings.targetAssetPricePercent !== undefined) {
          const calculatedTargetPrice = Math.round(
            (config.state.currentPrice || 0) * (1 + config.dealSettings.targetAssetPricePercent / 100) * 100
          ) / 100;
          setTargetPrice(calculatedTargetPrice);
        }
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
      });
      setConfigSource('db');

      setIsInitialized(true);
      console.log('✅ Конфигурация из БД загружена:', config.name);
    } catch (error) {
      console.error('❌ Ошибка загрузки конфигурации из БД:', error);
      alert(`Ошибка загрузки: ${error.message}`);
    }
  };

  // Функция сохранения конфигурации
  const handleSaveConfiguration = (configuration) => {
    const saved = localStorage.getItem('universalCalculatorConfigurations');
    let configurations = [];

    if (saved) {
      try {
        configurations = JSON.parse(saved);
      } catch (error) {
        console.error('Ошибка парсинга сохраненных конфигураций:', error);
      }
    }

    configurations.push(configuration);
    localStorage.setItem('universalCalculatorConfigurations', JSON.stringify(configurations));

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
          calculatorMode,
        },
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

      // Подготавливаем данные для API
      const configData = {
        name: updatedName,
        state: {
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
        },
      };

      console.log('📤 [handleSaveDBConfiguration] Отправляем на сервер:', { loadedConfigId, configData });

      // Отправляем на сервер
      const result = await updateConfiguration(loadedConfigId, configData, userId);

      console.log('✅ [handleSaveDBConfiguration] Ответ сервера:', result);

      // Обновляем исходное состояние после сохранения
      setOriginalDBConfig({
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

      // Подготавливаем данные для API
      const configData = {
        name: configuration.name,
        description: configuration.description,
        author: configuration.author,
        ticker: configuration.ticker,
        entryDate: configuration.entryDate,
        isLocked: configuration.isLocked,
        state: configuration.state,
        dealSettings: configuration.dealSettings,
        dealInfo: configuration.dealInfo,
        userId: userId
      };

      // Отправляем на сервер
      const result = await createConfiguration(configData);
      
      console.log('✅ Конфигурация сохранена в БД:', result.data);
      alert(`Конфигурация успешно сохранена в БД!\nID: ${result.data.id}`);
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
  const { plCloseAll, details, liquidityWarnings } = usePositionExitCalculator({
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
        {/* === ХЕДЕР С ДАННЫМИ ОТ РАСШИРЕНИЯ ИЛИ КОНФИГУРАЦИИ === */}
        {/* ЗАЧЕМ: Отображение контракта, цены и метаданных от TradingView Parser или загруженной конфигурации */}
        {/* ВАЖНО: Показываем если данные от расширения ИЛИ загружена конфигурация */}
        {isInitialized && (isFromExtension || loadedConfigId) && (contractCode || selectedTicker) && (
          <div className="mb-6 flex items-center gap-4">
            <div className={`inline-flex items-center gap-4 p-3 border-2 rounded-lg ${
              calculatorMode === CALCULATOR_MODES.FUTURES
                ? 'border-purple-400 bg-purple-50 dark:bg-purple-950/30'
                : CRYPTO_TICKERS.includes((selectedTicker || '').toUpperCase())
                  ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30'
                  : 'border-teal-400 bg-teal-50 dark:bg-teal-950/30'
              }`}>
              {/* Индикатор режима Акции/Фьючерсы/Крипто */}
              {/* ЗАЧЕМ: Отображает текущий тип инструмента */}
              <div className="flex items-center gap-1 bg-white/50 dark:bg-gray-800/50 rounded-md p-0.5">
                <div className={`px-2 py-1 text-xs font-medium rounded ${
                  calculatorMode === CALCULATOR_MODES.FUTURES
                    ? 'bg-purple-500 text-white'
                    : CRYPTO_TICKERS.includes((selectedTicker || '').toUpperCase())
                      ? 'bg-orange-500 text-white'
                      : 'bg-teal-500 text-white'
                }`}>
                  {calculatorMode === CALCULATOR_MODES.FUTURES
                    ? 'Фьючерсы'
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
                  const ticker = contractCode || selectedTicker;
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
                        setDaysPassed={(value) => {
                          setDaysPassed(value);
                          setUserAdjustedDays(true);
                        }}
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
                      onSaveToDB={() => setSaveToDBDialogOpen(true)}
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
          dealInfo={dealInfo}
          dealSettings={dealSettings}
        />

        {/* Диалог сохранения в БД */}
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
