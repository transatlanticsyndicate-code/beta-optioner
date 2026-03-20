/**
 * Контрол ручного ввода фактической IV на сегодня
 * ЗАЧЕМ: Позволяет откалибровать расчёты калькулятора под текущую реальную волатильность рынка
 * Затрагивает: симуляцию рынка, P&L, IV-колонку в таблице опционов
 */

import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

function MarketIvOverrideControl({
  marketIvOverride = null,
  setMarketIvOverride,
  compact = false,
}) {
  const [inputValue, setInputValue] = React.useState(
    marketIvOverride !== null && marketIvOverride !== undefined ? String(marketIvOverride) : ''
  );

  React.useEffect(() => {
    if (document.activeElement && document.activeElement.getAttribute('data-market-iv-input') === 'true') {
      return;
    }

    setInputValue(marketIvOverride !== null && marketIvOverride !== undefined ? String(marketIvOverride) : '');
  }, [marketIvOverride]);

  const handleChange = (event) => {
    const value = event.target.value;
    setInputValue(value);

    if (value === '') {
      setMarketIvOverride(null);
      return;
    }

    const parsed = parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      setMarketIvOverride(parsed);
    }
  };

  const handleBlur = () => {
    if (inputValue === '') {
      setMarketIvOverride(null);
      return;
    }

    const parsed = parseFloat(inputValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setInputValue(marketIvOverride !== null && marketIvOverride !== undefined ? String(marketIvOverride) : '');
      return;
    }

    setMarketIvOverride(parsed);
    setInputValue(String(parsed));
  };

  const handleReset = () => {
    setMarketIvOverride(null);
    setInputValue('');
  };

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-col gap-1">
        <Label className={`${compact ? 'text-xs' : 'text-sm'} font-medium`}>
          Фактическая IV сегодня
        </Label>
        <span className="text-xs text-muted-foreground">
          Подставляется как базовая волатильность для всех дальнейших расчётов.
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground min-w-[20px]">%</span>
        <Input
          type="number"
          value={inputValue}
          onChange={handleChange}
          onBlur={handleBlur}
          data-market-iv-input="true"
          className={`${compact ? 'h-8 text-sm' : 'h-9'} flex-1`}
          step="0.1"
          min="0"
          placeholder="Например 27.5"
        />
        <Button
          onClick={handleReset}
          type="button"
          className={`${compact ? 'h-8 w-8' : 'h-9 w-9'} p-0 bg-gray-500 hover:bg-gray-600`}
          title="Сбросить фактическую IV"
        >
          <RotateCcw className="h-4 w-4 text-white" />
        </Button>
      </div>

      {marketIvOverride !== null && marketIvOverride !== undefined && (
        <div className="text-xs text-cyan-600 font-medium">
          Используется IV: {marketIvOverride.toFixed(1)}%
        </div>
      )}
    </div>
  );
}

export default MarketIvOverrideControl;
