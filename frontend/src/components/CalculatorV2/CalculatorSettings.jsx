import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Card } from '../ui/card';
import CacheSettings from './CacheSettings';

function CalculatorSettings({ 
  showOptionLines = true,
  setShowOptionLines,
  showProbabilityZones = true,
  setShowProbabilityZones,
  cacheTTLMinutes = 0,
  onCacheTTLChange
}) {

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
