import React, { useMemo } from 'react';
import { useScrollIndicators } from '../../hooks/useScrollIndicators';
import { ScrollIndicator } from './ScrollIndicator';
import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import {
  calculateTotalPremium,
  calculateRequiredCapital,
  calculateDaysToExpiration,
  calculateTotalGreeks,
  calculatePLMetrics,
  formatCurrency,
  formatGreek,
  getValueColor
} from '../../utils/metricsCalculator';
import './OptionsMetrics.css';

/**
 * Блок метрик опционов с горизонтальным скроллом
 * Согласно ТЗ: приоритизация метрик от критических к продвинутым
 * 
 * @param {Object} props
 * @param {Array} props.options - массив опционов
 * @param {number} props.currentPrice - текущая цена актива
 * @param {Array} props.positions - массив позиций базового актива
 * @param {Object} props.plData - данные графика P&L (опционально)
 */
function OptionsMetrics({ options = [], currentPrice = 0, positions = [], daysRemaining = 0, plData = null }) {
  const {
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    scrollRight,
    scrollRef
  } = useScrollIndicators();

  // Проверяем, что опцион полностью заполнен
  const isOptionComplete = (option) => {
    return option.date && 
           option.strike && 
           option.premium !== undefined &&
           option.premium !== null &&
           option.visible !== false;
  };

  // Рассчитываем метрики на основе реальных данных
  const calculatedMetrics = useMemo(() => {
    const completeOptions = options.filter(isOptionComplete);
    
    // Если нет полных опционов - показываем заглушки
    if (completeOptions.length === 0) {
      return {
        premium: 0,
        requiredCapital: 0,
        daysToExpiration: 0,
        greeks: { delta: 0, gamma: 0, theta: 0, vega: 0 },
        plMetrics: { maxLoss: 0, maxProfit: 0, breakevens: [], riskReward: '—' },
        hasCompleteOptions: false
      };
    }

    const plMetrics = calculatePLMetrics(completeOptions, currentPrice, positions, daysRemaining);

    return {
      premium: calculateTotalPremium(completeOptions),
      requiredCapital: calculateRequiredCapital(completeOptions, currentPrice, positions),
      daysToExpiration: calculateDaysToExpiration(completeOptions),
      greeks: calculateTotalGreeks(completeOptions),
      plMetrics: plMetrics,
      hasCompleteOptions: true
    };
  }, [options, currentPrice, positions, daysRemaining]);

  // Метрики с приоритетами согласно ТЗ
  const metrics = useMemo(() => [
    // Уровень 1: Критические (всегда видны)
    {
      priority: 1,
      label: 'MAX убыток',
      value: calculatedMetrics.hasCompleteOptions && calculatedMetrics.plMetrics.maxLoss < 0 
        ? formatCurrency(calculatedMetrics.plMetrics.maxLoss) 
        : '—',
      color: 'red',
      tooltip: 'Максимальный возможный убыток стратегии.\nВНИМАНИЕ: при графике стремящемся в бесконечность сумма убытка ограничивается движением цены базового актива на 50%'
    },
    {
      priority: 1,
      label: 'MAX прибыль',
      value: calculatedMetrics.hasCompleteOptions 
        ? (calculatedMetrics.plMetrics.maxProfit === Infinity ? '∞' : formatCurrency(calculatedMetrics.plMetrics.maxProfit))
        : '—',
      color: 'green',
      tooltip: 'Максимальная возможная прибыль стратегии.\nВНИМАНИЕ: при графике стремящемся в бесконечность сумма прибыли ограничивается движением цены базового актива на 50%'
    },
    {
      priority: 1,
      label: 'Точка безубытка',
      value: calculatedMetrics.hasCompleteOptions && calculatedMetrics.plMetrics.breakevens.length > 0
        ? calculatedMetrics.plMetrics.breakevens.length === 1 
          ? `$${calculatedMetrics.plMetrics.breakevens[0].toFixed(2)}`
          : `${calculatedMetrics.plMetrics.breakevens.length} ${
              calculatedMetrics.plMetrics.breakevens.length === 2 ? 'точки' : 
              calculatedMetrics.plMetrics.breakevens.length >= 5 ? 'точек' : 'точки'
            }`
        : '—',
      color: 'orange',
      tooltip: calculatedMetrics.plMetrics?.breakevens?.length > 1 
        ? `Множественные точки безубыточности: ${calculatedMetrics.plMetrics.breakevens.map(be => `$${be.toFixed(2)}`).join(', ')}`
        : 'Цена актива, при которой стратегия не приносит ни прибыли, ни убытка (P&L = 0).'
    },
    {
      priority: 1,
      label: 'Risk/Reward',
      value: calculatedMetrics.hasCompleteOptions ? calculatedMetrics.plMetrics.riskReward : '—',
      color: 'blue',
      tooltip: 'Соотношение максимального риска к максимальной прибыли. Чем выше второе число, тем лучше.'
    },
    
    // Уровень 2: Важные (видны при небольшом скролле)
    {
      priority: 2,
      label: 'Всего премии',
      value: options.length > 0 ? formatCurrency(calculatedMetrics.premium, true) : '—',
      color: getValueColor(calculatedMetrics.premium),
      tooltip: calculatedMetrics.premium < 0 ? 'Дебет - сумма, которую вы заплатили за опционы' : 'Кредит - сумма, которую вы получили от продажи опционов'
    },
    {
      priority: 2,
      label: 'Маржин',
      value: options.length > 0 ? formatCurrency(calculatedMetrics.requiredCapital) : '—',
      color: 'gray',
      tooltip: 'Требуемый капитал для открытия позиции. Учитывает премию опционов + маржинальные требования для непокрытых опционов. Позиции базового актива снижают маржу для covered опционов.'
    },
    {
      priority: 2,
      label: 'Дней',
      value: options.length > 0 ? `${calculatedMetrics.daysToExpiration}` : '—',
      color: 'blue',
      tooltip: 'Количество дней до экспирации ближайшего опциона. Влияет на временной распад (тета).'
    },
    
    // Уровень 3: Продвинутые (для опытных, справа)
    {
      priority: 3,
      label: 'Дельта',
      value: options.length > 0 ? `Δ ${formatGreek(calculatedMetrics.greeks.delta)}` : '—',
      color: getValueColor(calculatedMetrics.greeks.delta),
      tooltip: 'Направленность позиции. Положительная дельта = прибыль при росте цены, отрицательная = при падении.'
    },
    {
      priority: 3,
      label: 'Гамма',
      value: options.length > 0 ? `Γ ${formatGreek(calculatedMetrics.greeks.gamma)}` : '—',
      color: 'purple',
      tooltip: 'Ускорение дельты при изменении цены актива. Показывает, как быстро меняется дельта.'
    },
    {
      priority: 3,
      label: 'Тета',
      value: options.length > 0 ? `Θ ${formatGreek(calculatedMetrics.greeks.theta)}` : '—',
      color: 'cyan',
      tooltip: 'Временной распад в долларах за день. Отрицательная тета = позиция теряет стоимость со временем.'
    },
    {
      priority: 3,
      label: 'Вега',
      value: options.length > 0 ? `ν ${formatGreek(calculatedMetrics.greeks.vega)}` : '—',
      color: getValueColor(calculatedMetrics.greeks.vega),
      tooltip: 'Чувствительность к изменению волатильности. Положительная вега = прибыль при росте волатильности.'
    }
  ], [options, calculatedMetrics]);

  return (
    <div className="metrics-scroll-container relative p-4">
      {/* Левый индикатор */}
      <ScrollIndicator
        direction="left"
        onClick={scrollLeft}
        visible={canScrollLeft}
      />

      {/* Скроллируемая область */}
      <div
        ref={scrollRef}
        className="metrics-scroll flex gap-6 overflow-x-auto pb-2"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'smooth'
        }}
      >
        {!calculatedMetrics.hasCompleteOptions ? (
          <div className="flex items-center justify-center w-full py-4 text-sm text-gray-500">
            {options.length === 0 
              ? 'Добавьте опционы для отображения метрик'
              : 'Выберите дату, страйк и премию для всех опционов'
            }
          </div>
        ) : (
          <TooltipProvider>
            {metrics.map((metric, index) => (
              <div key={index} className="flex flex-col items-start flex-shrink-0" data-priority={metric.priority}>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1 whitespace-nowrap">
                  <span>{metric.label}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground/60 hover:text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-sm">{metric.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className={`text-xl font-bold whitespace-nowrap ${
                  metric.color === 'red' ? 'text-red-500' :
                  metric.color === 'green' ? 'text-green-500' :
                  metric.color === 'orange' ? 'text-orange-500' :
                  metric.color === 'blue' ? 'text-blue-500' :
                  metric.color === 'cyan' ? 'text-cyan-500' :
                  metric.color === 'purple' ? 'text-purple-500' :
                  'text-gray-700'
                }`}>
                  {metric.value}
                </div>
              </div>
            ))}
          </TooltipProvider>
        )}
      </div>

      {/* Правый индикатор */}
      <ScrollIndicator
        direction="right"
        onClick={scrollRight}
        visible={canScrollRight}
      />
    </div>
  );
}

export default OptionsMetrics;
