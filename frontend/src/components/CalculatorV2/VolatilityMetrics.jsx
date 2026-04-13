import React from 'react';
import { HelpCircle, RefreshCw, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Button } from '../ui/button';
import { useScrollIndicators } from '../../hooks/useScrollIndicators';
import { ScrollIndicator } from './ScrollIndicator';
import './OptionsMetrics.css';

/**
 * Блок метрик волатильности — отображается над блоком метрик опционов
 * ЗАЧЕМ: Визуальный обзор волатильности актива (IV, HV, IV Rank и т.д.)
 * Данные приходят с barchart.com через бэкенд
 *
 * @param {Object} props
 * @param {Object|null} props.data - данные волатильности (null = загрузка/нет данных)
 * @param {boolean} props.loading - идёт загрузка данных
 * @param {Function} props.onRefresh - обработчик кнопки обновить
 */
function VolatilityMetrics({ data = null, loading = false, onRefresh, lastUpdated = null }) {
  const {
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    scrollRight,
    scrollRef
  } = useScrollIndicators();

  // Форматирование значения в проценты
  const formatPercent = (value) => {
    if (value === null || value === undefined) return '—';
    return `${value.toFixed(1)}%`;
  };

  const metrics = [
    {
      label: 'Implied Volatility',
      value: formatPercent(data?.impliedVolatility),
      color: 'blue',
      tooltip: 'Подразумеваемая волатильность (IV) — ожидание рынка относительно будущей волатильности актива. Рассчитывается из цен опционов.'
    },
    {
      label: 'Historic Volatility',
      value: formatPercent(data?.historicVolatility),
      color: 'gray',
      tooltip: 'Историческая волатильность (HV) — фактическая волатильность актива за прошедший период (30 дней).'
    },
    {
      label: 'IV Rank',
      value: formatPercent(data?.ivRank),
      color: 'purple',
      tooltip: 'IV Rank — положение текущей IV относительно диапазона за 52 недели. 0% = IV на минимуме, 100% = IV на максимуме.'
    },
    {
      label: 'IV Percentile',
      value: formatPercent(data?.ivPercentile),
      color: 'cyan',
      tooltip: 'IV Percentile — процент дней за последние 52 недели, когда IV была ниже текущей. Высокий процентил = IV выше обычного.'
    },
    {
      label: '5D IV Avg',
      value: formatPercent(data?.ivAvg5D),
      color: 'orange',
      tooltip: 'Средняя подразумеваемая волатильность за последние 5 торговых дней.'
    },
    {
      label: '1M IV Avg',
      value: formatPercent(data?.ivAvg1M),
      color: 'green',
      tooltip: 'Средняя подразумеваемая волатильность за последний месяц.'
    }
  ];

  return (
    <div className="metrics-scroll-container relative p-4">
      <ScrollIndicator
        direction="left"
        onClick={scrollLeft}
        visible={canScrollLeft}
      />

      <div
        ref={scrollRef}
        className="metrics-scroll flex gap-6 overflow-x-auto pb-2 items-center"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'smooth'
        }}
      >
        {/* Логотип barchart — источник данных */}
        <div className="flex-shrink-0 mr-2">
          <img
            src="https://www.barchart.com/cmdty/img/cmdtyexchange/barchart-logo.png"
            alt="Barchart"
            style={{ height: '3rem' }}
            className="opacity-60"
          />
        </div>

        <TooltipProvider>
          {metrics.map((metric, index) => (
            <div key={index} className="flex flex-col items-start flex-shrink-0">
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
                {loading ? '...' : metric.value}
              </div>
            </div>
          ))}
        </TooltipProvider>

        {/* Кнопка обновить + временная метка — справа от метрик */}
        {onRefresh && (
          <div className="flex-shrink-0 ml-2 flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="h-8 w-8 p-0 bg-cyan-400 hover:bg-cyan-500 text-white transition-all duration-200 hover:scale-105 active:scale-95"
                    onClick={onRefresh}
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm">Обновить данные волатильности</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {lastUpdated && (
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {new Date(lastUpdated).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}{' '}
                {new Date(lastUpdated).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        )}
      </div>

      <ScrollIndicator
        direction="right"
        onClick={scrollRight}
        visible={canScrollRight}
      />
    </div>
  );
}

export default VolatilityMetrics;
