/**
 * Компонент для расчета P&L при выходе из позиции
 * ЗАЧЕМ: Симуляция различных сценариев выхода (исполнение, закрытие опционов, закрытие всего)
 * Затрагивает: расчет прибыли/убытка, симуляция цены и времени
 */

import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Calculator as CalculatorIcon, HelpCircle } from 'lucide-react';
import { Card, CardContent } from '../../ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { usePositionExitCalculator } from '../../../hooks/usePositionExitCalculator';
import ExitTimeDecayChart from '../ExitTimeDecayChart';
import PriceAndTimeSettings from '../PriceAndTimeSettings';
import { getPriceRange } from './utils/formatters';
import { ScenarioCard, LiquidityWarning } from './components';
import { CALCULATOR_MODES } from '../../../utils/universalPricing';

export function ExitCalculator({ 
  options = [], 
  positions = [], 
  currentPrice = 0,
  daysPassed = 0,
  setDaysPassed,
  selectedExpirationDate = null,
  showOptionLines = true,
  targetPrice = 0,
  setTargetPrice,
  savedConfigDate = null,
  ivSurface = null,
  dividendYield = 0,
  isAIEnabled = false,
  aiVolatilityMap = {},
  fetchAIVolatility = null,
  selectedTicker = '',
  calculatorMode = 'stocks', // Режим калькулятора: 'stocks' | 'futures'
  contractMultiplier = 100 // Множитель контракта: 100 для акций, pointValue для фьючерсов
}) {
  // State для UI
  // ЗАЧЕМ: Сохранение состояния сворачивания в localStorage
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('isExitCalculatorCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  // Сохранение состояния сворачивания
  useEffect(() => {
    localStorage.setItem('isExitCalculatorCollapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  // Диапазон цен для слайдера (±50% от текущей цены)
  const { minPrice, maxPrice } = getPriceRange(currentPrice);

  // Расчет P&L через хук
  // ЗАЧЕМ: Использование IV Surface для точной интерполяции волатильности
  const { plExercise, plCloseOptions, plCloseAll, details, liquidityWarnings } = usePositionExitCalculator({
    underlyingPrice: targetPrice,
    daysPassed: daysPassed,
    options,
    positions,
    currentPrice,
    ivSurface,
    dividendYield,
    isAIEnabled,
    aiVolatilityMap,
    selectedTicker,
    calculatorMode,
    contractMultiplier
  });

  // Проверяем, есть ли данные для расчета
  const hasData = options.length > 0 || positions.length > 0;

  return (
    <Card className="w-full relative border-0" style={{ borderColor: '#b8b8b8' }}>
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <CalculatorIcon size={16} className="text-cyan-500" />
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">
              Расчёт выхода из позиции
              {/* Для фьючерсов показываем информацию о цене пункта */}
              {calculatorMode === CALCULATOR_MODES.FUTURES && (
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  (цена пункта: ${contractMultiplier})
                </span>
              )}
            </h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle size={16} className="text-gray-400 cursor-help hover:text-gray-600" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    {calculatorMode === CALCULATOR_MODES.FUTURES 
                      ? `Расчет P&L для фьючерсного контракта. Цена пункта: $${contractMultiplier}. P&L = разница в пунктах × количество контрактов × цена пункта.`
                      : 'Внимание! Расчет P&L за X дней до конца экспирации является приблизительным, так как неизвестно какая будет волатильность и безрисковая процентная ставка на прогнозируемую дату!'
                    }
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 hover:bg-muted rounded transition-colors"
          title={isCollapsed ? 'Развернуть' : 'Свернуть'}
        >
          {isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
        </button>
      </div>

      {!isCollapsed && (
        <CardContent className="p-6 space-y-6">
          {!hasData ? (
            <div className="text-center text-muted-foreground text-sm py-8">
              Добавьте опционы или позиции для расчета
            </div>
          ) : (
            <>
              {/* Layout: бегунки слева, блоки справа */}
              <div className="flex gap-6">
                {/* Левая колонка: настройки симуляции */}
                <div className="flex-shrink-0 w-64">
                  <PriceAndTimeSettings
                    currentPrice={currentPrice}
                    targetPrice={targetPrice}
                    setTargetPrice={setTargetPrice}
                    daysPassed={daysPassed}
                    setDaysPassed={setDaysPassed}
                    options={options}
                    minPrice={minPrice}
                    maxPrice={maxPrice}
                    compact={true}
                    savedConfigDate={savedConfigDate}
                  />
                </div>

                {/* Правая колонка: блоки сценариев */}
                <div className="flex-1 space-y-3">
                  {/* Предупреждение о низкой ликвидности */}
                  <LiquidityWarning warnings={liquidityWarnings} />

                  {/* Два сценария рядом */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Сценарий 1: Исполнение опционов */}
                    <ScenarioCard
                      title="Исполнить опционы в дату экспирации"
                      pl={plExercise}
                      details={details.exercise}
                      headerBgColor="#06b6d4"
                      tooltip="Исполнение всех ITM опционов и закрытие позиций базового актива по целевой цене"
                    />

                    {/* Сценарий 2: Закрытие всего */}
                    <ScenarioCard
                      title="Закрыть всё в выбранную дату"
                      pl={plCloseAll}
                      details={details.closeAll}
                      headerBgColor="#10b981"
                      tooltip="Закрытие всех опционов по рыночной цене и всех позиций базового актива по целевой цене"
                    />
                  </div>
                </div>
              </div>

              {/* График временного распада */}
              <div className="pt-4 border-t border-border">
                <ExitTimeDecayChart
                  options={options}
                  positions={positions}
                  currentPrice={currentPrice}
                  targetPrice={targetPrice}
                  daysPassed={daysPassed}
                  selectedExpirationDate={selectedExpirationDate}
                  showOptionLines={showOptionLines}
                  ivSurface={ivSurface}
                  dividendYield={dividendYield}
                  isAIEnabled={isAIEnabled}
                  aiVolatilityMap={aiVolatilityMap}
                  selectedTicker={selectedTicker}
                />
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default ExitCalculator;
