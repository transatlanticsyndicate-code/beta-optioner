import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronUp, ChevronDown, Calculator as CalculatorIcon, HelpCircle } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { Input } from '../ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { usePositionExitCalculator } from '../../hooks/usePositionExitCalculator';
import ExitTimeDecayChart from './ExitTimeDecayChart';

/**
 * Компонент для расчета P&L при выходе из позиции
 * 
 * @param {Object} props
 * @param {Array} props.options - Массив опционов
 * @param {Array} props.positions - Массив позиций базового актива
 * @param {number} props.currentPrice - Текущая цена базового актива
 * @param {number} props.daysRemaining - Количество дней до экспирации из настроек
 * @param {string} props.selectedExpirationDate - Выбранная дата экспирации
 * @param {boolean} props.showOptionLines - Показывать ли линии опционов на графике
 */
function ExitCalculator({ 
  options = [], 
  positions = [], 
  currentPrice = 0,
  daysRemaining = 0,
  setDaysRemaining,
  selectedExpirationDate = null,
  showOptionLines = true,
  targetPrice = 0,
  setTargetPrice,
  volatility = 25,
  setVolatility
}) {
  // State для UI
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('isExitCalculatorCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  // State для UI
  const [priceInput, setPriceInput] = useState(targetPrice.toFixed(2));
  const [volatilityManual, setVolatilityManual] = useState(false);
  const priceInputFocusedRef = React.useRef(false);

  useEffect(() => {
    if (!priceInputFocusedRef.current) {
      setPriceInput(targetPrice.toFixed(2));
    }
  }, [targetPrice]);

  // Сохранение состояния сворачивания
  useEffect(() => {
    localStorage.setItem('isExitCalculatorCollapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  // Вычисляем максимальное количество дней до экспирации
  const maxDaysToExpiration = React.useMemo(() => {
    if (!options || options.length === 0) return 30;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let maxDays = 0;
    options.forEach(option => {
      if (option.date) {
        const expirationDate = new Date(option.date);
        expirationDate.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((expirationDate - today) / (1000 * 60 * 60 * 24));
        if (daysUntil > maxDays) {
          maxDays = daysUntil;
        }
      }
    });
    
    return maxDays > 0 ? maxDays : 30;
  }, [options]);

  const derivedVolatility = React.useMemo(() => {
    if (!options || options.length === 0) {
      return null;
    }

    const ivValues = options
      .filter((option) => option?.visible !== false)
      .map((option) => {
        const rawIV = typeof option?.impliedVolatility === 'number'
          ? option.impliedVolatility
          : typeof option?.implied_volatility === 'number'
            ? option.implied_volatility
            : null;

        if (rawIV === null || rawIV <= 0) {
          return null;
        }

        const percentValue = rawIV > 1 ? rawIV : rawIV * 100;
        return percentValue;
      })
      .filter((value) => value !== null);

    if (!ivValues.length) {
      return null;
    }

    const average = ivValues.reduce((sum, value) => sum + value, 0) / ivValues.length;
    const clamped = Math.max(1, Math.min(100, average));
    return Math.round(clamped);
  }, [options]);

  useEffect(() => {
    if (!volatilityManual && derivedVolatility !== null) {
      setVolatility(derivedVolatility);
    }
  }, [derivedVolatility, volatilityManual]);

  // Диапазон цен для слайдера (±50% от текущей цены)
  const minPrice = Math.round(currentPrice * 0.5);
  const maxPrice = Math.round(currentPrice * 1.5);

  // Расчет P&L через хук
  const { plExercise, plCloseOptions, plCloseAll, details } = usePositionExitCalculator({
    underlyingPrice: targetPrice,
    daysToExpiration: daysRemaining,
    options,
    positions,
    currentPrice,
    volatility
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
                {/* Левая колонка: бегунки */}
                <div className="flex-shrink-0 w-64 space-y-6">
                {/* Ввод цены */}
                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <Label className="text-sm font-medium">Цена базового актива</Label>
                    <span className="text-xs text-muted-foreground">допустимый диапазон: ${minPrice.toFixed(2)} – ${maxPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">$</span>
                    <Input
                      type="number"
                      value={priceInput}
                      step="0.01"
                      min={minPrice}
                      max={maxPrice}
                      className="flex-1"
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        setPriceInput(e.target.value);
                        if (!isNaN(value)) {
                          const clampedValue = Math.min(Math.max(value, minPrice), maxPrice);
                          setTargetPrice(clampedValue);
                        }
                      }}
                      onBlur={(e) => {
                        priceInputFocusedRef.current = false;
                        const value = parseFloat(e.target.value);
                        if (isNaN(value)) {
                          setTargetPrice(minPrice);
                          setPriceInput(minPrice.toFixed(2));
                          return;
                        }
                        const clampedValue = Math.min(Math.max(value, minPrice), maxPrice);
                        setTargetPrice(clampedValue);
                        setPriceInput(clampedValue.toFixed(2));
                      }}
                      onFocus={() => {
                        priceInputFocusedRef.current = true;
                      }}
                    />
                  </div>
                </div>

                {/* Слайдер дней до экспирации */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-medium">Дней до экспирации</Label>
                    <span className="text-sm font-semibold text-cyan-600">
                      {options.length === 0 ? '—' : `${daysRemaining} дн.`}
                    </span>
                  </div>
                  <Slider
                    value={[maxDaysToExpiration - daysRemaining]}
                    onValueChange={(value) => {
                      if (setDaysRemaining) {
                        setDaysRemaining(maxDaysToExpiration - value[0]);
                      }
                    }}
                    min={0}
                    max={maxDaysToExpiration}
                    step={1}
                    className="w-full [&_[role=slider]]:bg-cyan-500 [&_[role=slider]]:border-cyan-500"
                    disabled={options.length === 0}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0 дн.</span>
                    <span>{options.length === 0 ? '—' : `${maxDaysToExpiration} дн.`}</span>
                  </div>
                </div>

                {/* Слайдер волатильности */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-medium">Волатильность</Label>
                    <span className="text-sm font-semibold text-cyan-600">
                      {volatility}%
                    </span>
                  </div>
                  <Slider
                    value={[volatility]}
                    onValueChange={(value) => {
                      setVolatility(value[0]);
                      setVolatilityManual(true);
                    }}
                    min={1}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1%</span>
                    <span>100%</span>
                  </div>
                </div>
                </div>

                {/* Правая колонка: блоки сценариев */}
                <div className="flex-1 grid grid-cols-2 gap-4">
                {/* Сценарий 1: Исполнить опционы */}
                <ScenarioCard
                  title="Исполнить опционы"
                  pl={plExercise}
                  details={details.exercise}
                  formatCurrency={formatCurrency}
                  getPLColor={getPLColor}
                  headerBgColor="#afafaf"
                  tooltip={`При исполнении Buy опционов количество дней до экспирации никак не влияет на P&L и его можно исполнить в любой момент.

Мы не можем исполнить Sell опцион по своему желанию - только по требованию покупателя либо в дату экспирации опцион истечет без исполнения.`}
                />

                {/* Сценарий 2: Закрыть всё */}
                <ScenarioCard
                  title="Закрыть всё"
                  pl={plCloseAll}
                  details={details.closeAll}
                  formatCurrency={formatCurrency}
                  getPLColor={getPLColor}
                  headerBgColor="#06b6d4"
                />
                </div>
              </div>

              {/* График временного распада - под блоками сценариев */}
              <div className="mt-6">
                <ExitTimeDecayChart
                  options={options}
                  positions={positions}
                  currentPrice={currentPrice}
                  targetPrice={targetPrice}
                  daysRemaining={daysRemaining}
                  showOptionLines={showOptionLines}
                  volatility={volatility}
                  selectedExpirationDate={selectedExpirationDate}
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
        {details && details.length > 0 ? (
          details.map((detail, index) => (
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
                  <div className="text-muted-foreground text-xs mt-0.5">
                    {detail.description}
                  </div>
                )}
              </div>
              <span className={`font-semibold whitespace-nowrap ${getPLColor(detail.value)}`}>
                {formatCurrency(detail.value)}
              </span>
            </motion.div>
          ))
        ) : (
          <div className="text-center text-muted-foreground text-xs py-4">
            Нет данных для расчета
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default ExitCalculator;
