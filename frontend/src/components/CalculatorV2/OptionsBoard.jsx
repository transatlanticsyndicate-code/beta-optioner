import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { RefreshCw, Filter, X, HelpCircle } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

/**
 * OptionsBoard - Доска опционов (Options Chain)
 * 
 * Отображает все доступные опционы для выбранного тикера и даты экспирации
 * в формате таблицы: CALLS | STRIKE | PUTS
 */
function OptionsBoard({ 
  selectedTicker, 
  currentPrice, 
  selectedDate,
  onAddOption 
}) {
  // State для опционов
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showAllStrikes, setShowAllStrikes] = useState(false);
  
  // Ref для автопрокрутки к ATM страйку
  const atmStrikeRef = useRef(null);
  
  // State для фильтров
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    // Базовые фильтры
    moneyness: [], // ['ITM', 'ATM', 'OTM']
    volume: 'all', // 'all' | '> 100' | '> 500' | '> 1000'
    openInterest: 'all', // 'all' | '> 500' | '> 1000' | '> 5000'
    spread: 'all', // 'all' | '< 5%' | '< 10%' | '< 20%'
    
    // Расширенные фильтры
    delta: 'all', // 'all' | '0-0.3' | '0.3-0.7' | '0.7-1.0'
    impliedVol: 'all', // 'all' | '< 30%' | '30-60%' | '> 60%'
    
    // Активный пресет
    activePreset: null, // null | 'trading' | 'hedging' | 'speculation' | 'selling'
  });

  // Конвертация формата даты из "28-11" или "2025-11-28" в "YYYY-MM-DD"
  const convertDateFormat = useCallback((dateStr) => {
    if (!dateStr) return null;
    
    // Если уже в формате YYYY-MM-DD
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return dateStr;
    }
    
    // Если в формате DD-MM или DD-MM-YY
    const parts = dateStr.split('-');
    if (parts.length === 2) {
      // Формат DD-MM, добавляем текущий год
      const [day, month] = parts;
      const year = new Date().getFullYear();
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } else if (parts.length === 3) {
      // Формат DD-MM-YY
      const [day, month, year] = parts;
      const fullYear = year.length === 2 ? `20${year}` : year;
      return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    return null;
  }, []);

  // Загрузка опционов при изменении тикера или даты
  useEffect(() => {
    if (selectedTicker && selectedDate) {
      loadOptions();
    }
  }, [selectedTicker, selectedDate]);

  // Функция загрузки опционов
  const loadOptions = async () => {
    if (!selectedTicker || !selectedDate) return;
    
    const formattedDate = convertDateFormat(selectedDate);
    if (!formattedDate) {
      console.error('❌ Invalid date format:', selectedDate);
      return;
    }
    
    console.log(`🔄 Loading options for ${selectedTicker} on ${formattedDate} (original: ${selectedDate})`);
    
    setLoading(true);
    try {
      const response = await fetch(
        `/api/polygon/ticker/${selectedTicker}/options?expiration_date=${formattedDate}`
      );
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.status === 'success' && data.options) {
          setOptions(data.options);
          setLastUpdated(new Date());
          console.log(`✅ Loaded ${data.options.length} options for ${selectedDate}`);
          console.log('📦 Sample option:', data.options[0]);
          console.log('📦 Option types:', [...new Set(data.options.map(o => o.type))]);
          console.log('📦 Strike range:', Math.min(...data.options.map(o => o.strike)), '-', Math.max(...data.options.map(o => o.strike)));
        } else {
          setOptions([]);
          console.log('⚠️ No options found');
        }
      } else {
        setOptions([]);
        console.error('❌ Failed to load options');
      }
    } catch (error) {
      console.error('❌ Error loading options:', error);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  // Группировка опционов по страйкам
  const optionsByStrike = useMemo(() => {
    const grouped = {};
    
    options.forEach(option => {
      if (!grouped[option.strike]) {
        grouped[option.strike] = { calls: null, puts: null };
      }
      
      // Приводим тип к uppercase для сравнения
      const type = option.type.toUpperCase();
      
      if (type === 'CALL') {
        grouped[option.strike].calls = option;
      } else if (type === 'PUT') {
        grouped[option.strike].puts = option;
      }
    });
    
    console.log('📊 Grouped by strike:', Object.keys(grouped).length, 'strikes');
    
    return grouped;
  }, [options]);

  // Функция определения монетности
  const getMoneyness = useCallback((strike, optionType) => {
    if (!currentPrice) return null;
    
    const diff = Math.abs(strike - currentPrice) / currentPrice;
    
    if (diff <= 0.03) return 'ATM'; // ±3%
    
    // Приводим к uppercase для сравнения
    const type = optionType.toUpperCase();
    
    if (type === 'CALL') {
      return strike < currentPrice ? 'ITM' : 'OTM';
    } else {
      return strike > currentPrice ? 'ITM' : 'OTM';
    }
  }, [currentPrice]);

  // Функция расчета спреда
  const calculateSpread = useCallback((bid, ask) => {
    if (!bid || !ask || ask === 0) return null;
    return ((ask - bid) / ask) * 100;
  }, []);

  // Функция проверки фильтра по монетности
  const passesMoneynessFilter = useCallback((strike, optionType) => {
    if (filters.moneyness.length === 0) return true;
    
    const moneyness = getMoneyness(strike, optionType);
    return filters.moneyness.includes(moneyness);
  }, [filters.moneyness, getMoneyness]);

  // Функция проверки фильтра по volume
  const passesVolumeFilter = useCallback((volume) => {
    if (filters.volume === 'all') return true;
    if (!volume && volume !== 0) return true; // Если данных нет, пропускаем
    
    const threshold = parseInt(filters.volume.match(/\d+/)[0]);
    return volume > threshold;
  }, [filters.volume]);

  // Функция проверки фильтра по Open Interest
  const passesOIFilter = useCallback((oi) => {
    if (filters.openInterest === 'all') return true;
    if (!oi && oi !== 0) return true; // Если данных нет, пропускаем
    
    const threshold = parseInt(filters.openInterest.match(/\d+/)[0]);
    return oi > threshold;
  }, [filters.openInterest]);

  // Функция проверки фильтра по спреду
  const passesSpreadFilter = useCallback((bid, ask) => {
    if (filters.spread === 'all') return true;
    
    const spread = calculateSpread(bid, ask);
    if (spread === null) return true; // Если данных нет, пропускаем
    
    const threshold = parseInt(filters.spread.match(/\d+/)[0]);
    return spread < threshold;
  }, [filters.spread, calculateSpread]);

  // Функция проверки фильтра по Delta
  const passesDeltaFilter = useCallback((delta) => {
    if (filters.delta === 'all') return true;
    if (!delta && delta !== 0) return true; // Если данных нет, пропускаем
    
    const absDelta = Math.abs(delta);
    
    if (filters.delta === '0-0.3') return absDelta >= 0 && absDelta <= 0.3;
    if (filters.delta === '0.3-0.7') return absDelta > 0.3 && absDelta <= 0.7;
    if (filters.delta === '0.7-1.0') return absDelta > 0.7 && absDelta <= 1.0;
    
    return true;
  }, [filters.delta]);

  // Функция проверки фильтра по Implied Volatility
  const passesIVFilter = useCallback((iv) => {
    if (filters.impliedVol === 'all') return true;
    if (!iv && iv !== 0) return true; // Если данных нет, пропускаем
    
    const ivPercent = iv * 100;
    
    if (filters.impliedVol === '< 30%') return ivPercent < 30;
    if (filters.impliedVol === '30-60%') return ivPercent >= 30 && ivPercent <= 60;
    if (filters.impliedVol === '> 60%') return ivPercent > 60;
    
    return true;
  }, [filters.impliedVol]);

  // Функция проверки всех фильтров для опциона
  const passesAllFilters = useCallback((option, strike) => {
    if (!option) return false;
    
    // Проверка монетности
    if (!passesMoneynessFilter(strike, option.type)) return false;
    
    // Проверка volume
    if (!passesVolumeFilter(option.volume || 0)) return false;
    
    // Проверка Open Interest
    if (!passesOIFilter(option.open_interest || 0)) return false;
    
    // Проверка спреда
    if (!passesSpreadFilter(option.bid, option.ask)) return false;
    
    // Проверка Delta
    if (!passesDeltaFilter(option.delta)) return false;
    
    // Проверка Implied Volatility
    if (!passesIVFilter(option.implied_volatility)) return false;
    
    return true;
  }, [
    passesMoneynessFilter,
    passesVolumeFilter,
    passesOIFilter,
    passesSpreadFilter,
    passesDeltaFilter,
    passesIVFilter
  ]);

  // Расчет максимального volume для масштабирования столбиков
  const maxVolume = useMemo(() => {
    let max = 0;
    options.forEach(option => {
      if (option.volume && option.volume > max) {
        max = option.volume;
      }
    });
    return max;
  }, [options]);

  // Расчет максимального Open Interest для масштабирования столбиков
  const maxOI = useMemo(() => {
    let max = 0;
    options.forEach(option => {
      if (option.open_interest && option.open_interest > max) {
        max = option.open_interest;
      }
    });
    return max;
  }, [options]);

  // Фильтрация страйков
  const filteredStrikes = useMemo(() => {
    let strikes = Object.keys(optionsByStrike).map(Number).sort((a, b) => a - b);
    console.log('🔍 Total strikes before filtering:', strikes.length);
    
    // Фильтрация по диапазону ±20% (если не показываем все)
    if (!showAllStrikes && currentPrice) {
      const minStrike = currentPrice * 0.8;
      const maxStrike = currentPrice * 1.2;
      const beforeCount = strikes.length;
      strikes = strikes.filter(strike => strike >= minStrike && strike <= maxStrike);
      console.log(`🔍 After ±20% filter: ${strikes.length} (was ${beforeCount}), range: ${minStrike.toFixed(2)} - ${maxStrike.toFixed(2)}, current: ${currentPrice}`);
    }
    
    // Фильтрация по активным фильтрам
    const beforeFilterCount = strikes.length;
    strikes = strikes.filter(strike => {
      const { calls, puts } = optionsByStrike[strike];
      
      // Хотя бы один опцион (call или put) должен пройти фильтры
      const callPasses = calls && passesAllFilters(calls, strike);
      const putPasses = puts && passesAllFilters(puts, strike);
      
      return callPasses || putPasses;
    });
    console.log(`🔍 After filters: ${strikes.length} (was ${beforeFilterCount})`);
    
    return strikes;
  }, [optionsByStrike, showAllStrikes, currentPrice, passesAllFilters]);

  // Найти ближайший страйк к текущей цене (ATM)
  const closestStrike = useMemo(() => {
    if (!currentPrice || filteredStrikes.length === 0) return null;
    
    return filteredStrikes.reduce((closest, strike) => {
      const currentDiff = Math.abs(strike - currentPrice);
      const closestDiff = Math.abs(closest - currentPrice);
      return currentDiff < closestDiff ? strike : closest;
    }, filteredStrikes[0]);
  }, [filteredStrikes, currentPrice]);

  // Автопрокрутка к ATM страйку при загрузке данных
  useEffect(() => {
    if (closestStrike && atmStrikeRef.current && !loading) {
      setTimeout(() => {
        atmStrikeRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }, 100);
    }
  }, [closestStrike, loading]);

  // Применение пресета фильтров
  const applyPreset = useCallback((presetName) => {
    const presets = {
      trading: {
        moneyness: ['ATM'],
        volume: '> 1000',
        openInterest: '> 5000',
        spread: '< 5%',
        delta: 'all',
        impliedVol: 'all',
        activePreset: 'trading'
      },
      hedging: {
        moneyness: ['ITM'],
        volume: 'all',
        openInterest: '> 1000',
        spread: 'all',
        delta: '0.7-1.0',
        impliedVol: 'all',
        activePreset: 'hedging'
      },
      speculation: {
        moneyness: ['OTM'],
        volume: '> 100',
        openInterest: 'all',
        spread: '< 10%',
        delta: '0-0.3',
        impliedVol: 'all',
        activePreset: 'speculation'
      },
      selling: {
        moneyness: ['OTM'],
        volume: 'all',
        openInterest: '> 500',
        spread: 'all',
        delta: 'all',
        impliedVol: '> 60%',
        activePreset: 'selling'
      }
    };
    
    if (presets[presetName]) {
      setFilters(presets[presetName]);
    }
  }, []);

  // Сброс фильтров
  const resetFilters = useCallback(() => {
    setFilters({
      moneyness: [],
      volume: 'all',
      openInterest: 'all',
      spread: 'all',
      delta: 'all',
      impliedVol: 'all',
      activePreset: null
    });
  }, []);

  // Переключение фильтра монетности
  const toggleMoneynessFilter = useCallback((value) => {
    setFilters(prev => ({
      ...prev,
      moneyness: prev.moneyness.includes(value)
        ? prev.moneyness.filter(v => v !== value)
        : [...prev.moneyness, value],
      activePreset: null
    }));
  }, []);

  // Удаление активного фильтра (чип)
  const removeActiveFilter = useCallback((filterType, value) => {
    if (filterType === 'moneyness') {
      toggleMoneynessFilter(value);
    } else {
      setFilters(prev => ({
        ...prev,
        [filterType]: 'all',
        activePreset: null
      }));
    }
  }, [toggleMoneynessFilter]);

  // Получение активных фильтров для отображения
  const activeFilters = useMemo(() => {
    const active = [];
    
    filters.moneyness.forEach(m => active.push({ type: 'moneyness', value: m, label: m }));
    if (filters.volume !== 'all') active.push({ type: 'volume', value: filters.volume, label: `Volume ${filters.volume}` });
    if (filters.openInterest !== 'all') active.push({ type: 'openInterest', value: filters.openInterest, label: `OI ${filters.openInterest}` });
    if (filters.spread !== 'all') active.push({ type: 'spread', value: filters.spread, label: `Spread ${filters.spread}` });
    if (filters.delta !== 'all') active.push({ type: 'delta', value: filters.delta, label: `Delta ${filters.delta}` });
    if (filters.impliedVol !== 'all') active.push({ type: 'impliedVol', value: filters.impliedVol, label: `IV ${filters.impliedVol}` });
    
    return active;
  }, [filters]);

  // Форматирование числа
  const formatNumber = (num, decimals = 2) => {
    if (num === null || num === undefined) return '—';
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(decimals);
  };

  // Форматирование времени
  const formatTime = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Рендер ячейки опциона
  const renderOptionCell = (option, strike, isCall) => {
    if (!option) {
      return (
        <div className="text-center text-gray-400 py-2">—</div>
      );
    }
    
    const moneyness = getMoneyness(strike, option.type);
    const spread = calculateSpread(option.bid, option.ask);
    const passes = passesAllFilters(option, strike);
    
    // Fallback для цен: last -> close -> premium
    const lastPrice = option.last || option.close || option.premium;
    // Fallback для bid/ask: используем close если нет данных
    const bidPrice = option.bid || (option.close ? option.close * 0.98 : null);
    const askPrice = option.ask || (option.close ? option.close * 1.02 : null);
    
    // Для CALLS: LAST, BID, ASK, Δ
    // Для PUTS: Δ, ASK, BID, LAST (зеркально)
    // OI теперь отображается отдельными столбиками
    return (
      <div 
        className={`grid grid-cols-4 gap-2 px-3 py-2 text-sm ${
          !passes ? 'opacity-30' : ''
        }`}
      >
        {isCall ? (
          <>
            <div className="text-right font-medium">{formatNumber(lastPrice)}</div>
            <div className="text-right text-green-600">{formatNumber(bidPrice)}</div>
            <div className="text-right text-red-600">{formatNumber(askPrice)}</div>
            <div className="text-right">{formatNumber(option.delta, 2)}</div>
          </>
        ) : (
          <>
            <div className="text-right">{formatNumber(option.delta, 2)}</div>
            <div className="text-right text-red-600">{formatNumber(askPrice)}</div>
            <div className="text-right text-green-600">{formatNumber(bidPrice)}</div>
            <div className="text-right font-medium">{formatNumber(lastPrice)}</div>
          </>
        )}
      </div>
    );
  };

  // Рендер столбика объема (горизонтальный, как на TradingView)
  const renderVolumeBar = (volume, isCall) => {
    if (!volume && volume !== 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <span className="text-xs text-gray-400">—</span>
        </div>
      );
    }
    
    const widthPercent = maxVolume > 0 ? (volume / maxVolume) * 100 : 0;
    const bgColor = isCall ? 'bg-blue-500' : 'bg-red-500';
    const lightBgColor = isCall ? 'bg-blue-50' : 'bg-red-50';
    
    return (
      <div className="relative h-full flex items-center">
        {/* Светлый фон (полная ширина ячейки) */}
        <div className={`absolute inset-0 ${lightBgColor}`} />
        
        {/* Темный столбик (пропорциональная ширина от края) */}
        <div 
          className={`absolute ${isCall ? 'right-0' : 'left-0'} top-0 bottom-0 ${bgColor} opacity-50`}
          style={{ 
            width: `${widthPercent}%`,
            minWidth: volume > 0 ? '2px' : '0'
          }}
        />
        
        {/* Цифра объема */}
        <span className={`relative z-10 text-xs font-medium px-2 ${isCall ? 'ml-auto' : 'mr-auto'}`}>
          {formatNumber(volume, 0)}
        </span>
      </div>
    );
  };

  // Рендер столбика Open Interest (горизонтальный, как на TradingView)
  const renderOIBar = (oi, isCall) => {
    if (!oi && oi !== 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <span className="text-xs text-gray-400">—</span>
        </div>
      );
    }
    
    const widthPercent = maxOI > 0 ? (oi / maxOI) * 100 : 0;
    // Левый (CALLS): #39eda0, Правый (PUTS): #ffa8c9
    const bgColor = isCall ? '#39eda0' : '#ffa8c9';
    const lightBgColor = isCall ? '#39eda01a' : '#ffa8c91a'; // 10% opacity для светлого фона
    
    return (
      <div className="relative h-full flex items-center">
        {/* Светлый фон (полная ширина ячейки) */}
        <div 
          className="absolute inset-0"
          style={{ backgroundColor: lightBgColor }}
        />
        
        {/* Темный столбик (пропорциональная ширина от края) */}
        <div 
          className={`absolute ${isCall ? 'right-0' : 'left-0'} top-0 bottom-0`}
          style={{ 
            backgroundColor: bgColor,
            opacity: 0.5,
            width: `${widthPercent}%`,
            minWidth: oi > 0 ? '2px' : '0'
          }}
        />
        
        {/* Цифра OI */}
        <span className={`relative z-10 text-xs font-medium px-2 ${isCall ? 'ml-auto' : 'mr-auto'}`}>
          {formatNumber(oi, 0)}
        </span>
      </div>
    );
  };

  // Рендер строки страйка
  const renderStrikeRow = (strike) => {
    const { calls, puts } = optionsByStrike[strike];
    const isATM = currentPrice && Math.abs(strike - currentPrice) / currentPrice <= 0.03;
    const isClosest = strike === closestStrike;
    
    const callVolume = calls?.volume || 0;
    const putVolume = puts?.volume || 0;
    const callOI = calls?.open_interest || 0;
    const putOI = puts?.open_interest || 0;
    
    return (
      <div 
        key={strike}
        ref={isClosest ? atmStrikeRef : null}
        className={`grid grid-cols-[1fr_65px_65px_auto_65px_65px_1fr] border-b border-gray-200 dark:border-gray-700 transition-colors ${
          isClosest 
            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-l-yellow-500' 
            : isATM 
              ? 'bg-blue-50 dark:bg-blue-900/20' 
              : ''
        }`}
      >
        {/* CALLS (левая часть) */}
        <div className="border-r border-gray-200 dark:border-gray-700">
          {renderOptionCell(calls, strike, true)}
        </div>
        
        {/* Столбик объема CALLS */}
        <div className="border-r border-gray-200 dark:border-gray-700 py-2">
          {renderVolumeBar(callVolume, true)}
        </div>
        
        {/* Столбик OI CALLS */}
        <div className="border-r border-gray-200 dark:border-gray-700 py-2">
          {renderOIBar(callOI, true)}
        </div>
        
        {/* STRIKE (центр) */}
        <div className={`flex items-center justify-center px-2 py-2 w-[60px] ${
          isClosest 
            ? 'bg-yellow-100 dark:bg-yellow-900/40' 
            : 'bg-gray-100 dark:bg-gray-800'
        }`}>
          <span className={`font-bold text-sm ${
            isClosest 
              ? 'text-yellow-700 dark:text-yellow-400' 
              : isATM 
                ? 'text-blue-600 dark:text-blue-400' 
                : ''
          }`}>
            {strike}
          </span>
        </div>
        
        {/* Столбик OI PUTS */}
        <div className="border-l border-gray-200 dark:border-gray-700 py-2">
          {renderOIBar(putOI, false)}
        </div>
        
        {/* Столбик объема PUTS */}
        <div className="border-l border-gray-200 dark:border-gray-700 py-2">
          {renderVolumeBar(putVolume, false)}
        </div>
        
        {/* PUTS (правая часть) */}
        <div className="border-l border-gray-200 dark:border-gray-700">
          {renderOptionCell(puts, strike, false)}
        </div>
      </div>
    );
  };

  // Debug: логирование props
  useEffect(() => {
    console.log('📊 OptionsBoard props:', {
      selectedTicker,
      selectedDate,
      currentPrice,
      hasOnAddOption: !!onAddOption
    });
  }, [selectedTicker, selectedDate, currentPrice, onAddOption]);

  if (!selectedTicker || !selectedDate) {
    return (
      <Card className="w-full">
        <CardContent className="pt-4 pb-4 px-6">
          <div className="flex items-center justify-center h-[400px]">
            <div className="text-center">
              <p className="text-lg text-muted-foreground mb-2">
                Выберите тикер и дату экспирации
              </p>
              <p className="text-sm text-gray-500">
                Тикер: {selectedTicker || 'не выбран'} | Дата: {selectedDate || 'не выбрана'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="pt-4 pb-4 px-6">
        {/* Шапка доски */}
        <div className="mb-4 space-y-3">
          {/* Первая строка: заголовок и кнопки */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Options Chain</h3>
              <p className="text-sm text-muted-foreground">
                {selectedTicker} • {selectedDate}
                {currentPrice && (
                  <span className="ml-2">
                    Current: ${currentPrice.toFixed(2)}
                  </span>
                )}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllStrikes(!showAllStrikes)}
              >
                {showAllStrikes ? '±20%' : 'Показать все'}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={loadOptions}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFiltersOpen(!filtersOpen)}
                className={activeFilters.length > 0 ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
              >
                <Filter className="h-4 w-4 mr-1" />
                Фильтры {activeFilters.length > 0 && `(${activeFilters.length})`}
              </Button>
            </div>
          </div>
          
          {/* Вторая строка: пресеты */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Быстрые фильтры:</span>
            <Button
              variant={filters.activePreset === 'trading' ? 'default' : 'outline'}
              size="sm"
              onClick={() => applyPreset('trading')}
              className="h-7"
            >
              Активная торговля
            </Button>
            <Button
              variant={filters.activePreset === 'hedging' ? 'default' : 'outline'}
              size="sm"
              onClick={() => applyPreset('hedging')}
              className="h-7"
            >
              Хеджирование
            </Button>
            <Button
              variant={filters.activePreset === 'speculation' ? 'default' : 'outline'}
              size="sm"
              onClick={() => applyPreset('speculation')}
              className="h-7"
            >
              Спекуляция
            </Button>
            <Button
              variant={filters.activePreset === 'selling' ? 'default' : 'outline'}
              size="sm"
              onClick={() => applyPreset('selling')}
              className="h-7"
            >
              Продажа премии
            </Button>
            {activeFilters.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-7 text-red-600"
              >
                Сбросить
              </Button>
            )}
          </div>
          
          {/* Третья строка: активные фильтры */}
          {activeFilters.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Активные:</span>
              {activeFilters.map((filter, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-xs"
                >
                  {filter.label}
                  <button
                    onClick={() => removeActiveFilter(filter.type, filter.value)}
                    className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Панель фильтров (выдвижная) */}
          {filtersOpen && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50 space-y-4">
              {/* Монетность */}
              <div>
                <label className="text-sm font-medium mb-2 block">Монетность:</label>
                <div className="flex gap-2">
                  {['ITM', 'ATM', 'OTM'].map(m => (
                    <Button
                      key={m}
                      variant={filters.moneyness.includes(m) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleMoneynessFilter(m)}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
              </div>
              
              {/* Volume */}
              <div>
                <label className="text-sm font-medium mb-2 block">Volume:</label>
                <div className="flex gap-2">
                  {['all', '> 100', '> 500', '> 1000'].map(v => (
                    <Button
                      key={v}
                      variant={filters.volume === v ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilters(prev => ({ ...prev, volume: v, activePreset: null }))}
                    >
                      {v === 'all' ? 'Все' : v}
                    </Button>
                  ))}
                </div>
              </div>
              
              {/* Open Interest */}
              <div>
                <label className="text-sm font-medium mb-2 block">Open Interest:</label>
                <div className="flex gap-2">
                  {['all', '> 500', '> 1000', '> 5000'].map(v => (
                    <Button
                      key={v}
                      variant={filters.openInterest === v ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilters(prev => ({ ...prev, openInterest: v, activePreset: null }))}
                    >
                      {v === 'all' ? 'Все' : v}
                    </Button>
                  ))}
                </div>
              </div>
              
              {/* Bid-Ask Spread */}
              <div>
                <label className="text-sm font-medium mb-2 block">Bid-Ask Spread:</label>
                <div className="flex gap-2">
                  {['all', '< 5%', '< 10%', '< 20%'].map(v => (
                    <Button
                      key={v}
                      variant={filters.spread === v ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilters(prev => ({ ...prev, spread: v, activePreset: null }))}
                    >
                      {v === 'all' ? 'Все' : v}
                    </Button>
                  ))}
                </div>
              </div>
              
              {/* Delta */}
              <div>
                <label className="text-sm font-medium mb-2 block">Delta:</label>
                <div className="flex gap-2">
                  {['all', '0-0.3', '0.3-0.7', '0.7-1.0'].map(v => (
                    <Button
                      key={v}
                      variant={filters.delta === v ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilters(prev => ({ ...prev, delta: v, activePreset: null }))}
                    >
                      {v === 'all' ? 'Все' : v}
                    </Button>
                  ))}
                </div>
              </div>
              
              {/* Implied Volatility */}
              <div>
                <label className="text-sm font-medium mb-2 block">Implied Volatility:</label>
                <div className="flex gap-2">
                  {['all', '< 30%', '30-60%', '> 60%'].map(v => (
                    <Button
                      key={v}
                      variant={filters.impliedVol === v ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilters(prev => ({ ...prev, impliedVol: v, activePreset: null }))}
                    >
                      {v === 'all' ? 'Все' : v}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {/* Информация о фильтрации */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div>
              Показано страйков: {filteredStrikes.length} из {Object.keys(optionsByStrike).length}
            </div>
            {lastUpdated && (
              <div>
                Обновлено: {formatTime(lastUpdated)}
              </div>
            )}
          </div>
        </div>
        
        {/* Таблица опционов */}
        {loading ? (
          <div className="flex items-center justify-center h-[400px]">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-600" />
              <p className="text-muted-foreground">Загрузка опционов...</p>
            </div>
          </div>
        ) : filteredStrikes.length === 0 ? (
          <div className="flex items-center justify-center h-[400px]">
            <p className="text-lg text-muted-foreground">
              Нет опционов для отображения
            </p>
          </div>
        ) : (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {/* Заголовок таблицы */}
            <TooltipProvider>
              <div className="grid grid-cols-[1fr_65px_65px_auto_65px_65px_1fr] bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                {/* CALLS Header */}
                <div className="grid grid-cols-4 gap-2 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-right cursor-help flex items-center justify-end gap-1">
                        <span>LAST</span>
                        <HelpCircle className="h-3 w-3 text-gray-400 hover:text-gray-600" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-sm">Цена (премия) крайнего опциона на этом страйке. Как правило средняя между BID и ASK.</p>
                    </TooltipContent>
                  </Tooltip>
                  <div className="text-right">BID</div>
                  <div className="text-right">ASK</div>
                  <div className="text-right">Δ</div>
                </div>
                
                {/* Volume Bar Header (CALLS) */}
                <div className="flex items-center justify-center px-2 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 cursor-help">
                        <span className="text-blue-600 dark:text-blue-400">VOL</span>
                        <HelpCircle className="h-3 w-3 text-gray-400 hover:text-gray-600" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-sm">Количество сделок, совершённых сегодня (за текущую торговую сессию) по данному страйку.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                
                {/* OI Bar Header (CALLS) */}
                <div className="flex items-center justify-center px-2 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 cursor-help">
                        <span className="text-green-600 dark:text-green-400">OI</span>
                        <HelpCircle className="h-3 w-3 text-gray-400 hover:text-gray-600" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-sm">Количество всех действующих (не закрытых) контрактов по данному страйку — т.е. сколько контрактов остаётся «в игре» с предыдущих дней.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                
                {/* STRIKE Header */}
                <div className="flex items-center justify-center px-2 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 w-[60px]">
                  STRIKE
                </div>
                
                {/* OI Bar Header (PUTS) */}
                <div className="flex items-center justify-center px-2 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 cursor-help">
                        <span className="text-orange-600 dark:text-orange-400">OI</span>
                        <HelpCircle className="h-3 w-3 text-gray-400 hover:text-gray-600" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-sm">Количество всех действующих (не закрытых) контрактов по данному страйку — т.е. сколько контрактов остаётся «в игре» с предыдущих дней.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                
                {/* Volume Bar Header (PUTS) */}
                <div className="flex items-center justify-center px-2 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 cursor-help">
                        <span className="text-red-600 dark:text-red-400">VOL</span>
                        <HelpCircle className="h-3 w-3 text-gray-400 hover:text-gray-600" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-sm">Количество сделок, совершённых сегодня (за текущую торговую сессию) по данному страйку.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                
                {/* PUTS Header */}
                <div className="grid grid-cols-4 gap-2 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700">
                  <div className="text-right">Δ</div>
                  <div className="text-right">ASK</div>
                  <div className="text-right">BID</div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-right cursor-help flex items-center justify-end gap-1">
                        <span>LAST</span>
                        <HelpCircle className="h-3 w-3 text-gray-400 hover:text-gray-600" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-sm">Цена (премия) крайнего опциона на этом страйке. Как правило средняя между BID и ASK.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </TooltipProvider>
            
            {/* Строки страйков */}
            <div className="max-h-[600px] overflow-y-auto">
              {filteredStrikes.map(renderStrikeRow)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default OptionsBoard;
