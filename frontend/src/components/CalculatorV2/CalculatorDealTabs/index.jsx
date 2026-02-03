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
import { getOptionVolatility } from '../../../utils/volatilitySurface';
import { calculateDaysRemainingUTC, getOldestEntryDate } from '../../../utils/dateUtils';
import { CALCULATOR_MODES } from '../../../utils/universalPricing';

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
      
      targetClosePrice = calculateStockOptionTheoreticalPrice(
        tempOption,
        targetAssetPriceDollars,
        simulatedDaysToExpiration,
        optionVolatility,
        dividendYield
      );
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
    if (dealInfo && setDealSettings) {
      setDealSettings({
        targetAssetPricePercent,
        exitStepsCount,
        exitPlan,
      });
    }
  }, [dealInfo, targetAssetPricePercent, exitStepsCount, exitPlan, setDealSettings]);

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
                {/* Инпуты настроек сделки */}
                <div className="absolute top-4 right-4 flex items-center gap-4">
                  {/* Количество шагов выхода */}
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground whitespace-nowrap">
                      Шагов:
                    </label>
                    <input
                      type="number"
                      value={exitStepsCount}
                      onChange={(e) => setExitStepsCount(Math.max(1, Number(e.target.value) || 1))}
                      className={`w-14 h-8 px-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:border-transparent text-center ${focusRingColor}`}
                      min="1"
                      max="20"
                    />
                  </div>
                  
                  {/* Разделитель */}
                  <div className="h-6 w-px bg-gray-300" />
                  
                  {/* Целевая цена актива */}
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground whitespace-nowrap">
                      Целевая цена актива:
                    </label>
                    {/* Инпут в процентах (изменение от текущей цены) */}
                    <div className="relative">
                      <input
                        type="number"
                        value={targetAssetPricePercent}
                        onChange={(e) => handlePercentChange(e.target.value)}
                        className={`w-24 h-8 px-2 pr-6 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:border-transparent text-right ${focusRingColor}`}
                        min="-100"
                        max="1000"
                        step="0.01"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                    </div>
                    {/* Инпут в долларах (целевая цена актива) */}
                    <div className="relative">
                      <input
                        type="number"
                        value={isDollarsInputFocused ? dollarsInputValue : targetAssetPriceDollars}
                        onChange={(e) => handleDollarsInputChange(e.target.value)}
                        onFocus={handleDollarsFocus}
                        onBlur={handleDollarsBlur}
                        onKeyDown={handleDollarsKeyDown}
                        className={`w-28 h-8 px-2 pr-6 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:border-transparent text-right ${focusRingColor}`}
                        min="0"
                        step="0.01"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    </div>
                  </div>
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
                      
                      {/* Таблица ПЛАН ВЫХОДА */}
                      <div className="border-t pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold">ПЛАН ВЫХОДА</h4>
                          <button
                            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
                            onClick={() => {
                              // TODO: Реализовать отправку срезок на график TradingView
                              console.log('📊 Отправка срезок на TradingView:', exitPlan);
                            }}
                          >
                            Отправить срезки на график TradingView →
                          </button>
                        </div>
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
                              {exitPlan.map((row, index) => {
                                const isLastRow = index === exitPlan.length - 1;
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
                                  {exitPlan.reduce((sum, row) => sum + row.quantity, 0)}
                                </td>
                                <td className="px-3 py-2"></td>
                                <td className="px-3 py-2 text-right text-green-600">
                                  +${exitPlan.reduce((sum, row) => sum + row.profit, 0).toLocaleString()}
                                </td>
                              </tr>
                            </tbody>
                          </table>
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
