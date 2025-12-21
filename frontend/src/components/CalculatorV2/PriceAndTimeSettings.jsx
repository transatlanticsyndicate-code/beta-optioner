/**
 * Компонент настроек цены и времени
 * ЗАЧЕМ: Обеспечивает синхронизированное управление ценой базового актива, прошедшими днями и волатильностью
 * 
 * ВАЖНО: Используем daysPassed (прошедшие дни) вместо daysRemaining
 * Это позволяет корректно обрабатывать опционы с разными сроками экспирации:
 * - Слайдер показывает сколько дней "прошло" от сегодня
 * - Каждый опцион имеет свой initialDaysToExpiration
 * - actualDaysRemaining = max(0, initialDaysToExpiration - daysPassed)
 * 
 * Затрагивает: расчеты P/L, графики, калькулятор выхода
 */

import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { isNonTradingDay } from '../../utils/marketHolidays';


function PriceAndTimeSettings({ 
  currentPrice = 0,
  targetPrice = 0,
  setTargetPrice,
  daysPassed = 0,         // Прошедшие дни (новая логика)
  setDaysPassed,          // Функция для изменения прошедших дней
  options = [],
  minPrice = 0,
  maxPrice = 0,
  compact = false, // Компактный режим для левой колонки
  savedConfigDate = null,  // Дата сохранения конфигурации (для зафиксированных позиций)
  livePrice = null  // Текущая рыночная цена (для кнопки сброса в зафиксированных позициях)
}) {
  const [priceInput, setPriceInput] = React.useState(targetPrice.toFixed(2));
  const priceInputFocusedRef = React.useRef(false);
  

  // Синхронизация targetPrice с currentPrice
  React.useEffect(() => {
    if (targetPrice === 0 && currentPrice > 0) {
      setTargetPrice(currentPrice);
    }
  }, [currentPrice, targetPrice, setTargetPrice]);

  // Синхронизация input с targetPrice
  React.useEffect(() => {
    if (!priceInputFocusedRef.current) {
      setPriceInput(targetPrice.toFixed(2));
    }
  }, [targetPrice]);

  // Вычисляем максимальное количество дней до экспирации
  // ВАЖНО: Для зафиксированных позиций считаем от даты сохранения, а не от сегодня
  // Это позволяет сохранить оригинальный диапазон ползунка
  const maxDaysToExpiration = React.useMemo(() => {
    if (!options || options.length === 0) return 30;
    
    // Базовая дата: дата сохранения (для зафиксированных) или сегодня
    let baseDate = new Date();
    if (savedConfigDate) {
      baseDate = new Date(savedConfigDate);
    }
    baseDate.setHours(0, 0, 0, 0);
    
    let maxDays = 0;
    options.forEach(option => {
      if (option.date) {
        // Вычисляем дни от базовой даты до экспирации
        const expirationDate = new Date(option.date + 'T00:00:00');
        const diffTime = expirationDate.getTime() - baseDate.getTime();
        const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (daysUntil > maxDays) {
          maxDays = daysUntil;
        }
      }
    });
    
    return maxDays > 0 ? maxDays : 30;
  }, [options, savedConfigDate]);

  // Вычисляем диапазон цен
  const calculatedMinPrice = minPrice || (currentPrice > 0 ? currentPrice * 0.5 : 0);
  const calculatedMaxPrice = maxPrice || (currentPrice > 0 ? currentPrice * 1.5 : 1000);

  const handlePriceInputChange = (e) => {
    const value = e.target.value;
    setPriceInput(value);
    
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= calculatedMinPrice && numValue <= calculatedMaxPrice) {
      setTargetPrice(numValue);
    }
  };

  const handlePriceSliderChange = (value) => {
    const newPrice = value[0];
    setTargetPrice(newPrice);
    if (!priceInputFocusedRef.current) {
      setPriceInput(newPrice.toFixed(2));
    }
  };

  return (
    <div className={`space-y-${compact ? '4' : '6'}`}>
      {/* Цена базового актива */}
      <div className="space-y-3">
        <div className="flex flex-col gap-1">
          <Label className={`${compact ? 'text-xs' : 'text-sm'} font-medium`}>Цена базового актива</Label>
          {!compact && (
            <span className="text-xs text-muted-foreground">
              допустимый диапазон: ${calculatedMinPrice.toFixed(2)} – ${calculatedMaxPrice.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground min-w-[20px]">$</span>
          <Input
            type="number"
            value={priceInput}
            onChange={handlePriceInputChange}
            onFocus={() => { priceInputFocusedRef.current = true; }}
            onBlur={() => { 
              priceInputFocusedRef.current = false;
              setPriceInput(targetPrice.toFixed(2));
            }}
            className={`${compact ? 'h-8 text-sm' : 'h-9'} flex-1`}
            step="0.01"
            min={calculatedMinPrice}
            max={calculatedMaxPrice}
          />
          <Button
            onClick={() => {
              // ЗАЧЕМ: Для зафиксированных позиций сбрасываем на текущую рыночную цену (livePrice),
              // а не на цену при сохранении (currentPrice)
              const resetPrice = livePrice !== null ? livePrice : currentPrice;
              setTargetPrice(resetPrice);
              setPriceInput(resetPrice.toFixed(2));
            }}
            className={`${compact ? 'h-8 w-8' : 'h-9 w-9'} p-0 bg-gray-500 hover:bg-gray-600`}
            title="Сбросить на текущую цену"
          >
            <RotateCcw className="h-4 w-4 text-white" />
          </Button>
        </div>
        <Slider
          value={[targetPrice]}
          onValueChange={handlePriceSliderChange}
          min={calculatedMinPrice}
          max={calculatedMaxPrice}
          step={0.01}
          className="[&_[role=slider]]:bg-cyan-500 [&_[role=slider]]:border-cyan-500"
        />
        {!compact && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>${calculatedMinPrice.toFixed(2)}</span>
            <span>${calculatedMaxPrice.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Симуляция времени - прошедшие дни */}
      <div className="space-y-2">
        {/* Заголовок с прошедшими днями слева, названием по центру и оставшимися днями справа */}
        <div className="flex items-center text-sm mb-1">
          {/* Прошедшие дни (слева) - ширина по содержимому */}
          <span className={`${compact ? 'text-base' : 'text-lg'} font-semibold ${compact ? 'text-cyan-600' : ''} text-left mr-2`}>
            {options.length === 0 ? '—' : `${daysPassed} д.`}
          </span>
          {/* Дата на которую попадает этот день */}
          {/* ВАЖНО: Для зафиксированных позиций считаем от даты сохранения */}
          {options.length > 0 && (() => {
            // Базовая дата: дата сохранения (для зафиксированных) или сегодня
            const baseDate = savedConfigDate ? new Date(savedConfigDate) : new Date();
            baseDate.setHours(0, 0, 0, 0);
            const targetDate = new Date(baseDate);
            targetDate.setDate(targetDate.getDate() + daysPassed);
            const { isNonTrading, reason } = isNonTradingDay(targetDate);
            const formattedDate = targetDate.toLocaleDateString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric'
            });
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span 
                      className={`${compact ? 'text-xs' : 'text-sm'} ${isNonTrading ? 'text-red-500 font-medium' : 'text-muted-foreground'} cursor-help`}
                    >
                      {formattedDate}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>{isNonTrading ? `Биржа закрыта: ${reason}` : 'Торговый день'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })()}
          {/* Название прижато вправо к цифрам оставшихся дней */}
          <span className={`${compact ? 'text-xs' : 'text-sm'} text-muted-foreground flex-1 text-right mr-1`}>Дней до экспирации</span>
          {/* Оставшиеся дни до самого длинного опциона (справа) - ширина по содержимому */}
          <span className={`${compact ? 'text-base' : 'text-lg'} font-semibold ${compact ? 'text-cyan-600' : ''}`}>
            {options.length === 0 ? '—' : `${Math.max(0, maxDaysToExpiration - daysPassed)} д.`}
          </span>
        </div>
        {/* Слайдер: от 0 (сегодня) до maxDaysToExpiration (день экспирации самого длинного опциона) */}
        <Slider
          value={[daysPassed]}
          onValueChange={(value) => setDaysPassed(value[0])}
          min={0}
          max={maxDaysToExpiration}
          step={1}
          disabled={options.length === 0}
          className="[&_[role=slider]]:bg-cyan-500 [&_[role=slider]]:border-cyan-500"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {savedConfigDate ? (() => {
              const date = new Date(savedConfigDate);
              return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
            })() : '0 д.'}
          </span>
          <span>{options.length === 0 ? '—' : `${maxDaysToExpiration} д.`}</span>
        </div>
      </div>

    </div>
  );
}

export default PriceAndTimeSettings;
