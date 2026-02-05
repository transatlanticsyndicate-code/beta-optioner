/**
 * SettingsStockGroups - Настройки групп акций для классификации
 * ЗАЧЕМ: Позволяет пользователю настраивать параметры классификации акций
 * и коэффициенты корректировки P&L для каждой группы
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { Shield, TrendingUp, Zap, HelpCircle, Save, RotateCcw } from 'lucide-react';

// ============================================================================
// КОНСТАНТЫ ПО УМОЛЧАНИЮ
// ============================================================================

// Значения по умолчанию для групп акций
const DEFAULT_STOCK_GROUPS = {
  stable: {
    label: 'Стабильные',
    description: 'Large-cap акции с низкой волатильностью',
    icon: 'Shield',
    color: 'text-blue-500',
    multipliers: { down: 1.0, up: 1.0 }
  },
  'tech-growth': {
    label: 'Tech Growth',
    description: 'Tech-акции $10-250B (HUBS, ZS, DDOG)',
    icon: 'TrendingUp',
    color: 'text-purple-500',
    multipliers: { down: 0.70, up: 1.1 }
  },
  growth: {
    label: 'Рост/События',
    description: 'Growth-акции, event-driven, высокая IV',
    icon: 'TrendingUp',
    color: 'text-green-500',
    multipliers: { down: 0.55, up: 1.05 }
  },
  illiquid: {
    label: 'Неликвидные',
    description: 'Small-cap, низкий объём, высокий beta',
    icon: 'Zap',
    color: 'text-orange-500',
    multipliers: { down: 1.0, up: 1.2 }
  }
};

// Значения по умолчанию для порогов классификации
const DEFAULT_THRESHOLDS = {
  // Stable пороги
  stable_min_cap: 100,        // $100B (в миллиардах для UI)
  stable_max_beta: 1.2,
  
  // Tech-Growth пороги
  tech_growth_min_cap: 10,    // $10B — минимум для tech-growth
  tech_growth_max_cap: 250,   // $250B — максимум для tech-growth
  
  // Illiquid пороги
  illiquid_max_cap: 5,        // $5B (в миллиардах для UI)
  illiquid_min_beta: 2.0,
  illiquid_max_volume: 2,     // 2M shares (в миллионах для UI)
  
  // Mega-cap исключение (TSLA, NVDA не попадают в illiquid)
  mega_cap_threshold: 50,     // $50B — порог mega-cap
  high_volume_threshold: 10,  // 10M акций — порог высокого объёма
  
  // Event-driven настройки для growth
  earnings_proximity_days: 14,    // Дней до earnings для усиления
  event_driven_down_mult: 0.9,    // Множитель для down (0.75 * 0.9 = 0.675)
  event_driven_up_mult: 0.95,     // Множитель для up (0.9 * 0.95 = 0.855)
};

// Ключ для localStorage
const STORAGE_KEY = 'stock_groups_settings';

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

// Загрузка настроек из API
const loadSettingsFromAPI = async () => {
  try {
    const response = await fetch('/api/stock-groups-settings');
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.error('Ошибка загрузки настроек групп акций из API:', e);
  }
  return null;
};

// Сохранение настроек через API
const saveSettingsToAPI = async (settings) => {
  try {
    const response = await fetch('/api/stock-groups-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    return response.ok;
  } catch (e) {
    console.error('Ошибка сохранения настроек групп акций:', e);
    return false;
  }
};

// Иконки для групп
const GROUP_ICONS = {
  stable: Shield,
  'tech-growth': TrendingUp,
  growth: TrendingUp,
  illiquid: Zap
};

// ============================================================================
// КОМПОНЕНТ
// ============================================================================

function SettingsStockGroups() {
  // State для коэффициентов групп
  const [groups, setGroups] = useState(DEFAULT_STOCK_GROUPS);
  
  // State для порогов классификации
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  
  // State для отслеживания изменений
  const [hasChanges, setHasChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null

  // Загрузка настроек при монтировании из API
  // ВАЖНО: Мержим сохранённые настройки с дефолтными, чтобы новые поля не были пустыми
  useEffect(() => {
    const loadData = async () => {
      const saved = await loadSettingsFromAPI();
      if (saved) {
        if (saved.groups) setGroups({ ...DEFAULT_STOCK_GROUPS, ...saved.groups });
        if (saved.thresholds) setThresholds({ ...DEFAULT_THRESHOLDS, ...saved.thresholds });
      }
    };
    loadData();
  }, []);

  // Обработчик изменения коэффициента группы
  const handleMultiplierChange = (groupKey, multType, value) => {
    const numValue = parseFloat(value) || 0;
    setGroups(prev => ({
      ...prev,
      [groupKey]: {
        ...prev[groupKey],
        multipliers: {
          ...prev[groupKey].multipliers,
          [multType]: numValue
        }
      }
    }));
    setHasChanges(true);
    setSaveStatus(null);
  };

  // Обработчик изменения порога
  const handleThresholdChange = (key, value) => {
    const numValue = parseFloat(value) || 0;
    setThresholds(prev => ({
      ...prev,
      [key]: numValue
    }));
    setHasChanges(true);
    setSaveStatus(null);
  };

  // Сохранение настроек через API
  const handleSave = async () => {
    const success = await saveSettingsToAPI({ groups, thresholds });
    setSaveStatus(success ? 'success' : 'error');
    if (success) {
      setHasChanges(false);
      // Автоматически скрываем статус через 3 секунды
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  // Сброс к значениям по умолчанию
  const handleReset = () => {
    setGroups(DEFAULT_STOCK_GROUPS);
    setThresholds(DEFAULT_THRESHOLDS);
    setHasChanges(true);
    setSaveStatus(null);
  };

  return (
    <div className="space-y-6">
      {/* Заголовок раздела */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Группы акций</h2>
        <p className="text-muted-foreground mt-1">
          Настройка параметров классификации акций и коэффициентов корректировки P&L
        </p>
      </div>

      {/* Карточка с коэффициентами групп */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Коэффициенты корректировки P&L
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[300px]">
                  <p>Коэффициенты применяются к расчётному P&L:</p>
                  <p className="mt-1"><strong>Down</strong> — для убытков (P&L &lt; 0)</p>
                  <p><strong>Up</strong> — для прибылей (P&L &gt; 0)</p>
                  <p className="mt-1 text-xs">Формула: adjusted_pnl = base_pnl × коэффициент</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <CardDescription>
            Коэффициенты для корректировки прогноза прибыли/убытка по группам акций
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {Object.entries(groups).map(([groupKey, group]) => {
              const IconComponent = GROUP_ICONS[groupKey];
              return (
                <div key={groupKey} className="border rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <IconComponent className={`h-5 w-5 ${group.color}`} />
                    <div>
                      <h4 className="font-medium">{group.label}</h4>
                      <p className="text-sm text-muted-foreground">{group.description}</p>
                    </div>
                    <Badge variant="outline" className="ml-auto">
                      {groupKey}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`${groupKey}-down`} className="text-sm">
                        Коэффициент Down (убытки)
                      </Label>
                      <Input
                        id={`${groupKey}-down`}
                        type="number"
                        step="0.05"
                        min="0"
                        max="2"
                        value={group.multipliers.down}
                        onChange={(e) => handleMultiplierChange(groupKey, 'down', e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${groupKey}-up`} className="text-sm">
                        Коэффициент Up (прибыль)
                      </Label>
                      <Input
                        id={`${groupKey}-up`}
                        type="number"
                        step="0.05"
                        min="0"
                        max="2"
                        value={group.multipliers.up}
                        onChange={(e) => handleMultiplierChange(groupKey, 'up', e.target.value)}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Карточка с порогами классификации */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Пороги классификации
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[350px]">
                  <p className="font-medium">Приоритет классификации:</p>
                  <p className="mt-1">1. <strong>Illiquid</strong> — если ЛЮБОЕ условие выполнено</p>
                  <p>2. <strong>Stable</strong> — если ВСЕ условия выполнены</p>
                  <p>3. <strong>Growth</strong> — по умолчанию</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <CardDescription>
            Параметры для автоматического определения группы акции
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Пороги для Stable */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="h-5 w-5 text-blue-500" />
                <div>
                  <h4 className="font-medium">Стабильные (Stable)</h4>
                  <p className="text-sm text-muted-foreground">Все условия должны выполняться</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stable_min_cap" className="text-sm">
                    Мин. капитализация ($ млрд)
                  </Label>
                  <Input
                    id="stable_min_cap"
                    type="number"
                    step="10"
                    min="0"
                    value={thresholds.stable_min_cap}
                    onChange={(e) => handleThresholdChange('stable_min_cap', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stable_max_beta" className="text-sm">
                    Макс. Beta
                  </Label>
                  <Input
                    id="stable_max_beta"
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    value={thresholds.stable_max_beta}
                    onChange={(e) => handleThresholdChange('stable_max_beta', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Пороги для Tech-Growth */}
            <div className="border rounded-lg p-4 border-purple-300 bg-purple-50/30">
              <div className="flex items-center gap-3 mb-4">
                <TrendingUp className="h-5 w-5 text-purple-500" />
                <div>
                  <h4 className="font-medium">Tech Growth</h4>
                  <p className="text-sm text-muted-foreground">Technology сектор + капитализация в диапазоне</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tech_growth_min_cap" className="text-sm">
                    Мин. капитализация ($ млрд)
                  </Label>
                  <Input
                    id="tech_growth_min_cap"
                    type="number"
                    step="5"
                    min="0"
                    value={thresholds.tech_growth_min_cap}
                    onChange={(e) => handleThresholdChange('tech_growth_min_cap', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tech_growth_max_cap" className="text-sm">
                    Макс. капитализация ($ млрд)
                  </Label>
                  <Input
                    id="tech_growth_max_cap"
                    type="number"
                    step="10"
                    min="0"
                    value={thresholds.tech_growth_max_cap}
                    onChange={(e) => handleThresholdChange('tech_growth_max_cap', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Пороги для Illiquid */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-3 mb-4">
                <Zap className="h-5 w-5 text-orange-500" />
                <div>
                  <h4 className="font-medium">Неликвидные (Illiquid)</h4>
                  <p className="text-sm text-muted-foreground">Любое условие должно выполняться</p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="illiquid_max_cap" className="text-sm">
                    Макс. капитализация ($ млрд)
                  </Label>
                  <Input
                    id="illiquid_max_cap"
                    type="number"
                    step="1"
                    min="0"
                    value={thresholds.illiquid_max_cap}
                    onChange={(e) => handleThresholdChange('illiquid_max_cap', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="illiquid_min_beta" className="text-sm">
                    Мин. Beta
                  </Label>
                  <Input
                    id="illiquid_min_beta"
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    value={thresholds.illiquid_min_beta}
                    onChange={(e) => handleThresholdChange('illiquid_min_beta', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="illiquid_max_volume" className="text-sm">
                    Макс. объём (млн акций)
                  </Label>
                  <Input
                    id="illiquid_max_volume"
                    type="number"
                    step="0.5"
                    min="0"
                    value={thresholds.illiquid_max_volume}
                    onChange={(e) => handleThresholdChange('illiquid_max_volume', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Mega-cap исключение */}
            <div className="border rounded-lg p-4 border-dashed border-purple-300 bg-purple-50/30">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="h-5 w-5 text-purple-500" />
                <div>
                  <h4 className="font-medium">Mega-cap исключение</h4>
                  <p className="text-sm text-muted-foreground">
                    TSLA, NVDA и др. не попадают в Illiquid даже при высоком beta
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mega_cap_threshold" className="text-sm">
                    Порог Mega-cap ($ млрд)
                  </Label>
                  <Input
                    id="mega_cap_threshold"
                    type="number"
                    step="10"
                    min="0"
                    value={thresholds.mega_cap_threshold}
                    onChange={(e) => handleThresholdChange('mega_cap_threshold', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="high_volume_threshold" className="text-sm">
                    Порог высокого объёма (млн акций)
                  </Label>
                  <Input
                    id="high_volume_threshold"
                    type="number"
                    step="1"
                    min="0"
                    value={thresholds.high_volume_threshold}
                    onChange={(e) => handleThresholdChange('high_volume_threshold', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Growth — по умолчанию + Event-driven */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-3 mb-4">
                <TrendingUp className="h-5 w-5 text-green-500" />
                <div>
                  <h4 className="font-medium">Рост/События (Growth)</h4>
                  <p className="text-sm text-muted-foreground">
                    По умолчанию + усиление перед earnings
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="earnings_proximity_days" className="text-sm">
                    Дней до earnings
                  </Label>
                  <Input
                    id="earnings_proximity_days"
                    type="number"
                    step="1"
                    min="1"
                    max="30"
                    value={thresholds.earnings_proximity_days}
                    onChange={(e) => handleThresholdChange('earnings_proximity_days', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event_driven_down_mult" className="text-sm">
                    Event Down множитель
                  </Label>
                  <Input
                    id="event_driven_down_mult"
                    type="number"
                    step="0.05"
                    min="0.5"
                    max="1"
                    value={thresholds.event_driven_down_mult}
                    onChange={(e) => handleThresholdChange('event_driven_down_mult', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event_driven_up_mult" className="text-sm">
                    Event Up множитель
                  </Label>
                  <Input
                    id="event_driven_up_mult"
                    type="number"
                    step="0.05"
                    min="0.5"
                    max="1"
                    value={thresholds.event_driven_up_mult}
                    onChange={(e) => handleThresholdChange('event_driven_up_mult', e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Итоговые коэффициенты перед earnings: Down = 0.75 × {thresholds.event_driven_down_mult} = {(0.75 * thresholds.event_driven_down_mult).toFixed(3)}, 
                Up = 0.9 × {thresholds.event_driven_up_mult} = {(0.9 * thresholds.event_driven_up_mult).toFixed(3)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Кнопки действий */}
      <div className="flex items-center gap-4">
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          Сохранить настройки
        </Button>
        
        <Button 
          variant="outline" 
          onClick={handleReset}
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Сбросить по умолчанию
        </Button>

        {/* Статус сохранения */}
        {saveStatus === 'success' && (
          <span className="text-sm text-green-600">✓ Настройки сохранены</span>
        )}
        {saveStatus === 'error' && (
          <span className="text-sm text-red-600">✗ Ошибка сохранения</span>
        )}
        {hasChanges && !saveStatus && (
          <span className="text-sm text-muted-foreground">Есть несохранённые изменения</span>
        )}
      </div>

      {/* Информационный блок */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <h4 className="font-medium mb-2">Как работает классификация (приоритет)</h4>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>1. Illiquid</strong> — проверяется первой. Если капитализация &lt; {thresholds.illiquid_max_cap}B, 
              ИЛИ объём &lt; {thresholds.illiquid_max_volume}M → акция неликвидная.
            </p>
            <p>
              <strong>2. Stable</strong> — если капитализация &gt; {thresholds.stable_min_cap}B 
              И beta &lt; {thresholds.stable_max_beta} И сектор стабильный (НЕ Technology) → акция стабильная.
            </p>
            <p>
              <strong className="text-purple-600">3. Tech Growth</strong> — если сектор Technology 
              И капитализация от {thresholds.tech_growth_min_cap}B до {thresholds.tech_growth_max_cap}B → tech-growth (HUBS, ZS, DDOG).
            </p>
            <p>
              <strong>4. Growth</strong> — всё остальное. Если до earnings &lt; {thresholds.earnings_proximity_days} дней, 
              применяется event-driven усиление.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SettingsStockGroups;
