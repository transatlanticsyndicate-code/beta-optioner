import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronUp, ChevronDown, Calculator as CalculatorIcon, HelpCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { usePositionExitCalculator } from '../../hooks/usePositionExitCalculator';
import ExitTimeDecayChart from './ExitTimeDecayChart';
import PriceAndTimeSettings from './PriceAndTimeSettings';
import { LIQUIDITY_LEVELS } from '../../utils/liquidityCheck';

/**
 * Компонент для расчета P&L при выходе из позиции
 * 
 * @param {Object} props
 * @param {Array} props.options - Массив опционов
 * @param {Array} props.positions - Массив позиций базового актива
 * @param {number} props.currentPrice - Текущая цена базового актива
 * @param {number} props.daysPassed - Прошедшие дни от сегодня
 * @param {string} props.selectedExpirationDate - Выбранная дата экспирации
 * @param {boolean} props.showOptionLines - Показывать ли линии опционов на графике
 */
function ExitCalculator({ 
  options = [], 
  positions = [], 
  currentPrice = 0,
  daysPassed = 0,
  setDaysPassed,
  selectedExpirationDate = null,
  showOptionLines = true,
  targetPrice = 0,
  setTargetPrice,
  savedConfigDate = null,  // Дата сохранения конфигурации (для зафиксированных позиций)
  ivSurface = null,  // IV Surface для точной интерполяции волатильности
  dividendYield = 0  // Дивидендная доходность для модели BSM
}) {
  // State для UI
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('isExitCalculatorCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  // Сохранение состояния сворачивания
  useEffect(() => {
    localStorage.setItem('isExitCalculatorCollapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  // Диапазон цен для слайдера (±50% от текущей цены)
  const minPrice = Math.round(currentPrice * 0.5);
  const maxPrice = Math.round(currentPrice * 1.5);

  // Расчет P&L через хук (всегда используем IV из API с IV Surface для точной интерполяции)
  const { plExercise, plCloseOptions, plCloseAll, details, liquidityWarnings } = usePositionExitCalculator({
    underlyingPrice: targetPrice,
    daysPassed: daysPassed,
    options,
    positions,
    currentPrice,
    ivSurface,
    dividendYield
  });

  // Форматирование валюты
  const formatCurrency = (value) => {
    const absValue = Math.abs(value);
    const sign = value >= 0 ? '+' : '-';
    
    if (absValue >= 1000000) {
      return `${sign}$${(absValue / 1000000).toFixed(2)}M`;
    } else if (absValue >= 1000) {
      return `${sign}$${(absValue / 1000).toFixed(2)}K`;
    } else {
      return `${sign}$${absValue.toFixed(2)}`;
    }
  };

  // Цвет для P&L
  const getPLColor = (value) => {
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  // Проверяем, есть ли данные для расчета
  const hasData = options.length > 0 || positions.length > 0;

  return (
    <Card className="w-full relative border-0" style={{ borderColor: '#b8b8b8' }}>
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <CalculatorIcon size={16} className="text-cyan-500" />
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Расчёт выхода из позиции</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle size={16} className="text-gray-400 cursor-help hover:text-gray-600" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Внимание! Расчет P&L за X дней до конца экспирации является приблизительным, так как неизвестно какая будет волатильность и безрисковая процентная ставка на прогнозируемую дату!</p>
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
          {isCollapsed ? (
            <ChevronDown size={20} />
          ) : (
            <ChevronUp size={20} />
          )}
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
                  {liquidityWarnings && liquidityWarnings.length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                        <div className="text-xs">
                          <span className="font-semibold text-orange-700">Низкая ликвидность:</span>
                          <span className="text-orange-600 ml-1">
                            {liquidityWarnings.map((w, i) => (
                              <TooltipProvider key={i}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className={`cursor-help underline decoration-dotted ${
                                      w.level === LIQUIDITY_LEVELS.VERY_LOW ? 'text-red-600' : ''
                                    }`}>
                                      {w.option}{i < liquidityWarnings.length - 1 ? ', ' : ''}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-xs">
                                    <div className="text-xs">
                                      <div className="font-semibold mb-1">
                                        {w.level === LIQUIDITY_LEVELS.VERY_LOW ? '⛔ Очень низкая ликвидность' : '⚠ Низкая ликвидность'}
                                      </div>
                                      {w.warnings.map((warning, j) => (
                                        <div key={j}>• {warning}</div>
                                      ))}
                                      <div className="mt-1 text-gray-500">Оценка: {w.score}/100</div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ))}
                          </span>
                          <div className="text-orange-500 mt-1">
                            Реальная цена закрытия может отличаться от расчётной
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4">
                {/* Сценарий 1: Исполнить опционы в дату экспирации */}
                <ScenarioCard
                  title="Исполнить опционы в дату экспирации"
                  pl={plExercise}
                  details={details.exercise}
                  formatCurrency={formatCurrency}
                  getPLColor={getPLColor}
                  headerBgColor="#afafaf"
                  tooltip={`При исполнении Buy опционов количество дней до экспирации никак не влияет на P&L и его можно исполнить в любой момент.

Мы не можем исполнить Sell опцион по своему желанию - только по требованию покупателя либо в дату экспирации опцион истечет без исполнения.`}
                />

                {/* Сценарий 2: Закрыть всё в выбранную дату */}
                <ScenarioCard
                  title="Закрыть всё в выбранную дату"
                  pl={plCloseAll}
                  details={details.closeAll}
                  formatCurrency={formatCurrency}
                  getPLColor={getPLColor}
                  headerBgColor="#06b6d4"
                />
                  </div>
                </div>
              </div>

              {/* График временного распада - под блоками сценариев */}
              <div className="mt-6">
                <ExitTimeDecayChart
                  options={options}
                  positions={positions}
                  currentPrice={currentPrice}
                  targetPrice={targetPrice}
                  daysPassed={daysPassed}
                  showOptionLines={showOptionLines}
                  selectedExpirationDate={selectedExpirationDate}
                  ivSurface={ivSurface}
                />
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/**
 * Компонент карточки сценария
 */
function ScenarioCard({ title, pl, details, formatCurrency, getPLColor, headerBgColor = '#06b6d4', tooltip }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="border rounded-lg overflow-hidden bg-white dark:bg-gray-900"
    >
      {/* Заголовок */}
      <div style={{ backgroundColor: headerBgColor }} className="px-4 py-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">{title}</h4>
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle size={16} className="text-white cursor-help hover:opacity-80" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="whitespace-pre-wrap">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Итоговый P&L */}
      <div className="bg-gray-50 dark:bg-gray-800 px-4 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Итоговый P&L
          </span>
          <span className={`text-2xl font-bold ${getPLColor(pl)}`}>
            {formatCurrency(pl)}
          </span>
        </div>
      </div>

      {/* Детали расчета */}
      <div className="px-4 py-3 space-y-1.5 max-h-[400px] overflow-y-auto">
        {details && details.length > 0 ? (() => {
          // Находим максимальное значение К среди всех опционов
          const kCoeffs = details.filter(d => d.kCoeff !== undefined).map(d => d.kCoeff);
          const maxKCoeff = kCoeffs.length > 0 ? Math.max(...kCoeffs) : null;
          
          return details.map((detail, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03 }}
              className={`flex justify-between items-start text-xs p-2 rounded ${
                detail.highlight 
                  ? 'bg-blue-50 dark:bg-blue-950/30' 
                  : 'bg-gray-50 dark:bg-gray-800/50'
              }`}
            >
              <div className="flex-1 pr-2">
                <div className={`font-medium ${
                  detail.highlight 
                    ? 'text-blue-700 dark:text-blue-400' 
                    : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {detail.label}
                </div>
                {detail.description && (
                  <div className="text-muted-foreground text-xs mt-0.5 whitespace-pre-line">
                    {detail.description}
                  </div>
                )}
              </div>
              {/* Колонка К (коэффициент P&L / Премия) - только для опционов */}
              {detail.kCoeff !== undefined && (
                <span className={`whitespace-nowrap mr-3 ${
                  detail.kCoeff === maxKCoeff && kCoeffs.length > 1
                    ? 'font-bold text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {detail.kCoeff >= 0 ? '+' : ''}{detail.kCoeff.toFixed(2)}
                </span>
              )}
              <span className={`font-semibold whitespace-nowrap ${getPLColor(detail.value)}`}>
                {formatCurrency(detail.value)}
              </span>
            </motion.div>
          ));
        })() : (
          <div className="text-center text-muted-foreground text-xs py-4">
            Нет данных для расчета
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default ExitCalculator;
