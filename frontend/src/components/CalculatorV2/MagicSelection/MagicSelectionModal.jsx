/**
 * Модальное окно "Волшебный подбор" опционов
 * ЗАЧЕМ: Предоставляет интерфейс для автоматического подбора оптимальных опционов
 * Затрагивает: калькулятор опционов, позиции базового актива, таблицу опционов
 * 
 * Сценарии отображения:
 * 1. Нет позиции базового актива → сообщение с кнопкой "Понятно"
 * 2. Есть базовый актив, нет BuyPUT → подбор BuyPUT для защиты
 * 3. Есть базовый актив и BuyPUT → подбор BuyCALL для компенсации
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Loader2, Sparkles, AlertCircle, CheckCircle, ChevronDown, ChevronUp, Wand2 } from 'lucide-react';
import { findBestBuyPut, findBestBuyCall, formatOptionForTable, calculateBaseAssetPL } from './magicSelectionLogic';

/**
 * Компонент модального окна волшебного подбора
 * @param {boolean} isOpen - Состояние открытия модального окна
 * @param {function} onClose - Функция закрытия окна
 * @param {array} positions - Позиции базового актива
 * @param {array} options - Опционы в калькуляторе
 * @param {number} currentPrice - Текущая цена базового актива
 * @param {number} targetPrice - Цена из блока "Симуляция изменения рынка"
 * @param {function} onAddOption - Функция добавления опциона в калькулятор
 * @param {string} selectedTicker - Тикер актива
 * @param {array} availableDates - Доступные даты экспирации
 * @param {object} ivSurface - IV Surface для интерполяции волатильности
 * @param {number} dividendYield - Дивидендная доходность
 * @param {function} onSelectionComplete - Callback для передачи параметров подбора в OptionSelectionResult
 */
function MagicSelectionModal({
  isOpen,
  onClose,
  positions = [],
  options = [],
  currentPrice = 0,
  targetPrice = 0,
  onAddOption,
  selectedTicker = '',
  availableDates = [],
  ivSurface = null,
  dividendYield = 0,
  onSelectionComplete = null
}) {
  // Состояние загрузки подбора
  const [isSearching, setIsSearching] = useState(false);
  // Состояние прогресса подбора
  const [progress, setProgress] = useState({ stage: '', total: 0, current: 0 });
  // Состояние ошибки
  const [error, setError] = useState(null);
  // Состояние успешного подбора
  const [foundOption, setFoundOption] = useState(null);
  // Ref для синхронного отслеживания наличия предложения
  // ЗАЧЕМ: useState асинхронный, а нам нужно проверять suggestion в setTimeout
  const suggestionRef = React.useRef(null);

  // Проверяем наличие позиции базового актива
  const hasBaseAssetPosition = useMemo(() => {
    return positions && positions.length > 0 && positions.some(p => p.visible !== false);
  }, [positions]);

  // Получаем цену позиции базового актива
  const baseAssetPrice = useMemo(() => {
    if (!hasBaseAssetPosition) return 0;
    const firstPosition = positions.find(p => p.visible !== false);
    return firstPosition?.price || currentPrice || 0;
  }, [positions, hasBaseAssetPosition, currentPrice]);

  // Проверяем наличие BuyPUT опциона
  const hasBuyPut = useMemo(() => {
    if (!options || options.length === 0) return false;
    return options.some(opt => 
      opt.type?.toUpperCase() === 'PUT' && 
      opt.action?.toLowerCase() === 'buy' &&
      opt.visible !== false
    );
  }, [options]);
  
  // Проверяем наличие BuyCALL опциона
  const hasBuyCall = useMemo(() => {
    if (!options || options.length === 0) return false;
    return options.some(opt => 
      opt.type?.toUpperCase() === 'CALL' && 
      opt.action?.toLowerCase() === 'buy' &&
      opt.visible !== false
    );
  }, [options]);
  
  // Получаем данные о BuyPUT опционе для расчёта убытка при росте цены
  const buyPutOption = useMemo(() => {
    if (!options || options.length === 0) return null;
    return options.find(opt => 
      opt.type?.toUpperCase() === 'PUT' && 
      opt.action?.toLowerCase() === 'buy' &&
      opt.visible !== false
    );
  }, [options]);

  // Определяем сценарий отображения
  // 1 - нет базового актива, 2 - подбор BuyPUT, 3 - подбор BuyCALL, 4 - всё готово (кнопка деактивирована)
  const scenario = useMemo(() => {
    if (!hasBaseAssetPosition) return 1;
    if (!hasBuyPut) return 2;
    if (!hasBuyCall) return 3;
    return 4; // Есть и BuyPUT, и BuyCALL — подбор завершён
  }, [hasBaseAssetPosition, hasBuyPut, hasBuyCall]);

  // Расчёт уровней для BuyPUT (±5% от цены базового актива из блока "Симуляция изменения рынка")
  const buyPutLevels = useMemo(() => {
    const price = currentPrice || 0;
    return {
      up: +(price * 1.05).toFixed(2),
      down: +(price * 0.95).toFixed(2)
    };
  }, [currentPrice]);

  // Расчёт уровней для BuyCALL (±2.44% от цены из симуляции)
  const buyCallLevels = useMemo(() => {
    const price = targetPrice || currentPrice || 0;
    return {
      up: +(price * 1.0244).toFixed(2),
      down: +(price * 0.9756).toFixed(2)
    };
  }, [targetPrice, currentPrice]);

  // Состояния для редактируемых инпутов уровней
  const [putUpPrice, setPutUpPrice] = useState(buyPutLevels.up);
  const [putDownPrice, setPutDownPrice] = useState(buyPutLevels.down);
  const [callUpPrice, setCallUpPrice] = useState(buyCallLevels.up);
  const [callDownPrice, setCallDownPrice] = useState(buyCallLevels.down);
  
  // Состояния для настроек фильтров
  const [strikeRangePercent, setStrikeRangePercent] = useState(20); // ±20% от текущей цены
  const [minOpenInterest, setMinOpenInterest] = useState(100); // Минимальный OI
  
  // Дополнительные параметры подбора
  const [optionRiskUpPercent, setOptionRiskUpPercent] = useState(5); // Риск опциона вверх (%)
  const [totalRiskDownPercent, setTotalRiskDownPercent] = useState(5); // Общий риск вниз (%)
  const [maxDaysToExpiration, setMaxDaysToExpiration] = useState(100); // Макс. дней до экспирации
  const [evaluationDay, setEvaluationDay] = useState(5); // День выхода (оценки P/L)
  
  // Состояние для предложения (опцион без фильтра ликвидности)
  const [suggestion, setSuggestion] = useState(null);
  
  // Состояние для сворачиваемого блока параметров
  const [isParamsCollapsed, setIsParamsCollapsed] = useState(true);
  
  // Параметры подбора BuyCALL (отдельные от BuyPUT)
  const [callMaxDaysToExpiration, setCallMaxDaysToExpiration] = useState(100);
  const [callEvaluationDay, setCallEvaluationDay] = useState(5);
  const [callStrikeRangePercent, setCallStrikeRangePercent] = useState(20);
  const [callMinOpenInterest, setCallMinOpenInterest] = useState(100);
  const [isCallParamsCollapsed, setIsCallParamsCollapsed] = useState(true);
  
  // Функция для установки suggestion с синхронизацией ref
  // ЗАЧЕМ: Нужно синхронно проверять наличие suggestion в setTimeout
  const setSuggestionWithRef = (value) => {
    suggestionRef.current = value;
    setSuggestion(value);
  };

  // Безопасная функция закрытия окна
  // ЗАЧЕМ: Проверяет наличие предложения перед закрытием
  const safeClose = () => {
    if (suggestionRef.current) {
      console.log('🔮 safeClose: блокируем закрытие, есть предложение');
      return;
    }
    console.log('🔮 safeClose: закрываем окно');
    onClose();
  };

  // Синхронизация значений при изменении цен
  useEffect(() => {
    setPutUpPrice(buyPutLevels.up);
    setPutDownPrice(buyPutLevels.down);
  }, [buyPutLevels.up, buyPutLevels.down]);

  useEffect(() => {
    setCallUpPrice(buyCallLevels.up);
    setCallDownPrice(buyCallLevels.down);
  }, [buyCallLevels.up, buyCallLevels.down]);

  // Получаем первую позицию базового актива
  const firstPosition = useMemo(() => {
    if (!hasBaseAssetPosition) return null;
    return positions.find(p => p.visible !== false);
  }, [positions, hasBaseAssetPosition]);

  // Сброс состояния при открытии/закрытии окна
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setFoundOption(null);
      setProgress({ stage: '', total: 0, current: 0 });
      setSuggestionWithRef(null); // Сбрасываем предложение
    }
  }, [isOpen]);

  // Обработчик начала подбора BuyPUT
  const handleStartBuyPutSelection = async () => {
    setIsSearching(true);
    setError(null);
    setFoundOption(null);
    setSuggestionWithRef(null); // Сбрасываем предложение при новом поиске
    
    try {
      const result = await findBestBuyPut({
        ticker: selectedTicker,
        currentPrice,
        priceUp: putUpPrice,
        priceDown: putDownPrice,
        position: firstPosition,
        availableDates,
        ivSurface,
        dividendYield,
        onProgress: setProgress,
        // Настройки фильтров из UI
        strikeRangePercent: strikeRangePercent / 100, // Конвертируем в десятичный формат
        minOpenInterest: minOpenInterest,
        // Дополнительные параметры подбора
        optionRiskUpPercent: optionRiskUpPercent / 100, // Риск опциона вверх (десятичный)
        totalRiskDownPercent: totalRiskDownPercent / 100, // Общий риск вниз (десятичный)
        maxDaysToExpiration: maxDaysToExpiration, // Макс. дней до экспирации
        evaluationDay: evaluationDay // День выхода (оценки P/L)
      });
      
      // Проверяем, вернулась ли ошибка с детальной информацией
      if (result && result.error) {
        // Формируем детальное сообщение об ошибке
        let errorMessage = result.message || 'Не удалось найти подходящий опцион.';
        if (result.stats) {
          const s = result.stats;
          errorMessage += `\n\nСтатистика поиска:`;
          errorMessage += `\n• Дат экспирации: ${s.filteredDates} из ${s.totalDates}`;
          if (s.totalPutOptions > 0) {
            errorMessage += `\n• PUT опционов найдено: ${s.totalPutOptions}`;
          }
          if (s.afterStrikeFilter > 0) {
            errorMessage += `\n• После фильтра страйков: ${s.afterStrikeFilter}`;
          }
          if (s.afterLiquidityFilter > 0) {
            errorMessage += `\n• После фильтра ликвидности: ${s.afterLiquidityFilter}`;
          }
          if (s.rejectedByLiquidity > 0) {
            errorMessage += `\n• Отклонено по ликвидности (OI<100): ${s.rejectedByLiquidity}`;
          }
        }
        setError(errorMessage);
        
        // Сохраняем предложение, если оно есть
        if (result.suggestion) {
          setSuggestionWithRef(result.suggestion);
        } else {
          setSuggestionWithRef(null);
        }
        return;
      }
      
      if (result && !result.error) {
        setFoundOption(result);
        
        // Если опцион не прошёл критерии риска, показываем предупреждение
        if (result.passedRiskCriteria === false && result.riskMessage) {
          setError(`⚠️ Опцион добавлен, но не прошёл критерии риска:\n${result.riskMessage}`);
        }
        
        // Форматируем и добавляем опцион в таблицу
        const formattedOption = formatOptionForTable(result);
        if (onAddOption) {
          onAddOption(formattedOption);
        }
        
        // Передаём параметры подбора для компонента OptionSelectionResult
        // ЗАЧЕМ: Отображаем результат подбора с расчётом P&L по целевым ценам
        if (onSelectionComplete) {
          const selectionParams = {
            optionType: 'PUT',
            daysAfterEntry: result.evaluationDay || evaluationDay,
            targetUpPercent: ((putUpPrice - currentPrice) / currentPrice * 100).toFixed(1),
            targetUpPrice: putUpPrice,
            targetDownPercent: ((currentPrice - putDownPrice) / currentPrice * 100).toFixed(1),
            targetDownPrice: putDownPrice,
            optionRiskPercent: optionRiskUpPercent, // Риск опциона вверх из UI
            riskPercent: totalRiskDownPercent, // Общий риск вниз из UI
            entryPrice: firstPosition?.price || currentPrice,
            positionQuantity: firstPosition?.quantity || 100,
            putPLAtUp: result.calculatedPlUp || 0,
            putPLAtDown: result.calculatedPlDown || 0
          };
          onSelectionComplete(selectionParams);
          console.log('🔮 Волшебный подбор: параметры для OptionSelectionResult', selectionParams);
        }
        
        // Закрываем окно через небольшую задержку
        setIsSearching(false);
        setTimeout(() => {
          safeClose();
        }, 1000);
        return;
      } else {
        setError('Не удалось найти подходящий опцион. Попробуйте изменить уровни.');
      }
    } catch (err) {
      console.error('Ошибка подбора:', err);
      setError('Произошла ошибка при подборе. Попробуйте ещё раз.');
    }
    setIsSearching(false);
  };

  // Обработчик начала подбора BuyCALL
  const handleStartBuyCallSelection = async () => {
    setIsSearching(true);
    setError(null);
    setFoundOption(null);
    setSuggestionWithRef(null);
    
    try {
      // Рассчитываем убыток базового актива при цене НИЗ для правильного расчёта % покрытия в предложении
      const baseAssetPlDown = calculateBaseAssetPL(firstPosition, callDownPrice);
      const baseAssetLossDown = Math.abs(Math.min(0, baseAssetPlDown));
      
      const result = await findBestBuyCall({
        ticker: selectedTicker,
        currentPrice,
        priceUp: callUpPrice,
        priceDown: callDownPrice,
        buyPutOption: buyPutOption,
        availableDates,
        ivSurface,
        dividendYield,
        onProgress: setProgress,
        strikeRangePercent: callStrikeRangePercent / 100,
        minOpenInterest: callMinOpenInterest,
        maxDaysToExpiration: callMaxDaysToExpiration,
        evaluationDay: callEvaluationDay,
        baseAssetLossDown: baseAssetLossDown
      });
      
      // Проверяем, вернулась ли ошибка с детальной информацией
      if (result && result.error) {
        let errorMessage = result.message || 'Не удалось найти подходящий CALL опцион.';
        if (result.stats) {
          const s = result.stats;
          errorMessage += `\n\nСтатистика поиска:`;
          errorMessage += `\n• Дат экспирации: ${s.filteredDates} из ${s.totalDates}`;
          if (s.totalCallOptions > 0) {
            errorMessage += `\n• CALL опционов найдено: ${s.totalCallOptions}`;
          }
          if (s.afterStrikeFilter > 0) {
            errorMessage += `\n• После фильтра страйков: ${s.afterStrikeFilter}`;
          }
          if (s.afterLiquidityFilter > 0) {
            errorMessage += `\n• После фильтра ликвидности: ${s.afterLiquidityFilter}`;
          }
          if (s.rejectedByLiquidity > 0) {
            errorMessage += `\n• Отклонено по ликвидности (OI<${callMinOpenInterest}): ${s.rejectedByLiquidity}`;
          }
        }
        setError(errorMessage);
        
        // Сохраняем предложение, если оно есть
        if (result.suggestion) {
          setSuggestionWithRef({ ...result.suggestion, optionType: 'CALL' });
        } else {
          setSuggestionWithRef(null);
        }
        return;
      }
      
      if (result && !result.error) {
        setFoundOption(result);
        
        // Форматируем и добавляем опцион в таблицу
        const formattedOption = formatOptionForTable(result, 'CALL');
        if (onAddOption) {
          onAddOption(formattedOption);
        }
        
        // Передаём параметры подбора для компонента OptionSelectionResult
        if (onSelectionComplete) {
          const selectionParams = {
            optionType: 'CALL',
            daysAfterEntry: result.evaluationDay || callEvaluationDay,
            targetUpPercent: ((callUpPrice - currentPrice) / currentPrice * 100).toFixed(1),
            targetUpPrice: callUpPrice,
            targetDownPercent: ((currentPrice - callDownPrice) / currentPrice * 100).toFixed(1),
            targetDownPrice: callDownPrice,
            entryPrice: firstPosition?.price || currentPrice,
            positionQuantity: firstPosition?.quantity || 100,
            callPLAtUp: result.calculatedPlUp || 0,
            callPLAtDown: result.calculatedPlDown || 0,
            putLossCompensated: result.putLossCompensated || 0
          };
          onSelectionComplete(selectionParams);
          console.log('🔮 BuyCALL подобран: параметры для OptionSelectionResult', selectionParams);
        }
        
        // Закрываем окно через небольшую задержку
        setTimeout(() => {
          safeClose();
        }, 500);
      } else {
        setError('Не удалось найти подходящий CALL опцион. Попробуйте изменить уровни.');
      }
    } catch (err) {
      console.error('Ошибка подбора BuyCALL:', err);
      setError('Произошла ошибка при подборе. Попробуйте ещё раз.');
    } finally {
      setIsSearching(false);
    }
  };

  // Обработчик начала подбора (BuyPUT или BuyCALL)
  const handleStartSelection = async () => {
    if (scenario === 2) {
      await handleStartBuyPutSelection();
    } else if (scenario === 3) {
      await handleStartBuyCallSelection();
    }
  };
  
  // Обработчик принятия предложения (опцион без фильтра ликвидности)
  const handleAcceptSuggestion = () => {
    if (!suggestion || !suggestion.option) return;
    
    // Определяем тип опциона из предложения
    const optType = suggestion.optionType || 'PUT';
    const isCall = optType.toUpperCase() === 'CALL';
    
    // Формируем опцион с данными из предложения
    const suggestedOption = {
      ...suggestion.option,
      calculatedPlUp: suggestion.plUp,
      calculatedPlDown: suggestion.plDown,
      evaluationDay: isCall ? callEvaluationDay : evaluationDay,
      passedRiskCriteria: false, // Не прошёл фильтр ликвидности
      acceptedFromSuggestion: true
    };
    
    setFoundOption(suggestedOption);
    setError(null);
    setSuggestionWithRef(null);
    
    // Форматируем и добавляем опцион в таблицу
    const formattedOption = formatOptionForTable(suggestedOption, optType);
    if (onAddOption) {
      onAddOption(formattedOption);
    }
    
    // Передаём параметры подбора для компонента OptionSelectionResult
    if (onSelectionComplete) {
      const selectionParams = isCall ? {
        optionType: 'CALL',
        daysAfterEntry: suggestedOption.evaluationDay || callEvaluationDay,
        targetUpPercent: ((callUpPrice - currentPrice) / currentPrice * 100).toFixed(1),
        targetUpPrice: callUpPrice,
        targetDownPercent: ((currentPrice - callDownPrice) / currentPrice * 100).toFixed(1),
        targetDownPrice: callDownPrice,
        entryPrice: firstPosition?.price || currentPrice,
        positionQuantity: firstPosition?.quantity || 100,
        callPLAtUp: suggestion.plUp || 0,
        callPLAtDown: suggestion.plDown || 0,
        putLossCompensated: suggestion.putLoss || 0
      } : {
        optionType: 'PUT',
        daysAfterEntry: suggestedOption.evaluationDay || evaluationDay,
        targetUpPercent: ((putUpPrice - currentPrice) / currentPrice * 100).toFixed(1),
        targetUpPrice: putUpPrice,
        targetDownPercent: ((currentPrice - putDownPrice) / currentPrice * 100).toFixed(1),
        targetDownPrice: putDownPrice,
        optionRiskPercent: optionRiskUpPercent,
        riskPercent: totalRiskDownPercent,
        entryPrice: firstPosition?.price || currentPrice,
        positionQuantity: firstPosition?.quantity || 100,
        putPLAtUp: suggestion.plUp || 0,
        putPLAtDown: suggestion.plDown || 0
      };
      onSelectionComplete(selectionParams);
      console.log(`🔮 Принято предложение ${optType}: параметры для OptionSelectionResult`, selectionParams);
    }
    
    // Закрываем окно через небольшую задержку
    setTimeout(() => {
      safeClose();
    }, 500);
  };

  // Форматирование статуса прогресса
  const getProgressText = () => {
    switch (progress.stage) {
      case 'loading':
        return `Загрузка даты ${progress.current}/${progress.total}...`;
      case 'calculating':
        return `Расчёт P/L ${progress.current}/${progress.total}...`;
      case 'filtering':
        return 'Фильтрация по критериям...';
      case 'selecting':
        return 'Выбор лучшего опциона...';
      default:
        return 'Подбираю...';
    }
  };

  // Стили для шапки модального окна
  const headerStyle = {
    background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 50%, #6d28d9 100%)',
    margin: '-24px -24px 16px -24px',
    padding: '16px 24px',
    borderRadius: '8px 8px 0 0',
  };

  // Стили для кнопки подбора
  const selectionButtonStyle = {
    background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 50%, #6d28d9 100%)',
    boxShadow: '0 2px 8px rgba(139, 92, 246, 0.4)',
  };

  // Обработчик изменения состояния диалога
  // ЗАЧЕМ: Блокируем закрытие только во время поиска, чтобы не прервать процесс
  const handleOpenChange = (open) => {
    if (!open) {
      // Пользователь пытается закрыть окно
      if (isSearching) {
        console.log('🔮 Блокируем закрытие: идёт поиск');
        return; // Не закрываем во время поиска
      }
      // Разрешаем закрытие по крестику даже если есть предложение
      console.log('🔮 Закрываем окно');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[450px] border-0 [&>button]:text-white [&>button]:hover:text-white/80">
        <DialogHeader style={headerStyle}>
          <DialogTitle className="text-white text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Волшебный подбор
          </DialogTitle>
        </DialogHeader>

        {/* Сценарий 1: Нет позиции базового актива */}
        {scenario === 1 && (
          <div className="space-y-4 py-4">
            <p className="text-center text-muted-foreground">
              Для волшебства необходимо сначала ввести позицию базового актива.
            </p>
            <div className="flex justify-center">
              <Button
                onClick={onClose}
                className="px-8 bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                Понятно
              </Button>
            </div>
          </div>
        )}

        {/* Сценарий 2: Подбор BuyPUT для защиты */}
        {scenario === 2 && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Готов подобрать самый оптимальный опцион <span className="font-semibold text-red-600">BuyPUT</span> для защиты позиции базового актива.
            </p>
            
            {/* Сворачиваемый блок параметров */}
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setIsParamsCollapsed(!isParamsCollapsed)}
                className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="text-sm text-muted-foreground">Параметры подбора</span>
                {isParamsCollapsed ? (
                  <ChevronDown size={16} className="text-muted-foreground" />
                ) : (
                  <ChevronUp size={16} className="text-muted-foreground" />
                )}
              </button>
              
              {!isParamsCollapsed && (
                <div className="p-3 space-y-3 border-t border-gray-200">
                  {/* Строка 1: ВЕРХ и Риск опциона вверх */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">
                        ВЕРХ <span className="text-muted-foreground text-xs">(+5%)</span>
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={putUpPrice}
                        onChange={(e) => setPutUpPrice(parseFloat(e.target.value) || 0)}
                        className="h-9"
                        tabIndex={-1}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">
                        Риск опц. вверх <span className="text-muted-foreground text-xs">(%)</span>
                      </Label>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        max="100"
                        value={optionRiskUpPercent}
                        onChange={(e) => setOptionRiskUpPercent(parseInt(e.target.value) || 5)}
                        className="h-9"
                      />
                    </div>
                  </div>
                  
                  {/* Разделитель */}
                  <div className="h-px bg-purple-400" />
                  
                  {/* Строка 2: НИЗ и Общий риск вниз */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">
                        НИЗ <span className="text-muted-foreground text-xs">(-5%)</span>
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={putDownPrice}
                        onChange={(e) => setPutDownPrice(parseFloat(e.target.value) || 0)}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">
                        Общий риск вниз <span className="text-muted-foreground text-xs">(%)</span>
                      </Label>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        max="100"
                        value={totalRiskDownPercent}
                        onChange={(e) => setTotalRiskDownPercent(parseInt(e.target.value) || 5)}
                        className="h-9"
                      />
                    </div>
                  </div>
                  
                  {/* Разделитель */}
                  <div className="h-px bg-purple-400" />
                  
                  {/* Строка 3: Экспирации и День выхода */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">
                        Экспирации <span className="text-muted-foreground text-xs">(дней)</span>
                      </Label>
                      <Input
                        type="number"
                        step="10"
                        min="5"
                        max="365"
                        value={maxDaysToExpiration}
                        onChange={(e) => setMaxDaysToExpiration(parseInt(e.target.value) || 100)}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">
                        Выход на <span className="text-muted-foreground text-xs">(день)</span>
                      </Label>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        max="30"
                        value={evaluationDay}
                        onChange={(e) => setEvaluationDay(parseInt(e.target.value) || 5)}
                        className="h-9"
                      />
                    </div>
                  </div>
                  
                  {/* Разделитель */}
                  <div className="h-px bg-purple-400" />
                  
                  {/* Строка 4: Страйки и Мин. OI */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">
                        Страйки <span className="text-muted-foreground text-xs">(±%)</span>
                      </Label>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        max="50"
                        value={strikeRangePercent}
                        onChange={(e) => setStrikeRangePercent(parseInt(e.target.value) || 20)}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">
                        Мин. OI <span className="text-muted-foreground text-xs">(ликв.)</span>
                      </Label>
                      <Input
                        type="number"
                        step="10"
                        min="0"
                        value={minOpenInterest}
                        onChange={(e) => setMinOpenInterest(parseInt(e.target.value) || 0)}
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Сообщение об ошибке */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span className="whitespace-pre-line">{error}</span>
              </div>
            )}
            
            {/* Предложение: лучший опцион без фильтра ликвидности */}
            {suggestion && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-md space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 text-lg">💡</span>
                  <div className="text-sm text-amber-800">
                    <p className="font-semibold mb-1">Предложение:</p>
                    <p>
                      {suggestion.optionType === 'CALL' 
                        ? 'Лучший CALL опцион по компенсации:'
                        : 'Лучший PUT опцион по покрытию:'}
                    </p>
                    <p className="font-medium mt-1">
                      {suggestion.optionType === 'CALL' ? 'CALL' : 'PUT'} ${suggestion.option?.strike} exp {suggestion.option?.expiration || suggestion.option?.expiration_date}
                    </p>
                    <p className="mt-1">
                      {suggestion.optionType === 'CALL' 
                        ? <>Прибыль при ВЕРХ: <span className="font-semibold text-amber-900">${suggestion.coverageAmount?.toFixed(0)}</span> ({suggestion.coveragePercent}% от убытка PUT)</>
                        : <>Покрытие: <span className="font-semibold text-amber-900">{suggestion.coveragePercent}%</span> (${suggestion.coverageAmount?.toFixed(0)})</>}
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                      Open Interest: {suggestion.openInterest}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleAcceptSuggestion}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white border-0"
                  size="sm"
                >
                  Принять предложение
                </Button>
              </div>
            )}

            {/* Сообщение об успехе */}
            {foundOption && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
                <span>Найден опцион: PUT ${foundOption.strike} exp {foundOption.expiration_date}</span>
              </div>
            )}

            <div className="flex flex-col items-center gap-2 pt-2">
              <Button
                onClick={handleStartSelection}
                disabled={isSearching}
                className="px-8 text-white border-0 transition-all duration-200 hover:opacity-90"
                style={selectionButtonStyle}
              >
                {isSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {getProgressText()}
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Начать подбор
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Сценарий 3: Подбор BuyCALL для компенсации */}
        {scenario === 3 && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Готов подобрать самый оптимальный опцион <span className="font-semibold text-green-600">BuyCALL</span> для компенсации затрат.
            </p>
            
            {/* Сворачиваемый блок параметров BuyCALL */}
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setIsCallParamsCollapsed(!isCallParamsCollapsed)}
                className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="text-sm text-muted-foreground">Параметры подбора</span>
                {isCallParamsCollapsed ? (
                  <ChevronDown size={16} className="text-muted-foreground" />
                ) : (
                  <ChevronUp size={16} className="text-muted-foreground" />
                )}
              </button>
              
              {!isCallParamsCollapsed && (
                <div className="p-3 space-y-3 border-t border-gray-200">
                  {/* Строка 1: ВЕРХ и НИЗ */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">
                        ВЕРХ <span className="text-muted-foreground text-xs">(+2.44%)</span>
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={callUpPrice}
                        onChange={(e) => setCallUpPrice(parseFloat(e.target.value) || 0)}
                        className="h-9"
                        tabIndex={-1}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">
                        НИЗ <span className="text-muted-foreground text-xs">(-2.44%)</span>
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={callDownPrice}
                        onChange={(e) => setCallDownPrice(parseFloat(e.target.value) || 0)}
                        className="h-9"
                      />
                    </div>
                  </div>
                  
                  {/* Разделитель */}
                  <div className="h-px bg-purple-400" />
                  
                  {/* Строка 2: Экспирации и День выхода */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">
                        Экспирации <span className="text-muted-foreground text-xs">(дней)</span>
                      </Label>
                      <Input
                        type="number"
                        step="10"
                        min="5"
                        max="365"
                        value={callMaxDaysToExpiration}
                        onChange={(e) => setCallMaxDaysToExpiration(parseInt(e.target.value) || 100)}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">
                        Выход на <span className="text-muted-foreground text-xs">(день)</span>
                      </Label>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        max="30"
                        value={callEvaluationDay}
                        onChange={(e) => setCallEvaluationDay(parseInt(e.target.value) || 5)}
                        className="h-9"
                      />
                    </div>
                  </div>
                  
                  {/* Разделитель */}
                  <div className="h-px bg-purple-400" />
                  
                  {/* Строка 3: Страйки и Мин. OI */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">
                        Страйки <span className="text-muted-foreground text-xs">(±%)</span>
                      </Label>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        max="50"
                        value={callStrikeRangePercent}
                        onChange={(e) => setCallStrikeRangePercent(parseInt(e.target.value) || 20)}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">
                        Мин. OI <span className="text-muted-foreground text-xs">(ликв.)</span>
                      </Label>
                      <Input
                        type="number"
                        step="10"
                        min="0"
                        value={callMinOpenInterest}
                        onChange={(e) => setCallMinOpenInterest(parseInt(e.target.value) || 0)}
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Сообщение об ошибке */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span className="whitespace-pre-line">{error}</span>
              </div>
            )}
            
            {/* Предложение: лучший CALL опцион */}
            {suggestion && suggestion.optionType === 'CALL' && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-md space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 text-lg">💡</span>
                  <div className="text-sm text-amber-800">
                    <p className="font-semibold mb-1">Предложение:</p>
                    <p>
                      Лучший CALL опцион по компенсации:
                    </p>
                    <p className="font-medium mt-1">
                      CALL ${suggestion.option?.strike} exp {suggestion.option?.expiration || suggestion.option?.expiration_date}
                    </p>
                    <p className="mt-1">
                      Прибыль при ВЕРХ: <span className="font-semibold text-amber-900">${suggestion.coverageAmount?.toFixed(0)}</span> ({suggestion.coveragePercent}% от убытка PUT)
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                      Open Interest: {suggestion.openInterest}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleAcceptSuggestion}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white border-0"
                  size="sm"
                >
                  Принять предложение
                </Button>
              </div>
            )}

            {/* Сообщение об успехе */}
            {foundOption && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
                <span>Найден опцион: CALL ${foundOption.strike} exp {foundOption.expiration_date || foundOption.expiration}</span>
              </div>
            )}

            <div className="flex flex-col items-center gap-2 pt-2">
              <Button
                onClick={handleStartSelection}
                disabled={isSearching}
                className="px-8 text-white border-0 transition-all duration-200 hover:opacity-90"
                style={selectionButtonStyle}
              >
                {isSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {getProgressText()}
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Начать подбор
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Сценарий 4: Подбор завершён — есть и BuyPUT, и BuyCALL */}
        {scenario === 4 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">
              <CheckCircle className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Подбор завершён!</p>
                <p className="text-xs mt-1">В калькуляторе уже есть BuyPUT и BuyCALL опционы.</p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default MagicSelectionModal;
