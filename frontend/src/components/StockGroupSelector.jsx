import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Building2, Zap, HelpCircle, RefreshCw, Check } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Badge } from './ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

/**
 * Компонент StockGroupSelector - селектор группы акции для корректировки P&L
 * ЗАЧЕМ: Позволяет автоматически или вручную выбрать группу акции для применения
 *        корректирующих коэффициентов к прогнозу P&L
 * Затрагивает: калькулятор опционов, расчёт P&L, NewTikerFinder
 * 
 * Группы:
 * - stable: Large-cap стабильные акции (коэфф. 1.0/1.0)
 * - growth: Growth/event-driven акции (коэфф. 0.75/0.9)
 * - illiquid: Неликвидные/высоковолатильные (коэфф. 1.0/1.2)
 */

// ============================================================================
// КОНСТАНТЫ
// ============================================================================

/** Базовая конфигурация групп акций (иконки и цвета — не меняются) */
const STOCK_GROUPS_BASE = {
  stable: {
    shortLabel: 'Стаб.',
    icon: Building2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  'tech-growth': {
    shortLabel: 'Tech',
    icon: TrendingUp,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
  },
  growth: {
    shortLabel: 'Рост',
    icon: TrendingUp,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
  },
  illiquid: {
    shortLabel: 'Нелик.',
    icon: Zap,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
  }
};

/** Дефолтные значения (используются если API недоступен) */
const DEFAULT_STOCK_GROUPS = {
  stable: {
    label: 'Стабильные',
    description: 'Large-cap акции с низкой волатильностью',
    multipliers: { down: 1.3, up: 1.0 }
  },
  'tech-growth': {
    label: 'Tech Growth',
    description: 'Tech-акции $10-250B (HUBS, ZS, DDOG)',
    multipliers: { down: 1.2, up: 1.0 }
  },
  growth: {
    label: 'Рост/События',
    description: 'Growth-акции, event-driven, высокая IV',
    multipliers: { down: 1.3, up: 0.85 }
  },
  illiquid: {
    label: 'Неликвидные',
    description: 'Small-cap, низкий объём, высокий beta',
    multipliers: { down: 1.0, up: 1.0 }
  }
};

/** Кэш настроек из API */
let _stockGroupsCache = null;
let _stockGroupsCacheTime = 0;
const CACHE_TTL = 60000; // 1 минута

/** Загрузка настроек групп из API */
const loadStockGroupsFromAPI = async () => {
  const now = Date.now();
  if (_stockGroupsCache && (now - _stockGroupsCacheTime) < CACHE_TTL) {
    return _stockGroupsCache;
  }
  
  try {
    const response = await fetch('/api/stock-groups-settings');
    if (response.ok) {
      const data = await response.json();
      _stockGroupsCache = data.groups || DEFAULT_STOCK_GROUPS;
      _stockGroupsCacheTime = now;
      return _stockGroupsCache;
    }
  } catch (e) {
    console.error('Ошибка загрузки настроек групп акций:', e);
  }
  return DEFAULT_STOCK_GROUPS;
};

/** Синхронный геттер для STOCK_GROUPS (использует кэш) */
const getStockGroups = () => {
  const groups = _stockGroupsCache || DEFAULT_STOCK_GROUPS;
  // Мержим с базовыми настройками (иконки, цвета)
  const result = {};
  for (const [key, base] of Object.entries(STOCK_GROUPS_BASE)) {
    const settings = groups[key] || DEFAULT_STOCK_GROUPS[key];
    result[key] = {
      ...base,
      label: settings.label || DEFAULT_STOCK_GROUPS[key].label,
      description: settings.description || DEFAULT_STOCK_GROUPS[key].description,
      multipliers: settings.multipliers || DEFAULT_STOCK_GROUPS[key].multipliers
    };
  }
  return result;
};

// Для обратной совместимости — динамический геттер
const STOCK_GROUPS = new Proxy({}, {
  get: (target, prop) => getStockGroups()[prop],
  ownKeys: () => Object.keys(STOCK_GROUPS_BASE),
  getOwnPropertyDescriptor: (target, prop) => ({
    enumerable: true,
    configurable: true,
    value: getStockGroups()[prop]
  })
});

/** Ключ для localStorage переопределений групп */
const GROUP_OVERRIDE_KEY = 'stock_group_overrides';


// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/** Получить переопределения групп из localStorage */
const getGroupOverrides = () => {
  try {
    const overrides = localStorage.getItem(GROUP_OVERRIDE_KEY);
    return overrides ? JSON.parse(overrides) : {};
  } catch {
    return {};
  }
};

/** Сохранить переопределение группы в localStorage */
const saveGroupOverride = (symbol, group) => {
  try {
    const overrides = getGroupOverrides();
    if (group === null) {
      delete overrides[symbol];
    } else {
      overrides[symbol] = group;
    }
    localStorage.setItem(GROUP_OVERRIDE_KEY, JSON.stringify(overrides));
  } catch (error) {
    console.error('Ошибка сохранения переопределения группы:', error);
  }
};

/** Получить переопределение группы для тикера */
const getGroupOverride = (symbol) => {
  const overrides = getGroupOverrides();
  return overrides[symbol] || null;
};


// ============================================================================
// КОМПОНЕНТ
// ============================================================================

/**
 * @param {Object} props
 * @param {string} props.symbol - Тикер акции
 * @param {Object} props.classification - Результат классификации от API (или null)
 * @param {Function} props.onGroupChange - Callback при изменении группы (group, multipliers)
 * @param {Function} props.onRefreshClassification - Callback для принудительного обновления классификации
 * @param {boolean} props.isLoading - Флаг загрузки классификации
 * @param {boolean} props.compact - Компактный режим отображения
 * @param {boolean} props.disabled - Отключить селектор
 */
function StockGroupSelector({
  symbol,
  classification,
  onGroupChange,
  onRefreshClassification,
  isLoading = false,
  compact = false,
  disabled = false
}) {
  // Состояние переопределения группы (null = авто)
  const [groupOverride, setGroupOverride] = useState(null);
  
  // Загружаем настройки групп из API при монтировании
  useEffect(() => {
    loadStockGroupsFromAPI();
  }, []);
  
  // Загружаем переопределение из localStorage ТОЛЬКО после получения классификации от API
  // ЗАЧЕМ: Избегаем показа старого переопределения до получения актуальных данных
  useEffect(() => {
    const originalGroup = classification?.originalGroup || classification?.group;
    
    console.log('[StockGroupSelector] Classification received:', {
      symbol,
      group: classification?.group,
      originalGroup: classification?.originalGroup,
      down_mult: classification?.down_mult,
      up_mult: classification?.up_mult
    });
    
    if (!symbol || !originalGroup) {
      setGroupOverride(null);
      return;
    }
    
    const savedOverride = getGroupOverride(symbol.toUpperCase());
    
    console.log('[StockGroupSelector] Override check:', {
      savedOverride,
      originalGroup,
      willOverride: savedOverride && savedOverride !== originalGroup
    });
    
    // Загружаем override только если он отличается от авто-группы
    if (savedOverride && savedOverride !== originalGroup) {
      setGroupOverride(savedOverride);
    } else {
      // Если override совпадает с авто или отсутствует — очищаем
      setGroupOverride(null);
      if (savedOverride) {
        saveGroupOverride(symbol.toUpperCase(), null);
      }
    }
  }, [symbol, classification?.originalGroup, classification?.group]);
  
  // Эффективная группа (override или auto)
  // ВАЖНО: Показываем loading если нет классификации и нет переопределения
  const effectiveGroup = groupOverride || classification?.group;
  const groupConfig = effectiveGroup ? (STOCK_GROUPS[effectiveGroup] || STOCK_GROUPS.growth) : null;
  const isOverridden = groupOverride !== null;
  
  // Показываем состояние загрузки если есть тикер но нет группы
  const showLoading = symbol && !effectiveGroup && !isOverridden;
  
  // Обработчик изменения группы
  const handleGroupChange = useCallback((newGroup) => {
    // Если выбрана та же группа что и auto — сбрасываем override
    const autoGroup = classification?.group || 'growth';
    const newOverride = newGroup === autoGroup ? null : newGroup;
    
    setGroupOverride(newOverride);
    saveGroupOverride(symbol?.toUpperCase(), newOverride);
    
    // Получаем коэффициенты для новой группы
    const newGroupConfig = STOCK_GROUPS[newGroup] || STOCK_GROUPS.growth;
    const multipliers = {
      down_mult: newGroupConfig.multipliers.down,
      up_mult: newGroupConfig.multipliers.up
    };
    
    // Вызываем callback
    if (onGroupChange) {
      onGroupChange(newGroup, multipliers);
    }
  }, [symbol, classification, onGroupChange]);
  
  // Сброс на авто
  // ВАЖНО: Используем originalGroup — исходную группу из API, а не текущую (которая может быть переопределена)
  const handleResetToAuto = useCallback(() => {
    const autoGroup = classification?.originalGroup || classification?.group || 'growth';
    setGroupOverride(null);
    saveGroupOverride(symbol?.toUpperCase(), null);
    
    const autoGroupConfig = STOCK_GROUPS[autoGroup] || STOCK_GROUPS.growth;
    const multipliers = {
      down_mult: autoGroupConfig.multipliers.down,
      up_mult: autoGroupConfig.multipliers.up
    };
    
    if (onGroupChange) {
      onGroupChange(autoGroup, multipliers);
    }
  }, [symbol, classification, onGroupChange]);
  
  // Если нет тикера — не показываем
  if (!symbol) {
    return null;
  }
  
  // Если нет классификации и нет переопределения - показываем загрузку
  const IconComponent = groupConfig?.icon || RefreshCw;
  
  // Компактный режим — только бейдж
  if (compact) {
    if (!groupConfig) {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
          Загрузка...
        </Badge>
      );
    }
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={`${groupConfig.bgColor} ${groupConfig.borderColor} ${groupConfig.color} cursor-pointer`}
            >
              <IconComponent className="h-3 w-3 mr-1" />
              {groupConfig.shortLabel}
              {isOverridden && <span className="ml-1 text-xs">✎</span>}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">{groupConfig.label}</p>
            <p className="text-xs text-muted-foreground">{groupConfig.description}</p>
            <p className="text-xs mt-1">
              Коэфф.: ↓{groupConfig.multipliers.down} / ↑{groupConfig.multipliers.up}
            </p>
            {isOverridden && (
              <p className="text-xs text-yellow-500 mt-1">Переопределено вручную</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  // Полный режим — селектор
  return (
    <div className="flex items-center gap-2">
      {/* Селектор */}
      <Select
        value={effectiveGroup}
        onValueChange={handleGroupChange}
        disabled={disabled || isLoading}
      >
        <SelectTrigger className={`w-[160px] h-8 ${isOverridden ? 'border-yellow-500/50' : ''}`}>
          <SelectValue>
            <div className="flex items-center gap-2">
              {showLoading || isLoading ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span className="text-sm text-muted-foreground">Определение...</span>
                </>
              ) : groupConfig ? (
                <>
                  <IconComponent className={`h-3 w-3 ${groupConfig.color}`} />
                  <span className="text-sm">{groupConfig.label}</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span className="text-sm text-muted-foreground">Загрузка...</span>
                </>
              )}
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(STOCK_GROUPS).map(([key, config]) => {
            const ItemIcon = config.icon;
            // Используем originalGroup (исходная группа из API) для определения "авто"
            // Если originalGroup не задан — используем group (для обратной совместимости)
            const originalAutoGroup = classification?.originalGroup || classification?.group || 'growth';
            const isAuto = key === originalAutoGroup;
            
            return (
              <SelectItem key={key} value={key}>
                <div className="flex items-center gap-2">
                  <ItemIcon className={`h-4 w-4 ${config.color}`} />
                  <span>{config.label}</span>
                  {isAuto && (
                    <Badge variant="outline" className="ml-1 text-xs py-0 px-1">
                      авто
                    </Badge>
                  )}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      
      {/* Кнопка принудительного обновления классификации */}
      {onRefreshClassification && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onRefreshClassification}
                disabled={isLoading || disabled}
                className={`p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground ${isLoading ? 'animate-spin' : ''}`}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Обновить авто-определение группы</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      
      {/* Индикатор переопределения и кнопка сброса */}
      {isOverridden && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleResetToAuto}
                className="p-1 hover:bg-muted rounded text-yellow-500 hover:text-yellow-600"
              >
                <Check className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Сбросить на авто {classification?.originalGroup || classification?.group ? `(${STOCK_GROUPS[classification.originalGroup || classification.group]?.label || 'Рост/События'})` : ''}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      
      {/* Подсказка с коэффициентами */}
      {groupConfig && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[250px]">
              <p className="font-medium mb-1">{groupConfig.label}</p>
              <p className="text-xs text-muted-foreground mb-2">{groupConfig.description}</p>
              <div className="text-xs space-y-1">
                <p>Коэффициенты корректировки P&L:</p>
                <p>• Убытки: ×{groupConfig.multipliers.down}</p>
                <p>• Прибыль: ×{groupConfig.multipliers.up}</p>
              </div>
              {classification?.features && (
                <div className="text-xs mt-2 pt-2 border-t border-border">
                  <p className="text-muted-foreground">Данные Finnhub:</p>
                  {classification.features.marketCap > 0 && (
                    <p>Cap: ${(classification.features.marketCap / 1e9).toFixed(1)}B</p>
                  )}
                  {classification.features.beta && (
                    <p>Beta: {classification.features.beta.toFixed(2)}</p>
                  )}
                  {classification.features.sector && (
                    <p>Сектор: {classification.features.sector}</p>
                  )}
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

export default StockGroupSelector;

// Экспорт констант для использования в других компонентах
export { STOCK_GROUPS, getGroupOverride, saveGroupOverride };
