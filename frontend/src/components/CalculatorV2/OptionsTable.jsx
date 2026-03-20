import React, { useState } from 'react';
import { Eye, EyeOff, ChevronDown, Trash2, Loader2, Save, RotateCcw, AlertTriangle, RefreshCw, Crown } from 'lucide-react';
import { MagicButton, MagicSelectionModal } from './MagicSelection';
import { clearTickerCache } from '../../services/apiClient';
import { invalidateOptionsForTicker } from '../../services/OptionsDataService';

import { GoldenButton, GoldenSelectionModal } from './GoldenSelection';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { getAllStrategies } from '../../config/optionsStrategies';
import { calculateOptionPLValue, adjustPLByStockGroup } from '../../utils/optionPricing';
import { getOptionVolatility } from '../../utils/volatilitySurface';
import { assessLiquidity, getLiquidityColor, formatLiquidityTooltip, LIQUIDITY_LEVELS } from '../../utils/liquidityCheck';
import { calculateDaysRemainingUTC, getOldestEntryDate, isOptionActiveAtDay, isOptionExpiredAtDay, calculateDaysToExpirationFromToday } from '../../utils/dateUtils';
import LockIcon from './LockIcon';

// Helper: format ISO date (YYYY-MM-DD) to display format (DD.MM.YY)
const formatDateForDisplay = (isoDate) => {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  const shortYear = year.slice(-2);
  return `${day}.${month}.${shortYear}`;
};

// Helper: format P&L value as "$ XXX XXX" (без центов, с пробелами)
// ЗАЧЕМ: Улучшение читаемости больших сумм P&L
const formatPLValue = (value) => {
  const absValue = Math.abs(Math.round(value)); // Округляем до целого
  const formatted = absValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); // Добавляем пробелы
  const sign = value >= 0 ? '+' : '-';
  return `${sign}$ ${formatted}`;
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
  onLockConfiguration,
  onResetCalculator,
  daysPassed = 0,
  targetPrice = 0,
  isLocked = false,
  selectedExpirationDate = null, // Выбранная дата экспирации на шкале
  ivSurface = null, // IV Surface для точной интерполяции волатильности
  dividendYield = 0, // Дивидендная доходность для модели BSM
  isEditMode = false, // Режим редактирования конфигурации
  hasChanges = false, // Есть ли изменения в режиме редактирования
  onSaveEditedConfiguration = null, // Функция сохранения изменений
  positions = [], // Позиции базового актива для волшебного подбора
  onAddMagicOption = null, // Функция добавления опциона из волшебного подбора
  onMagicSelectionComplete = null, // Callback для передачи параметров подбора в OptionSelectionResult
  onSetSimulationParams = null, // Callback для установки параметров симуляции (targetPrice, daysPassed)
  isAIEnabled = false, // Включен ли AI для прогнозирования волатильности
  aiVolatilityMap = {}, // Кэш AI предсказаний волатильности
  fetchAIVolatility = null, // Функция для запроса AI волатильности
  hideColumns = [], // Массив колонок для скрытия: ['premium', 'oi']
  stockClassification = null, // Классификация акции для корректировки P&L
  manualIvOverride = null // Ручная фактическая IV (в процентах, например 40)
}) {
  // Логирование полученных AI пропсов
  console.log('🤖 [OptionsTable] Получены пропсы:', {
    isAIEnabled,
    targetPrice,
    currentPrice,
    aiVolatilityMapKeys: Object.keys(aiVolatilityMap || {}),
    aiVolatilityMapSize: Object.keys(aiVolatilityMap || {}).length,
    aiVolatilityMap
  });

  const [customStrategyName, setCustomStrategyName] = React.useState('');
  const [saveDialogOpen, setSaveDialogOpenLocal] = React.useState(false);
  const [magicModalOpen, setMagicModalOpen] = useState(false); // Состояние модального окна волшебного подбора
  const [goldenModalOpen, setGoldenModalOpen] = useState(false); // Состояние модального окна золотого подбора
  const [showAllStrikesForOption, setShowAllStrikesForOption] = React.useState({}); // { optionId: true/false }
  const [editingPremium, setEditingPremium] = React.useState(null); // optionId для редактирования премии
  const [editingEntryDate, setEditingEntryDate] = React.useState(null); // optionId для редактирования даты входа
  const [isRefreshingAll, setIsRefreshingAll] = React.useState(false); // Состояние обновления всех опционов
  const scrolledToAtm = React.useRef(new Set()); // Отслеживаем, для каких опционов уже был скролл

  // Функция фильтрации страйков (показываем только ±20% от цены)
  // ВАЖНО: Всегда включаем текущий страйк опциона, даже если он далеко от цены
  const filterStrikes = (strikes, optionId) => {
    // Находим опцион и его текущий страйк
    const option = options.find(opt => opt.id === optionId);
    const currentStrike = option?.strike ? Number(option.strike) : null;

    if (showAllStrikesForOption[optionId] || !currentPrice || currentPrice <= 0) {
      return strikes;
    }

    const minStrike = currentPrice * 0.8; // -20%
    const maxStrike = currentPrice * 1.2; // +20%

    let filtered = strikes.filter(strike => strike >= minStrike && strike <= maxStrike);

    // Если после фильтрации осталось мало страйков (< 5), показываем все
    if (filtered.length < 5) {
      filtered = [...strikes];
    }

    // Всегда включаем текущий страйк опциона, даже если он далеко от цены
    // ЗАЧЕМ: Опцион из подбора может иметь страйк за пределами ±20% диапазона
    if (currentStrike && !filtered.some(s => Number(s) === currentStrike)) {
      filtered = [...filtered, currentStrike].sort((a, b) => a - b);
      console.log('➕ filterStrikes: добавлен текущий страйк опциона:', currentStrike);
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

  // Проверяем, выбрана ли валидная дата экспирации (из списка доступных дат)
  // ЗАЧЕМ: Блокируем добавление опционов до выбора реальной даты из API
  const isValidExpirationDate = selectedExpirationDate &&
    availableDates.length > 0 &&
    availableDates.includes(selectedExpirationDate);

  // Получаем список стратегий
  const strategies = getAllStrategies();

  // Обработчик изменения поля опциона
  const handleFieldChange = (optionId, field, value) => {
    if (onUpdateOption) {
      onUpdateOption(optionId, field, value);
    }
  };

  // Обработчик обновления всех незалоченных опционов
  // ЗАЧЕМ: Позволяет пользователю быстро обновить рыночные данные для всех позиций
  // ВАЖНО: Очищает кэш перед обновлением для получения свежих данных с API
  const handleRefreshAllOptions = async () => {
    if (!loadOptionDetails || !selectedTicker || isRefreshingAll) return;

    // Фильтруем только незалоченные опционы с заполненными данными
    const optionsToRefresh = options.filter(opt =>
      !opt.isLockedPosition && opt.date && opt.strike && opt.type
    );

    if (optionsToRefresh.length === 0) {
      console.log('⚠️ Нет опционов для обновления');
      return;
    }

    // Логируем IV ДО обновления
    console.log('📊 IV ДО обновления:');
    optionsToRefresh.forEach(opt => {
      const iv = opt.impliedVolatility || opt.implied_volatility || opt.iv;
      console.log(`   ${opt.type} ${opt.strike} ${opt.date}: IV = ${iv ? (iv < 1 ? (iv * 100).toFixed(1) : iv.toFixed(1)) : 'N/A'}%`);
    });

    setIsRefreshingAll(true);

    try {
      // ВАЖНО: Очищаем ВСЕ кэши перед обновлением для получения свежих данных
      // Это решает проблему разной IV на разных устройствах из-за кэширования
      clearTickerCache(selectedTicker);
      invalidateOptionsForTicker(selectedTicker);
      console.log(`🔄 Кэш очищен для ${selectedTicker}, запрашиваем свежие данные для ${optionsToRefresh.length} опционов...`);

      // Обновляем все опционы параллельно
      await Promise.all(
        optionsToRefresh.map(opt =>
          loadOptionDetails(opt.id, selectedTicker, opt.date, opt.strike, opt.type)
        )
      );
      console.log('✅ Запросы завершены. Проверьте IV в таблице.');
    } catch (error) {
      console.error('❌ Ошибка при обновлении опционов:', error);
    } finally {
      setIsRefreshingAll(false);
    }
  };

  // Обработчик изменения даты с загрузкой страйков
  const handleDateChange = async (optionId, isoDate) => {
    // Сначала обновляем дату (ISO формат)
    handleFieldChange(optionId, 'date', isoDate);
    // Сбрасываем флаг золотой кнопки, т.к. опцион изменён
    // ЗАЧЕМ: Если пользователь изменил дату, это уже не тот опцион, который подобрала золотая кнопка
    handleFieldChange(optionId, 'isGoldenOption', false);

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
    // Сбрасываем флаг золотой кнопки, т.к. опцион изменён
    // ЗАЧЕМ: Если пользователь изменил страйк, это уже не тот опцион, который подобрала золотая кнопка
    handleFieldChange(optionId, 'isGoldenOption', false);

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
          {/* Волшебная кнопка для автоматического подбора опционов */}
          <MagicButton onClick={() => setMagicModalOpen(true)} />

          {/* Золотая кнопка для альтернативного подбора опционов */}
          <GoldenButton onClick={() => setGoldenModalOpen(true)} />

          {/* Кнопка добавления опционов доступна всегда (даже для зафиксированных позиций) */}
          {/* ЗАЧЕМ: Позволяет добавлять новые опционы к зафиксированным */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className={`h-8 text-white ${!isValidExpirationDate
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-cyan-500 hover:bg-cyan-600'
                  }`}
                disabled={isLoadingDates || !isValidExpirationDate}
                title={!isValidExpirationDate ? 'Сначала выберите дату экспирации' : ''}
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
          {/* Выбор стратегии доступен всегда (добавляет новые опционы) */}
          {/* ЗАЧЕМ: Позволяет добавлять стратегии к зафиксированным позициям */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`h-8 bg-transparent hover:text-foreground ${!isValidExpirationDate
                  ? 'text-gray-400 cursor-not-allowed border-gray-300'
                  : 'text-foreground'
                  }`}
                disabled={isLoadingDates || !isValidExpirationDate}
                title={!isValidExpirationDate ? 'Сначала выберите дату экспирации' : ''}
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
          {/* Меню сохранения доступно всегда */}
          {/* ЗАЧЕМ: Позволяет пересохранить конфигурацию с новыми позициями */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`h-8 bg-transparent hover:text-foreground ${!isValidExpirationDate
                  ? 'text-gray-400 cursor-not-allowed border-gray-300'
                  : 'text-foreground'
                  }`}
                disabled={!isValidExpirationDate}
                title={!isValidExpirationDate ? 'Сначала выберите дату экспирации' : ''}
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
              <DropdownMenuItem
                onClick={() => onLockConfiguration && onLockConfiguration()}
                className="text-red-600 flex items-center gap-1"
              >
                <LockIcon size={14} />
                <span>Зафиксировать позиции</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Кнопка удаления всех опционов - удаляет только незафиксированные */}
          <Button
            size="sm"
            className={`h-8 w-8 p-0 text-white ${!isValidExpirationDate
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-red-500 hover:bg-red-600'
              }`}
            disabled={!isValidExpirationDate}
            onClick={() => {
              // Удаляем только незафиксированные опционы
              // ЗАЧЕМ: Зафиксированные позиции должны оставаться неизменными
              const unlockedOptions = options.filter(opt => !opt.isLockedPosition);
              const lockedCount = options.length - unlockedOptions.length;
              const message = lockedCount > 0
                ? `Будет удалено ${unlockedOptions.length} опционов. ${lockedCount} зафиксированных останутся.`
                : 'Вы уверены? Все опционы будут удалены.';
              if (window.confirm(message)) {
                unlockedOptions.forEach(opt => deleteOption(opt.id));
              }
            }}
            title={!isValidExpirationDate ? 'Сначала выберите дату экспирации' : 'Удалить все опционы'}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="h-8 w-8 p-0 bg-cyan-400 hover:bg-cyan-500 text-white"
                  onClick={handleRefreshAllOptions}
                  disabled={isRefreshingAll || options.filter(opt => !opt.isLockedPosition && opt.date && opt.strike).length === 0}
                  title="Обновить данные незалоченных опционов"
                >
                  {isRefreshingAll ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Обновить данные опционов</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {/* Кнопка "Сохранить изменения" в режиме редактирования */}
          {isEditMode && hasChanges && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="h-8 px-3 bg-red-500 hover:bg-red-600 text-white animate-pulse"
                    onClick={() => onSaveEditedConfiguration?.()}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    Сохранить изменения
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Сохранить изменения конфигурации</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
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
          {/* Заголовки колонок — динамическая сетка в зависимости от hideColumns */}
          <div className="grid items-center text-xs font-medium text-muted-foreground px-2" style={{ 
            display: 'grid', 
            gridTemplateColumns: `30px 90px 80px 90px 47px ${hideColumns.includes('premium') ? '' : '95px '}95px 95px ${hideColumns.includes('oi') ? '' : '75px '}40px 37px 60px 100px 40px`.replace(/\s+/g, ' ').trim(), 
            gap: '8px' 
          }}>
            <div></div>
            <div className="text-left ml-2">Тип</div>
            <div className="text-left ml-2">Дата эксп.</div>
            <div className="text-left ml-2">Страйк</div>
            <div className="text-right ml-2">Кол.</div>
            {!hideColumns.includes('premium') && <div className="text-right ml-2">Премия</div>}
            <div className="text-right ml-2">BID</div>
            <div className="text-right ml-2">ASK</div>
            {!hideColumns.includes('oi') && <div className="text-right ml-2">OI</div>}
            <div className="text-right ml-2" style={{ fontSize: '0.7rem' }}>VOL</div>
            <div className="text-right ml-2" style={{ fontSize: '0.7rem' }}>IV</div>
            <div className="text-right ml-2">Вход</div>
            <div className="text-right ml-2">P&L</div>
            <div></div>
          </div>

          {options.map((option, optionIndex) => {
            // Устанавливаем дату входа по умолчанию (текущая дата в ISO формате)
            // ЗАЧЕМ: Каждая позиция должна иметь дату входа для отслеживания времени нахождения в позиции
            const entryDate = option.entryDate || new Date().toISOString().split('T')[0];
            
            // Проверяем, истёк ли опцион на текущий день симуляции
            // ЗАЧЕМ: Если целевая дата больше даты экспирации, строка отображается серым
            const oldestEntry = getOldestEntryDate(options);
            const isExpired = isOptionExpiredAtDay(option, daysPassed, oldestEntry);

            // Определяем, нужно ли применять серый цвет ко всей строке
            // ЗАЧЕМ: Скрытые или истёкшие опционы отображаются серым
            const isGrayedOut = !option.visible || isExpired;

            return (
              <div
                key={option.id}
                className={`items-center text-sm border rounded-md p-2 ${isGrayedOut ? "[&_*]:!text-[#AAAAAA] [&_span]:!bg-gray-100" : ""
                  }`}
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: `30px 90px 80px 90px 47px ${hideColumns.includes('premium') ? '' : '95px '}95px 95px ${hideColumns.includes('oi') ? '' : '75px '}40px 37px 60px 100px 40px`.replace(/\s+/g, ' ').trim(), 
                  gap: '8px' 
                }}
              >
                {/* Иконка видимости: Lock для зафиксированных позиций, Eye/EyeOff для обычных */}
                {/* ЗАЧЕМ: Проверяем isLockedPosition на уровне каждой позиции, а не глобальный isLocked */}
                <div className="w-[30px] flex items-center justify-center gap-0.5">
                  <button
                    onClick={() => !option.isLockedPosition && toggleOptionVisibility(option.id)}
                    className={`flex justify-center ${option.isLockedPosition
                      ? 'text-red-500 cursor-default'
                      : 'text-muted-foreground hover:text-foreground cursor-pointer'
                      }`}
                    title={option.isLockedPosition ? 'Позиция зафиксирована' : (option.visible ? 'Скрыть' : 'Показать')}
                  >
                    {option.isLockedPosition
                      ? <LockIcon size={16} />
                      : (option.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />)
                    }
                  </button>
                  {option.isGoldenOption && (
                    <Crown 
                      className="h-3 w-3" 
                      style={{ color: '#eab308' }}
                      title="Подобран через золотую кнопку"
                    />
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <span className={`text-xs font-medium ${option.action === "Buy" ? "text-green-600" : "text-red-600"}`}>
                    {option.action}
                  </span>
                  <span
                    className={`${option.type === "CALL" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      } px-1.5 py-0.5 rounded text-xs font-medium`}
                  >
                    {option.type}
                  </span>
                </div>
                <Select
                  value={option.date}
                  onValueChange={(value) => handleDateChange(option.id, value)}
                  disabled={option.isLockedPosition}
                >
                  <SelectTrigger className="h-7 text-right ml-2 text-xs text-muted-foreground px-1 border-input font-bold" disabled={option.isLockedPosition}>
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
                  disabled={option.isLockedPosition || !option.date || option.date === "" || loadingStrikesForDate[option.date]}
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

                      // Явно показываем страйк, если он есть (даже если его нет в списке)
                      // ЗАЧЕМ: SelectValue не отображает значение, если оно не в списке SelectItem
                      if (option.strike) {
                        return <span>{option.strike}</span>;
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
                      let allStrikes = option.date && strikesByDate[option.date] ? [...strikesByDate[option.date]] : [...availableStrikes];

                      // Если у опциона есть страйк, но его нет в списке - добавляем
                      // ВАЖНО: Опцион из подбора может иметь страйк, которого нет в загруженных данных
                      const optionStrike = option.strike ? Number(option.strike) : null;
                      if (optionStrike && !allStrikes.some(s => Number(s) === optionStrike)) {
                        allStrikes = [...allStrikes, optionStrike].sort((a, b) => a - b);
                        console.log('➕ Добавлен страйк опциона в список:', optionStrike);
                      }

                      // Если список пустой, но у опциона есть страйк — показываем только его
                      if (allStrikes.length === 0) {
                        if (!optionStrike) {
                          return <SelectItem value="" disabled>Выберите дату</SelectItem>;
                        }
                        return <SelectItem value={optionStrike.toString()}>{optionStrike}</SelectItem>;
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
                    onChange={(e) => !option.isLockedPosition && handleFieldChange(option.id, 'quantity', parseInt(e.target.value) || 0)}
                    className="h-7 text-right text-muted-foreground text-sm px-1 font-bold w-[29px]"
                    disabled={option.isLockedPosition}
                  />
                  {/* Скрываем кнопки +/- для зафиксированных позиций */}
                  {!option.isLockedPosition && (
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
                  )}
                </div>
                {/* Premium - блокируем редактирование для зафиксированных позиций */}
                {/* УСЛОВНО: Скрываем если hideColumns включает 'premium' */}
                {!hideColumns.includes('premium') && (
                  <span
                    className={option.isPremiumModified ? "text-right ml-2 text-orange-600 font-bold cursor-pointer" : `text-right ml-2 ${option.isLockedPosition ? 'cursor-default' : 'cursor-pointer'}`}
                    onDoubleClick={() => !option.isLockedPosition && setEditingPremium(option.id)}
                  >
                    {editingPremium === option.id && !option.isLockedPosition ? (
                      <Input
                        type="number"
                        autoFocus
                        defaultValue={option.customPremium ?? option.premium ?? ''}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            handleFieldChange(option.id, 'customPremium', val);
                            handleFieldChange(option.id, 'isPremiumModified', true);
                          }
                          setEditingPremium(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.target.blur();
                          }
                          if (e.key === 'Escape') {
                            setEditingPremium(null);
                          }
                        }}
                        className="h-6 text-right text-sm w-[60px]"
                      />
                    ) : (
                      option.isPremiumModified ?
                        (option.customPremium >= 0 ? `$${option.customPremium.toFixed(2)}` : `-$${Math.abs(option.customPremium).toFixed(2)}`) :
                        (option.isLoadingDetails ? (
                          <Loader2 className="h-3 w-3 animate-spin inline" />
                        ) : option.premium !== null ? (
                          option.premium >= 0 ? `$${option.premium.toFixed(2)}` : `-$${Math.abs(option.premium).toFixed(2)}`
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        ))
                    )}
                  </span>
                )}

                {/* Bid */}
                <span className="text-green-600 text-right ml-2">
                  {option.isPremiumModified ? "🟠" : (
                    option.isLoadingDetails ? (
                      <Loader2 className="h-3 w-3 animate-spin inline" />
                    ) : option.bid !== null ? (
                      `$${option.bid.toFixed(2)}`
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                  )}
                </span>

                {/* Ask */}
                <span className="text-red-600 text-right ml-2">
                  {option.isPremiumModified ? "🟠" : (
                    option.isLoadingDetails ? (
                      <Loader2 className="h-3 w-3 animate-spin inline" />
                    ) : option.ask !== null ? (
                      `$${option.ask.toFixed(2)}`
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                  )}
                </span>

                {/* OI с индикатором ликвидности */}
                {/* УСЛОВНО: Скрываем если hideColumns включает 'oi' */}
                {!hideColumns.includes('oi') && (() => {
                  // Оцениваем ликвидность опциона
                  const liquidity = assessLiquidity(option);
                  const colors = getLiquidityColor(liquidity.level);
                  const showWarning = liquidity.level === LIQUIDITY_LEVELS.LOW || liquidity.level === LIQUIDITY_LEVELS.VERY_LOW;

                  return (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`text-right ml-2 font-bold flex items-center justify-end gap-1 ${showWarning ? colors.text : 'text-muted-foreground'
                            }`}>
                            {option.isLoadingDetails ? (
                              <Loader2 className="h-3 w-3 animate-spin inline" />
                            ) : (
                              <>
                                {showWarning && <AlertTriangle className="h-3 w-3" />}
                                {option.oi !== null ? option.oi.toLocaleString() : "—"}
                              </>
                            )}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <pre className="text-xs whitespace-pre-wrap">{formatLiquidityTooltip(liquidity)}</pre>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })()}

                {/* VOL */}
                <span className="text-muted-foreground text-right ml-2" style={{ fontSize: '0.7rem' }}>
                  {option.isLoadingDetails ? (
                    <Loader2 className="h-3 w-3 animate-spin inline" />
                  ) : option.volume !== null ? (
                    option.volume.toLocaleString()
                  ) : (
                    "—"
                  )}
                </span>

                {/* IV (Implied Volatility) - результирующая волатильность с учётом времени */}
                <span className="text-muted-foreground text-right ml-2 font-medium" style={{ fontSize: '0.7rem' }}>
                  {(() => {
                    const optIV = option.impliedVolatility || option.implied_volatility;
                    if (!optIV || optIV <= 0) return '—';
                    // Вычисляем результирующую IV с учётом симуляции времени
                    // ВАЖНО: Передаём oldestEntryDate для корректного расчёта actualDaysPassed
                    const oldestEntry = getOldestEntryDate(options);
                    const currentDays = calculateDaysRemainingUTC(option, 0, 30, oldestEntry);
                    const simulatedDays = calculateDaysRemainingUTC(option, daysPassed, 30, oldestEntry);
                    const todaySimDays = calculateDaysToExpirationFromToday(option);
                    // manualIvOverride только для первого опциона в таблице
                    const ivOverrideForOption = optionIndex === 0 ? manualIvOverride : null;
                    const resultIV = getOptionVolatility(option, currentDays, simulatedDays, ivSurface, null, null, ivOverrideForOption, todaySimDays);
                    return `${resultIV.toFixed(0)}%`;
                  })()}
                </span>

                {/* Дата входа в позицию */}
                <span
                  className={editingEntryDate === option.id && !option.isLockedPosition ? "text-right ml-2" : `text-right ml-2 ${option.isLockedPosition ? 'cursor-default' : 'cursor-pointer'}`}
                  onDoubleClick={() => !option.isLockedPosition && setEditingEntryDate(option.id)}
                >
                  {editingEntryDate === option.id && !option.isLockedPosition ? (
                    <Input
                      type="date"
                      autoFocus
                      defaultValue={entryDate}
                      onBlur={(e) => {
                        if (e.target.value) {
                          handleFieldChange(option.id, 'entryDate', e.target.value);
                        }
                        setEditingEntryDate(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.target.blur();
                        }
                        if (e.key === 'Escape') {
                          setEditingEntryDate(null);
                        }
                      }}
                      className="h-7 text-right text-xs px-1 border-input font-bold w-[90px]"
                    />
                  ) : (
                    <span className="text-xs font-bold text-cyan-500">{formatDateForDisplay(entryDate)}</span>
                  )}
                </span>

                {/* P/L (Прибыль/Убыток) */}
                <span className="text-right ml-2 font-bold">
                  {(() => {
                    // Рассчитываем P/L только если есть все необходимые данные
                    // Премия может быть из API (option.premium) или введена вручную (option.customPremium)
                    const hasPremium = option.isPremiumModified ? (option.customPremium !== null && option.customPremium !== undefined) : (option.premium !== null && option.premium !== undefined);
                    if (!hasPremium || !option.strike || !currentPrice) {
                      return <span className="text-muted-foreground">—</span>;
                    }

                    // Вычисляем индивидуальное количество дней до экспирации для этого опциона
                    // ВАЖНО: Передаём oldestEntryDate для корректного расчёта actualDaysPassed
                    const oldestEntry = getOldestEntryDate(options);
                    
                    // Проверяем, активен ли опцион на текущий день симуляции
                    // ЗАЧЕМ: Если целевая дата раньше даты входа опциона, он ещё не куплен
                    const isActive = isOptionActiveAtDay(option, daysPassed, oldestEntry);
                    console.log(`📅 [OptionsTable] Проверка активности: ${option.type} ${option.strike}, entryDate=${option.entryDate}, oldestEntry=${oldestEntry?.toISOString()}, daysPassed=${daysPassed}, isActive=${isActive}`);
                    
                    if (!isActive) {
                      return <span className="text-muted-foreground">—</span>;
                    }
                    
                    const currentDaysToExpiration = calculateDaysRemainingUTC(option, 0, 30, oldestEntry);
                    const optionDaysRemaining = calculateDaysRemainingUTC(option, daysPassed, 30, oldestEntry);

                    // Определяем волатильность для этого опциона
                    // ЗАЧЕМ: Используем единую функцию getOptionVolatility с IV Surface для точной интерполяции
                    const todaySimDays = calculateDaysToExpirationFromToday(option);
                    // manualIvOverride только для первого опциона в таблице
                    const ivOverrideForOption = optionIndex === 0 ? manualIvOverride : null;
                    let optionVolatility = getOptionVolatility(
                      option,
                      currentDaysToExpiration,
                      optionDaysRemaining,
                      ivSurface,
                      null,
                      null,
                      ivOverrideForOption,
                      todaySimDays
                    );

                    // Проверяем наличие AI волатильности в кэше
                    // ЗАЧЕМ: Если AI включен и есть прогноз, используем его вместо стандартной IV
                    if (isAIEnabled && aiVolatilityMap && selectedTicker && targetPrice) {
                      const cacheKey = `${selectedTicker}_${option.strike}_${option.date}_${targetPrice.toFixed(2)}_${optionDaysRemaining}`;
                      const aiVolatility = aiVolatilityMap[cacheKey];
                      if (aiVolatility) {
                        console.log('🤖 [OptionsTable] Используем AI волатильность:', {
                          strike: option.strike,
                          standardIV: optionVolatility,
                          aiIV: aiVolatility,
                          cacheKey
                        });
                        optionVolatility = aiVolatility;
                      } else {
                        console.log('🤖 [OptionsTable] AI волатильность не найдена в кэше:', cacheKey);
                      }
                    }

                    // Используем customPremium если премия была изменена вручную
                    // ВАЖНО: При ручной премии обнуляем ask/bid, чтобы getEntryPrice() использовал premium
                    const effectivePremium = option.isPremiumModified ? option.customPremium : option.premium;
                    const tempOpt = {
                      ...option,
                      premium: effectivePremium,
                      ask: option.isPremiumModified ? 0 : option.ask,
                      bid: option.isPremiumModified ? 0 : option.bid
                    };

                    // ЛОГИРОВАНИЕ: Выводим bid/ask и IV для сравнения с подбором
                    // ЗАЧЕМ: Диагностика расхождений P/L между подбором и таблицей
                    const rawIV = option.impliedVolatility || option.implied_volatility;
                    console.log(`[Таблица] 💰 P/L расчёт ${option.type} Strike $${option.strike}: BID=$${option.bid?.toFixed(2) || 'N/A'}, ASK=$${option.ask?.toFixed(2) || 'N/A'}, Premium=$${effectivePremium?.toFixed(2) || 'N/A'}, EntryPrice=${option.action === 'Buy' ? (option.ask || effectivePremium) : (option.bid || effectivePremium)}`);
                    console.log(`[Таблица] 📈 IV расчёт ${option.type} Strike $${option.strike}: rawIV=${rawIV}, IV=${(optionVolatility * 100).toFixed(1)}%, currentDays=${currentDaysToExpiration}, daysRemaining=${optionDaysRemaining}, targetPrice=$${targetPrice || currentPrice}`);

                    let pl = calculateOptionPLValue(
                      tempOpt,
                      targetPrice || currentPrice,
                      currentPrice,
                      optionDaysRemaining,
                      optionVolatility,
                      dividendYield
                    );

                    // Применяем корректировку P&L по группе акции
                    if (stockClassification) {
                      pl = adjustPLByStockGroup(pl, stockClassification);
                    }

                    const plColor = pl > 0 ? 'text-green-600' : pl < 0 ? 'text-red-600' : 'text-muted-foreground';

                    return (
                      <span className={plColor}>
                        {formatPLValue(pl)}
                      </span>
                    );
                  })()}
                </span>

                {/* Кнопка удаления скрыта для зафиксированных позиций */}
                {/* ЗАЧЕМ: Проверяем isLockedPosition на уровне каждой позиции */}
                {!option.isLockedPosition ? (
                  <button
                    onClick={() => deleteOption(option.id)}
                    className="text-muted-foreground hover:text-destructive w-[30px] flex justify-center"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="w-[30px]" />
                )}
              </div>
            );
          })}

          {/* Итоговая строка */}
          <div className="items-center text-sm border-t-2 border-cyan-500 bg-cyan-50/50 rounded-md p-2 font-bold" style={{ display: 'grid', gridTemplateColumns: '30px 90px 80px 90px 47px 95px 95px 95px 75px 40px 37px 60px 100px 40px', gap: '8px' }}>
            <div></div>
            <div className="text-left ml-2">ИТОГО:</div>
            <div></div>
            <div></div>
            <div></div>
            <div className="text-right ml-2">
              {(() => {
                // Рассчитываем общую премию с учетом направления сделки
                // Sell (продажа) - получаем премию (+)
                // Buy (покупка) - тратим премию (-)
                const totalPremium = options
                  .filter(opt => {
                    if (opt.visible === false) return false;
                    // Проверяем наличие премии (из API или введённой вручную)
                    const hasPremium = opt.isPremiumModified
                      ? (opt.customPremium !== null && opt.customPremium !== undefined)
                      : (opt.premium !== null && opt.premium !== undefined);
                    return hasPremium;
                  })
                  .reduce((sum, opt) => {
                    const premium = opt.isPremiumModified ? opt.customPremium : (opt.premium || 0);
                    const quantity = Math.abs(opt.quantity || 0);
                    const multiplier = 100; // Стандартный мультипликатор опционов
                    const isSell = (opt.action || 'Buy').toLowerCase() === 'sell';
                    const sign = isSell ? 1 : -1; // Sell = +премия, Buy = -премия
                    return sum + (sign * premium * quantity * multiplier);
                  }, 0);

                const premiumColor = totalPremium > 0 ? 'text-green-600' : totalPremium < 0 ? 'text-red-600' : '';

                return (
                  <span className={premiumColor}>
                    {totalPremium !== 0 ? formatPLValue(totalPremium) : '—'}
                  </span>
                );
              })()}
            </div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div className="text-right ml-2">
              {(() => {
                // Рассчитываем общий P/L (только для видимых опционов с данными)
                const totalPL = options
                  .filter(opt => {
                    if (opt.visible === false || !opt.strike || !currentPrice) return false;
                    // Проверяем наличие премии (из API или введённой вручную)
                    const hasPremium = opt.isPremiumModified
                      ? (opt.customPremium !== null && opt.customPremium !== undefined)
                      : (opt.premium !== null && opt.premium !== undefined);
                    return hasPremium;
                  })
                  .reduce((sum, opt) => {
                    // Вычисляем индивидуальное количество дней до экспирации для этого опциона
                    // ВАЖНО: Передаём oldestEntryDate для корректного расчёта actualDaysPassed
                    const oldestEntry = getOldestEntryDate(options);
                    
                    // Проверяем, активен ли опцион на текущий день симуляции
                    // ЗАЧЕМ: Если целевая дата раньше даты входа опциона, он ещё не куплен
                    if (!isOptionActiveAtDay(opt, daysPassed, oldestEntry)) {
                      return sum; // Пропускаем неактивные опционы
                    }
                    
                    const currentDaysToExp = calculateDaysRemainingUTC(opt, 0, 30, oldestEntry);
                    const optDaysRemaining = calculateDaysRemainingUTC(opt, daysPassed, 30, oldestEntry);

                    // Определяем волатильность для этого опциона
                    // ЗАЧЕМ: Используем единую функцию getOptionVolatility с IV Surface для точной интерполяции
                    let optVolatility = getOptionVolatility(
                      opt,
                      currentDaysToExp,
                      optDaysRemaining,
                      ivSurface
                    );

                    // Проверяем наличие AI волатильности в кэше
                    if (isAIEnabled && aiVolatilityMap && selectedTicker && targetPrice) {
                      const cacheKey = `${selectedTicker}_${opt.strike}_${opt.date}_${targetPrice.toFixed(2)}_${optDaysRemaining}`;
                      const aiVolatility = aiVolatilityMap[cacheKey];
                      if (aiVolatility) {
                        optVolatility = aiVolatility;
                      }
                    }

                    // ВАЖНО: При ручной премии обнуляем ask/bid, чтобы getEntryPrice() использовал premium
                    const effectivePremium = opt.isPremiumModified ? opt.customPremium : opt.premium;
                    const tempOpt = {
                      ...opt,
                      premium: effectivePremium,
                      ask: opt.isPremiumModified ? 0 : opt.ask,
                      bid: opt.isPremiumModified ? 0 : opt.bid
                    };
                    let pl = calculateOptionPLValue(
                      tempOpt,
                      targetPrice || currentPrice,
                      currentPrice,
                      optDaysRemaining,
                      optVolatility,
                      dividendYield
                    );
                    
                    // Применяем корректировку P&L по группе акции
                    if (stockClassification) {
                      pl = adjustPLByStockGroup(pl, stockClassification);
                    }
                    
                    return sum + pl;
                  }, 0);

                const plColor = totalPL > 0 ? 'text-green-600' : totalPL < 0 ? 'text-red-600' : 'text-muted-foreground';

                return (
                  <span className={plColor}>
                    {formatPLValue(totalPL)}
                  </span>
                );
              })()}
            </div>
            <div></div>
          </div>
        </div>
      )}

      {/* Модальное окно волшебного подбора опционов */}
      <MagicSelectionModal
        isOpen={magicModalOpen}
        onClose={() => setMagicModalOpen(false)}
        positions={positions}
        options={options}
        currentPrice={currentPrice}
        targetPrice={targetPrice}
        selectedTicker={selectedTicker}
        availableDates={availableDates}
        ivSurface={ivSurface}
        dividendYield={dividendYield}
        onAddOption={(option) => {
          if (onAddMagicOption) {
            onAddMagicOption(option);
          }
          setMagicModalOpen(false);
        }}
        onSelectionComplete={onMagicSelectionComplete}
      />
      {/* Модальное окно золотого подбора */}
      {goldenModalOpen && (
        <GoldenSelectionModal
          isOpen={goldenModalOpen}
          onClose={() => setGoldenModalOpen(false)}
          positions={positions}
          options={options}
          currentPrice={currentPrice}
          selectedTicker={selectedTicker}
          availableDates={availableDates}
          onAddOption={(option) => {
            console.log('👑 OptionsTable.jsx: Получен опцион от GoldenModal:', option.isGoldenOption, option);
            if (onAddMagicOption) {
              console.log('👑 OptionsTable.jsx: Передаем в onAddMagicOption:', option);
              onAddMagicOption(option);
            }
            setGoldenModalOpen(false);
          }}
          onSetSimulationParams={onSetSimulationParams}
        />
      )}
    </div>
  );
}

export default OptionsTable;
