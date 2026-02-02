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
}) {
  // Активный таб: 'calculator' или 'deal'
  // ЗАЧЕМ: Поддержка управления табом как изнутри, так и извне (при создании сделки)
  const [internalActiveTab, setInternalActiveTab] = useState('calculator');
  
  // State для целевой цены актива в %
  // ЗАЧЕМ: Позволяет задать целевую цену актива относительно текущей цены
  const [targetAssetPricePercent, setTargetAssetPricePercent] = useState(50);
  
  // State для количества шагов выхода
  // ЗАЧЕМ: Позволяет настроить количество шагов в плане выхода
  const [exitStepsCount, setExitStepsCount] = useState(4);
  
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
  
  // Обработчик изменения долларов (обратная связь)
  // ЗАЧЕМ: Пересчитывает проценты из введённой целевой цены и синхронизирует с симуляцией
  const handleDollarsChange = (value) => {
    const dollars = Number(value) || 0;
    if (currentPrice > 0) {
      // percent = ((dollars - currentPrice) / currentPrice) * 100
      const percent = Math.round(((dollars - currentPrice) / currentPrice) * 100);
      setTargetAssetPricePercent(percent);
    }
    
    // Синхронизируем с блоком симуляции
    if (setTargetPrice && dollars > 0) {
      setTargetPrice(dollars);
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
          <Card className="w-full relative" style={{ borderColor: dealInfo ? '#22c55e' : '#b8b8b8' }}>
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
                  className="w-14 h-8 px-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-center"
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
                    className="w-20 h-8 px-2 pr-6 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-right"
                    min="-100"
                    max="1000"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
                {/* Инпут в долларах (целевая цена актива) */}
                <div className="relative">
                  <input
                    type="number"
                    value={targetAssetPriceDollars}
                    onChange={(e) => handleDollarsChange(e.target.value)}
                    className="w-28 h-8 px-2 pr-6 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-right"
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
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                      <FileText size={20} className="text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-green-700 dark:text-green-300">
                        Сделка - {dealInfo.ticker} - опционов {currentOptionsCount}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Создана: {new Date(dealInfo.createdAt).toLocaleString('ru-RU')}
                      </p>
                    </div>
                  </div>
                  
                  {/* Таблица ПЛАН ВЫХОДА */}
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-semibold mb-3">ПЛАН ВЫХОДА</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 dark:bg-gray-800">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Шаг</th>
                            <th className="px-3 py-2 text-right font-medium">Количество</th>
                            <th className="px-3 py-2 text-right font-medium">Цена опциона</th>
                            <th className="px-3 py-2 text-right font-medium">Прибыль</th>
                            <th className="px-3 py-2 text-right font-medium">Накопленная</th>
                          </tr>
                        </thead>
                        <tbody>
                          {exitPlan.map((row, index) => (
                            <tr key={row.step} className={index > 0 ? 'border-t' : ''}>
                              <td className="px-3 py-2 font-medium">{row.step}</td>
                              <td className="px-3 py-2 text-right">{row.quantity}</td>
                              <td className="px-3 py-2 text-right">${row.optionPrice.toFixed(2)}</td>
                              <td className="px-3 py-2 text-right text-green-600">+${row.profit.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right font-medium text-green-600">+${row.accumulated.toLocaleString()}</td>
                            </tr>
                          ))}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default CalculatorDealTabs;
