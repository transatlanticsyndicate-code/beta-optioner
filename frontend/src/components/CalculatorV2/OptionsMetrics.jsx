import React, { useMemo } from 'react';
import { useScrollIndicators } from '../../hooks/useScrollIndicators';
import { ScrollIndicator } from './ScrollIndicator';
import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import {
  calculateTotalPremium,
  calculateRequiredCapital,
  calculateTotalGreeks,
  calculateLiveGreeks,
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
function OptionsMetrics({ options = [], currentPrice = 0, positions = [], daysPassed = 0, plData = null, ivSurface = null, dividendYield = 0, isAIEnabled = false, aiVolatilityMap = {}, fetchAIVolatility = null, targetPrice = 0, selectedTicker = '', calculatorMode = 'stocks', contractMultiplier = 100 }) {
  // DEBUG: Закомментировано для production
  // console.log('🤖 [OptionsMetrics] Получены пропсы:', {
  //   isAIEnabled,
  //   targetPrice,
  //   selectedTicker,
  //   aiVolatilityMapKeys: Object.keys(aiVolatilityMap || {}),
  //   aiVolatilityMapSize: Object.keys(aiVolatilityMap || {}).length
  // });

  const {
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    scrollRight,
    scrollRef
  } = useScrollIndicators();

  // Проверяем, что опцион полностью заполнен
  const isOptionComplete = (option) => {
    // Проверяем наличие цены (хотя бы одной: premium, bid или ask, включая ручные правки)
    const hasPremium = (option.premium !== undefined && option.premium !== null) || (option.isPremiumModified && option.customPremium !== undefined);
    const hasBid = (option.bid !== undefined && option.bid !== null) || (option.isBidModified && option.customBid !== undefined);
    const hasAsk = (option.ask !== undefined && option.ask !== null) || (option.isAskModified && option.customAsk !== undefined);

    return option.date &&
      option.strike &&
      (hasPremium || hasBid || hasAsk) &&
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
        greeks: { delta: 0, gamma: 0, theta: 0, vega: 0 },
        plMetrics: { maxLoss: 0, maxProfit: 0, breakevens: [], riskReward: '—' },
        hasCompleteOptions: false
      };
    }

    const plMetrics = calculatePLMetrics(completeOptions, currentPrice, positions, daysPassed, ivSurface, dividendYield, isAIEnabled, aiVolatilityMap, targetPrice, selectedTicker, calculatorMode, contractMultiplier);

    // ЗАЧЕМ (2A-3): греки должны реагировать на ползунок дней/цены и на ручную Fact IV ноги,
    // а не быть заморожены на дату импорта котировок. calculateLiveGreeks пересчитывает их
    // через Black-Scholes/Black-76 с той же волатильностью/днями, что использует P&L график.
    // Если live-расчёт по какой-то причине даёт некорректный результат (NaN/исключение) —
    // подстраховываемся статическим расчётом по полям ноги (calculateTotalGreeks, фикс 2A-1),
    // чтобы карточки не сломались и не показали пустоту/NaN.
    let greeks;
    let greeksAreLive = true;
    try {
      greeks = calculateLiveGreeks(
        completeOptions,
        currentPrice,
        daysPassed,
        contractMultiplier,
        calculatorMode,
        ivSurface,
        dividendYield,
        isAIEnabled,
        aiVolatilityMap,
        targetPrice,
        selectedTicker
      );
      const isValid = greeks && ['delta', 'gamma', 'theta', 'vega'].every(k => Number.isFinite(greeks[k]));
      if (!isValid) {
        throw new Error('calculateLiveGreeks вернул некорректное значение');
      }
    } catch (e) {
      greeks = calculateTotalGreeks(completeOptions, contractMultiplier);
      greeksAreLive = false;
    }

    return {
      premium: calculateTotalPremium(completeOptions, contractMultiplier),
      requiredCapital: calculateRequiredCapital(completeOptions, currentPrice, positions, contractMultiplier),
      greeks,
      greeksAreLive,
      plMetrics: plMetrics,
      hasCompleteOptions: true
    };
  }, [options, currentPrice, positions, daysPassed, ivSurface, dividendYield, isAIEnabled, aiVolatilityMap, targetPrice, selectedTicker, calculatorMode, contractMultiplier]);

  // ЗАЧЕМ (2A-3, фолбэк): если calculateLiveGreeks не смог посчитать «живые» греки и сработал
  // fallback на статический расчёт по полям ноги — явно помечаем это в тултипах, чтобы
  // пользователь не думал, что значения реагируют на ползунки дней/цены.
  const greeksStaleNote = calculatedMetrics.greeksAreLive === false
    ? ' ВНИМАНИЕ: показаны греки на дату входа в позицию (не пересчитаны на текущую симуляцию).'
    : '';

  // Метрики с приоритетами согласно ТЗ
  const metrics = useMemo(() => [
    // Уровень 1: Критические (всегда видны)
    {
      priority: 1,
      label: 'MAX убыток',
      // Показываем число всегда, когда есть полные опционы — даже если оно положительное.
      // ЗАЧЕМ: бывают стратегии с гарантированной минимальной прибылью на экспирации
      // (коллар, протективный пут и т.п.) — у них «худший P&L» >= 0, и пользователю
      // важно видеть размер этого минимального профита, а не прочерк.
      value: calculatedMetrics.hasCompleteOptions
        ? formatCurrency(calculatedMetrics.plMetrics.maxLoss)
        : '—',
      // Цвет зависит от знака: убыток — красный, гарантированная прибыль — зелёный, ноль — серый.
      color: !calculatedMetrics.hasCompleteOptions
        ? 'red'
        : calculatedMetrics.plMetrics.maxLoss < 0
          ? 'red'
          : calculatedMetrics.plMetrics.maxLoss > 0
            ? 'green'
            : 'gray',
      tooltip: 'Худший P&L стратегии НА ДАТУ ЭКСПИРАЦИИ. Отрицательное значение — максимальный убыток. Положительное значение — гарантированный минимальный профит (стратегия не может уйти в минус).\nВНИМАНИЕ: при графике стремящемся в бесконечность сумма ограничивается движением цены базового актива на 100%.'
    },
    {
      priority: 1,
      label: 'MAX прибыль',
      value: calculatedMetrics.hasCompleteOptions
        ? (calculatedMetrics.plMetrics.maxProfit === Infinity ? '∞' : formatCurrency(calculatedMetrics.plMetrics.maxProfit))
        : '—',
      color: 'green',
      tooltip: 'Максимальная возможная прибыль стратегии НА ДАТУ ЭКСПИРАЦИИ.\nВНИМАНИЕ: при графике стремящемся в бесконечность сумма прибыли ограничивается движением цены базового актива на 100%.'
    },
    {
      priority: 1,
      // ЗАЧЕМ (фикс 2A-4.3): точка безубытка теперь считается НА ДАТУ ЭКСПИРАЦИИ (страйк ± премия),
      // а не на текущую/симулируемую дату (та «плавала» вместе с ползунком дней). Дата экспирации
      // добавлена в подпись, чтобы было явно видно, к какому моменту относится число.
      label: calculatedMetrics.plMetrics?.expirationDateLabel
        ? `Точка безубытка (${calculatedMetrics.plMetrics.expirationDateLabel})`
        : 'Точка безубытка',
      value: calculatedMetrics.hasCompleteOptions && calculatedMetrics.plMetrics.breakevens.length > 0
        ? calculatedMetrics.plMetrics.breakevens.length === 1
          ? `$${calculatedMetrics.plMetrics.breakevens[0].toFixed(2)}`
          : `${calculatedMetrics.plMetrics.breakevens.length} ${calculatedMetrics.plMetrics.breakevens.length === 2 ? 'точки' :
            calculatedMetrics.plMetrics.breakevens.length >= 5 ? 'точек' : 'точки'
          }`
        : '—',
      color: 'orange',
      tooltip: calculatedMetrics.plMetrics?.breakevens?.length > 1
        ? `Множественные точки безубыточности НА ДАТУ ЭКСПИРАЦИИ${calculatedMetrics.plMetrics.expirationDateLabel ? ` (${calculatedMetrics.plMetrics.expirationDateLabel})` : ''}: ${calculatedMetrics.plMetrics.breakevens.map(be => `$${be.toFixed(2)}`).join(', ')}`
        : `Цена актива, при которой стратегия не приносит ни прибыли, ни убытка (P&L = 0) НА ДАТУ ЭКСПИРАЦИИ${calculatedMetrics.plMetrics?.expirationDateLabel ? ` (${calculatedMetrics.plMetrics.expirationDateLabel})` : ''}.`
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

    // Уровень 3: Продвинутые (для опытных, справа)
    {
      priority: 3,
      label: 'Дельта',
      value: options.length > 0 ? `Δ ${formatGreek(calculatedMetrics.greeks.delta)}` : '—',
      color: getValueColor(calculatedMetrics.greeks.delta),
      // ЗАЧЕМ (2A-2): дельта позиции — это эквивалент в акциях/единицах базового актива
      // (уже умножена на contractMultiplier и количество контрактов), т.е. одновременно
      // и «сколько акций», и «$ прибыли/убытка на $1 движения цены».
      tooltip: `Эквивалент позиции в акциях (или другой единице) базового актива. Показывает, на сколько долларов изменится P&L всей позиции при движении цены базового актива на $1.${greeksStaleNote}`
    },
    {
      priority: 3,
      label: 'Гамма',
      value: options.length > 0 ? `Γ ${formatGreek(calculatedMetrics.greeks.gamma)}` : '—',
      color: 'purple',
      tooltip: `Скорость изменения дельты позиции при движении цены базового актива на $1. Чем выше гамма, тем быстрее «плывёт» дельта.${greeksStaleNote}`
    },
    {
      priority: 3,
      label: 'Тета',
      value: options.length > 0 ? `Θ ${formatGreek(calculatedMetrics.greeks.theta)}` : '—',
      color: 'cyan',
      // ЗАЧЕМ (2A-2): тета — доллары в день НА ВСЮ ПОЗИЦИЮ (contractMultiplier и quantity уже учтены).
      tooltip: `Временной распад позиции: сколько долларов в день теряет (или зарабатывает) вся позиция при прочих равных. Отрицательная тета = позиция теряет стоимость со временем.${greeksStaleNote}`
    },
    {
      priority: 3,
      label: 'Вега',
      value: options.length > 0 ? `ν ${formatGreek(calculatedMetrics.greeks.vega)}` : '—',
      color: getValueColor(calculatedMetrics.greeks.vega),
      // ЗАЧЕМ (2A-2): вега — доллары на 1 процентный пункт изменения IV НА ВСЮ ПОЗИЦИЮ.
      tooltip: `Чувствительность всей позиции к изменению волатильности: $ на 1 процентный пункт изменения implied volatility (IV). Положительная вега = прибыль при росте волатильности.${greeksStaleNote}`
    }
  ], [options, calculatedMetrics, greeksStaleNote]);

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
                <div className={`text-xl font-bold whitespace-nowrap ${metric.color === 'red' ? 'text-red-500' :
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
