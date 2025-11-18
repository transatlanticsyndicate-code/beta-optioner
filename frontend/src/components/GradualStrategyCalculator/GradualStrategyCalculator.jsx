import React, { useState, useEffect, useCallback } from 'react';
import './GradualStrategyCalculator.css';
import {
  parseExitScheme,
  validateExitScheme,
} from '../../utils/gradualStrategyCalculations';
import OwnDataChart from './OwnDataChart';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Button } from '../ui/button';
import { RotateCcw } from 'lucide-react';
import { TickerSearch } from '../CalculatorV2';
import FinancialControl from '../CalculatorV2/FinancialControl';

// Функция форматирования денежных значений с разделением на тысячи (пробел)
const formatMoney = (value, isPrice = false) => {
  if (!value && value !== 0) return '$0';
  const num = parseFloat(value);
  // Для цен показываем 2 знака после запятой, для остального - целое число
  const decimals = isPrice ? 2 : 0;
  return '$' + num.toLocaleString('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).replace(/,/g, '.');
};

const GradualStrategyCalculator = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isDataCleared, setIsDataCleared] = useState(false);

  // State для TickerSearch
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [selectedTicker, setSelectedTicker] = useState("");
  const [tickerPrice, setTickerPrice] = useState(245);
  const [tickerPriceChange, setTickerPriceChange] = useState({ value: -0.80, percent: -0.32 });

  // State для новых полей под тикером
  const [quantity, setQuantity] = useState(1);
  const [positionDirection, setPositionDirection] = useState('LONG');
  const [marginAmount, setMarginAmount] = useState(0);
  const [availableCapitalAmount, setAvailableCapitalAmount] = useState(0);

  // State для финансового контроля (синхронизация с FinancialControl через localStorage)
  const [financialControlEnabled, setFinancialControlEnabled] = useState(() => {
    const saved = localStorage.getItem('financialControlEnabled');
    return saved ? JSON.parse(saved) : false;
  });

  // Общие параметры
  const [assetType, setAssetType] = useState('futures');
  const [ticker, setTicker] = useState('ES');
  const [pointValue, setPointValue] = useState(10);
  const [direction, setDirection] = useState('LONG');

  // Параметры ОТКРЫТИЯ
  const [entryNumContracts, setEntryNumContracts] = useState(8);
  const [currentPrice, setCurrentPrice] = useState(3500);
  const [targetEntryPrice, setTargetEntryPrice] = useState(0);
  const [availableCapital, setAvailableCapital] = useState(30000);
  
  // НОВОЕ: Логика усреднения с шириной канала
  const [entryLogic, setEntryLogic] = useState('uniform'); // 'uniform' или 'channel'
  const [channelWidth, setChannelWidth] = useState(0);
  
  // НОВОЕ: Stop-Loss для ВХОДА
  const [entryStopLossPoints, setEntryStopLossPoints] = useState(0);
  const [entryStopLossPrice, setEntryStopLossPrice] = useState(0);
  const [entryStopLossType, setEntryStopLossType] = useState('points'); // 'points' или 'price'
  const [showEntrySL, setShowEntrySL] = useState(false);

  // Вспомогательная переменная для получения текущего значения стоплосса
  const entryStopLoss = entryStopLossType === 'points' ? entryStopLossPoints : entryStopLossPrice;

  // Параметры ЗАКРЫТИЯ
  const [exitNumContracts, setExitNumContracts] = useState(8);
  const [entryPrice, setEntryPrice] = useState(3400);
  const [margin, setMargin] = useState(15440);
  const [targetProfitPercent, setTargetProfitPercent] = useState(100);
  
  // НОВОЕ: Схема выхода (групповая разгрузка)
  const [exitSchemeType, setExitSchemeType] = useState('uniform'); // 'uniform', 'by2', 'by4', 'custom'
  const [customExitScheme, setCustomExitScheme] = useState('');
  const [exitSchemeError, setExitSchemeError] = useState(null);
  
  // НОВОЕ: Stop-Loss для ВЫХОДА
  const [exitStopLoss, setExitStopLoss] = useState(0);
  const [showExitSL, setShowExitSL] = useState(false);

  // Состояние для сворачивания блока Справка
  const [isReferenceCollapsed, setIsReferenceCollapsed] = useState(() => {
    const saved = localStorage.getItem('isReferenceCollapsed');
    return saved ? JSON.parse(saved) : true; // По умолчанию свёрнут
  });


  // Функция сохранения состояния
  const saveCalculatorState = useCallback(() => {
    if (!isInitialized) return;

    const state = {
      selectedTicker,
      tickerPrice,
      tickerPriceChange,
      quantity,
      positionDirection,
      marginAmount,
      availableCapitalAmount,
      financialControlEnabled,
      assetType,
      ticker,
      pointValue,
      direction,
      entryNumContracts,
      currentPrice,
      targetEntryPrice,
      availableCapital,
      entryLogic,
      channelWidth,
      entryStopLossPoints,
      entryStopLossPrice,
      entryStopLossType,
      showEntrySL,
      exitNumContracts,
      entryPrice,
      margin,
      targetProfitPercent,
      exitSchemeType,
      customExitScheme,
      exitStopLoss,
      showExitSL,
      isReferenceCollapsed,
      searchOpen,
      searchValue,
      exitSchemeError
    };

    localStorage.setItem('gradualCalculatorState', JSON.stringify(state));
    console.log('💾 Состояние градуального калькулятора сохранено');
  }, [
    isInitialized,
    selectedTicker,
    tickerPrice,
    tickerPriceChange,
    quantity,
    positionDirection,
    marginAmount,
    availableCapitalAmount,
    financialControlEnabled,
    assetType,
    ticker,
    pointValue,
    direction,
    entryNumContracts,
    currentPrice,
    targetEntryPrice,
    availableCapital,
    entryLogic,
    channelWidth,
    entryStopLossPoints,
    entryStopLossPrice,
    entryStopLossType,
    showEntrySL,
    exitNumContracts,
    entryPrice,
    margin,
    targetProfitPercent,
    exitSchemeType,
    customExitScheme,
    exitStopLoss,
    showExitSL,
    isReferenceCollapsed,
    searchOpen,
    searchValue,
    exitSchemeError
  ]);

  // Функция сброса калькулятора
  const resetCalculator = useCallback(() => {
    setSelectedTicker('');
    setTickerPrice(245);
    setTickerPriceChange({ value: -0.80, percent: -0.32 });
    setQuantity(1);
    setPositionDirection('LONG');
    setMarginAmount(0);
    setAvailableCapitalAmount(0);
    setFinancialControlEnabled(false);
    setAssetType('futures');
    setTicker('ES');
    setPointValue(10);
    setDirection('LONG');
    setEntryNumContracts(8);
    setCurrentPrice(3500);
    setTargetEntryPrice(0);
    setAvailableCapital(30000);
    setEntryLogic('uniform');
    setChannelWidth(0);
    setEntryStopLossPoints(0);
    setEntryStopLossPrice(0);
    setEntryStopLossType('points');
    setShowEntrySL(false);
    setExitNumContracts(8);
    setEntryPrice(3400);
    setMargin(15440);
    setTargetProfitPercent(100);
    setExitSchemeType('uniform');
    setCustomExitScheme('');
    setExitStopLoss(0);
    setShowExitSL(false);
    setIsReferenceCollapsed(false);
    setSearchOpen(false);
    setSearchValue('');
    setIsDataCleared(false);
    setExitSchemeError(null);
    localStorage.removeItem('gradualCalculatorState');
  }, []);

  // Установка заголовка страницы
  useEffect(() => {
    document.title = 'Градуальный калькулятор';
  }, []);

  // Загружаем состояние при первой загрузке страницы
  useEffect(() => {
    if (isInitialized) return;
    
    const saved = localStorage.getItem('gradualCalculatorState');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        setSelectedTicker(state.selectedTicker || '');
        setTickerPrice(state.tickerPrice || 245);
        setTickerPriceChange(state.tickerPriceChange || { value: -0.80, percent: -0.32 });
        setQuantity(state.quantity || 1);
        setPositionDirection(state.positionDirection || 'LONG');
        setMarginAmount(state.marginAmount || 0);
        setAvailableCapitalAmount(state.availableCapitalAmount || 0);
        setFinancialControlEnabled(state.financialControlEnabled || false);
        setAssetType(state.assetType || 'futures');
        setTicker(state.ticker || 'ES');
        setPointValue(state.pointValue || 10);
        setDirection(state.direction || 'LONG');
        setEntryNumContracts(state.entryNumContracts || 8);
        setCurrentPrice(state.currentPrice || 3500);
        setTargetEntryPrice(state.targetEntryPrice || 0);
        setAvailableCapital(state.availableCapital || 30000);
        setEntryLogic(state.entryLogic || 'uniform');
        setChannelWidth(state.channelWidth || 0);
        setEntryStopLossPoints(state.entryStopLossPoints || 0);
        setEntryStopLossPrice(state.entryStopLossPrice || 0);
        setEntryStopLossType(state.entryStopLossType || 'points');
        setShowEntrySL(state.showEntrySL || false);
        setExitNumContracts(state.exitNumContracts || 8);
        setEntryPrice(state.entryPrice || 3400);
        setMargin(state.margin || 15440);
        setTargetProfitPercent(state.targetProfitPercent || 100);
        setExitSchemeType(state.exitSchemeType || 'uniform');
        setCustomExitScheme(state.customExitScheme || '');
        setExitStopLoss(state.exitStopLoss || 0);
        setShowExitSL(state.showExitSL || false);
        setIsReferenceCollapsed(state.isReferenceCollapsed || false);
        setSearchOpen(state.searchOpen || false);
        setSearchValue(state.searchValue || '');
        setExitSchemeError(state.exitSchemeError || null);
        console.log('✅ Состояние градуального калькулятора загружено из localStorage');
      } catch (error) {
        console.error('Ошибка загрузки состояния градуального калькулятора:', error);
      }
    }
    setIsInitialized(true);
  }, [isInitialized]);

  // Сохраняем состояние при изменении (но не при первой инициализации)
  useEffect(() => {
    if (!isInitialized) return;
    saveCalculatorState();
  }, [isInitialized, saveCalculatorState]);

  // Сохранение в localStorage при изменении
  useEffect(() => {
    localStorage.setItem('isReferenceCollapsed', JSON.stringify(isReferenceCollapsed));
  }, [isReferenceCollapsed]);

  // Функция для получения цены пункта из настроек фьючерсов
  const getPointValueFromSettings = (ticker) => {
    try {
      const saved = localStorage.getItem('futuresSettings');
      if (saved) {
        const futuresSettings = JSON.parse(saved);
        const future = futuresSettings.find(f => f.ticker === ticker);
        return future ? future.pointValue : null;
      }
    } catch (error) {
      console.error('Ошибка загрузки настроек фьючерсов:', error);
    }
    
    // Fallback на дефолтные данные
    const DEFAULT_FUTURES = [
      { id: 1, ticker: 'ES', name: 'E-mini S&P 500', pointValue: 50 },
      { id: 2, ticker: 'NQ', name: 'E-mini Nasdaq-100', pointValue: 20 },
      { id: 3, ticker: 'YM', name: 'E-mini Dow Jones', pointValue: 5 },
      { id: 4, ticker: 'GC', name: 'Gold Futures', pointValue: 100 },
      { id: 5, ticker: 'CL', name: 'Crude Oil Futures', pointValue: 1000 },
      { id: 6, ticker: 'ZC', name: 'Corn Futures', pointValue: 50 },
      { id: 7, ticker: 'ZS', name: 'Soybean Futures', pointValue: 50 },
      { id: 8, ticker: 'ZW', name: 'Wheat Futures', pointValue: 50 },
      { id: 9, ticker: 'ZO', name: 'Oat Futures', pointValue: 50 },
      { id: 10, ticker: 'ZR', name: 'Rough Rice Futures', pointValue: 100 },
      { id: 11, ticker: 'ZL', name: 'Soybean Oil Futures', pointValue: 100 },
      { id: 12, ticker: 'ZM', name: 'Soybean Meal Futures', pointValue: 100 },
      { id: 13, ticker: 'LE', name: 'Live Cattle Futures', pointValue: 400 },
      { id: 14, ticker: 'GF', name: 'Feeder Cattle Futures', pointValue: 500 },
      { id: 15, ticker: 'LH', name: 'Lean Hog Futures', pointValue: 400 },
    ];

    const future = DEFAULT_FUTURES.find(f => f.ticker === ticker);
    return future ? future.pointValue : null;
  };






  // Получаем цену пункта для проверки
  const pointValueForButton = selectedTicker ? getPointValueFromSettings(selectedTicker) : null;
  const totalMarginAmount = marginAmount * quantity;

  // Обработчик выбора тикера
  const handleTickerSelect = (ticker) => {
    setSelectedTicker(ticker);
    // Здесь можно добавить логику загрузки данных для тикера
    console.log('Выбран тикер:', ticker);
  };

  // Автоматический расчет доступного капитала из данных Финансового контроля
  useEffect(() => {
    const updateAvailableCapital = () => {
      const depositAmount = localStorage.getItem('depositAmount');
      const instrumentCount = localStorage.getItem('instrumentCount');
      
      if (depositAmount && instrumentCount) {
        const deposit = parseFloat(depositAmount);
        const instruments = parseInt(instrumentCount);
        
        if (deposit > 0 && instruments > 0) {
          const calculated = Math.round(deposit / instruments);
          setAvailableCapitalAmount(calculated);
        }
      }
    };

    // Обновляем при монтировании
    updateAvailableCapital();

    // Слушаем изменения в localStorage (для синхронизации с FinancialControl)
    const interval = setInterval(updateAvailableCapital, 100);

    return () => clearInterval(interval);
  }, []);

  // Автоматическая синхронизация financialControlEnabled из localStorage
  useEffect(() => {
    const updateFinancialControlEnabled = () => {
      const saved = localStorage.getItem('financialControlEnabled');
      setFinancialControlEnabled(saved ? JSON.parse(saved) : false);
    };

    // Обновляем при монтировании
    updateFinancialControlEnabled();

    // Слушаем изменения в localStorage (для синхронизации с FinancialControl)
    const interval = setInterval(updateFinancialControlEnabled, 100);

    return () => clearInterval(interval);
  }, []);

  // Автоматический расчет количества при изменении маржина
  useEffect(() => {
    if (marginAmount > 0 && availableCapitalAmount > 0) {
      const calculatedQuantity = Math.floor(availableCapitalAmount / marginAmount);
      setQuantity(calculatedQuantity);
    }
  }, [marginAmount, availableCapitalAmount]);

  // Валидация custom схемы выхода в реальном времени
  useEffect(() => {
    if (exitSchemeType === 'custom' && customExitScheme !== '') {
      const parsedScheme = parseExitScheme(customExitScheme);
      const validation = validateExitScheme(parsedScheme, quantity);
      
      if (!validation.isValid) {
        setExitSchemeError(validation.error);
      } else {
        setExitSchemeError(null);
      }
    } else if (exitSchemeType === 'custom' && customExitScheme === '') {
      setExitSchemeError(null);
    }
  }, [customExitScheme, exitSchemeType, quantity]);

  // Проверяем превышение маржина
  const totalMargin = marginAmount * quantity;
  const isMarginExceeded = totalMargin > availableCapitalAmount && availableCapitalAmount > 0;

  return (
    <div className="gradual-calculator">
      {/* Стандартный заголовок страницы */}
      <div className="space-y-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Градуальный калькулятор</h2>
            <p className="text-muted-foreground mt-1">Расчет градуальных стратегий входа и выхода</p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="h-8 w-8 p-0 bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={() => {
                    if (window.confirm('Вы уверены? Калькулятор будет полностью сброшен.')) {
                      resetCalculator();
                    }
                  }}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Полный сброс калькулятора</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Разметка: левая колонка 1/4, правая 3/4 */}
      <div className="flex gap-6">
        {/* Левая колонка (1/4) */}
        <div className="w-1/4 space-y-6">
          <Card 
            className={`flex-[1] ${isMarginExceeded ? 'animate-border-blink' : ''}`}
            style={{ borderColor: isMarginExceeded ? '#ef4444' : '#b8b8b8' }}
          >
            <CardContent className="pt-[20px] pb-[20px] space-y-4">
              <TickerSearch
                selectedTicker={selectedTicker}
                onTickerSelect={handleTickerSelect}
                searchOpen={searchOpen}
                setSearchOpen={setSearchOpen}
                searchValue={searchValue}
                setSearchValue={setSearchValue}
                currentPrice={tickerPrice}
                priceChange={tickerPriceChange}
              />

              {/* Строка 1: Маржин */}
              <div className="flex items-center gap-3 justify-between">
                <Label className="text-sm font-medium whitespace-nowrap">Маржин за единицу</Label>
                <Input
                  type="number"
                  value={marginAmount === 0 ? '' : marginAmount}
                  onChange={(e) => setMarginAmount(parseFloat(e.target.value) || 0)}
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className={`w-[110px] h-8 text-right text-xs ${marginAmount === 0 ? 'animate-border-blink-cyan' : ''}`}
                />
              </div>

              {/* Строка 2: Количество + LONG/SHORT */}
              <div className="flex items-center gap-3">
                <Label className="text-sm font-medium whitespace-nowrap">Количество</Label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                  className="flex-1 text-right"
                  min="0"
                />
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => setQuantity(prev => prev + 1)}
                    className="h-3 w-3 flex items-center justify-center hover:bg-muted rounded transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="18 15 12 9 6 15"></polyline>
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuantity(prev => Math.max(0, prev - 1))}
                    className="h-3 w-3 flex items-center justify-center hover:bg-muted rounded transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                </div>
                <Select value={positionDirection} onValueChange={setPositionDirection}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LONG" className="text-green-600 font-medium">LONG</SelectItem>
                    <SelectItem value="SHORT" className="text-red-600 font-medium">SHORT</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Строка 3: Цена пункта - значение */}
              <div className="flex items-center gap-3 justify-between">
                <Label className="text-sm text-gray-600 whitespace-nowrap">Цена пункта</Label>
                <span className="text-sm text-gray-600">
                  {selectedTicker ? (
                    (() => {
                      const pointValue = getPointValueFromSettings(selectedTicker);
                      return pointValue ? `$${pointValue}` : <span className="text-red-600 font-bold animate-pulse">ОТСУТСТВУЕТ</span>;
                    })()
                  ) : (
                    '—'
                  )}
                </span>
              </div>

              {/* Строка 4: Всего маржин - значение */}
              <div className="flex items-center gap-3 justify-between">
                <Label className="text-sm text-gray-600 whitespace-nowrap">Всего маржин</Label>
                <span className="text-sm text-gray-600">
                  ${(marginAmount * quantity).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                </span>
              </div>

              {/* Строка 5: Плашка лимита */}
              {availableCapitalAmount > 0 && financialControlEnabled && (
                <div className={`px-3 py-2 rounded text-center text-sm font-medium ${
                  isMarginExceeded 
                    ? 'bg-red-500 text-white' 
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {isMarginExceeded ? (
                    <>Лимит $ {availableCapitalAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} - ПРЕВЫШЕНИЕ на $ {(totalMargin - availableCapitalAmount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}</>
                  ) : (
                    <>Лимит $ {availableCapitalAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} - В РАМКАХ ЛИМИТА</>
                  )}
                </div>
              )}

              {/* Stop-Loss чекбокс в конце блока */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="entry-stop-loss"
                  checked={showEntrySL}
                  onChange={(e) => setShowEntrySL(e.target.checked)}
                  className="w-4 h-4 text-cyan-600"
                />
                <Label htmlFor="entry-stop-loss" className="text-sm font-medium cursor-pointer">
                  Рассчитать Stop-Loss
                </Label>
              </div>

              {/* Stop-Loss радиобаттоны - отображаются если чекбокс отмечен */}
              {showEntrySL && (
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="stop-loss-points"
                          name="stop-loss-type"
                          value="points"
                          checked={entryStopLossType === 'points'}
                          onChange={(e) => setEntryStopLossType(e.target.value)}
                          className="w-4 h-4 text-cyan-600"
                        />
                        <Label htmlFor="stop-loss-points" className="text-xs text-gray-500 font-normal cursor-pointer">
                          в пунктах от средней цены
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="stop-loss-price"
                          name="stop-loss-type"
                          value="price"
                          checked={entryStopLossType === 'price'}
                          onChange={(e) => setEntryStopLossType(e.target.value)}
                          className="w-4 h-4 text-cyan-600"
                        />
                        <Label htmlFor="stop-loss-price" className="text-xs text-gray-500 font-normal cursor-pointer">
                          ввод стопа
                        </Label>
                      </div>
                    </div>
                    
                    {/* Инпут справа от радиобаттонов - равняется к правому краю */}
                    <div className="flex flex-col gap-2">
                      {entryStopLossType === 'points' && (
                        <Input
                          type="number"
                          value={entryStopLossPoints === 0 ? '' : entryStopLossPoints}
                          onChange={(e) => setEntryStopLossPoints(parseFloat(e.target.value) || 0)}
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          className={`w-[100px] h-8 text-right text-xs ${entryStopLossPoints === 0 ? 'animate-border-blink-cyan' : ''}`}
                        />
                      )}
                      {entryStopLossType === 'price' && (
                        <Input
                          type="number"
                          value={entryStopLossPrice === 0 ? '' : entryStopLossPrice}
                          onChange={(e) => setEntryStopLossPrice(parseFloat(e.target.value) || 0)}
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          className={`w-[100px] h-8 text-right text-xs ${entryStopLossPrice === 0 ? 'animate-border-blink-cyan' : ''}`}
                        />
                      )}
                    </div>
                  </div>

                  {/* Проверка: стоплосс должен быть МЕНЬШЕ целевой/средней цены входа */}
                  {targetEntryPrice > 0 && entryStopLoss > 0 && (
                    <>
                      {entryStopLossType === 'points' ? (
                        (() => {
                          const referencePrice = (entryLogic === 'channel' && window.channelAveragePrice) 
                            ? window.channelAveragePrice 
                            : targetEntryPrice;
                          return referencePrice - entryStopLoss >= referencePrice && (
                            <div className="bg-red-50 border border-red-200 rounded-md p-3">
                              <div className="text-sm text-red-800">
                                ⚠️ Stop-Loss должен быть ниже {entryLogic === 'channel' ? 'средней цены' : 'целевой цены'}
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        (() => {
                          const referencePrice = (entryLogic === 'channel' && window.channelAveragePrice) 
                            ? window.channelAveragePrice 
                            : targetEntryPrice;
                          return entryStopLoss >= referencePrice && (
                            <div className="bg-red-50 border border-red-200 rounded-md p-3">
                              <div className="text-sm text-red-800">
                                ⚠️ Stop-Loss должен быть ниже {entryLogic === 'channel' ? 'средней цены' : 'целевой цены'}
                              </div>
                            </div>
                          );
                        })()
                      )}
                    </>
                  )}
                </div>
              )}

            </CardContent>
          </Card>

          {/* Блок Финансовый контроль */}
          <FinancialControl selectedTicker={selectedTicker} />

          {/* Новый блок с желтым бордером */}
          <>
            <Card className="border overflow-hidden bg-white" style={{ borderColor: '#fbbf24' }}>
              <div className="flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: '#b8b8b8' }}>
                <div className="flex items-center gap-2">
  <h3 className="text-sm font-medium">Справка</h3>
</div>
                <button
                  onClick={() => setIsReferenceCollapsed(!isReferenceCollapsed)}
                  className="p-1 hover:bg-muted rounded transition-colors"
                  title={isReferenceCollapsed ? 'Развернуть' : 'Свернуть'}
                >
                  {isReferenceCollapsed ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="18 15 12 9 6 15"></polyline>
                    </svg>
                  )}
                </button>
              </div>
              {!isReferenceCollapsed && (
              <div className="space-y-4 p-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <div className="text-sm text-yellow-800 font-medium mb-2">
                    ⚠️ Принцип градуального открытия:
                  </div>
                  <div className="text-sm text-gray-700">
                    Каждый контракт открывается по мере снижения цены через равный интервал. Это позволяет усреднить цену входа и снизить риск входа на пике.
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <div className="text-sm text-yellow-800 font-medium mb-2">
                    ⚠️ Принцип градуального закрытия:
                  </div>
                  <div className="text-sm text-gray-700">
                    Каждый контракт закрывается через равный интервал роста цены. Первый приносит наименьшую прибыль, последний - наибольшую, обеспечивая оптимальное использование тренда.
                  </div>
                </div>
              </div>
              )}
            </Card>
          </>
        </div>

        {/* Правая колонка (3/4) с двумя столбцами */}
        <div className="flex-1 flex gap-6">
          {/* Столбец 1 - Блок 2: ОТКРЫТИЕ / Усреднение входа */}
          <div className="flex-1 min-h-0 h-full">
            <div className="border rounded-lg overflow-hidden bg-white h-full flex flex-col" style={{ borderColor: '#b8b8b8' }}>
              {/* Бирюзовый заголовок */}
              <div className="px-4 py-3" style={{ 
                backgroundColor: (
                  targetEntryPrice === 0 || 
                  marginAmount === 0 ||
                  (entryLogic === 'channel' && channelWidth === 0) ||
                  (showEntrySL && entryStopLoss === 0) ||
                  (showEntrySL && entryStopLossType === 'price' && entryLogic === 'uniform' && entryStopLoss >= targetEntryPrice) ||
                  (showEntrySL && entryStopLossType === 'price' && entryLogic === 'channel' && window.channelAveragePrice && entryStopLoss >= window.channelAveragePrice)
                ) ? '#9ca3af' : 'rgb(6, 182, 212)' 
              }}>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white">ОТКРЫТИЕ / Усреднение входа</h4>
                </div>
              </div>

              {/* Контент блока */}
              <div className="px-4 py-4 space-y-4 flex-1 overflow-y-auto">
                {/* Целевая цена входа */}
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Целевая цена входа</Label>
                  <Input
                    type="number"
                    value={targetEntryPrice === 0 ? '' : targetEntryPrice}
                    onChange={(e) => setTargetEntryPrice(parseFloat(e.target.value) || 0)}
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className={`w-[100px] h-8 text-right text-xs ${targetEntryPrice === 0 ? 'animate-border-blink-cyan' : ''}`}
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-medium">Логика усреднения / стратегия входа</Label>
                  <div className="flex items-center gap-3">
                    <Select value={entryLogic} onValueChange={setEntryLogic}>
                      <SelectTrigger className="w-[250px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="uniform">Полный вход</SelectItem>
                        <SelectItem value="channel">Набор позиции</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {entryLogic === 'channel' && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-gray-500 font-normal whitespace-nowrap">Ширина канала в пунктах</Label>
                        <Input
                          type="number"
                          value={channelWidth}
                          onChange={(e) => setChannelWidth(parseFloat(e.target.value) || 0)}
                          min="0.5"
                          step="0.01"
                          className={`w-[50px] h-8 text-right text-xs ${channelWidth === 0 ? 'animate-border-blink-cyan' : ''}`}
                          onFocus={(e) => {
                            if (channelWidth === 0) {
                              e.target.value = '';
                            }
                          }}
                          onBlur={(e) => {
                            const numValue = parseFloat(e.target.value) || 0;
                            setChannelWidth(numValue);
                            e.target.value = numValue === 0 ? '' : numValue.toString();
                          }}
                          placeholder="0"
                        />
                      </div>
                    )}
                  </div>

                  {/* Информационный блок */}
                  {entryLogic === 'channel' && channelWidth > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                      <div className="text-sm text-blue-800">
                        💡 1-я покупка сразу, 2-я через {channelWidth}п, остальные через {(channelWidth * 0.5).toFixed(1)}п
                      </div>
                    </div>
                  )}

                  {/* Таблица для "Полный вход" */}
                  {targetEntryPrice > 0 && entryLogic === 'uniform' && (
                    <div className="border rounded-md overflow-hidden">
                      <h4 className="text-sm font-semibold bg-gray-50 px-3 py-2 border-b">📋 План входа</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-right font-medium text-gray-700">Количество</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-700">Цена входа</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-700">Маржин всего</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-t hover:bg-gray-50">
                              <td className="px-3 py-2 text-right">{quantity}</td>
                              <td className="px-3 py-2 text-right">{formatMoney(targetEntryPrice, true)}</td>
                              <td className="px-3 py-2 text-right font-medium">{formatMoney(marginAmount * quantity)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Таблица для "Набор позиции" */}
                  {targetEntryPrice > 0 && entryLogic === 'channel' && channelWidth > 0 && (
                    <div className="border rounded-md overflow-hidden">
                      <h4 className="text-sm font-semibold bg-gray-50 px-3 py-2 border-b">📋 План входа</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-center font-medium text-gray-700">Шаг</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-700">Количество</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-700">Цена входа</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-700">Маржин</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-700">Всего маржин</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const entries = [];
                              let totalMargin = 0;
                              let remainingContracts = quantity;
                              let stepNumber = 0;
                              let currentPrice = targetEntryPrice;
                              
                              // Логика входов с удвоением
                              // Для SHORT цены растут вверх, для LONG - падают вниз
                              const priceDirection = positionDirection === 'SHORT' ? 1 : -1;
                              
                              while (remainingContracts > 0) {
                                let contractsInStep;
                                
                                if (stepNumber === 0) {
                                  // 1-й вход: 1 контракт по целевой цене
                                  contractsInStep = 1;
                                  currentPrice = targetEntryPrice;
                                } else if (stepNumber === 1) {
                                  // 2-й вход: 1 контракт через channelWidth
                                  contractsInStep = 1;
                                  currentPrice = targetEntryPrice + (priceDirection * channelWidth);
                                } else if (stepNumber === 2) {
                                  // 3-й вход: 2 контракта через половину ширины канала
                                  contractsInStep = Math.min(2, remainingContracts);
                                  currentPrice = currentPrice + (priceDirection * channelWidth * 0.5);
                                } else {
                                  // 4-й и далее: удвоение количества контрактов
                                  const previousContracts = entries[stepNumber - 1].contracts;
                                  contractsInStep = Math.min(previousContracts * 2, remainingContracts);
                                  currentPrice = currentPrice + (priceDirection * channelWidth * 0.5);
                                }
                                
                                const margin = marginAmount * contractsInStep;
                                totalMargin += margin;
                                
                                entries.push({
                                  step: stepNumber + 1,
                                  contracts: contractsInStep,
                                  price: currentPrice,
                                  margin: margin,
                                  totalMargin: totalMargin
                                });
                                
                                remainingContracts -= contractsInStep;
                                stepNumber++;
                              }
                              
                              // Вычисляем среднюю цену позиции
                              const totalCost = entries.reduce((sum, entry) => sum + (entry.price * entry.contracts), 0);
                              const totalContracts = entries.reduce((sum, entry) => sum + entry.contracts, 0);
                              const averagePrice = totalCost / totalContracts;
                              
                              // Сохраняем среднюю цену для использования в блоке стоплосса
                              window.channelAveragePrice = averagePrice;
                              window.channelStepsCount = entries.length;
                              
                              return entries.map((entry, index) => (
                                <tr key={index} className="border-t hover:bg-gray-50">
                                  <td className="px-3 py-2 text-center">{entry.step}</td>
                                  <td className="px-3 py-2 text-right">{entry.contracts}</td>
                                  <td className="px-3 py-2 text-right">{formatMoney(entry.price, true)}</td>
                                  <td className="px-3 py-2 text-right">{formatMoney(entry.margin)}</td>
                                  <td className="px-3 py-2 text-right font-medium">{formatMoney(entry.totalMargin)}</td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Инфоблок со средней ценой для "Набор позиции" */}
                  {targetEntryPrice > 0 && entryLogic === 'channel' && channelWidth > 0 && window.channelStepsCount > 1 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                      <div className="text-sm text-blue-800">
                        📊 Средняя цена позиции: {formatMoney(window.channelAveragePrice, true)}
                      </div>
                    </div>
                  )}

                  {/* Stop-Loss значение под таблицей для "Полный вход" */}
                  {targetEntryPrice > 0 && entryLogic === 'uniform' && entryStopLoss > 0 && showEntrySL && (
                    <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                      <div className="text-sm text-orange-800">
                        🛡️ Stop-Loss: {entryStopLossType === 'points' ? formatMoney(targetEntryPrice - entryStopLoss, true) : formatMoney(entryStopLoss, true)}
                      </div>
                    </div>
                  )}

                  {/* Stop-Loss значение под таблицей для "Набор позиции" */}
                  {targetEntryPrice > 0 && entryLogic === 'channel' && channelWidth > 0 && entryStopLoss > 0 && showEntrySL && (
                    <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                      <div className="text-sm text-orange-800">
                        🛡️ Stop-Loss: {entryStopLossType === 'points' 
                          ? formatMoney((window.channelAveragePrice || targetEntryPrice) - entryStopLoss, true) 
                          : formatMoney(entryStopLoss, true)}
                      </div>
                    </div>
                  )}

                </div>

              </div>
            </div>
          </div>

          {/* Столбец 2 - ЗАКРЫТИЕ / Фиксация прибыли */}
          <div className="flex-1 min-h-0 h-full">
            <div className="border rounded-lg overflow-hidden bg-white h-full flex flex-col" style={{ borderColor: '#b8b8b8' }}>
              {/* Оранжевый заголовок */}
              <div className="px-4 py-3" style={{ backgroundColor: '#f97316' }}>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white">ЗАКРЫТИЕ / Фиксация прибыли</h4>
                </div>
              </div>

              {/* Контент блока */}
              <div className="px-4 py-4 space-y-4 flex-1 overflow-y-auto">
                {/* Целевая прибыль в % */}
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Целевая прибыль в %</Label>
                  <Input
                    type="number"
                    value={targetProfitPercent}
                    onChange={(e) => setTargetProfitPercent(parseFloat(e.target.value) || 0)}
                    min="0"
                    max="1000"
                    step="1"
                    className="w-[100px] text-right"
                  />
                </div>

                {/* Схема выхода / групповая разгрузка */}
                <div className="space-y-3">
                  <div className="font-bold text-sm">Схема выхода / групповая разгрузка</div>
                  
                  <div className="flex items-center space-x-6">
                    <Select value={exitSchemeType} onValueChange={(value) => {
                      setExitSchemeType(value);
                      setExitSchemeError(null);
                    }}>
                      <SelectTrigger className="w-[250px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="uniform">Равномерно по 1 контракту</SelectItem>
                        <SelectItem value="by2">Группами по 2 контракта</SelectItem>
                        <SelectItem value="by4">Группами по 4 контракта</SelectItem>
                        <SelectItem value="custom">Свой вариант</SelectItem>
                      </SelectContent>
                    </Select>

                    {exitSchemeType === 'custom' && (
                      <>
                        <input
                          type="text"
                          value={customExitScheme}
                          onChange={(e) => {
                            setCustomExitScheme(e.target.value);
                            setExitSchemeError(null);
                          }}
                          placeholder="2, 3, 3 или 2+3+3"
                          className={`w-[150px] text-right px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${exitSchemeError ? 'error' : ''} ${customExitScheme === '' ? 'animate-border-blink-cyan' : ''}`}
                        />
                        <Label className="text-xs text-gray-500 font-normal ml-2">Распределение по группам (например: 2, 3, 3)</Label>
                      </>
                    )}
                  </div>

                  {/* Инфоблок для custom схемы выхода */}
                  {exitSchemeType === 'custom' && (
                    <>
                      {exitSchemeError && (
                        <div className="error-message">❌ {exitSchemeError}</div>
                      )}
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                        <div className="text-sm text-blue-800">
                          💡 Сумма должна быть равна {quantity}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Таблица плана выхода */}
                  {(() => {
                    // Определяем цену входа (целевая или средняя)
                    const entryPrice = entryLogic === 'channel' && window.channelAveragePrice 
                      ? window.channelAveragePrice 
                      : targetEntryPrice;
                    
                    // Проверяем наличие всех необходимых данных
                    if (!entryPrice || entryPrice === 0 || !pointValueForButton || quantity === 0 || targetProfitPercent === 0) {
                      return null;
                    }

                    // Вычисляем целевую прибыль в долларах
                    const totalMargin = marginAmount * quantity;
                    const targetProfitDollars = totalMargin * (targetProfitPercent / 100);

                    // Определяем схему выхода (количество контрактов в каждой группе)
                    let exitGroups = [];
                    
                    if (exitSchemeType === 'uniform') {
                      // По 1 контракту
                      exitGroups = Array(quantity).fill(1);
                    } else if (exitSchemeType === 'by2') {
                      // По 2 контракта
                      const fullGroups = Math.floor(quantity / 2);
                      const remainder = quantity % 2;
                      exitGroups = Array(fullGroups).fill(2);
                      if (remainder > 0) exitGroups.push(remainder);
                    } else if (exitSchemeType === 'by4') {
                      // По 4 контракта
                      const fullGroups = Math.floor(quantity / 4);
                      const remainder = quantity % 4;
                      exitGroups = Array(fullGroups).fill(4);
                      if (remainder > 0) exitGroups.push(remainder);
                    } else if (exitSchemeType === 'custom' && customExitScheme !== '') {
                      // Пользовательская схема
                      const parsedScheme = parseExitScheme(customExitScheme);
                      const validation = validateExitScheme(parsedScheme, quantity);
                      if (validation.isValid) {
                        exitGroups = parsedScheme;
                      } else {
                        return null; // Не показываем таблицу если схема невалидна
                      }
                    } else {
                      return null;
                    }

                    // Вычисляем интервал между выходами (Δ)
                    // Формула: Δ = targetProfitDollars / (pointValue * sum(i * contracts[i]))
                    const weightedSum = exitGroups.reduce((sum, contracts, index) => {
                      return sum + (index + 1) * contracts;
                    }, 0);
                    
                    const delta = targetProfitDollars / (pointValueForButton * weightedSum);

                    // Формируем массив выходов
                    const exits = [];
                    let accumulatedProfit = 0;

                    exitGroups.forEach((contracts, index) => {
                      const stepNumber = index + 1;
                      
                      // Цена выхода (для LONG идем вверх, для SHORT - вниз)
                      const exitPrice = positionDirection === 'LONG' 
                        ? entryPrice + (stepNumber * delta)
                        : entryPrice - (stepNumber * delta);
                      
                      // Прибыль от этого шага
                      const priceDiff = positionDirection === 'LONG'
                        ? exitPrice - entryPrice
                        : entryPrice - exitPrice;
                      const stepProfit = priceDiff * pointValueForButton * contracts;
                      
                      accumulatedProfit += stepProfit;

                      exits.push({
                        step: stepNumber,
                        contracts: contracts,
                        exitPrice: exitPrice,
                        stepProfit: stepProfit,
                        accumulatedProfit: accumulatedProfit
                      });
                    });

                    // Вычисляем данные для инфоблока
                    const finalExit = exits[exits.length - 1];
                    const totalPoints = exitGroups.length * delta;
                    const finalPrice = finalExit.exitPrice;

                    return (
                      <>
                        <div className="border rounded-md overflow-hidden">
                          <h4 className="text-sm font-semibold bg-gray-50 px-3 py-2 border-b">📋 План выхода</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-center font-medium text-gray-700">Шаг</th>
                                  <th className="px-3 py-2 text-right font-medium text-gray-700">Количество</th>
                                  <th className="px-3 py-2 text-right font-medium text-gray-700">Цена выхода</th>
                                  <th className="px-3 py-2 text-right font-medium text-gray-700">Прибыль</th>
                                  <th className="px-3 py-2 text-right font-medium text-gray-700">Накопленная</th>
                                </tr>
                              </thead>
                              <tbody>
                                {exits.map((exit, index) => (
                                  <tr key={index} className="border-t hover:bg-gray-50">
                                    <td className="px-3 py-2 text-center">{exit.step}</td>
                                    <td className="px-3 py-2 text-right">{exit.contracts}</td>
                                    <td className="px-3 py-2 text-right">{formatMoney(exit.exitPrice, true)}</td>
                                    <td className="px-3 py-2 text-right text-green-600 font-medium">{formatMoney(exit.stepProfit)}</td>
                                    <td className="px-3 py-2 text-right font-medium">{formatMoney(exit.accumulatedProfit)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Инфоблок с итоговой информацией */}
                        <div className="bg-green-50 border border-green-200 rounded-md p-3">
                          <div className="text-sm text-green-800">
                            ℹ️ Расчет выхода для получения <span className="font-bold">{targetProfitPercent}%</span> прибыли в сумме <span className="font-bold">{formatMoney(targetProfitDollars)}</span>.
                            <br />
                            Интервал: <span className="font-bold">{delta.toFixed(2)}</span> пунктов. Общий рост: <span className="font-bold">{totalPoints.toFixed(2)}</span> пунктов. Финальная цена: <span className="font-bold">{formatMoney(finalPrice, true)}</span>.
                          </div>
                        </div>
                      </>
                    );
                  })()}

                </div>

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* График пользовательских данных (входы/выходы/стоп-лосс) */}
      <div className="mt-6 w-full">
        <OwnDataChart
          averagePrice={(() => {
            // Рассчитываем среднюю цену входа
            if (entryLogic === 'channel' && window.channelAveragePrice) {
              return window.channelAveragePrice;
            }
            return targetEntryPrice > 0 ? targetEntryPrice : null;
          })()}
          entryPrices={(() => {
            // entryPrices: массив цен входа (по логике калькулятора)
            const prices = [];
            if (targetEntryPrice > 0 && entryLogic === 'uniform') {
              // Для равномерного входа - все контракты по одной цене
              for (let i = 0; i < quantity; i++) prices.push(targetEntryPrice);
            } else if (targetEntryPrice > 0 && entryLogic === 'channel' && channelWidth > 0) {
              // Для набора позиции - используем ту же логику, что и в таблице
              // Для SHORT цены растут вверх, для LONG - падают вниз
              const priceDirection = positionDirection === 'SHORT' ? 1 : -1;
              let remainingContracts = quantity;
              let stepNumber = 0;
              let currentPrice = targetEntryPrice;
              const entries = [];
              
              while (remainingContracts > 0) {
                let contractsInStep;
                
                if (stepNumber === 0) {
                  // 1-й вход: 1 контракт по целевой цене
                  contractsInStep = 1;
                  currentPrice = targetEntryPrice;
                } else if (stepNumber === 1) {
                  // 2-й вход: 1 контракт через channelWidth
                  contractsInStep = 1;
                  currentPrice = targetEntryPrice + (priceDirection * channelWidth);
                } else if (stepNumber === 2) {
                  // 3-й вход: 2 контракта через половину ширины канала
                  contractsInStep = Math.min(2, remainingContracts);
                  currentPrice = currentPrice + (priceDirection * channelWidth * 0.5);
                } else {
                  // 4-й и далее: удвоение количества контрактов
                  const previousContracts = entries[stepNumber - 1].contracts;
                  contractsInStep = Math.min(previousContracts * 2, remainingContracts);
                  currentPrice = currentPrice + (priceDirection * channelWidth * 0.5);
                }
                
                entries.push({ contracts: contractsInStep, price: currentPrice });
                
                // Добавляем цены для каждого контракта в этом шаге
                for (let j = 0; j < contractsInStep; j++) {
                  prices.push(currentPrice);
                }
                
                remainingContracts -= contractsInStep;
                stepNumber++;
              }
            }
            return prices;
          })()}
          exitPrices={(() => {
            // exitPrices: массив цен выхода (по логике калькулятора)
            const prices = [];
            if (!targetEntryPrice || !quantity || !targetProfitPercent) return prices;
            // Определяем цену входа (целевая или средняя)
            const entryPriceVal = entryLogic === 'channel' && window.channelAveragePrice ? window.channelAveragePrice : targetEntryPrice;
            // Схема выхода
            let exitGroups = [];
            if (exitSchemeType === 'uniform') exitGroups = Array(quantity).fill(1);
            else if (exitSchemeType === 'by2') {
              const full = Math.floor(quantity / 2); const rem = quantity % 2;
              exitGroups = Array(full).fill(2); if (rem > 0) exitGroups.push(rem);
            } else if (exitSchemeType === 'by4') {
              const full = Math.floor(quantity / 4); const rem = quantity % 4;
              exitGroups = Array(full).fill(4); if (rem > 0) exitGroups.push(rem);
            } else if (exitSchemeType === 'custom' && customExitScheme) {
              try {
                exitGroups = parseExitScheme(customExitScheme);
              } catch { exitGroups = []; }
            }
            // Расчет цен выхода
            const totalMargin = marginAmount * quantity;
            const targetProfitDollars = totalMargin * (targetProfitPercent / 100);
            const weightedSum = exitGroups.reduce((sum, contracts, idx) => sum + (idx + 1) * contracts, 0);
            const delta = pointValueForButton && weightedSum ? targetProfitDollars / (pointValueForButton * weightedSum) : 0;
            let step = 0;
            while (step < exitGroups.length) {
              const exitPrice = positionDirection === 'LONG'
                ? entryPriceVal + ((step + 1) * delta)
                : entryPriceVal - ((step + 1) * delta);
              prices.push(exitPrice);
              step++;
            }
            return prices;
          })()}
          stopLoss={(() => {
            // Рассчитываем абсолютную цену стоп-лосса
            if (!showEntrySL || entryStopLoss <= 0) return null;
            
            // Определяем среднюю цену входа
            let avgEntryPrice = targetEntryPrice;
            if (entryLogic === 'channel' && window.channelAveragePrice) {
              avgEntryPrice = window.channelAveragePrice;
            }
            
            // Конвертируем пункты в абсолютную цену
            const stopLossPrice = positionDirection === 'LONG'
              ? avgEntryPrice - entryStopLoss
              : avgEntryPrice + entryStopLoss;
            
            return stopLossPrice;
          })()}
        />
      </div>
    </div>
  );
};

export default GradualStrategyCalculator;
