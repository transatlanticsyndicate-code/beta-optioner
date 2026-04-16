import React, { useState } from 'react';
import { Eye, EyeOff, ChevronDown, Trash2, Loader2, Save, RotateCcw, AlertTriangle, RefreshCw, Gem, Info } from 'lucide-react';
import { clearTickerCache } from '../../services/apiClient';
import { invalidateOptionsForTicker } from '../../services/OptionsDataService';
import { sendRefreshSpecificCommand } from '../../hooks/useExtensionData';

import { SuperButton, SuperSelectionModal } from './SuperSelection';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { getAllStrategies } from '../../config/optionsStrategies';
// Импорт из старого модуля для режима "Акции" (обратная совместимость)
import { calculateOptionPLValue as calculateStockOptionPLValue, adjustPLByStockGroup, calculateOptionTheoreticalPrice } from '../../utils/optionPricing';
// Импорт из нового модуля для режима "Фьючерсы"
import { calculateFuturesOptionPLValue, calculateFuturesOptionTheoreticalPrice } from '../../utils/futuresPricing';
import { getOptionVolatility } from '../../utils/volatilitySurface';
import { assessLiquidity, getLiquidityColor, formatLiquidityTooltip, LIQUIDITY_LEVELS } from '../../utils/liquidityCheck';
import { calculateDaysRemainingUTC, getOldestEntryDate, isOptionActiveAtDay, isOptionExpiredAtDay, calculateDaysToExpirationFromToday } from '../../utils/dateUtils';
import LockIcon from './LockIcon';

// Режимы калькулятора
const CALCULATOR_MODES = {
  STOCKS: 'stocks',
  FUTURES: 'futures',
  CRYPTO: 'crypto'
};

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

function OptionsTableV3({
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
  onSaveToDB,
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
  configSource = null, // Источник конфигурации ('db' или 'localStorage')
  onSaveDBConfiguration = null, // Функция сохранения изменений конфигурации из БД
  positions = [], // Позиции базового актива для волшебного подбора
  onAddMagicOption = null, // Функция добавления опциона из волшебного подбора
  isAIEnabled = false, // Включен ли AI для прогнозирования волатильности
  aiVolatilityMap = {}, // Кэш AI предсказаний волатильности
  fetchAIVolatility = null, // Функция для запроса AI волатильности
  hideColumns = [], // Массив колонок для скрытия: ['premium', 'oi']
  isFromExtension = false, // Флаг: данные от расширения TradingView (для универсального калькулятора)
  calculatorMode = 'stocks', // Режим калькулятора: 'stocks' | 'futures'
  contractMultiplier = 100, // Множитель контракта: 100 для акций, pointValue для фьючерсов
  isFuturesMissingSettings = false, // Флаг: отсутствуют настройки фьючерса (блокирует расчёты)
  stockClassification = null // Классификация акции для корректировки P&L (только для режима stocks)
}) {
  // DEBUG: Логирование параметров для отладки сохранения конфигурации из БД
  React.useEffect(() => {
    if (isEditMode && hasChanges) {
      console.log('🔍 [OptionsTableV3] Параметры кнопки сохранения:', {
        isEditMode,
        hasChanges,
        configSource,
        onSaveDBConfiguration: typeof onSaveDBConfiguration,
        onSaveEditedConfiguration: typeof onSaveEditedConfiguration
      });
    }
  }, [isEditMode, hasChanges, configSource, onSaveDBConfiguration, onSaveEditedConfiguration]);

  // DEBUG: Закомментировано для production
  // console.log('🤖 [OptionsTable] Получены пропсы:', {
  //   isAIEnabled,
  //   targetPrice,
  //   currentPrice,
  //   aiVolatilityMapKeys: Object.keys(aiVolatilityMap || {}),
  //   aiVolatilityMapSize: Object.keys(aiVolatilityMap || {}).length,
  //   aiVolatilityMap
  // });

  const [customStrategyName, setCustomStrategyName] = React.useState('');
  const [saveDialogOpen, setSaveDialogOpenLocal] = React.useState(false);
  const [superModalOpen, setSuperModalOpen] = useState(false); // Состояние модального окна Супер подбора
  const [showAllStrikesForOption, setShowAllStrikesForOption] = React.useState({}); // { optionId: true/false }
  const [editingPremium, setEditingPremium] = React.useState(null); // optionId для редактирования премии
  const [editingEntryDate, setEditingEntryDate] = React.useState(null); // optionId для редактирования даты входа
  const [editingAssetPrice, setEditingAssetPrice] = React.useState(null); // optionId для редактирования цены актива
  const [editingBid, setEditingBid] = React.useState(null); // optionId для редактирования bid
  const [editingAsk, setEditingAsk] = React.useState(null); // optionId для редактирования ask
  const [isRefreshingAll, setIsRefreshingAll] = React.useState(false); // Состояние обновления всех опционов
  const scrolledToAtm = React.useRef(new Set()); // Отслеживаем, для каких опционов уже был скролл

  // Состояние для сортировки таблицы
  // ЗАЧЕМ: Позволяет пользователю сортировать опционы по разным колонкам
  const [sortColumn, setSortColumn] = React.useState('date'); // По умолчанию сортировка по дате экспирации
  const [sortDirection, setSortDirection] = React.useState('asc'); // asc | desc

  // Функция обработки клика по заголовку колонки
  const handleSort = (column) => {
    if (sortColumn === column) {
      // Если кликнули по той же колонке — меняем направление
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Новая колонка — устанавливаем её и направление по умолчанию (asc)
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Функция сортировки опционов
  const getSortedOptions = () => {
    if (!options || options.length === 0) return [];

    const sorted = [...options].sort((a, b) => {
      let valueA, valueB;

      switch (sortColumn) {
        case 'type':
          // Сортируем по типу (CALL/PUT) + action (Buy/Sell)
          valueA = `${a.type}_${a.action}`;
          valueB = `${b.type}_${b.action}`;
          break;
        case 'date':
          // Сортируем по дате экспирации
          valueA = a.date || '';
          valueB = b.date || '';
          break;
        case 'strike':
          // Сортируем по страйку (числовое сравнение)
          valueA = parseFloat(a.strike) || 0;
          valueB = parseFloat(b.strike) || 0;
          break;
        case 'entry':
          // Сортируем по дате входа
          valueA = a.entryDate || '';
          valueB = b.entryDate || '';
          break;
        default:
          return 0;
      }

      if (valueA < valueB) return sortDirection === 'asc' ? -1 : 1;
      if (valueA > valueB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  };

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
    console.log('🔧 [OptionsTable] handleFieldChange:', { optionId, field, value });
    if (onUpdateOption) {
      onUpdateOption(optionId, field, value);
      console.log('✅ [OptionsTable] onUpdateOption вызван');
    } else {
      console.warn('⚠️ [OptionsTable] onUpdateOption не определен!');
    }
  };

  // Обработчик изменения фактической IV для опциона
  // ЗАЧЕМ: Позволяет пользователю корректировать волатильность для каждого опциона отдельно
  // ВАЖНО: Сохраняем дату ввода (manualIvOverrideDate) для корректного перерасчёта IV в будущем
  const handleIvOverrideChange = React.useCallback((optionId, value) => {
    const numValue = value ? parseFloat(value) : null;

    // Валидация: 1-200%
    if (numValue !== null && (numValue < 1 || numValue > 200)) {
      return;
    }

    // Сохраняем manualIvOverride и дату ввода
    // ЗАЧЕМ: Дата нужна для перерасчёта IV от якорного значения до текущей даты
    if (numValue !== null) {
      const now = new Date();
      const todayISO = now.toISOString().split('T')[0];
      const todayDisplay = now.toLocaleDateString('ru-RU') + ' ' + now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      handleFieldChange(optionId, 'manualIvOverride', numValue);
      handleFieldChange(optionId, 'manualIvOverrideDate', todayISO);
      handleFieldChange(optionId, 'manualIvOverrideDisplayDate', todayDisplay);
    } else {
      handleFieldChange(optionId, 'manualIvOverride', null);
      handleFieldChange(optionId, 'manualIvOverrideDate', null);
      handleFieldChange(optionId, 'manualIvOverrideDisplayDate', null);
    }
  }, []);

  // Обработчик изменения фактической P&L для опциона
  // ЗАЧЕМ: Позволяет пользователю зафиксировать реальную P&L на конкретный день
  // ВАЖНО: Сохраняет дату ввода (actualPLDate) для корректной проекции на будущие дни
  const handleActualPLChange = React.useCallback((optionId, value) => {
    const numValue = value ? parseFloat(value) : null;
    
    // Сохраняем actualPL, actualPLDate (сегодня) и actualPLPrice (текущая цена актива из блока "Симуляция")
    // ЗАЧЕМ: actualPLPrice нужна для корректного расчёта якорной P&L при изменении цены актива
    // ВАЖНО: Берём targetPrice (поле "Цена базового актива" в блоке "Симуляция"), fallback на currentPrice
    if (numValue !== null) {
      const today = new Date().toISOString().split('T')[0]; // ISO формат: YYYY-MM-DD
      handleFieldChange(optionId, 'actualPL', numValue);
      handleFieldChange(optionId, 'actualPLDate', today);
      handleFieldChange(optionId, 'actualPLPrice', targetPrice || currentPrice); // targetPrice = цена из блока "Симуляция"
    } else {
      // Если поле очищено — удаляем все якорные значения
      handleFieldChange(optionId, 'actualPL', null);
      handleFieldChange(optionId, 'actualPLDate', null);
      handleFieldChange(optionId, 'actualPLPrice', null);
    }
  }, [targetPrice, currentPrice]);

  // Обработчик обновления всех незалоченных опционов
  // ЗАЧЕМ: Позволяет пользователю быстро обновить рыночные данные для всех позиций
  // ВАЖНО: В режиме расширения отправляет команду refresh_specific, иначе использует API
  const handleRefreshAllOptions = async () => {
    if (isRefreshingAll) return;

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
      // РЕЖИМ РАСШИРЕНИЯ: Отправляем команду refresh_specific в расширение TradingView
      // ЗАЧЕМ: Расширение обновит данные конкретных опционов + цену базового актива
      if (isFromExtension) {
        sendRefreshSpecificCommand(optionsToRefresh, true);
        console.log(`📤 [Extension] Отправлена команда refresh_specific для ${optionsToRefresh.length} опционов`);
        // Расширение обновит localStorage, калькулятор получит данные через storage event
        // Сбрасываем флаг загрузки через небольшую задержку
        setTimeout(() => setIsRefreshingAll(false), 1000);
        return;
      }

      // РЕЖИМ API: Стандартное обновление через API (для старого калькулятора)
      if (!loadOptionDetails || !selectedTicker) {
        setIsRefreshingAll(false);
        return;
      }

      // Очищаем ВСЕ кэши перед обновлением для получения свежих данных
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

          {/* Супер кнопка для расширенного подбора опционов */}
          <SuperButton onClick={() => setSuperModalOpen(true)} />
          {/* Кнопка сохранения в БД */}
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => onSaveToDB && onSaveToDB()}
            title="Сохранить в БД"
          >
            💾 Сохранить в БД
          </Button>
          {/* СКРЫТО: Кнопка "Обновить данные незалоченных опционов" */}
          {/* <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="h-8 w-8 p-0 bg-cyan-400 hover:bg-cyan-500 text-white transition-all duration-200 hover:scale-105 active:scale-95"
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
          </TooltipProvider> */}
          {/* Кнопка "Сохранить изменения" в режиме редактирования */}
          {isEditMode && hasChanges && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="h-8 px-3 bg-red-500 hover:bg-red-600 text-white animate-pulse"
                    onClick={() => {
                      console.log('🖱️ [OptionsTableV3] Клик на "Сохранить изменения"', { configSource, hasChanges, isEditMode });
                      if (configSource === 'db') {
                        console.log('📤 [OptionsTableV3] Вызов onSaveDBConfiguration');
                        onSaveDBConfiguration?.();
                      } else {
                        console.log('💾 [OptionsTableV3] Вызов onSaveEditedConfiguration');
                        onSaveEditedConfiguration?.();
                      }
                    }}
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
                  className="h-8 w-8 p-0 bg-orange-500 hover:bg-orange-600 text-white transition-all duration-200 hover:scale-105 active:scale-95"
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
          {/* ЗАЧЕМ: Клик по заголовку сортирует таблицу по этой колонке */}
          <div className="grid items-center text-xs font-medium text-muted-foreground px-2" style={{
            display: 'grid',
            gridTemplateColumns: `30px minmax(0,0.9fr) minmax(0,0.9fr) minmax(0,0.7fr) minmax(0,0.55fr) ${hideColumns.includes('premium') ? '' : 'minmax(0,0.8fr) '}minmax(0,0.6fr) minmax(0,0.6fr) ${hideColumns.includes('oi') ? '' : 'minmax(0,0.6fr) '}minmax(0,0.4fr) minmax(0,0.55fr) minmax(0,0.55fr) minmax(0,0.65fr) minmax(0,0.55fr) minmax(0,1.1fr) minmax(0,0.75fr) minmax(0,0.7fr) 40px`.replace(/\s+/g, ' ').trim(),
            gap: '6px'
          }}>
            <div></div>
            <div 
              className="text-left cursor-pointer hover:text-foreground select-none flex items-center gap-1"
              onClick={() => handleSort('type')}
            >
              Тип
              {sortColumn === 'type' && (
                <span className="text-cyan-500">{sortDirection === 'asc' ? '↑' : '↓'}</span>
              )}
            </div>
            <div
              className="text-center cursor-pointer hover:text-foreground select-none flex items-center justify-center gap-1"
              onClick={() => handleSort('date')}
            >
              Expir.
              {sortColumn === 'date' && (
                <span className="text-cyan-500">{sortDirection === 'asc' ? '↑' : '↓'}</span>
              )}
            </div>
            <div
              className="text-center cursor-pointer hover:text-foreground select-none flex items-center justify-center gap-1"
              onClick={() => handleSort('strike')}
            >
              Страйк
              {sortColumn === 'strike' && (
                <span className="text-cyan-500">{sortDirection === 'asc' ? '↑' : '↓'}</span>
              )}
            </div>
            <div className="text-center">Кол.</div>
            {!hideColumns.includes('premium') && <div className="text-center">Премия</div>}
            <div className="text-center">BID</div>
            <div className="text-center">ASK</div>
            {!hideColumns.includes('oi') && <div className="text-center">OI</div>}
            <div className="text-center" style={{ fontSize: '0.7rem' }}>VOL</div>
            <div className="text-center" style={{ fontSize: '0.7rem' }}>IV</div>
            <div className="text-center" style={{ fontSize: '0.7rem' }}>Fact IV</div>
            <div
              className="text-center cursor-pointer hover:text-foreground select-none flex items-center justify-center gap-1"
              onClick={() => handleSort('entry')}
              style={{ fontSize: '0.75rem' }}
            >
              Вход
              {sortColumn === 'entry' && (
                <span className="text-cyan-500">{sortDirection === 'asc' ? '↑' : '↓'}</span>
              )}
            </div>
            <div className="text-center flex items-center justify-center gap-0.5" style={{ fontSize: '0.7rem' }}>
              Актив
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Цена Актива на момент входа в позицию.<br/>Влияет только на расчет срезок в Плане выхода.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="text-center" style={{ fontSize: '0.75rem' }}>P&L</div>
            <div className="text-center" style={{ fontSize: '0.75rem' }}>Fact P&L</div>
            <div className="text-center" style={{ fontSize: '0.75rem' }}>Close</div>
            <div></div>
          </div>

          {getSortedOptions().map((option, optionIndex) => {
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
                  gridTemplateColumns: `30px minmax(0,0.9fr) minmax(0,0.9fr) minmax(0,0.7fr) minmax(0,0.55fr) ${hideColumns.includes('premium') ? '' : 'minmax(0,0.8fr) '}minmax(0,0.6fr) minmax(0,0.6fr) ${hideColumns.includes('oi') ? '' : 'minmax(0,0.6fr) '}minmax(0,0.4fr) minmax(0,0.55fr) minmax(0,0.55fr) minmax(0,0.65fr) minmax(0,0.55fr) minmax(0,1.1fr) minmax(0,0.75fr) minmax(0,0.7fr) 40px`.replace(/\s+/g, ' ').trim(),
                  gap: '6px'
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
                  {option.isSuperOption && (
                    <Gem
                      className="h-3 w-3"
                      style={{ color: '#00BFFF' }} // Голубой цвет (DeepSkyBlue)
                      title="Подобран через супер кнопку"
                    />
                  )}
                </div>
                <div className="flex items-center gap-1 text-left">
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
                <div className="flex items-center justify-end">
                  <Input
                    value={option.date ? formatDateForDisplay(option.date) : ""}
                    readOnly
                    className="h-7 text-right text-xs text-muted-foreground px-1 border-input font-bold bg-gray-50 cursor-default w-[70px]"
                    placeholder="Дата"
                  />
                </div>
                <Input
                  value={option.strike || ""}
                  readOnly
                  className="h-7 text-right font-medium text-sm px-1 border-input bg-gray-50 cursor-default"
                  placeholder=""
                />
                <div className="flex items-center gap-1 text-right">
                  <Input
                    type="number"
                    value={option.quantity}
                    onChange={(e) => !option.isLockedPosition && handleFieldChange(option.id, 'quantity', parseInt(e.target.value) || 0)}
                    className="h-7 text-right text-muted-foreground text-sm px-1 font-bold w-[34px]"
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
                    className={option.isPremiumModified ? "text-right text-orange-600 font-bold cursor-pointer" : `text-right ${option.isLockedPosition ? 'cursor-default' : 'cursor-pointer'}`}
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
                <span
                  className={option.isBidModified ? "text-right text-orange-600 font-bold cursor-pointer" : `text-green-600 text-right ${option.isLockedPosition ? 'cursor-default' : 'cursor-pointer'}`}
                  onDoubleClick={() => !option.isLockedPosition && setEditingBid(option.id)}
                >
                  {editingBid === option.id && !option.isLockedPosition ? (
                    <Input
                      type="number"
                      autoFocus
                      defaultValue={option.customBid ?? option.bid ?? ''}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          handleFieldChange(option.id, 'customBid', val);
                          handleFieldChange(option.id, 'isBidModified', true);
                        }
                        setEditingBid(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.target.blur();
                        }
                        if (e.key === 'Escape') {
                          setEditingBid(null);
                        }
                      }}
                      className="h-6 text-right text-sm w-[60px]"
                    />
                  ) : (
                    option.isBidModified ?
                      (option.customBid >= 0 ? `$${option.customBid.toFixed(2)}` : `-$${Math.abs(option.customBid).toFixed(2)}`) :
                      (option.isLoadingDetails ? (
                        <Loader2 className="h-3 w-3 animate-spin inline" />
                      ) : option.bid !== null ? (
                        `$${option.bid.toFixed(2)}`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      ))
                  )}
                </span>

                {/* Ask */}
                <span
                  className={option.isAskModified ? "text-right text-orange-600 font-bold cursor-pointer" : `text-red-600 text-right ${option.isLockedPosition ? 'cursor-default' : 'cursor-pointer'}`}
                  onDoubleClick={() => !option.isLockedPosition && setEditingAsk(option.id)}
                >
                  {editingAsk === option.id && !option.isLockedPosition ? (
                    <Input
                      type="number"
                      autoFocus
                      defaultValue={option.customAsk ?? option.ask ?? ''}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          handleFieldChange(option.id, 'customAsk', val);
                          handleFieldChange(option.id, 'isAskModified', true);
                        }
                        setEditingAsk(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.target.blur();
                        }
                        if (e.key === 'Escape') {
                          setEditingAsk(null);
                        }
                      }}
                      className="h-6 text-right text-sm w-[60px]"
                    />
                  ) : (
                    option.isAskModified ?
                      (option.customAsk >= 0 ? `$${option.customAsk.toFixed(2)}` : `-$${Math.abs(option.customAsk).toFixed(2)}`) :
                      (option.isLoadingDetails ? (
                        <Loader2 className="h-3 w-3 animate-spin inline" />
                      ) : option.ask !== null ? (
                        `$${option.ask.toFixed(2)}`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      ))
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
                          <span className={`text-right font-bold flex items-center justify-end gap-1 ${showWarning ? colors.text : 'text-muted-foreground'
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
                <span className="text-muted-foreground text-right" style={{ fontSize: '0.7rem' }}>
                  {option.isLoadingDetails ? (
                    <Loader2 className="h-3 w-3 animate-spin inline" />
                  ) : option.volume !== null ? (
                    option.volume.toLocaleString()
                  ) : (
                    "—"
                  )}
                </span>

                {/* IV (Implied Volatility) - результирующая волатильность с учётом времени */}
                {/* ЗАЧЕМ: Отображаем IV с одним знаком после запятой для точности */}
                {/* При покупке используется askIV, при продаже — bidIV (логика в adaptOption) */}
                <span className="text-muted-foreground text-right font-medium" style={{ fontSize: '0.7rem' }}>
                  {(() => {
                    const optIV = option.impliedVolatility || option.implied_volatility;
                    if (!optIV || optIV <= 0) return '—';
                    // Вычисляем результирующую IV с учётом симуляции времени
                    // ВАЖНО: Передаём oldestEntryDate для корректного расчёта actualDaysPassed
                    const oldestEntry = getOldestEntryDate(options);
                    const currentDays = calculateDaysRemainingUTC(option, 0, 30, oldestEntry);
                    const simulatedDays = calculateDaysRemainingUTC(option, daysPassed, 30, oldestEntry);
                    const todaySimDays = calculateDaysToExpirationFromToday(option);
                    // Используем manualIvOverride из самого опциона
                    const resultIV = getOptionVolatility(option, currentDays, simulatedDays, ivSurface, 'simple', null, option.manualIvOverride, todaySimDays);
                    return `${resultIV.toFixed(2)}%`;
                  })()}
                </span>

                {/* Фактическая IV % - ручная коррекция волатильности */}
                {/* ЗАЧЕМ: Позволяет пользователю корректировать IV для каждого опциона отдельно */}
                <Input
                  type="number"
                  min="1"
                  max="200"
                  step="0.1"
                  value={option.manualIvOverride || ''}
                  onChange={(e) => handleIvOverrideChange(option.id, e.target.value)}
                  placeholder={(() => {
                    const optIV = option.impliedVolatility || option.implied_volatility;
                    if (!optIV || optIV <= 0) return '—';
                    return optIV < 1 ? (optIV * 100).toFixed(1) : optIV.toFixed(1);
                  })()}
                  title={option.manualIvOverrideDisplayDate || option.manualIvOverrideDate
                    ? `Обновлено: ${option.manualIvOverrideDisplayDate || option.manualIvOverrideDate}`
                    : ''}
                  disabled={option.isLockedPosition}
                  className="w-14 px-1 text-right text-xs border rounded"
                  style={{
                    fontSize: '0.7rem',
                    backgroundColor: option.ivUpdatedFromExtension ? '#dcfce7' : (option.manualIvOverride ? '#fef3c7' : 'transparent')
                  }}
                />

                {/* Дата входа в позицию */}
                <span
                  className={editingEntryDate === option.id && !option.isLockedPosition ? "text-right" : `text-right ${option.isLockedPosition ? 'cursor-default' : 'cursor-pointer'}`}
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

                {/* Цена базового актива на момент входа */}
                <span
                  className={`text-right ${option.isLockedPosition ? 'cursor-default' : 'cursor-pointer'}`}
                  onDoubleClick={() => !option.isLockedPosition && setEditingAssetPrice(option.id)}
                >
                  {editingAssetPrice === option.id && !option.isLockedPosition ? (
                    <Input
                      type="number"
                      step="0.01"
                      autoFocus
                      defaultValue={option.assetPriceAtEntry || currentPrice || ''}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val > 0) {
                          handleFieldChange(option.id, 'assetPriceAtEntry', val);
                          handleFieldChange(option.id, 'isAssetPriceModified', true);
                        }
                        setEditingAssetPrice(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.target.blur();
                        if (e.key === 'Escape') setEditingAssetPrice(null);
                      }}
                      className="h-7 text-right text-xs px-1 border-input font-bold w-[60px]"
                    />
                  ) : (
                    <span className={`text-xs font-bold ${option.isAssetPriceModified ? 'text-orange-500' : 'text-muted-foreground'}`}>
                      {option.assetPriceAtEntry ? option.assetPriceAtEntry.toFixed(2) : '—'}
                    </span>
                  )}
                </span>

                {/* P/L (Прибыль/Убыток) */}
                <span className="text-right font-bold">
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
                    // DEBUG: Закомментировано для production
                    // console.log(`📅 [OptionsTable] Проверка активности: ${option.type} ${option.strike}, entryDate=${option.entryDate}, oldestEntry=${oldestEntry?.toISOString()}, daysPassed=${daysPassed}, isActive=${isActive}`);

                    if (!isActive) {
                      return <span className="text-muted-foreground">—</span>;
                    }

                    const currentDaysToExpiration = calculateDaysRemainingUTC(option, 0, 30, oldestEntry);
                    const optionDaysRemaining = calculateDaysRemainingUTC(option, daysPassed, 30, oldestEntry);

                    // Определяем волатильность для этого опциона
                    // ЗАЧЕМ: Используем единую функцию getOptionVolatility с IV Surface для точной интерполяции
                    const todaySimDays = calculateDaysToExpirationFromToday(option);
                    // Используем manualIvOverride из самого опциона
                    let optionVolatility = getOptionVolatility(
                      option,
                      currentDaysToExpiration,
                      optionDaysRemaining,
                      ivSurface,
                      'simple',
                      null,
                      option.manualIvOverride,
                      todaySimDays
                    );

                    // Проверяем наличие AI волатильности в кэше
                    // ЗАЧЕМ: Если AI включен и есть прогноз, используем его вместо стандартной IV
                    // ВАЖНО: manualIvOverride имеет приоритет — AI не перезаписывает ручную IV
                    if (isAIEnabled && aiVolatilityMap && selectedTicker && targetPrice && !option.manualIvOverride) {
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
                    // Но теперь мы также передаем ручные Bid/Ask, если они изменены
                    const effectivePremium = option.isPremiumModified ? option.customPremium : option.premium;
                    const tempOpt = {
                      ...option,
                      premium: effectivePremium,
                      // Если премия изменена вручную, сбрасываем Bid/Ask как и раньше
                      // Если нет - передаем флаги модификации для Bid/Ask
                      ask: option.isPremiumModified ? 0 : (option.isAskModified ? option.customAsk : option.ask),
                      bid: option.isPremiumModified ? 0 : (option.isBidModified ? option.customBid : option.bid),
                    };

                    // DEBUG: Закомментировано для production
                    // ЛОГИРОВАНИЕ: Выводим bid/ask и IV для сравнения с подбором
                    // ЗАЧЕМ: Диагностика расхождений P/L между подбором и таблицей
                    // const rawIV = option.impliedVolatility || option.implied_volatility;
                    // console.log(`[Таблица] 💰 P/L расчёт ${option.type} Strike $${option.strike}: BID=$${option.bid?.toFixed(2) || 'N/A'}, ASK=$${option.ask?.toFixed(2) || 'N/A'}, Premium=$${effectivePremium?.toFixed(2) || 'N/A'}, EntryPrice=${option.action === 'Buy' ? (option.ask || effectivePremium) : (option.bid || effectivePremium)}`);
                    // console.log(`[Таблица] 📈 IV расчёт ${option.type} Strike $${option.strike}: rawIV=${rawIV}, IV=${(optionVolatility * 100).toFixed(1)}%, currentDays=${currentDaysToExpiration}, daysRemaining=${optionDaysRemaining}, targetPrice=$${targetPrice || currentPrice}`);

                    // ПРОВЕРКА: Если отсутствуют настройки фьючерса — показываем иконку с восклицательным знаком
                    if (isFuturesMissingSettings) {
                      return (
                        <span className="text-red-600 flex items-center justify-center" title="Отсутствуют настройки фьючерса">
                          <AlertTriangle className="h-4 w-4" />
                        </span>
                      );
                    }

                    // ПРОВЕРКА: Если Bid и Ask равны нулю — показываем иконку с восклицательным знаком
                    // ЗАЧЕМ: Расширение может добавить опцион с нулевыми ценами, что делает расчёт P&L невозможным
                    // Учитываем ручные правки при проверке
                    const effectiveBid = option.isBidModified ? option.customBid : option.bid;
                    const effectiveAsk = option.isAskModified ? option.customAsk : option.ask;
                    const hasBid = effectiveBid !== null && effectiveBid !== undefined && effectiveBid > 0;
                    const hasAsk = effectiveAsk !== null && effectiveAsk !== undefined && effectiveAsk > 0;
                    if (!hasBid && !hasAsk && !option.isPremiumModified) {
                      return (
                        <span className="text-red-600 flex items-center justify-center" title="Отсутствуют цены Bid и Ask">
                          <AlertTriangle className="h-4 w-4" />
                        </span>
                      );
                    }

                    // Выбираем модель расчёта в зависимости от режима калькулятора
                    // ЗАЧЕМ: Режим "Фьючерсы" использует Black-76, режимы "Акции" и "Крипто" — BSM
                    // Для крипто (Binance) безрисковая ставка = 0, для акций — из FRED (null)
                    const rfrOpt = calculatorMode === CALCULATOR_MODES.CRYPTO ? 0 : null;
                    // Цена актива на момент входа — для расчётов P&L
                    const optionAssetPrice = option.assetPriceAtEntry || currentPrice;
                    let pl = calculatorMode === CALCULATOR_MODES.FUTURES
                      ? calculateFuturesOptionPLValue(tempOpt, targetPrice || currentPrice, optionDaysRemaining, contractMultiplier, optionVolatility)
                      : calculateStockOptionPLValue(tempOpt, targetPrice || currentPrice, optionAssetPrice, optionDaysRemaining, optionVolatility, dividendYield, contractMultiplier, rfrOpt);

                    // Применяем корректировку P&L по группе акции (только для режима stocks, не для крипто)
                    if (calculatorMode === CALCULATOR_MODES.STOCKS && stockClassification) {
                      pl = adjustPLByStockGroup(pl, stockClassification);
                    }

                    // Логика якорной P&L: если пользователь ввел actualPL, используем её как якорь
                    // ЗАЧЕМ: Позволяет пользователю зафиксировать реальную P&L и проецировать от неё
                    if (option.actualPL !== null && option.actualPL !== undefined && option.actualPLDate) {
                      // Вычисляем дни от входа до даты ввода actualPL
                      const anchorDateObj = new Date(option.actualPLDate + 'T00:00:00Z');
                      const oldestEntryDateObj = oldestEntry || new Date();
                      const anchorDaysPassed = Math.round((anchorDateObj - oldestEntryDateObj) / (1000 * 60 * 60 * 24));

                      // Если текущий день < дня ввода — показываем стандартный расчёт
                      // Если текущий день >= дня ввода — используем якорную формулу
                      if (daysPassed >= anchorDaysPassed) {
                        // Вычисляем теоретическую цену на момент якоря
                        const anchorDaysToExp = calculateDaysRemainingUTC(option, anchorDaysPassed, 30, oldestEntry);
                        const rfrAnchor = calculatorMode === CALCULATOR_MODES.CRYPTO ? 0 : null;

                        // IV на момент якоря: используем manualIvOverride если задан, иначе marketIV
                        const anchorIV = option.manualIvOverride !== null && option.manualIvOverride !== undefined
                          ? (option.manualIvOverride / 100)
                          : optionVolatility;

                        // ВАЖНО: plAtAnchor считается при ЦЕНЕ АКТИВА НА МОМЕНТ ВВОДА якоря (actualPLPrice)
                        // ЗАЧЕМ: Якорь фиксирует P&L при конкретной цене, дельта должна учитывать изменение цены
                        const anchorPrice = option.actualPLPrice || currentPrice;

                        let plAtAnchor = calculatorMode === CALCULATOR_MODES.FUTURES
                          ? calculateFuturesOptionPLValue(tempOpt, anchorPrice, anchorDaysToExp, contractMultiplier, anchorIV)
                          : calculateStockOptionPLValue(tempOpt, anchorPrice, optionAssetPrice, anchorDaysToExp, anchorIV, dividendYield, contractMultiplier, rfrAnchor);
                        
                        if (calculatorMode === CALCULATOR_MODES.STOCKS && stockClassification) {
                          plAtAnchor = adjustPLByStockGroup(plAtAnchor, stockClassification);
                        }
                        
                        const plBeforeAnchor = pl;
                        // Итоговая P&L = actualPL + (текущая теор. P&L - теор. P&L на якоре)
                        pl = option.actualPL + (pl - plAtAnchor);
                        
                        console.log(`🎯 [Якорь] ${option.type} Strike ${option.strike}:`, {
                          actualPL: option.actualPL,
                          actualPLPrice: option.actualPLPrice,
                          currentPrice,
                          targetPrice,
                          anchorPrice,
                          plBeforeAnchor: Math.round(plBeforeAnchor),
                          plAtAnchor: Math.round(plAtAnchor),
                          delta: Math.round(plBeforeAnchor - plAtAnchor),
                          plAfterAnchor: Math.round(pl)
                        });
                      }
                    }

                    const plColor = pl > 0 ? 'text-green-600' : pl < 0 ? 'text-red-600' : 'text-muted-foreground';

                    return (
                      <span className={plColor}>
                        {formatPLValue(pl)}
                      </span>
                    );
                  })()}
                </span>

                {/* Фактическая P&L — ручная коррекция P&L на конкретный день */}
                {/* ЗАЧЕМ: Позволяет пользователю зафиксировать реальную P&L и использовать её как якорь для проекций */}
                <Input
                  type="number"
                  step="0.01"
                  value={option.actualPL !== null && option.actualPL !== undefined ? option.actualPL : ''}
                  onChange={(e) => handleActualPLChange(option.id, e.target.value)}
                  placeholder={(() => {
                    // Placeholder = текущий теоретический P&L
                    const hasPremium = option.isPremiumModified ? (option.customPremium !== null && option.customPremium !== undefined) : (option.premium !== null && option.premium !== undefined);
                    if (!hasPremium || !option.strike || !currentPrice) return '—';
                    return '0';
                  })()}
                  disabled={option.isLockedPosition}
                  className="w-full px-1 text-right text-xs border rounded"
                  style={{ 
                    fontSize: '0.7rem',
                    backgroundColor: (option.actualPL !== null && option.actualPL !== undefined) ? '#fef3c7' : 'transparent'
                  }}
                />

                {/* Close Price - теоретическая цена опциона на выход */}
                {/* ЗАЧЕМ: Показывает цену опциона, соответствующую отображаемому P&L (с учётом калибровки и якоря) */}
                {/* ВАЖНО: Рассчитываем обратно из adjusted P&L, чтобы всегда соответствовать колонке P&L */}
                <span className="text-muted-foreground text-right" style={{ fontSize: '0.7rem' }}>
                  {(() => {
                    const hasPremium = option.isPremiumModified ? (option.customPremium !== null && option.customPremium !== undefined) : (option.premium !== null && option.premium !== undefined);
                    if (!hasPremium || !option.strike || !currentPrice) {
                      return <span className="text-muted-foreground">—</span>;
                    }

                    const oldestEntry = getOldestEntryDate(options);
                    const isActive = isOptionActiveAtDay(option, daysPassed, oldestEntry);
                    if (!isActive) {
                      return <span className="text-muted-foreground">—</span>;
                    }

                    // === Расчёт той же adjusted P&L что и в колонке P&L ===
                    const currentDaysToExpiration = calculateDaysRemainingUTC(option, 0, 30, oldestEntry);
                    const optionDaysRemaining = calculateDaysRemainingUTC(option, daysPassed, 30, oldestEntry);
                    const todaySimDays = calculateDaysToExpirationFromToday(option);

                    // Определяем волатильность
                    let optionVolatility = getOptionVolatility(
                      option,
                      currentDaysToExpiration,
                      optionDaysRemaining,
                      ivSurface,
                      'simple',
                      null,
                      option.manualIvOverride,
                      todaySimDays
                    );

                    // Используем customPremium если премия была изменена вручную
                    const effectivePremium = option.isPremiumModified ? option.customPremium : option.premium;
                    const tempOpt = {
                      ...option,
                      premium: effectivePremium,
                      ask: option.isPremiumModified ? 0 : (option.isAskModified ? option.customAsk : option.ask),
                      bid: option.isPremiumModified ? 0 : (option.isBidModified ? option.customBid : option.bid),
                    };

                    // Цена входа (ASK для Buy, BID для Sell)
                    const isBuy = (option.action || 'Buy').toLowerCase() === 'buy';
                    let entryPrice;
                    if (isBuy) {
                      entryPrice = option.isAskModified && option.customAsk !== undefined ? option.customAsk : (option.ask || effectivePremium || 0);
                    } else {
                      entryPrice = option.isBidModified && option.customBid !== undefined ? option.customBid : (option.bid || effectivePremium || 0);
                    }

                    const quantity = Math.abs(option.quantity || 0);

                    // Базовая теоретическая цена (до корректировок)
                    let theoreticalPrice;
                    if (calculatorMode === CALCULATOR_MODES.FUTURES) {
                      theoreticalPrice = calculateFuturesOptionTheoreticalPrice(
                        option,
                        targetPrice || currentPrice,
                        optionDaysRemaining,
                        optionVolatility
                      );
                    } else {
                      const rfrOpt = calculatorMode === CALCULATOR_MODES.CRYPTO ? 0 : null;
                      theoreticalPrice = calculateOptionTheoreticalPrice(
                        option,
                        targetPrice || currentPrice,
                        optionDaysRemaining,
                        optionVolatility,
                        dividendYield,
                        rfrOpt
                      );
                    }

                    // Расчёт raw P&L
                    const rfrOpt = calculatorMode === CALCULATOR_MODES.CRYPTO ? 0 : null;
                    const optionAssetPrice = option.assetPriceAtEntry || currentPrice;
                    let pl = calculatorMode === CALCULATOR_MODES.FUTURES
                      ? calculateFuturesOptionPLValue(tempOpt, targetPrice || currentPrice, optionDaysRemaining, contractMultiplier, optionVolatility)
                      : calculateStockOptionPLValue(tempOpt, targetPrice || currentPrice, optionAssetPrice, optionDaysRemaining, optionVolatility, dividendYield, contractMultiplier, rfrOpt);

                    // Применяем корректировку P&L по группе акции
                    if (calculatorMode === CALCULATOR_MODES.STOCKS && stockClassification) {
                      pl = adjustPLByStockGroup(pl, stockClassification);
                    }

                    // Применяем логику якорной P&L
                    if (option.actualPL !== null && option.actualPL !== undefined && option.actualPLDate) {
                      const anchorDateObj = new Date(option.actualPLDate + 'T00:00:00Z');
                      const oldestEntryDateObj = oldestEntry || new Date();
                      const anchorDaysPassed = Math.round((anchorDateObj - oldestEntryDateObj) / (1000 * 60 * 60 * 24));

                      if (daysPassed >= anchorDaysPassed) {
                        const anchorDaysToExp = calculateDaysRemainingUTC(option, anchorDaysPassed, 30, oldestEntry);
                        const rfrAnchor = calculatorMode === CALCULATOR_MODES.CRYPTO ? 0 : null;
                        const anchorIV = option.manualIvOverride !== null && option.manualIvOverride !== undefined
                          ? (option.manualIvOverride / 100)
                          : optionVolatility;
                        const anchorPrice = option.actualPLPrice || currentPrice;

                        let plAtAnchor = calculatorMode === CALCULATOR_MODES.FUTURES
                          ? calculateFuturesOptionPLValue(tempOpt, anchorPrice, anchorDaysToExp, contractMultiplier, anchorIV)
                          : calculateStockOptionPLValue(tempOpt, anchorPrice, optionAssetPrice, anchorDaysToExp, anchorIV, dividendYield, contractMultiplier, rfrAnchor);
                        
                        if (calculatorMode === CALCULATOR_MODES.STOCKS && stockClassification) {
                          plAtAnchor = adjustPLByStockGroup(plAtAnchor, stockClassification);
                        }
                        
                        pl = option.actualPL + (pl - plAtAnchor);
                      }
                    }

                    // === Обратный расчёт цены закрытия из adjusted P&L ===
                    // P&L = (ClosePrice - EntryPrice) * Qty * Multiplier (для Buy)
                    // P&L = (EntryPrice - ClosePrice) * Qty * Multiplier (для Sell)
                    // Отсюда: ClosePrice = EntryPrice + P&L/(Qty*Multiplier) для Buy
                    // ClosePrice = EntryPrice - P&L/(Qty*Multiplier) для Sell
                    let closePrice;
                    const multiplier = contractMultiplier || 100;
                    if (quantity === 0 || multiplier === 0) {
                      closePrice = theoreticalPrice;
                    } else {
                      if (isBuy) {
                        closePrice = entryPrice + (pl / (quantity * multiplier));
                      } else {
                        closePrice = entryPrice - (pl / (quantity * multiplier));
                      }
                    }

                    // Ограничиваем цену неотрицательными значениями
                    closePrice = Math.max(0, closePrice);

                    return `$${closePrice.toFixed(2)}`;
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
          <div className="items-center text-sm border-t-2 border-cyan-500 bg-cyan-50/50 rounded-md p-2 font-bold" style={{ display: 'grid', gridTemplateColumns: `30px minmax(0,0.9fr) minmax(0,0.9fr) minmax(0,0.7fr) minmax(0,0.55fr) ${hideColumns.includes('premium') ? '' : 'minmax(0,0.8fr) '}minmax(0,0.6fr) minmax(0,0.6fr) ${hideColumns.includes('oi') ? '' : 'minmax(0,0.6fr) '}minmax(0,0.4fr) minmax(0,0.55fr) minmax(0,0.55fr) minmax(0,0.65fr) minmax(0,0.55fr) minmax(0,1.1fr) minmax(0,0.75fr) minmax(0,0.7fr) 40px`.replace(/\s+/g, ' ').trim(), gap: '6px' }}>
            <div></div>
            <div className="text-left">ИТОГО:</div>
            <div></div>
            <div></div>
            <div></div>
            {!hideColumns.includes('premium') && <div></div>}
            <div></div>
            <div></div>
            {!hideColumns.includes('oi') && <div></div>}
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div className="text-right">
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
                    const todaySimDaysForOpt = calculateDaysToExpirationFromToday(opt);
                    // Используем manualIvOverride из самого опциона
                    let optVolatility = getOptionVolatility(
                      opt,
                      currentDaysToExp,
                      optDaysRemaining,
                      ivSurface,
                      'simple',
                      null,
                      opt.manualIvOverride,
                      todaySimDaysForOpt
                    );

                    // Проверяем наличие AI волатильности в кэше
                    // ВАЖНО: manualIvOverride имеет приоритет — AI не перезаписывает ручную IV
                    if (isAIEnabled && aiVolatilityMap && selectedTicker && targetPrice && !opt.manualIvOverride) {
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
                    // ПРОВЕРКА: Если отсутствуют настройки фьючерса — не считаем прибыль
                    if (isFuturesMissingSettings) {
                      return sum;
                    }

                    // Выбираем модель расчёта в зависимости от режима калькулятора
                    // Для крипто (Binance) безрисковая ставка = 0, для акций — из FRED (null)
                    const rfrSum = calculatorMode === CALCULATOR_MODES.CRYPTO ? 0 : null;
                    const optAssetPrice = opt.assetPriceAtEntry || currentPrice;
                    let pl = calculatorMode === CALCULATOR_MODES.FUTURES
                      ? calculateFuturesOptionPLValue(tempOpt, targetPrice || currentPrice, optDaysRemaining, contractMultiplier, optVolatility)
                      : calculateStockOptionPLValue(tempOpt, targetPrice || currentPrice, optAssetPrice, optDaysRemaining, optVolatility, dividendYield, contractMultiplier, rfrSum);

                    // Применяем корректировку P&L по группе акции (только для режима stocks, не для крипто)
                    if (calculatorMode === CALCULATOR_MODES.STOCKS && stockClassification) {
                      pl = adjustPLByStockGroup(pl, stockClassification);
                    }

                    // Логика якорной P&L для итоговой строки
                    // ЗАЧЕМ: Если пользователь ввел actualPL, используем её как якорь для этого опциона
                    if (opt.actualPL !== null && opt.actualPL !== undefined && opt.actualPLDate) {
                      // Вычисляем дни от входа до даты ввода actualPL
                      const anchorDateObj = new Date(opt.actualPLDate + 'T00:00:00Z');
                      const oldestEntryDateObj = oldestEntry || new Date();
                      const anchorDaysPassed = Math.round((anchorDateObj - oldestEntryDateObj) / (1000 * 60 * 60 * 24));

                      // Если текущий день >= дня ввода — используем якорную формулу
                      if (daysPassed >= anchorDaysPassed) {
                        // Вычисляем теоретическую цену на момент якоря
                        const anchorDaysToExp = calculateDaysRemainingUTC(opt, anchorDaysPassed, 30, oldestEntry);
                        const rfrAnchor = calculatorMode === CALCULATOR_MODES.CRYPTO ? 0 : null;

                        // IV на момент якоря: используем manualIvOverride если задан, иначе marketIV
                        const anchorIV = opt.manualIvOverride !== null && opt.manualIvOverride !== undefined
                          ? (opt.manualIvOverride / 100)
                          : optVolatility;

                        // ВАЖНО: plAtAnchor считается при ЦЕНЕ АКТИВА НА МОМЕНТ ВВОДА якоря (actualPLPrice)
                        // ЗАЧЕМ: Якорь фиксирует P&L при конкретной цене, дельта должна учитывать изменение цены
                        const anchorPrice = opt.actualPLPrice || currentPrice;

                        let plAtAnchor = calculatorMode === CALCULATOR_MODES.FUTURES
                          ? calculateFuturesOptionPLValue(tempOpt, anchorPrice, anchorDaysToExp, contractMultiplier, anchorIV)
                          : calculateStockOptionPLValue(tempOpt, anchorPrice, optAssetPrice, anchorDaysToExp, anchorIV, dividendYield, contractMultiplier, rfrAnchor);
                        
                        if (calculatorMode === CALCULATOR_MODES.STOCKS && stockClassification) {
                          plAtAnchor = adjustPLByStockGroup(plAtAnchor, stockClassification);
                        }
                        
                        // Итоговая P&L = actualPL + (текущая теор. P&L - теор. P&L на якоре)
                        pl = opt.actualPL + (pl - plAtAnchor);
                      }
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
            <div></div>
            <div></div>
            <div></div>
          </div>
        </div>
      )}

      {/* Модальное окно Супер подбора */}
      {superModalOpen && (
        <SuperSelectionModal
          isOpen={superModalOpen}
          onClose={() => setSuperModalOpen(false)}
          positions={positions}
          options={options}
          currentPrice={currentPrice}
          selectedTicker={selectedTicker}
          availableDates={availableDates}
          isFromExtension={isFromExtension}
          onAddOption={(option) => {
            if (onAddMagicOption) {
              onAddMagicOption(option);
            }
            setSuperModalOpen(false);
          }}
          classification={stockClassification}
          calculatorMode={calculatorMode}
          contractMultiplier={contractMultiplier}
        />
      )}
    </div>
  );
}

export default OptionsTableV3;
