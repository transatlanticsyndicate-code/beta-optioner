import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { Calculator, ChevronUp, ChevronDown, Save, RotateCcw, TrendingUp, Activity, BarChart3, Target, Bitcoin } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useLocalStorageValue } from '../hooks/useLocalStorage';
import { getActiveBlocks, isBlockEnabled } from '../config/calculatorV3Blocks';
import { applyStrategy, getAllStrategies } from '../config/optionsStrategies';
import { saveCustomStrategy, getCustomStrategies, deleteCustomStrategy, applyCustomStrategy } from '../utils/customStrategies';
import { cacheManager } from '../utils/cacheManager';
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
import TradingViewWidget from '../components/TradingViewWidget';

// Импорт модульных компонентов (используем те же, что и в V2)
import {
  TickerSearch,
  BaseAssetPositions,
  OptionsTable,
  ExpirationCalendar,
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
import FinancialControl from '../components/CalculatorV2/FinancialControl';
import ExitCalculator from '../components/CalculatorV2/ExitCalculator';

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

function OptionsCalculatorV3() {
  // Установка заголовка страницы
  useEffect(() => {
    document.title = 'Калькулятор опционов | SYNDICATE Platform';
    return () => {
      document.title = 'SYNDICATE Platform';
    };
  }, []);

  // Все блоки всегда включены
  const activeBlocks = getActiveBlocks();

  // Функция проверки, должен ли блок отображаться (всегда true)
  const shouldShowBlock = (blockId) => {
    return true; // Все блоки всегда отображаются
  };

  // State для поиска тикера
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [selectedTicker, setSelectedTicker] = useState("");
  const [isDataCleared, setIsDataCleared] = useState(false);
  const [showDemoData, setShowDemoData] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(245); // Демо-значение для работы с демо-опционами
  const [priceChange, setPriceChange] = useState({ value: -0.80, percent: -0.32 }); // Демо-значение

  // State для настроек калькулятора
  const [daysRemaining, setDaysRemaining] = useState(0); // Начальное значение - 0 дней (день экспирации)
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

  // State для синхронизированных настроек цены и волатильности
  const [targetPrice, setTargetPrice] = useState(currentPrice);
  const [volatility, setVolatility] = useState(25);

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
  
  // State для страйков по датам
  const [strikesByDate, setStrikesByDate] = useState({}); // { "2025-10-17": [195, 200, 205, ...] }
  
  // State для настройки кэша (в минутах)
  const [cacheTTLMinutes, setCacheTTLMinutes] = useState(() => {
    const saved = localStorage.getItem('cacheTTLMinutes');
    return saved ? parseInt(saved) : 0;
  });
  
  // Сохраняем настройку кэша в localStorage при изменении
  useEffect(() => {
    localStorage.setItem('cacheTTLMinutes', cacheTTLMinutes.toString());
  }, [cacheTTLMinutes]);
  const [loadingStrikesForDate, setLoadingStrikesForDate] = useState({}); // { "2025-10-17": true }
  
  // State для календаря экспирации (объявляем рано, чтобы использовать в addOption)
  // Используем ISO формат YYYY-MM-DD
  const [selectedExpirationDate, setSelectedExpirationDate] = useState("2025-11-28");
  const [expirationDates, setExpirationDates] = useState({});

  // Функция загрузки страйков для конкретной даты
  const loadStrikesForDate = async (ticker, date) => {
    if (!ticker) {
      return [];
    }
    if (strikesByDate[date]) {
      console.log(`✅ Strikes for ${date} already cached`);
      return strikesByDate[date];
    }
    if (loadingStrikesForDate[date]) {
      console.log(`⏳ Strikes for ${date} already loading...`);
      return [];
    }
    console.log(`🔄 Loading strikes for ${ticker} on ${date}...`);
    setLoadingStrikesForDate(prev => ({ ...prev, [date]: true }));
    try {
      const response = await fetch(`/api/polygon/ticker/${ticker}/options?expiration_date=${date}`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && data.options && data.options.length > 0) {
          const strikes = [...new Set(data.options.map(opt => opt.strike))].sort((a, b) => a - b);
          console.log(`✅ Loaded ${strikes.length} strikes for ${date}`);
          setStrikesByDate(prev => ({ ...prev, [date]: strikes }));
          setLoadingStrikesForDate(prev => ({ ...prev, [date]: false }));
          return strikes;
        }
      }
      console.log(`⚠️ No strikes found for ${date}`);
      setLoadingStrikesForDate(prev => ({ ...prev, [date]: false }));
      return [];
    } catch (error) {
      console.error(`❌ Error loading strikes for ${date}:`, error);
      setLoadingStrikesForDate(prev => ({ ...prev, [date]: false }));
      return [];
    }
  };
  
  // Функция загрузки деталей опциона (bid/ask/volume/oi) после выбора страйка
  const loadOptionDetails = async (optionId, ticker, date, strike, optionType) => {
    if (!ticker) {
      return null;
    }
    console.log(`🔄 Loading details for ${ticker} ${optionType} ${strike} on ${date}...`);
    setOptions(prevOptions => 
      prevOptions.map(opt => 
        opt.id === optionId ? { ...opt, isLoadingDetails: true } : opt
      )
    );
    try {
      const response = await fetch(
        `/api/polygon/ticker/${ticker}/option-details?expiration_date=${date}&strike=${strike}&option_type=${optionType}`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && data.details) {
          const details = data.details;
          console.log(`✅ Loaded details for ${ticker} ${optionType} ${strike}:`, details);
          setOptions(prevOptions => 
            prevOptions.map(opt => 
              opt.id === optionId ? {
                ...opt,
                premium: details.premium || 0,
                bid: details.bid || 0,
                ask: details.ask || 0,
                volume: details.volume || 0,
                oi: details.open_interest || 0,
                delta: details.delta || 0,
                gamma: details.gamma || 0,
                theta: details.theta || 0,
                vega: details.vega || 0,
                impliedVolatility: details.implied_volatility || 0,
                isLoadingDetails: false
              } : opt
            )
          );
          return details;
        }
      }
      console.log(`⚠️ No details found for ${ticker} ${optionType} ${strike}`);
      setOptions(prevOptions => 
        prevOptions.map(opt => 
          opt.id === optionId ? { ...opt, isLoadingDetails: false } : opt
        )
      );
      return null;
    } catch (error) {
      console.error(`❌ Error loading option details:`, error);
      setOptions(prevOptions => 
        prevOptions.map(opt => 
          opt.id === optionId ? { ...opt, isLoadingDetails: false } : opt
        )
      );
      return null;
    }
  };
  
  // Функция загрузки дат экспирации
  const loadExpirationDates = async (ticker) => {
    setIsLoadingDates(true);
    try {
      // Проверяем кэш
      const cacheKey = `expirations_${ticker}`;
      const cachedDates = cacheManager.get(cacheKey, cacheTTLMinutes);
      
      if (cachedDates) {
        console.log(`Using cached expiration dates for ${ticker}`);
        setExpirationDates(cachedDates);
        setIsLoadingDates(false);
        return;
      }
      
      const datesResponse = await fetch(`/api/polygon/ticker/${ticker}/expirations`);
      if (datesResponse.ok) {
        const datesData = await datesResponse.json();
        if (datesData.status === 'success' && datesData.dates && datesData.dates.length > 0) {
          const grouped = {};
          const currentYear = new Date().getFullYear();
          
          datesData.dates.forEach(dateStr => {
            const date = new Date(dateStr + 'T00:00:00');
            const monthName = date.toLocaleDateString('en-US', { month: 'short' });
            const year = date.getFullYear();
            const year2digit = date.toLocaleDateString('en-US', { year: '2-digit' });
            
            // Добавляем год к месяцу, если это не текущий год
            const monthKey = year !== currentYear 
              ? `${monthName} '${year2digit}` 
              : monthName;
            
            const day = date.getDate();
            if (!grouped[monthKey]) {
              grouped[monthKey] = [];
            }
            grouped[monthKey].push({
              date: dateStr,
              day: day,
              displayDate: day.toString()
            });
          });
          // Сохраняем в кэш
          cacheManager.set(cacheKey, grouped);
          setExpirationDates(grouped);
        } else {
          setExpirationDates({});
        }
      } else {
        setExpirationDates({});
      }
    } catch (error) {
      console.error('❌ Error loading expiration dates:', error);
      setExpirationDates({});
    } finally {
      setIsLoadingDates(false);
    }
  };

  const handleTickerSelect = (ticker) => {
    if (ticker) {
      flushSync(() => {
        setShowDemoData(false);
        setPositions([]);
        setExpirationDates({});
        setOptions([]);
        // Сбрасываем цену сразу при смене тикера
        setCurrentPrice(0);
        setPriceChange({ value: 0, percent: 0 });
        
        // Автоматически определяем тип инструмента
        const detectedType = detectInstrumentType(ticker);
        setDealForm(prev => ({
          ...prev,
          type: detectedType
        }));
      });
      setSelectedTicker(ticker);
      setIsDataCleared(true);
    } else {
      setSelectedTicker("");
      setIsDataCleared(false);
      setShowDemoData(false);
      setExpirationDates({});
      setOptions([]);
    }
  };

  useEffect(() => {
    if (selectedTicker && isDataCleared) {
      const loadTickerData = async () => {
        try {
          const priceResponse = await fetch(`/api/polygon/ticker/${selectedTicker}`);
          if (priceResponse.ok) {
            const priceData = await priceResponse.json();
            if (priceData.price) {
              setCurrentPrice(priceData.price);
              setTargetPrice(priceData.price); // Синхронизируем targetPrice
              setPriceChange({
                value: priceData.change || 0,
                percent: priceData.changePercent || 0
              });
            }
          }
          await loadExpirationDates(selectedTicker);
          setIsDataCleared(false);
        } catch (error) {
          console.error('❌ Error loading ticker data:', error);
          setIsLoadingDates(false);
          setIsDataCleared(false);
        }
      };
      loadTickerData();
    } else {
    }
  }, [selectedTicker, isDataCleared]);

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
      daysRemaining,
      chartDisplayMode,
      showOptionLines,
      showProbabilityZones,
      strikesByDate,
      expirationDates,
    };
    localStorage.setItem('calculatorState', JSON.stringify(state));
  }, [selectedTicker, currentPrice, priceChange, options, positions, selectedExpirationDate, daysRemaining, chartDisplayMode, showOptionLines, showProbabilityZones, strikesByDate, expirationDates]);

  const resetCalculator = useCallback(() => {
    setSelectedTicker('');
    setCurrentPrice(245);
    setTargetPrice(245);
    setVolatility(25);
    setPriceChange({ value: -0.80, percent: -0.32 });
    setOptions([]);
    setPositions([]);
    setSelectedExpirationDate('2025-11-28');
    setDaysRemaining(0);
    setChartDisplayMode('profit-loss-dollar');
    setUserAdjustedDays(false);
    setIsDataCleared(false);
    setShowDemoData(false);
    setSearchValue('');
    setStrikesByDate({});
    setExpirationDates({});
    localStorage.removeItem('calculatorState');
  }, []);

  // Загружаем состояние при первой загрузке страницы
  useEffect(() => {
    if (isInitialized) return;
    
    const saved = localStorage.getItem('calculatorState');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        setSelectedTicker(state.selectedTicker || '');
        setCurrentPrice(state.currentPrice || 245);
        setPriceChange(state.priceChange || { value: -0.80, percent: -0.32 });
        setOptions(state.options || []);
        setPositions(state.positions || []);
        setSelectedExpirationDate(state.selectedExpirationDate || '2025-11-28');
        setDaysRemaining(state.daysRemaining || 0);
        setChartDisplayMode(state.chartDisplayMode || 'profit-loss-dollar');
        setStrikesByDate(state.strikesByDate || {});
        setExpirationDates(state.expirationDates || {});
        console.log('✅ Состояние калькулятора загружено из localStorage');
      } catch (error) {
        console.error('Ошибка загрузки состояния калькулятора:', error);
      }
    }
    setIsInitialized(true);
  }, [isInitialized]);

  // Сохраняем состояние при изменении (но не при первой инициализации)
  useEffect(() => {
    if (!isInitialized) return;
    saveCalculatorState();
  }, [isInitialized, saveCalculatorState]);
  
  // Автоматически устанавливаем daysRemaining в 0 (день экспирации) при изменении опционов
  // Но только если пользователь еще не взаимодействовал с бегунком
  useEffect(() => {
    if (options.length === 0) return;
    
    // Обновляем только если пользователь не трогал бегунок
    if (!userAdjustedDays) {
      setDaysRemaining(0); // Устанавливаем в 0 дней (день экспирации)
    }
    
    // Сбрасываем флаг при изменении опционов (новые опционы = новая ситуация)
    setUserAdjustedDays(false);
  }, [options.length, options.map(o => o.date).join(',')]); // Убрали daysRemaining из зависимостей
  
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

  // Автоматически загружаем страйки для всех дат в опционах (для магнитного прилипания)
  useEffect(() => {
    if (!selectedTicker || options.length === 0) return;
    
    // Собираем уникальные даты из опционов
    const uniqueDates = [...new Set(options.map(opt => opt.date).filter(Boolean))];
    
    // Загружаем страйки для каждой даты
    uniqueDates.forEach(date => {
      if (!strikesByDate[date]) {
        console.log('🔄 Автозагрузка страйков для даты:', date);
        loadStrikesForDate(selectedTicker, date);
      }
    });
  }, [options, selectedTicker, strikesByDate, loadStrikesForDate]);

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
    };
    console.log('✅ New option created:', newOption);
    setOptions(prevOptions => [...prevOptions, newOption]);
    
    // Загружаем страйки для даты (для магнитного прилипания при перетаскивании)
    if (prefilledDate && selectedTicker) {
      loadStrikesForDate(selectedTicker, prefilledDate);
    }
    
    // Загружаем детали опциона если есть все необходимые данные
    if (autoStrike && prefilledDate && selectedTicker) {
      setTimeout(() => {
        loadOptionDetails(newOption.id, selectedTicker, prefilledDate, autoStrike, type);
        console.log('🔄 Загрузка деталей нового опциона:', { 
          id: newOption.id, 
          ticker: selectedTicker, 
          date: prefilledDate, 
          strike: autoStrike, 
          type 
        });
      }, 100); // Небольшая задержка чтобы опцион успел добавиться в state
    }
  }, [selectedExpirationDate, calculateAutoStrike, selectedTicker, loadOptionDetails, loadStrikesForDate]);

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
      };
    });
    setOptions([...options, ...newOptions]);
    
    // Загружаем страйки для даты (для магнитного прилипания при перетаскивании)
    if (prefilledDate && selectedTicker) {
      loadStrikesForDate(selectedTicker, prefilledDate);
    }
    
    // Загружаем детали для всех новых опционов
    if (prefilledDate && selectedTicker) {
      setTimeout(() => {
        newOptions.forEach(opt => {
          if (opt.strike) {
            loadOptionDetails(opt.id, selectedTicker, prefilledDate, opt.strike, opt.type);
            console.log('🔄 Загрузка деталей опциона из стратегии:', { 
              id: opt.id, 
              ticker: selectedTicker, 
              date: prefilledDate, 
              strike: opt.strike, 
              type: opt.type 
            });
          }
        });
      }, 100); // Небольшая задержка чтобы опционы успели добавиться в state
    }
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
        
        // Загружаем страйки для новой даты
        if (selectedTicker && loadStrikesForDate) {
          await loadStrikesForDate(selectedTicker, newDate);
        }
        
        // Загружаем детали для всех опционов с установленным страйком
        if (selectedTicker && loadOptionDetails) {
          const optionsToUpdate = optionsWithDate.filter(opt => opt.strike);
          console.log('📅 Loading details for', optionsToUpdate.length, 'options');
          
          for (const opt of optionsToUpdate) {
            if (opt.strike) {
              await loadOptionDetails(opt.id, selectedTicker, newDate, opt.strike, opt.type);
            }
          }
        }
      }
    } else {
      console.log('📅 Multiple dates in use, not updating options');
    }
  }, [displayOptions, setOptions, selectedTicker, loadStrikesForDate, loadOptionDetails]);

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

  // State для сворачивания TradingViewWidget
  const [isTradingViewCollapsed, setIsTradingViewCollapsed] = useState(() => {
    const saved = localStorage.getItem('isTradingViewCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('isTradingViewCollapsed', JSON.stringify(isTradingViewCollapsed));
  }, [isTradingViewCollapsed]);

  const selectStrategy = (strategy) => {
    console.log("Выбрана стратегия:", strategy);
  };

  // Получение location для работы с URL параметрами
  const location = useLocation();

  // Загрузка конфигурации из URL при монтировании компонента
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const configId = searchParams.get('config');
    
    if (configId) {
      loadConfiguration(configId);
    }
  }, [location.search]);

  // Функция загрузки конфигурации
  const loadConfiguration = async (configId) => {
    const saved = localStorage.getItem('savedCalculatorConfigurations');
    if (saved) {
      try {
        const configurations = JSON.parse(saved);
        const config = configurations.find(c => c.id === configId);
        
        if (config && config.state) {
          // Восстанавливаем состояние калькулятора
          const ticker = config.state.selectedTicker || '';
          
          // Сначала устанавливаем тикер и загружаем даты экспирации
          if (ticker) {
            setSelectedTicker(ticker);
            setCurrentPrice(config.state.currentPrice || 0);
            setPriceChange(config.state.priceChange || { value: 0, percent: 0 });
            
            // Загружаем даты экспирации для тикера
            await loadExpirationDates(ticker);
          }
          
          // Затем восстанавливаем остальное состояние
          setOptions(config.state.options || []);
          setPositions(config.state.positions || []);
          setSelectedExpirationDate(config.state.selectedExpirationDate || '');
          setDaysRemaining(config.state.daysRemaining || 0);
          setShowOptionLines(config.state.showOptionLines !== undefined ? config.state.showOptionLines : true);
          setShowProbabilityZones(config.state.showProbabilityZones !== undefined ? config.state.showProbabilityZones : true);
          setChartDisplayMode(config.state.chartDisplayMode || 'profit-loss-dollar');
          
          console.log('✅ Конфигурация загружена:', config.name);
        } else {
          console.warn('⚠️ Конфигурация не найдена:', configId);
        }
      } catch (error) {
        console.error('❌ Ошибка загрузки конфигурации:', error);
      }
    }
  };

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

  // Функция получения текущего состояния для сохранения
  const getCurrentState = () => {
    return {
      selectedTicker,
      currentPrice,
      priceChange,
      options,
      positions,
      selectedExpirationDate,
      daysRemaining,
      showOptionLines,
      showProbabilityZones,
      chartDisplayMode,
    };
  };

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ minWidth: '1600px', maxWidth: '1600px' }}>
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-start gap-2 flex-1">
              <TickerSearch
                selectedTicker={selectedTicker}
                onTickerSelect={handleTickerSelect}
                searchOpen={searchOpen}
                setSearchOpen={setSearchOpen}
                searchValue={searchValue}
                setSearchValue={setSearchValue}
                currentPrice={currentPrice}
                priceChange={priceChange}
              />
              <Select value={dealForm?.type || 'futures'} onValueChange={(value) => handleDealInputChange('type', value)}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Тип" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stocks">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      Акции
                    </div>
                  </SelectItem>
                  <SelectItem value="futures">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-blue-500" />
                      Фьючерсы
                    </div>
                  </SelectItem>
                  <SelectItem value="indices">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-purple-500" />
                      Индексы
                    </div>
                  </SelectItem>
                  <SelectItem value="options">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-orange-500" />
                      Опционы
                    </div>
                  </SelectItem>
                  <SelectItem value="crypto">
                    <div className="flex items-center gap-2">
                      <Bitcoin className="h-4 w-4 text-yellow-500" />
                      Критовалюта
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

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
                      />
                      <PositionFinancialControl
                        positions={positions}
                        options={displayOptions}
                        currentPrice={currentPrice}
                        daysRemaining={daysRemaining}
                        financialControlEnabled={financialControlEnabled}
                        depositAmount={depositAmount}
                        instrumentCount={instrumentCount}
                        maxLossPercent={maxLossPercent}
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
                        daysRemaining={daysRemaining}
                        setDaysRemaining={(value) => {
                          setDaysRemaining(value);
                          setUserAdjustedDays(true);
                        }}
                        volatility={volatility}
                        setVolatility={setVolatility}
                        options={displayOptions}
                        minPrice={currentPrice * 0.5}
                        maxPrice={currentPrice * 1.5}
                        compact={true}
                      />
                    </CardContent>
                  )}
                </Card>
              )}

              {shouldShowBlock('tradingview-widget') && (
                <Card className="overflow-hidden" style={{ borderColor: '#b8b8b8' }}>
                  <div className="flex items-center justify-between px-6 py-3 border-b border-border">
                    <h3 className="text-sm font-medium">TradingView</h3>
                    <button
                      onClick={() => setIsTradingViewCollapsed(!isTradingViewCollapsed)}
                      className="p-1 hover:bg-muted rounded transition-colors"
                      title={isTradingViewCollapsed ? 'Развернуть' : 'Свернуть'}
                    >
                      {isTradingViewCollapsed ? (
                        <ChevronDown size={20} />
                      ) : (
                        <ChevronUp size={20} />
                      )}
                    </button>
                  </div>
                  <CardContent className={`p-4 ${isTradingViewCollapsed ? 'hidden' : ''}`}>
                    <TradingViewWidget ticker={selectedTicker} isVisible={!isTradingViewCollapsed} />
                  </CardContent>
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
                    showProbabilityZones={showProbabilityZones}
                    setShowProbabilityZones={setShowProbabilityZones}
                    cacheTTLMinutes={cacheTTLMinutes}
                    onCacheTTLChange={setCacheTTLMinutes}
                  />
                </Card>
              )}

              {/* Финансовый контроль */}
              <FinancialControl selectedTicker={selectedTicker} />
            </div>

            <div className="flex-[3] space-y-6">
              {selectedTicker && (
                <Card className="w-full relative overflow-hidden border-0" style={{ height: '80px', borderColor: '#b8b8b8' }}>
                  {isLoadingDates && (
                    <>
                      <div className="absolute top-0 left-0 right-0 h-[2px] z-30 overflow-hidden">
                        <div 
                          className="h-full w-full"
                          style={{
                            background: 'linear-gradient(90deg, transparent 0%, #06b6d4 50%, transparent 100%)',
                            backgroundSize: '200% 100%',
                            animation: 'shimmer 1.5s linear infinite'
                          }}
                        />
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span 
                          className="text-sm text-muted-foreground"
                          style={{
                            animation: 'pulse 1.5s ease-in-out infinite'
                          }}
                        >
                          Загрузка дат экспирации...
                        </span>
                      </div>
                    </>
                  )}
                  <CardContent className="p-0 relative">
                    {!isLoadingDates && (
                      <ExpirationCalendar
                        groupedDates={groupedDates}
                        selectedExpirationDate={selectedExpirationDate}
                        setSelectedExpirationDate={handleExpirationDateChange}
                        scrollContainerRef={scrollContainerRef}
                        isDragging={isDragging}
                        handleMouseDown={handleMouseDown}
                        handleMouseMove={handleMouseMove}
                        handleMouseUp={handleMouseUp}
                        handleMouseLeave={handleMouseLeave}
                        usedDates={Object.keys(dateColorMap)}
                        dateColorMap={dateColorMap}
                      />
                    )}
                  </CardContent>
                </Card>
              )}

              <Card className="w-full relative" style={{ borderColor: '#b8b8b8' }}>
                <CardContent className="pt-[20px] pb-[20px] space-y-4">
                  {selectedTicker ? (
                    <OptionsTable
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
                      onResetCalculator={resetCalculator}
                      daysRemaining={daysRemaining}
                    />
                  ) : (
                    <div className="w-full h-[80px] flex items-center justify-center text-muted-foreground text-sm">
                      Введите тикер
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
                    daysRemaining={daysRemaining}
                  />
                </Card>
              )}

              <Tabs defaultValue="chart" className="w-full">
                <TabsList className="w-full grid grid-cols-2">
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
                        daysRemaining={daysRemaining}
                        showProbabilityZones={showProbabilityZones}
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
                      };
                      setOptions(prevOptions => [...prevOptions, newOption]);
                    }}
                  />
                </TabsContent>
              </Tabs>

              {/* Калькулятор выхода из позиции */}
              <ExitCalculator
                options={displayOptions}
                positions={positions}
                currentPrice={currentPrice}
                daysRemaining={daysRemaining}
                setDaysRemaining={(value) => {
                  setDaysRemaining(value);
                  setUserAdjustedDays(true);
                }}
                selectedExpirationDate={selectedExpirationDate}
                showOptionLines={showOptionLines}
                targetPrice={targetPrice}
                setTargetPrice={setTargetPrice}
                volatility={volatility}
                setVolatility={setVolatility}
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
                  className="text-right"
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
      </div>
    </div>
  );
}

export default OptionsCalculatorV3;
