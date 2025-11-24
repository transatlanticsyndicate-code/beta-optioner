/**
 * Компонент настроек цены и времени
 * ЗАЧЕМ: Обеспечивает синхронизированное управление ценой базового актива, днями до экспирации и волатильностью
 * Затрагивает: расчеты P/L, графики, калькулятор выхода
 */

import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

function PriceAndTimeSettings({ 
  currentPrice = 0,
  targetPrice = 0,
  setTargetPrice,
  daysRemaining = 0,
  setDaysRemaining,
  volatility = 25,
  setVolatility,
  options = [],
  minPrice = 0,
  maxPrice = 0,
  compact = false // Компактный режим для левой колонки
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
              setTargetPrice(currentPrice);
              setPriceInput(currentPrice.toFixed(2));
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

      {/* Дней до экспирации */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className={`${compact ? 'text-xs' : 'text-sm'} text-muted-foreground`}>Дней до экспирации</span>
          <span className={`${compact ? 'text-base' : 'text-lg'} font-semibold ${compact ? 'text-cyan-600' : ''}`}>
            {options.length === 0 ? '—' : `${daysRemaining} д.`}
          </span>
        </div>
        <Slider
          value={[maxDaysToExpiration - daysRemaining]}
          onValueChange={(value) => setDaysRemaining(maxDaysToExpiration - value[0])}
          min={0}
          max={maxDaysToExpiration}
          step={1}
          disabled={options.length === 0}
          className="[&_[role=slider]]:bg-cyan-500 [&_[role=slider]]:border-cyan-500"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0 д.</span>
          <span>{options.length === 0 ? '—' : `${maxDaysToExpiration} д.`}</span>
        </div>
      </div>

      {/* Волатильность */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className={`${compact ? 'text-xs' : 'text-sm'} text-muted-foreground`}>Волатильность</span>
          <span className={`${compact ? 'text-base' : 'text-lg'} font-semibold ${compact ? 'text-cyan-600' : ''}`}>
            {volatility}%
          </span>
        </div>
        <Slider
          value={[volatility]}
          onValueChange={(value) => setVolatility(value[0])}
          min={1}
          max={100}
          step={1}
          className="[&_[role=slider]]:bg-cyan-500 [&_[role=slider]]:border-cyan-500"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}

export default PriceAndTimeSettings;
