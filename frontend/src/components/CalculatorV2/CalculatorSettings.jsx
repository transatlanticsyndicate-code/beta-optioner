import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Slider } from '../ui/slider';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Card } from '../ui/card';
import CacheSettings from './CacheSettings';

function CalculatorSettings({ 
  daysRemaining, 
  setDaysRemaining, 
  showOptionLines = true,
  setShowOptionLines,
  showProbabilityZones = true,
  setShowProbabilityZones,
  options = [],
  cacheTTLMinutes = 0,
  onCacheTTLChange
}) {
  // Вычисляем максимальное количество дней до экспирации из опционов
  const maxDaysToExpiration = React.useMemo(() => {
    if (!options || options.length === 0) return 30; // По умолчанию 30 дней
    
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

  const [isCalculatorSettingsCollapsed, setIsCalculatorSettingsCollapsed] = React.useState(() => {
    const saved = localStorage.getItem('isCalculatorSettingsCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  React.useEffect(() => {
    localStorage.setItem('isCalculatorSettingsCollapsed', JSON.stringify(isCalculatorSettingsCollapsed));
  }, [isCalculatorSettingsCollapsed]);

  return (
    <Card className="border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <h3 className="text-sm font-medium">Настройки</h3>
        <button
          onClick={() => setIsCalculatorSettingsCollapsed(!isCalculatorSettingsCollapsed)}
          className="p-1 hover:bg-muted rounded transition-colors"
          title={isCalculatorSettingsCollapsed ? 'Развернуть' : 'Свернуть'}
        >
          {isCalculatorSettingsCollapsed ? (
            <ChevronDown size={16} />
          ) : (
            <ChevronUp size={16} />
          )}
        </button>
      </div>
      {!isCalculatorSettingsCollapsed && (
        <div className="space-y-6 p-6">
          <div className="flex items-center justify-between">
            <Label htmlFor="show-option-lines" className="text-sm font-normal cursor-pointer">
              Отображать все линии на графике
            </Label>
            <Switch
              id="show-option-lines"
              checked={showOptionLines}
              onCheckedChange={setShowOptionLines}
              className="data-[state=checked]:bg-cyan-500"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="show-probability-zones" className="text-sm font-normal cursor-pointer">
              Показывать зоны вероятности
            </Label>
            <Switch
              id="show-probability-zones"
              checked={showProbabilityZones}
              onCheckedChange={setShowProbabilityZones}
              className="data-[state=checked]:bg-cyan-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-muted-foreground">Дней до экспирации</span>
              <span className="text-lg font-semibold">
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

          <div className="pt-4 border-t border-gray-200">
            <CacheSettings 
              cacheTTLMinutes={cacheTTLMinutes}
              onCacheTTLChange={onCacheTTLChange}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

export default CalculatorSettings;
