/**
 * Компонент табов "Калькулятор" / "Сделка"
 * ЗАЧЕМ: Разделяет функционал калькулятора опционов и управления сделками
 * Затрагивает: UniversalOptionsCalculator, OptionsMetrics, PLChart, OptionSelectionResult, ExitCalculator
 */

import React, { useState, useMemo } from 'react';
import { Calculator, FileText } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import { Card, CardContent } from '../../ui/card';

// Импорт компонентов калькулятора
import OptionsMetrics from '../OptionsMetrics';
import PLChart from '../PLChart';
import OptionSelectionResult from '../OptionSelectionResult';
import ExitCalculator from '../ExitCalculator';

// Импорт функций для расчёта цены опциона
import { calculateOptionTheoreticalPrice as calculateStockOptionTheoreticalPrice } from '../../../utils/optionPricing';
import { calculateFuturesOptionTheoreticalPrice } from '../../../utils/futuresPricing'; // FIX: Explicit import for futures pricing
import { getOptionVolatility } from '../../../utils/volatilitySurface';
import { calculateDaysRemainingUTC, getOldestEntryDate } from '../../../utils/dateUtils';
import { CALCULATOR_MODES } from '../../../utils/universalPricing';
import { sendSlicesToTradingViewCommand, sendClearSlicesCommand } from '../../../hooks/useExtensionData';

/**
 * CalculatorDealTabs — контейнер с двумя табами под таблицей опционов
 * @param {Object} props — все пропсы для дочерних компонентов
 */
function CalculatorDealTabs({
  // Общие пропсы
  options,
  positions,
  currentPrice,
  selectedTicker,
  daysPassed,
  setDaysPassed,
  targetPrice,
  setTargetPrice,
  ivSurface,
  dividendYield,
  calculatorMode,
  contractMultiplier,
  stockClassification,
  
  // Пропсы для OptionsMetrics
  shouldShowBlock,
  isFuturesMissingSettings,
  isAIEnabled,
  aiVolatilityMap,
  fetchAIVolatility,
  
  // Пропсы для PLChart
  showOptionLines,
  showProbabilityZones,
  
  // Пропсы для OptionSelectionResult
  optionSelectionParams,
  
  // Пропсы для ExitCalculator
  selectedExpirationDate,
  savedConfigDate,
  setUserAdjustedDays,
  
  // Пропсы для управления табами извне
  activeTab: externalActiveTab,
  onTabChange,
  
  // Информация о сделке
  dealInfo,
  dealSettings,
  setDealSettings,
}) {
  // Активный таб: 'calculator' или 'deal'
  // ЗАЧЕМ: Поддержка управления табом как изнутри, так и извне (при создании сделки)
  const [internalActiveTab, setInternalActiveTab] = useState('calculator');
  
  // State для целевой цены актива в %
  // ЗАЧЕМ: Позволяет задать целевую цену актива относительно текущей цены
  const [targetAssetPricePercent, setTargetAssetPricePercent] = useState(60);
  
  // State для количества шагов выхода
  // ЗАЧЕМ: Позволяет настроить количество шагов в плане выхода
  const [exitStepsCount, setExitStepsCount] = useState(4);
  
  // State для инпута долларов (локальный, чтобы избежать прыгающих значений при вводе)
  // ЗАЧЕМ: При вводе в инпут значение не должно пересчитываться до потери фокуса
  const [dollarsInputValue, setDollarsInputValue] = useState('');
  const [isDollarsInputFocused, setIsDollarsInputFocused] = useState(false);
  
  // State для отслеживания отправки срезок
  // ЗАЧЕМ: После отправки показываем кнопку перехода на TradingView вместо кнопки отправки
  const [slicesSent, setSlicesSent] = useState(false);
  
  // State для сохранения замороженного плана выхода
  // ЗАЧЕМ: После отправки срезок план выхода не должен пересчитываться
  const [frozenExitPlan, setFrozenExitPlan] = useState(null);
  
  // State для сохранения ссылки на график TradingView
  // ЗАЧЕМ: Используется в кнопке "Перейти на график TradingView"
  const [tradingViewUrl, setTradingViewUrl] = useState(null);
  
  // Ref для хранения последнего обработанного dealSettings
  // ЗАЧЕМ: Избежать повторной обработки того же объекта dealSettings
  const lastProcessedSettingsRef = React.useRef(null);
  
  // Ref для отслеживания процесса восстановления
  // ЗАЧЕМ: Предотвратить сохранение dealSettings во время восстановления
  const isRestoringState = React.useRef(false);
  
  // Восстанавливаем состояние отправки срезок из dealSettings при загрузке позиции
  // ЗАЧЕМ: При открытии сохраненной позиции нужно показать правильные кнопки
  React.useEffect(() => {
    // Восстанавливаем только если dealSettings изменился (новый объект)
    if (dealSettings && dealSettings !== lastProcessedSettingsRef.current) {
      isRestoringState.current = true;
      
      if (dealSettings.slicesSent !== undefined) {
        setSlicesSent(dealSettings.slicesSent);
      }
      if (dealSettings.tradingViewUrl !== undefined) {
        setTradingViewUrl(dealSettings.tradingViewUrl);
      }
      if (dealSettings.frozenExitPlan !== undefined) {
        setFrozenExitPlan(dealSettings.frozenExitPlan);
      }
      
      console.log('📊 Состояние срезок восстановлено из dealSettings:', {
        slicesSent: dealSettings.slicesSent,
        tradingViewUrl: dealSettings.tradingViewUrl
      });
      
      lastProcessedSettingsRef.current = dealSettings;
      
      // Сбрасываем флаг восстановления после завершения
      setTimeout(() => {
        isRestoringState.current = false;
      }, 50);
    }
  }, [dealSettings]);
  
  // Динамический расчёт количества опционов из текущего состояния
  // ЗАЧЕМ: При изменении quantity в таблице опционов — сделка автоматически обновляется
  const currentOptionsCount = useMemo(() => {
    const visibleOptions = options.filter(opt => opt.visible !== false);
    return visibleOptions.reduce((sum, opt) => sum + Math.abs(opt.quantity || 1), 0);
  }, [options]);
  
  // Эффективное количество шагов (не больше количества опционов)
  // ЗАЧЕМ: Если опционов меньше чем шагов — уменьшаем шаги до количества опционов
  const effectiveStepsCount = useMemo(() => {
    if (currentOptionsCount <= 0) return exitStepsCount;
    return Math.min(exitStepsCount, currentOptionsCount);
  }, [exitStepsCount, currentOptionsCount]);
  
  // Целевая цена актива в долларах (рассчитывается из текущей цены + проценты)
  // ЗАЧЕМ: currentPrice + (currentPrice * targetAssetPricePercent / 100)
  const targetAssetPriceDollars = useMemo(() => {
    if (currentPrice === 0) return 0;
    return Math.round(currentPrice * (1 + targetAssetPricePercent / 100) * 100) / 100;
  }, [currentPrice, targetAssetPricePercent]);
  
  // Расчёт плана выхода
  // ЗАЧЕМ: Равномерно распределяем количество опционов на N шагов выхода
  // Остаток распределяется по первым шагам (7 при 4 шагах → 2,2,2,1)
  // Цена опциона рассчитывается линейно от цены входа до целевой цены закрытия
  const exitPlan = useMemo(() => {
    if (!dealInfo || currentOptionsCount <= 0 || effectiveStepsCount <= 0) return [];
    
    const totalOptions = currentOptionsCount;
    const steps = effectiveStepsCount;
    const baseQuantity = Math.floor(totalOptions / steps);
    const remainder = totalOptions % steps;
    
    // Получаем первый видимый опцион для расчёта цен
    const visibleOptions = options.filter(opt => opt.visible !== false);
    const firstOption = visibleOptions[0];
    
    // Цена входа опциона (ASK для Buy, BID для Sell)
    let entryPrice = 0;
    let targetClosePrice = 0;
    
    if (firstOption) {
      // Цена входа
      if (firstOption.isPremiumModified && firstOption.customPremium !== undefined) {
        entryPrice = parseFloat(firstOption.customPremium) || 0;
      } else if (firstOption.action === 'Buy') {
        entryPrice = parseFloat(firstOption.ask) || parseFloat(firstOption.premium) || 0;
      } else {
        entryPrice = parseFloat(firstOption.bid) || parseFloat(firstOption.premium) || 0;
      }
      
      // Рассчитываем целевую цену закрытия опциона при targetAssetPriceDollars
      // ЗАЧЕМ: Используем теоретическую цену опциона при целевой цене актива
      const oldestEntryDate = getOldestEntryDate(visibleOptions);
      const currentDaysToExpiration = calculateDaysRemainingUTC(firstOption, 0, 30, oldestEntryDate);
      const simulatedDaysToExpiration = calculateDaysRemainingUTC(firstOption, daysPassed, 30, oldestEntryDate);
      
      // Получаем IV для расчёта
      const optionVolatility = getOptionVolatility(
        firstOption,
        currentDaysToExpiration,
        simulatedDaysToExpiration,
        ivSurface,
        'simple'
      );
      
      // Рассчитываем теоретическую цену опциона при целевой цене актива
      const tempOption = {
        ...firstOption,
        premium: firstOption.isPremiumModified ? firstOption.customPremium : firstOption.premium,
      };
      
      if (calculatorMode === CALCULATOR_MODES.FUTURES) {
        targetClosePrice = calculateFuturesOptionTheoreticalPrice(
          tempOption,
          targetAssetPriceDollars,
          simulatedDaysToExpiration,
          optionVolatility
        );
      } else {
        targetClosePrice = calculateStockOptionTheoreticalPrice(
          tempOption,
          targetAssetPriceDollars,
          simulatedDaysToExpiration,
          optionVolatility,
          dividendYield
        );
      }
    }
    
    // Сдвиг цены для каждого шага
    const priceStep = steps > 0 ? (targetClosePrice - entryPrice) / steps : 0;
    
    // Остаток распределяется по первым шагам
    // Пример: 7 опционов → baseQuantity=1, remainder=3 → 2,2,2,1
    const plan = [];
    let accumulatedProfit = 0;
    
    for (let i = 1; i <= steps; i++) {
      // Первые remainder шагов получают +1
      const quantity = i <= remainder 
        ? baseQuantity + 1
        : baseQuantity;
      
      // Цена опциона на этом шаге (линейная интерполяция)
      const optionPrice = entryPrice + priceStep * i;
      
      // Прибыль на этом шаге = (цена выхода - цена входа) * количество * множитель
      const stepProfit = (optionPrice - entryPrice) * quantity * contractMultiplier;
      accumulatedProfit += stepProfit;
      
      plan.push({
        step: i,
        quantity: quantity,
        optionPrice: Math.round(optionPrice * 100) / 100,
        profit: Math.round(stepProfit),
        accumulated: Math.round(accumulatedProfit)
      });
    }
    
    return plan;
  }, [dealInfo, effectiveStepsCount, currentOptionsCount, options, targetAssetPriceDollars, daysPassed, ivSurface, dividendYield, contractMultiplier]);
  
  // Сохраняем настройки таба Сделка при изменении
  // ЗАЧЕМ: Передать настройки в диалог сохранения позиции
  React.useEffect(() => {
    // Не сохраняем во время восстановления состояния
    if (isRestoringState.current) return;
    
    if (dealInfo && setDealSettings) {
      setDealSettings({
        targetAssetPricePercent,
        exitStepsCount,
        exitPlan,
        slicesSent,
        tradingViewUrl,
        frozenExitPlan,
      });
    }
  }, [dealInfo, targetAssetPricePercent, exitStepsCount, exitPlan, slicesSent, tradingViewUrl, frozenExitPlan, setDealSettings]);

  // Обработчик изменения процентов
  // ЗАЧЕМ: При изменении % — обновляем targetPrice в блоке симуляции
  const handlePercentChange = (value) => {
    const percent = Number(value) || 0;
    setTargetAssetPricePercent(percent);
    
    // Синхронизируем с блоком симуляции
    if (setTargetPrice && currentPrice > 0) {
      const newTargetPrice = Math.round(currentPrice * (1 + percent / 100) * 100) / 100;
      setTargetPrice(newTargetPrice);
    }
  };
  
  // Обработчик изменения долларов (только локальный state при вводе)
  // ЗАЧЕМ: Избегаем прыгающих значений — пересчёт происходит только при потере фокуса
  const handleDollarsInputChange = (value) => {
    setDollarsInputValue(value);
  };
  
  // Обработчик фокуса на инпуте долларов
  const handleDollarsFocus = () => {
    setIsDollarsInputFocused(true);
    // При фокусе устанавливаем текущее значение в инпут
    setDollarsInputValue(targetAssetPriceDollars.toString());
  };
  
  // Обработчик потери фокуса — пересчитываем проценты
  const handleDollarsBlur = () => {
    setIsDollarsInputFocused(false);
    const dollars = Number(dollarsInputValue) || 0;
    if (currentPrice > 0 && dollars > 0) {
      // percent = ((dollars - currentPrice) / currentPrice) * 100
      // Округляем до 2 знаков после запятой для точности
      const percent = Math.round(((dollars - currentPrice) / currentPrice) * 10000) / 100;
      setTargetAssetPricePercent(percent);
      
      // Синхронизируем с блоком симуляции
      if (setTargetPrice) {
        setTargetPrice(dollars);
      }
    }
  };
  
  // Обработчик Enter в инпуте долларов
  const handleDollarsKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur(); // Триггерим blur для применения значения
    }
  };
  
  // Генерация ссылки на график TradingView для опциона
  // ЗАЧЕМ: Формирует URL для просмотра графика опциона на TradingView
  // Формат: https://www.tradingview.com/chart/?symbol=OPRA:MSFT260220C430.0
  const generateTradingViewLink = () => {
    if (!dealInfo || !options || options.length === 0) {
      return null;
    }
    
    // Получаем первый видимый опцион
    const visibleOptions = options.filter(opt => opt.visible !== false);
    if (visibleOptions.length === 0) return null;
    
    const firstOption = visibleOptions[0];
    
    // Тикер базового актива
    const ticker = dealInfo.ticker || selectedTicker || '';
    
    // Дата экспирации в формате YYMMDD
    const expirationDate = new Date(firstOption.date);
    const year = String(expirationDate.getFullYear()).slice(-2);
    const month = String(expirationDate.getMonth() + 1).padStart(2, '0');
    const day = String(expirationDate.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    
    // Тип опциона (C или P)
    const optionType = firstOption.type === 'CALL' ? 'C' : 'P';
    
    // Страйк (если не дробный, добавляем .0)
    const strike = firstOption.strike;
    const strikeStr = Number.isInteger(strike) ? `${strike}.0` : String(strike);
    
    // Формируем ссылку
    const symbol = `${ticker}${dateStr}${optionType}${strikeStr}`;
    return `https://www.tradingview.com/chart/?symbol=OPRA:${symbol}`;
  };
  
  // Обработчик отправки срезок на график TradingView
  // ЗАЧЕМ: Формирует данные срезок и отправляет команду в расширение Chrome
  const handleSendSlicesToTradingView = () => {
    if (!dealInfo || exitPlan.length === 0) {
      console.warn('⚠️ Нет данных для отправки срезок');
      return;
    }

    // Генерируем ссылку на график TradingView
    const chartUrl = generateTradingViewLink();
    if (!chartUrl) {
      console.warn('⚠️ Не удалось сгенерировать ссылку на график TradingView');
      return;
    }

    // Получаем первый видимый опцион для ASK цены
    const visibleOptions = options.filter(opt => opt.visible !== false);
    const firstOption = visibleOptions[0];
    
    // Получаем ASK цену опциона из таблицы
    let askPrice = 0;
    if (firstOption) {
      if (firstOption.isPremiumModified && firstOption.customPremium !== undefined) {
        askPrice = parseFloat(firstOption.customPremium) || 0;
      } else {
        askPrice = parseFloat(firstOption.ask) || parseFloat(firstOption.premium) || 0;
      }
    }

    // Получаем дату входа из dealInfo
    const entryDate = dealInfo.createdAt ? new Date(dealInfo.createdAt) : new Date();
    const formattedDate = `${String(entryDate.getDate()).padStart(2, '0')}.${String(entryDate.getMonth() + 1).padStart(2, '0')}.${String(entryDate.getFullYear()).slice(-2)}`;

    // Формируем массив срезок для отправки
    const slices = exitPlan.map(row => {
      // Цена базового актива одинакова для всех шагов - это текущая цена актива
      const assetPrice = currentPrice;

      // Формируем текст по шаблону с ASK ценой из таблицы опционов
      const text = `Срезка ${row.step} - цена Акции ${assetPrice.toFixed(2)} - цена покупки Опциона ${askPrice.toFixed(2)} * ${row.quantity} - дата входа ${formattedDate}`;

      return {
        price: row.optionPrice,
        text: text
      };
    });

    // Отправляем команду в расширение с ссылкой на график
    sendSlicesToTradingViewCommand(slices, chartUrl);
    console.log('📊 Срезки отправлены на график TradingView:', slices);
    console.log('🔗 Ссылка на график:', chartUrl);
    
    // Сохраняем ссылку для кнопки перехода
    setTradingViewUrl(chartUrl);
    
    // Замораживаем текущий план выхода
    setFrozenExitPlan(exitPlan);
    
    // Устанавливаем флаг отправки
    setSlicesSent(true);
  };

  // Обработчик сброса плана выхода
  // ЗАЧЕМ: Удаляет срезки из расширения и разблокирует таб "Сделка"
  const handleResetExitPlan = () => {
    // Отправляем команду в расширение об удалении срезок с ссылкой на график
    sendClearSlicesCommand(tradingViewUrl);
    console.log('🗑️ Команда на удаление срезок отправлена в расширение');
    
    // Очищаем замороженный план выхода
    setFrozenExitPlan(null);
    
    // Очищаем ссылку на TradingView
    setTradingViewUrl(null);
    
    // Сбрасываем флаг отправки (разблокируем таб)
    setSlicesSent(false);
  };

  // Используем внешний таб если передан, иначе внутренний
  const activeTab = externalActiveTab !== undefined ? externalActiveTab : internalActiveTab;
  
  const handleTabChange = (value) => {
    // При переходе на таб "Сделка" устанавливаем targetPrice = targetAssetPriceDollars
    // ЗАЧЕМ: Синхронизация целевой цены актива с блоком "симуляция изменения рынка"
    if (value === 'deal' && setTargetPrice && targetAssetPriceDollars > 0) {
      setTargetPrice(targetAssetPriceDollars);
    }
    
    if (onTabChange) {
      onTabChange(value);
    } else {
      setInternalActiveTab(value);
    }
  };

  return (
    <div className="w-full space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* Заголовок с табами */}
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="calculator" className="flex items-center gap-2">
            <Calculator size={16} />
            Калькулятор
          </TabsTrigger>
          <TabsTrigger value="deal" className="flex items-center gap-2">
            <FileText size={16} />
            Сделка
          </TabsTrigger>
        </TabsList>

        {/* Таб "Калькулятор" — содержит все компоненты анализа */}
        <TabsContent value="calculator" className="space-y-6 mt-4">
          {/* Метрики опционов */}
          {shouldShowBlock('metrics-block') && !isFuturesMissingSettings && (
            <Card className="w-full relative" style={{ borderColor: '#b8b8b8' }}>
              <OptionsMetrics
                options={options}
                currentPrice={currentPrice}
                positions={positions}
                daysPassed={daysPassed}
                ivSurface={ivSurface}
                dividendYield={dividendYield}
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

          {/* График P&L */}
          <Card className="w-full relative" style={{ borderColor: '#b8b8b8' }}>
            <CardContent className="pt-4 pb-4 px-6">
              <PLChart
                options={options}
                currentPrice={currentPrice}
                positions={positions}
                showOptionLines={showOptionLines}
                daysPassed={daysPassed}
                showProbabilityZones={showProbabilityZones}
                targetPrice={targetPrice}
                ivSurface={ivSurface}
                dividendYield={dividendYield}
                isAIEnabled={isAIEnabled}
                aiVolatilityMap={aiVolatilityMap}
                fetchAIVolatility={fetchAIVolatility}
                selectedTicker={selectedTicker}
                calculatorMode={calculatorMode}
                contractMultiplier={contractMultiplier}
                stockClassification={stockClassification}
              />
            </CardContent>
          </Card>

          {/* Результат подбора опционов */}
          <OptionSelectionResult
            selectionParams={optionSelectionParams}
            options={options}
            positions={positions}
            currentPrice={currentPrice}
            ivSurface={ivSurface}
            dividendYield={dividendYield}
            targetPrice={targetPrice}
            daysPassed={daysPassed}
            calculatorMode={calculatorMode}
            contractMultiplier={contractMultiplier}
          />

          {/* Калькулятор выхода из позиции */}
          <ExitCalculator
            options={options}
            positions={positions}
            currentPrice={currentPrice}
            daysPassed={daysPassed}
            setDaysPassed={(value) => {
              setDaysPassed(value);
              if (setUserAdjustedDays) setUserAdjustedDays(true);
            }}
            selectedExpirationDate={selectedExpirationDate}
            showOptionLines={showOptionLines}
            targetPrice={targetPrice}
            setTargetPrice={setTargetPrice}
            savedConfigDate={savedConfigDate}
            ivSurface={ivSurface}
            dividendYield={dividendYield}
            isAIEnabled={isAIEnabled}
            aiVolatilityMap={aiVolatilityMap}
            fetchAIVolatility={fetchAIVolatility}
            selectedTicker={selectedTicker}
            calculatorMode={calculatorMode}
            contractMultiplier={contractMultiplier}
            stockClassification={stockClassification}
          />
        </TabsContent>

        {/* Таб "Сделка" — данные о созданной сделке */}
        <TabsContent value="deal" className="mt-4">
          {(() => {
            const isFutures = calculatorMode === CALCULATOR_MODES.FUTURES;
            const borderColor = dealInfo ? (isFutures ? '#a855f7' : '#22c55e') : '#b8b8b8';
            const bgColor = isFutures ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-green-100 dark:bg-green-900/30';
            const textColor = isFutures ? 'text-purple-700 dark:text-purple-300' : 'text-green-700 dark:text-green-300';
            const iconColor = isFutures ? 'text-purple-600' : 'text-green-600';
            const focusRingColor = isFutures ? 'focus:ring-purple-500' : 'focus:ring-green-500';
            
            return (
              <Card className="w-full relative" style={{ borderColor }}>
                {/* Кнопки в правом верхнем углу */}
                <div className="absolute right-4 flex items-center gap-2" style={{ top: '2rem' }}>
                  {!slicesSent ? (
                    // Кнопка отправки срезок (до отправки)
                    <button
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
                      onClick={handleSendSlicesToTradingView}
                    >
                      Отправить срезки на график TradingView →
                    </button>
                  ) : (
                    <>
                      {/* Кнопка перехода на TradingView (после отправки) */}
                      <a
                        href={tradingViewUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-green-100 hover:bg-green-200 rounded-md transition-colors inline-block text-center no-underline"
                        onClick={(e) => {
                          if (!tradingViewUrl) {
                            e.preventDefault();
                            console.warn('⚠️ Ссылка на график TradingView не найдена');
                          } else {
                            console.log('🔗 Переход на график TradingView:', tradingViewUrl);
                          }
                        }}
                      >
                        Перейти на график TradingView →
                      </a>
                      
                      {/* Кнопка сброса плана выхода */}
                      <button
                        className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
                        onClick={handleResetExitPlan}
                        title="Сбросить план выхода"
                      >
                        Сбросить план выхода
                      </button>
                    </>
                  )}
                </div>
                
                <CardContent className="pt-6 pb-6 px-6">
                  {dealInfo ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 ${bgColor} rounded-full flex items-center justify-center`}>
                          <FileText size={20} className={iconColor} />
                        </div>
                        <div>
                          <h3 className={`text-lg font-bold ${textColor}`}>
                            Сделка - {dealInfo.ticker} - опционов {currentOptionsCount}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Создана: {new Date(dealInfo.createdAt).toLocaleString('ru-RU')}
                          </p>
                        </div>
                      </div>
                      
                      {/* Двухколоночный layout: настройки слева (1/3), таблица справа (2/3) */}
                      <div className="border-t pt-4">
                        <div className="flex gap-6">
                          {/* Левая колонка: Настройки (1/3 ширины) */}
                          <div className="w-1/3 space-y-4">
                            <h4 className="text-sm font-semibold mb-4">НАСТРОЙКИ</h4>
                            
                            {/* Количество шагов выхода */}
                            <div className="space-y-2">
                              <label className="text-sm text-muted-foreground block">
                                Количество шагов выхода:
                              </label>
                              <input
                                type="number"
                                value={exitStepsCount}
                                onChange={(e) => setExitStepsCount(Math.max(1, Number(e.target.value) || 1))}
                                className={`w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:border-transparent ${focusRingColor} ${slicesSent ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                min="1"
                                max="20"
                                disabled={slicesSent}
                              />
                            </div>
                            
                            {/* Целевая цена актива в процентах */}
                            <div className="space-y-2">
                              <label className="text-sm text-muted-foreground block">
                                Целевая цена актива (%):
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  value={targetAssetPricePercent}
                                  onChange={(e) => handlePercentChange(e.target.value)}
                                  className={`w-full h-10 px-3 pr-8 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:border-transparent ${focusRingColor} ${slicesSent ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                  min="-100"
                                  max="1000"
                                  step="0.01"
                                  disabled={slicesSent}
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                              </div>
                            </div>
                            
                            {/* Целевая цена актива в долларах */}
                            <div className="space-y-2">
                              <label className="text-sm text-muted-foreground block">
                                Целевая цена актива ($):
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  value={isDollarsInputFocused ? dollarsInputValue : targetAssetPriceDollars}
                                  onChange={(e) => handleDollarsInputChange(e.target.value)}
                                  onFocus={handleDollarsFocus}
                                  onBlur={handleDollarsBlur}
                                  onKeyDown={handleDollarsKeyDown}
                                  className={`w-full h-10 px-3 pr-8 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:border-transparent ${focusRingColor} ${slicesSent ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                  min="0"
                                  step="0.01"
                                  disabled={slicesSent}
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Правая колонка: Таблица План выхода (2/3 ширины) */}
                          <div className="w-2/3">
                            <h4 className="text-sm font-semibold mb-4">ПЛАН ВЫХОДА</h4>
                            <div className="border rounded-lg overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-100 dark:bg-gray-800">
                                  <tr>
                                    <th className="px-3 py-2 text-left font-medium">Шаг</th>
                                    <th className="px-3 py-2 text-right font-medium">Количество</th>
                                    <th className="px-3 py-2 text-right font-medium">Цена опциона</th>
                                    <th className="px-3 py-2 text-right font-medium">Прибыль</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(slicesSent && frozenExitPlan ? frozenExitPlan : exitPlan).map((row, index) => {
                                    return (
                                      <tr key={row.step} className={index > 0 ? 'border-t' : ''}>
                                        <td className="px-3 py-2 font-medium">{row.step}</td>
                                        <td className="px-3 py-2 text-right">{row.quantity}</td>
                                        <td className="px-3 py-2 text-right">${row.optionPrice.toFixed(2)}</td>
                                        <td className="px-3 py-2 text-right text-green-600">+${row.profit.toLocaleString()}</td>
                                      </tr>
                                    );
                                  })}
                                  <tr className="border-t-2 border-gray-300 bg-gray-50 dark:bg-gray-900 font-semibold">
                                    <td className="px-3 py-2">ИТОГО</td>
                                    <td className="px-3 py-2 text-right">
                                      {(slicesSent && frozenExitPlan ? frozenExitPlan : exitPlan).reduce((sum, row) => sum + row.quantity, 0)}
                                    </td>
                                    <td className="px-3 py-2"></td>
                                    <td className="px-3 py-2 text-right text-green-600">
                                      +${(slicesSent && frozenExitPlan ? frozenExitPlan : exitPlan).reduce((sum, row) => sum + row.profit, 0).toLocaleString()}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center min-h-[200px] text-muted-foreground">
                      <FileText size={48} className="mb-4 opacity-50" />
                      <h3 className="text-lg font-medium mb-2">Сделка не создана</h3>
                      <p className="text-sm text-center max-w-md">
                        Нажмите кнопку "+ СДЕЛКА" в верхней части страницы для создания новой сделки.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default CalculatorDealTabs;
