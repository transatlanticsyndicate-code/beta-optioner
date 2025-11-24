import React from 'react';
import { Eye, EyeOff, ChevronDown, Trash2, Loader2, Save, RotateCcw } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { getAllStrategies } from '../../config/optionsStrategies';
import { calculateOptionPLValue } from '../../utils/optionPricing';

// Helper: format ISO date (YYYY-MM-DD) to display format (DD.MM.YY)
const formatDateForDisplay = (isoDate) => {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  const shortYear = year.slice(-2);
  return `${day}.${month}.${shortYear}`;
};

function OptionsTable({ 
  options, 
  toggleOptionVisibility, 
  deleteOption, 
  addOption,
  setSaveDialogOpen,
  onSelectStrategy,
  onUpdateOption,
  onSaveCustomStrategy,
  onDeleteCustomStrategy,
  customStrategies = [],
  availableDates = [],
  availableStrikes = [],
  selectedTicker = '',
  currentPrice = 0,
  loadStrikesForDate,
  loadOptionDetails,
  strikesByDate = {},
  loadingStrikesForDate = {},
  isLoadingDates = false,
  selectedStrategyName = '',
  onSaveConfiguration,
  onResetCalculator,
  daysRemaining = 0,
  targetPrice = 0
}) {
  // console.log('📋 OptionsTable render:', { 
  //   optionsCount: options.length, 
  // });
  
  const [customStrategyName, setCustomStrategyName] = React.useState('');
  const [saveDialogOpen, setSaveDialogOpenLocal] = React.useState(false);
  const [showAllStrikesForOption, setShowAllStrikesForOption] = React.useState({}); // { optionId: true/false }
  const scrolledToAtm = React.useRef(new Set()); // Отслеживаем, для каких опционов уже был скролл
  
  // Функция фильтрации страйков (показываем только ±20% от цены)
  const filterStrikes = (strikes, optionId) => {
    if (showAllStrikesForOption[optionId] || !currentPrice || currentPrice <= 0) {
      return strikes;
    }
    
    const minStrike = currentPrice * 0.8; // -20%
    const maxStrike = currentPrice * 1.2; // +20%
    
    const filtered = strikes.filter(strike => strike >= minStrike && strike <= maxStrike);
    
    // Если после фильтрации осталось мало страйков (< 5), показываем все
    if (filtered.length < 5) {
      return strikes;
    }
    
    // Всегда включаем текущий страйк опциона, даже если он далеко от цены
    // Это важно для случаев, когда флажок перетащен далеко от текущей цены
    const option = options.find(opt => opt.id === optionId);
    if (option && option.strike && !filtered.includes(option.strike)) {
      return [...filtered, option.strike].sort((a, b) => a - b);
    }
    
    return filtered;
  };
  
  // Функция группировки страйков
  const groupStrikes = (strikes) => {
    if (!currentPrice || currentPrice <= 0) {
      return { below: [], atm: [], above: [] };
    }
    
    const atmRange = currentPrice * 0.1; // ±10% для "около цены"
    const minAtm = currentPrice - atmRange;
    const maxAtm = currentPrice + atmRange;
    
    return {
      below: strikes.filter(s => s < minAtm),
      atm: strikes.filter(s => s >= minAtm && s <= maxAtm),
      above: strikes.filter(s => s > maxAtm)
    };
  };
  
  // Найти ближайший страйк к текущей цене (ATM)
  const findAtmStrike = (strikes) => {
    if (!currentPrice || strikes.length === 0) return null;
    
    return strikes.reduce((closest, strike) => {
      const currentDiff = Math.abs(strike - currentPrice);
      const closestDiff = Math.abs(closest - currentPrice);
      return currentDiff < closestDiff ? strike : closest;
    });
  };
  
  // Проверяем, есть ли опционы
  const hasOptions = options && options.length > 0;
  
  // Получаем список стратегий
  const strategies = getAllStrategies();

  // Обработчик изменения поля опциона
  const handleFieldChange = (optionId, field, value) => {
    if (onUpdateOption) {
      onUpdateOption(optionId, field, value);
    }
  };
  
  // Обработчик изменения даты с загрузкой страйков
  const handleDateChange = async (optionId, isoDate) => {
    // Сначала обновляем дату (ISO формат)
    handleFieldChange(optionId, 'date', isoDate);
    
    // Находим опцион
    const option = options.find(opt => opt.id === optionId);
    
    if (isoDate && loadStrikesForDate && selectedTicker) {
      // Загружаем страйки для этой даты
      await loadStrikesForDate(selectedTicker, isoDate);
      
      // Если у опциона уже есть страйк — загружаем детали
      if (option && option.strike && loadOptionDetails) {
        await loadOptionDetails(optionId, selectedTicker, isoDate, option.strike, option.type);
      }
    }
  };
  
  // Обработчик изменения страйка с загрузкой деталей (bid/ask/volume/oi)
  const handleStrikeChange = async (optionId, strike) => {
    // Сначала обновляем страйк
    handleFieldChange(optionId, 'strike', strike);
    
    // Находим опцион
    const option = options.find(opt => opt.id === optionId);
    if (!option || !option.date) return;
    
    if (option.date && loadOptionDetails && selectedTicker) {
      // Загружаем детали для этого опциона (дата уже в ISO формате)
      await loadOptionDetails(optionId, selectedTicker, option.date, strike, option.type);
    }
  };

  // Функция для получения цвета и иконки маркера настроения
  const getSentimentBadge = (sentiment) => {
    switch (sentiment) {
      case 'bullish':
        return { color: 'bg-green-100 text-green-700 border-green-200', icon: '↗', label: 'Бычья' };
      case 'bearish':
        return { color: 'bg-red-100 text-red-700 border-red-200', icon: '↘', label: 'Медвежья' };
      case 'neutral':
        return { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: '→', label: 'Нейтральная' };
      default:
        return { color: 'bg-gray-100 text-gray-700 border-gray-200', icon: '•', label: 'Неизвестно' };
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">
          Опционы
          {selectedStrategyName && (
            <span className="text-cyan-500 ml-2">/ {selectedStrategyName}</span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                size="sm" 
                className="h-8 bg-cyan-500 hover:bg-cyan-600 text-white"
                disabled={isLoadingDates}
              >
                +ОПЦИОН
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => addOption("Buy", "CALL")}>
                <span className="text-green-600 font-medium mr-2">Buy</span>
                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium">CALL</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addOption("Buy", "PUT")}>
                <span className="text-green-600 font-medium mr-2">Buy</span>
                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-medium">PUT</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addOption("Sell", "CALL")}>
                <span className="text-red-600 font-medium mr-2">Sell</span>
                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium">CALL</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addOption("Sell", "PUT")}>
                <span className="text-red-600 font-medium mr-2">Sell</span>
                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-medium">PUT</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 bg-transparent text-foreground hover:text-foreground"
                disabled={isLoadingDates}
              >
                Выбрать стратегию
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80 max-h-[400px] overflow-y-auto">
              {/* Персональные стратегии */}
              {customStrategies.length > 0 && (
                <>
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                    Мои стратегии
                  </div>
                  {customStrategies.map((strategy) => (
                    <DropdownMenuItem 
                      key={strategy.id}
                      onClick={() => onSelectStrategy && onSelectStrategy(strategy.id)}
                      className="flex items-center justify-between py-3 px-3 cursor-pointer"
                    >
                      <div className="flex flex-col flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded text-xs font-medium border bg-purple-100 text-purple-700 border-purple-200">
                            ⭐ Моя
                          </span>
                          <span className="font-medium text-sm">{strategy.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {strategy.positions.length} позиций
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onDeleteCustomStrategy) {
                            onDeleteCustomStrategy(strategy.id);
                          }
                        }}
                        className="ml-2 p-1 hover:bg-destructive/10 rounded transition-colors"
                        title="Удалить стратегию"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </DropdownMenuItem>
                  ))}
                  <div className="h-px bg-border my-2" />
                </>
              )}
              
              {/* Встроенные стратегии */}
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                Встроенные стратегии
              </div>
              {strategies.map((strategy) => {
                const badge = getSentimentBadge(strategy.sentiment);
                return (
                  <DropdownMenuItem 
                    key={strategy.id}
                    onClick={() => onSelectStrategy && onSelectStrategy(strategy.id)}
                    className="flex flex-col items-start py-3 px-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 w-full mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${badge.color}`}>
                        {badge.icon} {badge.label}
                      </span>
                      <span className="font-medium text-sm">{strategy.nameRu}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {strategy.shortDescription}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 bg-transparent text-foreground hover:text-foreground"
              >
                Сохранить
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setSaveDialogOpen && setSaveDialogOpen(true)}>
                <span>Сохранить текущую стратегию</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSaveConfiguration && onSaveConfiguration()}>
                <span>Сохранить текущую конфигурацию</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            className="h-8 w-8 p-0 bg-red-500 hover:bg-red-600 text-white"
            onClick={() => {
              if (window.confirm('Вы уверены? Все опционы будут удалены.')) {
                options.forEach(opt => deleteOption(opt.id));
              }
            }}
            title="Удалить все опционы"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="h-8 w-8 p-0 bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={() => {
                    if (window.confirm('Вы уверены? Калькулятор будет полностью сброшен.')) {
                      onResetCalculator?.();
                    }
                  }}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Полный сброс калькулятора</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {hasOptions && (
        <div className="space-y-2">
          <div className="grid grid-cols-[40px_120px_90px_90px_100px_80px_80px_80px_80px_100px_100px_40px] items-center text-xs font-medium text-muted-foreground px-2" style={{ gap: '8px' }}>
            <div></div>
            <div className="text-left ml-2">Тип</div>
            <div className="text-right ml-2">Дата</div>
            <div className="text-right ml-2">Страйк</div>
            <div className="text-right ml-2">Кол-во</div>
            <div className="text-right ml-2">Премия</div>
            <div className="text-right ml-2">BID</div>
            <div className="text-right ml-2">ASK</div>
            <div className="text-right ml-2">OI</div>
            <div className="text-right ml-2">VOL</div>
            <div className="text-right ml-2">P&L</div>
            <div></div>
          </div>

          {options.map((option) => (
          <div
            key={option.id}
            className={`grid grid-cols-[40px_120px_90px_90px_100px_80px_80px_80px_80px_100px_100px_40px] items-center text-sm border rounded-md p-2 ${
              !option.visible ? "[&>*]:text-[#AAAAAA]" : ""
            }`}
            style={{ gap: '8px' }}
          >
            <button
              onClick={() => toggleOptionVisibility(option.id)}
              className="text-muted-foreground hover:text-foreground w-[30px] flex justify-center"
            >
              {option.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <div className="flex items-center gap-1 ml-2">
              <span className={`text-xs font-medium ${option.action === "Buy" ? "text-green-600" : "text-red-600"}`}>
                {option.action}
              </span>
              <span
                className={`${
                  option.type === "CALL" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                } px-1.5 py-0.5 rounded text-xs font-medium`}
              >
                {option.type}
              </span>
            </div>
            <Select
              value={option.date}
              onValueChange={(value) => handleDateChange(option.id, value)}
            >
              <SelectTrigger className="h-7 text-right ml-2 text-xs text-muted-foreground px-1 border-input font-bold">
                <SelectValue placeholder="Дата">
                  {option.date ? formatDateForDisplay(option.date) : "Дата"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableDates.length > 0 ? (
                  availableDates.map((isoDate) => (
                    <SelectItem key={isoDate} value={isoDate}>
                      {formatDateForDisplay(isoDate)}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value={option.date}>{formatDateForDisplay(option.date)}</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Select
              value={option.strike ? option.strike.toString() : ""}
              onValueChange={(value) => handleStrikeChange(option.id, parseFloat(value))}
              disabled={(() => {
                // Если даты нет или она пустая - disabled
                if (!option.date || option.date === "") return true;
                // Если идет загрузка страйков - disabled (дата уже в ISO формате)
                return loadingStrikesForDate[option.date];
              })()}
            >
              <SelectTrigger className="h-7 text-right ml-2 font-medium text-sm px-1 border-input">
                {(() => {
                  const isLoading = option.date && loadingStrikesForDate[option.date];
                  
                  if (isLoading) {
                    return (
                      <div className="flex items-center justify-center">
                        <Loader2 className="h-3 w-3 animate-spin text-cyan-500" />
                      </div>
                    );
                  }
                  
                  return <SelectValue placeholder="" />;
                })()}
              </SelectTrigger>
              <SelectContent className="max-h-[500px]">
                <style>{`
                  [data-radix-select-viewport] {
                    padding-right: 0 !important;
                  }
                `}</style>
                {(() => {
                  // Получаем страйки для этой даты (дата уже в ISO формате)
                  let allStrikes = option.date && strikesByDate[option.date] ? strikesByDate[option.date] : availableStrikes;
                  
                  // Если у опциона есть страйк, но его нет в списке - добавляем
                  // Это важно для случаев, когда флажок перетащен далеко от текущей цены
                  if (option.strike && !allStrikes.includes(option.strike)) {
                    allStrikes = [...allStrikes, option.strike].sort((a, b) => a - b);
                    console.log('➕ Добавлен страйк опциона в список (перетаскивание на дальний страйк):', option.strike);
                  }
                  
                  if (allStrikes.length === 0) {
                    if (!option.strike) {
                      return <SelectItem value="" disabled>Выберите дату</SelectItem>;
                    }
                    return <SelectItem value={option.strike.toString()}>{option.strike}</SelectItem>;
                  }
                  
                  // Фильтруем страйки (показываем только ±20% от цены)
                  const strikes = filterStrikes(allStrikes, option.id);
                  const atmStrike = findAtmStrike(strikes);
                  
                  console.log('🎯 ATM Strike:', atmStrike, 'Current Price:', currentPrice, 'Strikes count:', strikes.length);
                  
                  // Группируем страйки (для общей информации)
                  const grouped = groupStrikes(strikes);
                  
                  // Определяет позицию sticky для заголовков (зависит от наличия кнопки)
                  const showAllForThisOption = showAllStrikesForOption[option.id];
                  const hasShowAllButton = !showAllForThisOption && allStrikes.length > strikes.length;
                  const headerStickyTop = hasShowAllButton ? 'top-[36px]' : 'top-0';
                  
                  // Разделяем страйки на две части: половину ниже ATM и половину выше
                  const atmIndex = strikes.indexOf(atmStrike);
                  const halfCount = Math.floor(strikes.length / 2);
                  const startIndex = Math.max(0, atmIndex - halfCount);
                  const endIndex = Math.min(strikes.length, startIndex + strikes.length);
                  
                  // Берем страйки вокруг ATM
                  const centeredStrikes = strikes.slice(startIndex, endIndex);
                  const centeredGrouped = groupStrikes(centeredStrikes);
                  
                  return (
                    <>
                      {/* Кнопка "Показать все" сверху */}
                      {hasShowAllButton && (
                        <div className="sticky top-0 bg-white z-20 pl-2 pr-0 py-1.5 text-center border-b">
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              setShowAllStrikesForOption(prev => ({ ...prev, [option.id]: true }));
                            }}
                            className="text-[11px] text-cyan-600 hover:text-cyan-700 font-medium"
                          >
                            📊 Все ({allStrikes.length}) • Сейчас: ±20% ({strikes.length})
                          </button>
                        </div>
                      )}
                      
                      {/* Группа: Ниже цены */}
                      {centeredGrouped.below.length > 0 && (
                        <>
                          <div className={`pl-2 pr-0 py-1 text-[10px] font-semibold text-muted-foreground bg-gray-50 sticky ${headerStickyTop} z-10 shadow-sm`}>
                            ↓ НИЖЕ ЦЕНЫ ({centeredGrouped.below.length})
                          </div>
                          {centeredGrouped.below.map((strike) => (
                            <SelectItem 
                              key={strike} 
                              value={strike.toString()}
                              className={strike === atmStrike ? "bg-cyan-50 font-semibold" : ""}
                            >
                              {strike}
                            </SelectItem>
                          ))}
                        </>
                      )}
                      
                      {/* Группа: Около цены (ATM) - ПОСЕРЕДИНЕ */}
                      {centeredGrouped.atm.length > 0 && (
                        <>
                          <div className={`pl-2 pr-0 py-1 text-[10px] font-semibold text-cyan-700 bg-cyan-50 sticky ${headerStickyTop} z-10 shadow-sm`}>
                            ≈ ОКОЛО ЦЕНЫ ${currentPrice.toFixed(0)} ({centeredGrouped.atm.length})
                          </div>
                          {centeredGrouped.atm.map((strike) => {
                            const isAtm = strike === atmStrike;
                            const scrollKey = `${option.id}-${strike}`;
                            
                            return (
                              <SelectItem 
                                key={strike} 
                                value={strike.toString()}
                                className={isAtm ? "bg-cyan-100 font-bold border-l-2 border-cyan-500" : "bg-cyan-50/30"}
                                ref={isAtm ? (el) => {
                                  // Автоскролл к ATM страйку при открытии (только один раз)
                                  if (el && !scrolledToAtm.current.has(scrollKey)) {
                                    scrolledToAtm.current.add(scrollKey);
                                    console.log('📍 Scrolling to ATM:', strike, 'for option:', option.id);
                                    setTimeout(() => {
                                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }, 150);
                                  }
                                } : null}
                              >
                                {isAtm ? `★ ${strike}` : strike}
                              </SelectItem>
                            );
                          })}
                        </>
                      )}
                      
                      {/* Группа: Выше цены */}
                      {centeredGrouped.above.length > 0 && (
                        <>
                          <div className={`pl-2 pr-0 py-1 text-[10px] font-semibold text-muted-foreground bg-gray-50 sticky ${headerStickyTop} z-10 shadow-sm`}>
                            ↑ ВЫШЕ ЦЕНЫ ({centeredGrouped.above.length})
                          </div>
                          {centeredGrouped.above.map((strike) => (
                            <SelectItem 
                              key={strike} 
                              value={strike.toString()}
                              className={strike === atmStrike ? "bg-cyan-50 font-semibold" : ""}
                            >
                              {strike}
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </>
                  );
                })()}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 ml-2">
              <Input
                type="number"
                value={option.quantity}
                onChange={(e) => handleFieldChange(option.id, 'quantity', parseInt(e.target.value) || 0)}
                className="h-7 text-right text-muted-foreground text-sm px-1 font-bold w-[50px]"
              />
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => handleFieldChange(option.id, 'quantity', option.quantity + 1)}
                  className="h-3 w-3 flex items-center justify-center hover:bg-muted rounded transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15"></polyline>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => handleFieldChange(option.id, 'quantity', Math.max(-1000, option.quantity - 1))}
                  className="h-3 w-3 flex items-center justify-center hover:bg-muted rounded transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              </div>
            </div>
            {/* Premium */}
            <span className="text-right ml-2">
              {option.isLoadingDetails ? (
                <Loader2 className="h-3 w-3 animate-spin inline" />
              ) : option.premium !== null ? (
                `$${option.premium.toFixed(2)}`
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
            
            {/* Bid */}
            <span className="text-green-600 text-right ml-2">
              {option.isLoadingDetails ? (
                <Loader2 className="h-3 w-3 animate-spin inline" />
              ) : option.bid !== null ? (
                `$${option.bid.toFixed(2)}`
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
            
            {/* Ask */}
            <span className="text-red-600 text-right ml-2">
              {option.isLoadingDetails ? (
                <Loader2 className="h-3 w-3 animate-spin inline" />
              ) : option.ask !== null ? (
                `$${option.ask.toFixed(2)}`
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
            
            {/* OI */}
            <span className="text-muted-foreground text-right ml-2 font-bold">
              {option.isLoadingDetails ? (
                <Loader2 className="h-3 w-3 animate-spin inline" />
              ) : option.oi !== null ? (
                option.oi.toLocaleString()
              ) : (
                "—"
              )}
            </span>
            
            {/* VOL */}
            <span className="text-muted-foreground text-right ml-2">
              {option.isLoadingDetails ? (
                <Loader2 className="h-3 w-3 animate-spin inline" />
              ) : option.volume !== null ? (
                option.volume.toLocaleString()
              ) : (
                "—"
              )}
            </span>
            
            {/* P/L (Прибыль/Убыток) */}
            <span className="text-right ml-2 font-bold">
              {(() => {
                // Рассчитываем P/L только если есть все необходимые данные
                if (!option.premium || option.premium === null || !option.strike || !currentPrice) {
                  return <span className="text-muted-foreground">—</span>;
                }
                
                const pl = calculateOptionPLValue(
                  option,
                  targetPrice || currentPrice,
                  currentPrice,
                  daysRemaining
                );
                
                const plColor = pl > 0 ? 'text-green-600' : pl < 0 ? 'text-red-600' : 'text-muted-foreground';
                const plSign = pl > 0 ? '+' : '';
                
                return (
                  <span className={plColor}>
                    {plSign}${pl.toFixed(2)}
                  </span>
                );
              })()}
            </span>
            
            <button
              onClick={() => deleteOption(option.id)}
              className="text-muted-foreground hover:text-destructive w-[30px] flex justify-center"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          ))}
          
          {/* Итоговая строка */}
          <div className="grid grid-cols-[40px_120px_90px_90px_100px_80px_80px_80px_80px_100px_100px_40px] items-center text-sm border-t-2 border-cyan-500 bg-cyan-50/50 rounded-md p-2 font-bold" style={{ gap: '8px' }}>
            <div></div>
            <div className="text-left ml-2 col-span-4">ИТОГО:</div>
            <div className="text-right ml-2">
              {(() => {
                // Рассчитываем общую премию с учетом направления сделки
                // Sell (продажа) - получаем премию (+)
                // Buy (покупка) - тратим премию (-)
                const totalPremium = options
                  .filter(opt => opt.visible !== false && opt.premium !== null)
                  .reduce((sum, opt) => {
                    const premium = opt.premium || 0;
                    const quantity = Math.abs(opt.quantity || 0);
                    const multiplier = 100; // Стандартный мультипликатор опционов
                    const isSell = (opt.action || 'Buy').toLowerCase() === 'sell';
                    const sign = isSell ? 1 : -1; // Sell = +премия, Buy = -премия
                    return sum + (sign * premium * quantity * multiplier);
                  }, 0);
                
                const premiumColor = totalPremium > 0 ? 'text-green-600' : totalPremium < 0 ? 'text-red-600' : '';
                const premiumSign = totalPremium > 0 ? '+' : '';
                
                return (
                  <span className={premiumColor}>
                    {totalPremium !== 0 ? `${premiumSign}$${totalPremium.toFixed(2)}` : '—'}
                  </span>
                );
              })()}
            </div>
            <div className="col-span-4"></div>
            <div className="text-right ml-2">
              {(() => {
                // Рассчитываем общий P/L (только для видимых опционов с данными)
                const totalPL = options
                  .filter(opt => opt.visible !== false && opt.premium !== null && opt.strike && currentPrice)
                  .reduce((sum, opt) => {
                    const pl = calculateOptionPLValue(
                      opt,
                      targetPrice || currentPrice,
                      currentPrice,
                      daysRemaining
                    );
                    return sum + pl;
                  }, 0);
                
                const plColor = totalPL > 0 ? 'text-green-600' : totalPL < 0 ? 'text-red-600' : 'text-muted-foreground';
                const plSign = totalPL > 0 ? '+' : '';
                
                return (
                  <span className={plColor}>
                    {plSign}${totalPL.toFixed(2)}
                  </span>
                );
              })()}
            </div>
            <div></div>
          </div>
        </div>
      )}

    </div>
  );
}

export default OptionsTable;
