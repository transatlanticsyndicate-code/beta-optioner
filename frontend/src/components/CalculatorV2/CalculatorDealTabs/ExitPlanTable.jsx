import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent } from '../../ui/card';
import { calculateOptionPLValue, adjustPLByStockGroup } from '../../../utils/optionPricing';
import { calculateFuturesOptionPLValue } from '../../../utils/futuresPricing';
import { CALCULATOR_MODES } from '../../../utils/universalPricing';
import { getOptionVolatility } from '../../../utils/volatilitySurface';
import { calculateDaysToExpirationFromToday, calculateDaysRemainingUTC, getOldestEntryDate } from '../../../utils/dateUtils';

/**
 * Таблица Плана выхода для сделки
 * ЗАЧЕМ: Позволяет гибко настраивать цели по цене и количеству для каждого шага выхода
 */
function ExitPlanTable({ ticker, currentPrice, dealInfo, options, calculatorMode = CALCULATOR_MODES.STOCKS, contractMultiplier = 100, dividendYield = 0, stockClassification = null, ivSurface = null, slicesSent = false, setSlicesSent, savedSteps = null, onStepsChange = null }) {
  // Дефолтные проценты для 4 шагов
  const defaultPercents = [15, 30, 45, 60];
  
  // Состояние шагов: [{ id, percent, dollars, quantity }]
  const [steps, setSteps] = useState([]);

  // Refs для отслеживания изменений и предотвращения перезаписи ручного ввода
  const lastSeenTotalQuantityRef = useRef(null);
  const lastSeenDealIdRef = useRef(null);
  // Ref для предотвращения перезаписи восстановленных шагов автоинициализацией
  const restoredFromSavedRef = useRef(false);

  // Функция расчёта даты выхода по умолчанию
  // ЗАЧЕМ: Каждый шаг получает дату +N месяцев от сегодня (шаг 1 = +1 месяц, шаг 2 = +2 месяца и т.д.)
  const calculateDefaultExitDate = (stepIndex) => {
    const today = new Date();
    const exitDate = new Date(today);
    exitDate.setMonth(exitDate.getMonth() + (stepIndex + 1));
    return exitDate.toISOString().split('T')[0]; // Формат YYYY-MM-DD
  };

  // Функция валидации даты выхода
  // ЗАЧЕМ: Дата выхода не должна быть больше даты экспирации опциона
  const validateExitDate = (exitDate, optionExpirationDate) => {
    if (!optionExpirationDate) return exitDate;
    
    const exit = new Date(exitDate);
    const expiration = new Date(optionExpirationDate);
    
    // Если дата выхода больше даты экспирации, возвращаем дату экспирации
    if (exit > expiration) {
      return optionExpirationDate;
    }
    
    return exitDate;
  };

  // Восстановление шагов из savedSteps (открытие сохранённой позиции)
  // ЗАЧЕМ: При открытии сохранённой позиции восстанавливаем ручные изменения пользователя
  const lastRestoredStepsRef = useRef(null);
  useEffect(() => {
    if (!savedSteps || savedSteps.length === 0) return;
    // Не восстанавливаем если это те же данные что мы сами отправили через onStepsChange
    const serialized = JSON.stringify(savedSteps);
    if (serialized === lastReportedStepsRef.current || serialized === lastRestoredStepsRef.current) return;
    lastRestoredStepsRef.current = serialized;
    lastReportedStepsRef.current = serialized; // Предотвращаем обратный цикл
    setSteps(savedSteps);
    restoredFromSavedRef.current = true;
    console.log('🔄 [ExitPlanTable] Восстановлены шаги из dealSettings:', savedSteps.length, 'шагов');
  }, [savedSteps]);

  // Уведомление родителя об изменении шагов (для сохранения в dealSettings)
  // ЗАЧЕМ: Передаём steps наверх чтобы они попали в dealSettings и сохранились
  const lastReportedStepsRef = useRef(null);
  useEffect(() => {
    if (!onStepsChange || steps.length === 0) return;
    // Сохраняем только данные, без ссылок на опционы (optionRef содержит циклические ссылки)
    const stepsToSave = steps.map(s => ({
      id: s.id,
      percent: s.percent,
      dollars: s.dollars,
      quantity: s.quantity,
      exitDate: s.exitDate,
    }));
    // Сравниваем с предыдущим значением чтобы избежать бесконечного цикла
    const serialized = JSON.stringify(stepsToSave);
    if (serialized !== lastReportedStepsRef.current) {
      lastReportedStepsRef.current = serialized;
      onStepsChange(stepsToSave);
    }
  }, [steps, onStepsChange]);

  // Снимок плана выхода в localStorage
  // ЗАЧЕМ: Внешние потребители (расширение и др.) могут забирать актуальное состояние плана выхода
  useEffect(() => {
    try {
      if (!steps || steps.length === 0) {
        localStorage.removeItem('currentExitPlanSnapshot');
        return;
      }

      const stepsWithPL = steps.map(step => ({
        step: step.id,
        percent: step.percent,
        targetPrice: step.dollars,
        quantity: step.quantity,
        exitDate: step.exitDate,
        option: step.optionRef ? {
          type: step.optionRef.type,
          action: step.optionRef.action,
          strike: step.optionRef.strike,
          expiration: step.optionRef.date,
        } : null,
        pl: calculateStepPL(step),
      }));

      const totalPL = stepsWithPL.reduce((sum, s) => sum + s.pl, 0);

      const snapshot = {
        ticker,
        currentPrice,
        steps: stepsWithPL,
        totalPL,
        updatedAt: new Date().toISOString(),
      };

      localStorage.setItem('currentExitPlanSnapshot', JSON.stringify(snapshot));
    } catch (err) {
      console.error('Ошибка сохранения снимка плана выхода в localStorage:', err);
    }
  }, [steps, ticker, currentPrice]);

  // Инициализация шагов при первом рендере или изменении dealInfo/options
  useEffect(() => {
    if (!dealInfo) return;

    // Пропускаем автоинициализацию если шаги только что восстановлены из сохранённой позиции
    // ЗАЧЕМ: savedSteps содержит ручные изменения пользователя, автоинициализация их затрёт
    if (restoredFromSavedRef.current) {
      restoredFromSavedRef.current = false;
      return;
    }

    // Берём все видимые опционы из текущей таблицы (options prop)
    // ЗАЧЕМ: Это позволяет автоматически добавлять/удалять опционы в плане выхода
    const visibleOptions = (options || []).filter(opt => opt.visible !== false);

    // Если нет видимых опционов, очищаем таблицу
    if (visibleOptions.length === 0) {
      setSteps([]);
      return;
    }

    // Используем текущие опционы из таблицы как liveOptions
    const liveOptions = visibleOptions;

    // Проверяем, новая ли это сделка или первая загрузка
    const dealId = dealInfo.createdAt;
    const isNewDeal = lastSeenDealIdRef.current !== dealId;

    if (isNewDeal || lastSeenDealIdRef.current === null) {
      lastSeenDealIdRef.current = dealId;
      lastSeenTotalQuantityRef.current = null; // Принудительный сброс количеств
    }

    setSteps(prevSteps => {
      let newSteps = [];
      let forceRedistribute = false;
      // При загрузке новой сделки источником служат сохранённые пользователем шаги
      // (savedSteps) либо пустой массив — чтобы дефолтные проценты применились к новой сделке.
      // ЗАЧЕМ: prevSteps содержат данные ПРЕДЫДУЩЕЙ сделки; если их брать, проценты/количество
      // предыдущей сделки «переедут» в новую позицию (см. баг со «следом» плана выхода).
      const sourceSteps = isNewDeal
        ? (savedSteps && savedSteps.length > 0 ? savedSteps : [])
        : prevSteps;

      if (!dealInfo.isMultiDeal) {
        // ЛОГИКА ДЛЯ ОБЫЧНОЙ СДЕЛКИ (1 опцион)
        const option = liveOptions[0];
        const totalQuantity = Math.abs(Number(option.quantity) || 1);

        // Если общее количество изменилось извне — перераспределяем шаги
        if (lastSeenTotalQuantityRef.current !== totalQuantity) {
          forceRedistribute = true;
          lastSeenTotalQuantityRef.current = totalQuantity;
        }

        // Определяем количество шагов: не более 4, не более количества контрактов
        const stepsCount = Math.min(4, totalQuantity);

        // Распределяем количество контрактов по шагам
        const baseQuantity = Math.floor(totalQuantity / stepsCount);
        const remainder = totalQuantity % stepsCount;

        newSteps = Array.from({ length: stepsCount }, (_, index) => {
          const autoQuantity = index < remainder ? baseQuantity + 1 : baseQuantity;
          const existingStep = sourceSteps[index];

          const percent = existingStep ? existingStep.percent : (defaultPercents[index] || (index + 1) * 15);
          // Целевая цена рассчитывается от цены актива на момент входа в конкретный опцион
          const basePrice = option.assetPriceAtEntry || currentPrice;
          const dollars = basePrice ? (basePrice * (1 + percent / 100)) : 0;

          // Используем ручное количество если нет forceRedistribute
          const quantity = (existingStep && !forceRedistribute) ? existingStep.quantity : autoQuantity;

          // Рассчитываем дату выхода по умолчанию (+N месяцев от сегодня)
          const defaultExitDate = calculateDefaultExitDate(index);
          const exitDate = existingStep?.exitDate || validateExitDate(defaultExitDate, option.date);

          return {
            id: index + 1,
            percent,
            dollars: Math.round(dollars * 100) / 100,
            quantity,
            exitDate, // Дата выхода для этого шага
            optionRef: option, // ВАЖНО: Всегда берём актуальный опцион для получения свежих manualIvOverride и actualPL
            profit: existingStep ? existingStep.profit : 0 // Временно заглушка
          };
        });
      } else {
        // ЛОГИКА ДЛЯ МУЛЬТИСДЕЛКИ (>1 опциона)
        // Сортируем опционы по дате экспирации (от ближайшей к дальней)
        const sortedOptions = [...liveOptions].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Формируем строку количеств для отслеживания изменений
        const totalQuantityStr = sortedOptions.map(o => Math.abs(o.quantity || 1)).join(',');
        
        if (lastSeenTotalQuantityRef.current !== totalQuantityStr) {
          forceRedistribute = true;
          lastSeenTotalQuantityRef.current = totalQuantityStr;
        }
        
        // Количество шагов = количеству разных опционов (уже ограничено до 4 при создании)
        newSteps = sortedOptions.map((option, index) => {
          const autoQuantity = Math.abs(option.quantity || 1);
          const existingStep = sourceSteps[index];

          const percent = existingStep ? existingStep.percent : (defaultPercents[index] || (index + 1) * 15);
          // Целевая цена рассчитывается от цены актива на момент входа в конкретный опцион
          const basePrice = option.assetPriceAtEntry || currentPrice;
          const dollars = basePrice ? (basePrice * (1 + percent / 100)) : 0;

          const quantity = (existingStep && !forceRedistribute) ? existingStep.quantity : autoQuantity;

          // Рассчитываем дату выхода по умолчанию (+N месяцев от сегодня)
          const defaultExitDate = calculateDefaultExitDate(index);
          const exitDate = existingStep?.exitDate || validateExitDate(defaultExitDate, option.date);

          return {
            id: index + 1,
            percent,
            dollars: Math.round(dollars * 100) / 100,
            quantity,
            exitDate, // Дата выхода для этого шага
            optionRef: option, // Сохраняем ссылку на опцион для расчёта P&L в будущем
            profit: existingStep ? existingStep.profit : 0
          };
        });
      }

      // Проверяем, были ли реальные изменения, чтобы избежать бесконечного ререндера
      let hasChanges = false;
      if (prevSteps.length !== newSteps.length) {
        hasChanges = true;
      } else {
        for (let i = 0; i < prevSteps.length; i++) {
          const prevOpt = prevSteps[i].optionRef;
          const newOpt = newSteps[i].optionRef;
          
          // Проверяем изменения в шагах и в optionRef (manualIvOverride, actualPL)
          if (prevSteps[i].quantity !== newSteps[i].quantity ||
              prevSteps[i].percent !== newSteps[i].percent ||
              prevSteps[i].dollars !== newSteps[i].dollars ||
              prevOpt?.manualIvOverride !== newOpt?.manualIvOverride ||
              prevOpt?.actualPL !== newOpt?.actualPL ||
              prevOpt?.actualPLDate !== newOpt?.actualPLDate ||
              prevOpt?.actualPLPrice !== newOpt?.actualPLPrice ||
              prevOpt?.actualPLQuantity !== newOpt?.actualPLQuantity) {
            hasChanges = true;
            break;
          }
        }
      }

      return hasChanges ? newSteps : prevSteps;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice, dealInfo, options, savedSteps]);

  // Локальный стейт для инпута процентов — предотвращает пересчёт при каждом нажатии
  const [percentInputState, setPercentInputState] = useState({});

  const handlePercentInput = (index, value) => {
    setPercentInputState(prev => ({ ...prev, [index]: value }));
  };

  const handlePercentBlur = (index) => {
    const value = percentInputState[index];
    if (value === undefined) return;
    const newPercent = parseFloat(value) || 0;
    const newSteps = [...steps];
    newSteps[index].percent = newPercent;

    // Пересчитываем доллары от цены актива конкретного опциона
    const basePrice = newSteps[index].optionRef?.assetPriceAtEntry || currentPrice;
    if (basePrice > 0) {
      const newDollars = basePrice * (1 + newPercent / 100);
      newSteps[index].dollars = Math.round(newDollars * 100) / 100;
    }

    setSteps(newSteps);
    setPercentInputState(prev => { const n = { ...prev }; delete n[index]; return n; });
  };

  const handlePercentKeyDown = (index, e) => {
    if (e.key === 'Enter') e.target.blur();
  };

  // Локальный стейт для инпута долларов — предотвращает пересчёт при каждом нажатии
  // ЗАЧЕМ: Без этого ввод "1000" превращается в "$1.01" после первой цифры
  const [dollarsInputState, setDollarsInputState] = useState({});

  // Обработчик изменения долларов (локальный ввод, без пересчёта)
  const handleDollarsInput = (index, value) => {
    setDollarsInputState(prev => ({ ...prev, [index]: value }));
  };

  // Применение введённого значения при потере фокуса
  const handleDollarsBlur = (index) => {
    const value = dollarsInputState[index];
    if (value === undefined) return;
    const newDollars = parseFloat(value) || 0;
    const newSteps = [...steps];
    newSteps[index].dollars = newDollars;

    // Пересчитываем проценты от цены актива конкретного опциона
    const basePrice = newSteps[index].optionRef?.assetPriceAtEntry || currentPrice;
    if (basePrice > 0) {
      const newPercent = (newDollars / basePrice - 1) * 100;
      newSteps[index].percent = Math.round(newPercent * 100) / 100;
    }

    setSteps(newSteps);
    setDollarsInputState(prev => { const n = { ...prev }; delete n[index]; return n; });
  };

  const handleDollarsKeyDown = (index, e) => {
    if (e.key === 'Enter') e.target.blur();
  };

  // Обработчик изменения количества
  const handleQuantityChange = (index, value) => {
    const newQuantity = parseInt(value, 10) || 0;
    const newSteps = [...steps];
    newSteps[index].quantity = newQuantity;
    setSteps(newSteps);
  };

  // Обработчик изменения даты выхода
  const handleExitDateChange = (index, value) => {
    const newSteps = [...steps];
    const step = newSteps[index];
    
    // Валидируем дату относительно даты экспирации опциона
    const validatedDate = validateExitDate(value, step.optionRef?.date);
    newSteps[index].exitDate = validatedDate;
    
    setSteps(newSteps);
  };

  // Форматирование названия опциона: "Buy CALL 80 (18.06.26)"
  const formatOptionName = (option) => {
    if (!option) return '';
    
    const action = option.action || 'Buy';
    const type = option.type || 'CALL';
    const strike = option.strike || 0;
    
    // Форматируем дату из ISO формата (YYYY-MM-DD) в DD.MM.YY
    let formattedDate = '';
    if (option.date) {
      const dateParts = option.date.split('-');
      if (dateParts.length === 3) {
        const year = dateParts[0].slice(-2); // Последние 2 цифры года
        const month = dateParts[1];
        const day = dateParts[2];
        formattedDate = `${day}.${month}.${year}`;
      }
    }
    
    return `${action} ${type} ${strike}${formattedDate ? ` (${formattedDate})` : ''}`;
  };

  // Обработчик отправки срезок на график TradingView
  // ЗАЧЕМ: Отправляет данные из таблицы "План выхода" в расширение TradingView через localStorage
  const handleSendSrezki = () => {
    if (!ticker || steps.length === 0) {
      console.warn('[План выхода] Невозможно отправить срезки: нет тикера или шагов');
      return;
    }

    // Формируем массив срезок из таблицы "План выхода"
    const srezki = steps.map(step => ({
      option: formatOptionName(step.optionRef),
      targetPrice: step.dollars
    }));

    // Формируем команду для расширения
    const command = {
      type: 'send_srezki',
      ticker: ticker,
      srezki: srezki,
      timestamp: Date.now(),
      processed: false
    };

    // Записываем команду в localStorage
    localStorage.setItem('tvc_refresh_command', JSON.stringify(command));

    // Обновляем состояние: срезки отправлены
    if (setSlicesSent) setSlicesSent(true);

    console.log('[План выхода] ✅ Срезки отправлены на график:', command);
  };

  // Обработчик перехода на график TradingView
  // ЗАЧЕМ: Отправляет команду расширению для открытия/переключения на вкладку TradingView
  const handleGoToChart = () => {
    if (!ticker) {
      console.warn('[План выхода] Невозможно перейти на график: нет тикера');
      return;
    }

    // Формируем команду для расширения
    const command = {
      type: 'go_to_chart',
      ticker: ticker,
      timestamp: Date.now(),
      processed: false
    };

    // Записываем команду в localStorage
    localStorage.setItem('tvc_refresh_command', JSON.stringify(command));

    console.log('[План выхода] 📊 Переход на график:', command);
  };

  // Обработчик удаления срезок с графика
  // ЗАЧЕМ: Отправляет команду расширению для удаления нарисованных линий и сбрасывает состояние
  const handleClearSrezki = () => {
    if (!ticker) {
      console.warn('[План выхода] Невозможно удалить срезки: нет тикера');
      return;
    }

    // Формируем команду для расширения
    const command = {
      type: 'clear_srezki',
      ticker: ticker,
      timestamp: Date.now(),
      processed: false
    };

    // Записываем команду в localStorage
    localStorage.setItem('tvc_refresh_command', JSON.stringify(command));

    // Сбрасываем состояние: срезки удалены
    if (setSlicesSent) setSlicesSent(false);

    console.log('[План выхода] 🗑️ Срезки удалены с графика:', command);
  };

  // Расчёт P&L для конкретного шага на дату выхода
  // ЗАЧЕМ: Формула якоря синхронизирована с таблицей опционов (OptionsTableV3.jsx:1108-1157),
  // чтобы P/L на шаге совпадала с тем, что показывает таблица опционов при
  // daysPassed = дни от oldestEntry до step.exitDate и targetPrice = step.dollars.
  const calculateStepPL = (step) => {
    if (!step.optionRef || !step.dollars || step.quantity === 0 || !step.exitDate) return 0;

    const option = step.optionRef;
    const targetAssetPrice = step.dollars;
    const MS_IN_DAY = 1000 * 60 * 60 * 24;

    // База «день входа»: самая ранняя дата входа среди всех опционов позиции
    // ЗАЧЕМ: Таблица опционов использует oldestEntry как базу для calculateDaysRemainingUTC
    const oldestEntry = getOldestEntryDate(options) || new Date();

    // Эквивалент «симулированных дней» для даты выхода шага (как daysPassed в таблице опционов)
    const exitDt = new Date(step.exitDate + 'T00:00:00Z');
    const stepSimDays = Math.max(0, Math.round((exitDt - oldestEntry) / MS_IN_DAY));

    // currentDaysToExpiration — дни от входа (daysPassed=0) до экспирации
    // optionDaysRemaining — дни от даты выхода до экспирации (аналог daysRemaining в OptionsTableV3)
    const currentDaysToExpiration = calculateDaysRemainingUTC(option, 0, 30, oldestEntry);
    const optionDaysRemaining = calculateDaysRemainingUTC(option, stepSimDays, 30, oldestEntry);

    // todayDaysToExpiration — дни от реального сегодня до экспирации (для manualIvOverride)
    const todaySimDays = calculateDaysToExpirationFromToday(option);

    // Волатильность через ту же getOptionVolatility, что и таблица опционов
    const optionVolatility = getOptionVolatility(
      option,
      currentDaysToExpiration,
      optionDaysRemaining,
      ivSurface,
      'simple',
      null,
      option.manualIvOverride,
      todaySimDays
    );

    // Подготовка объекта опциона — та же логика, что в таблице опционов
    const effectivePremium = option.isPremiumModified ? option.customPremium : option.premium;
    const tempOpt = {
      ...option,
      premium: effectivePremium,
      ask: option.isPremiumModified ? 0 : option.ask,
      bid: option.isPremiumModified ? 0 : option.bid,
      quantity: step.quantity
    };

    console.log(`[План выхода] 💰 P/L расчёт ${option.type} Strike $${option.strike}:`, {
      targetPrice: targetAssetPrice,
      stepSimDays,
      optionDaysRemaining,
      IV: (optionVolatility * 100).toFixed(1) + '%',
      manualIvOverride: option.manualIvOverride,
      actualPL: option.actualPL,
      actualPLDate: option.actualPLDate,
      quantity: step.quantity,
      contractMultiplier
    });

    // Цена актива на момент входа в опцион — для BSM-расчёта
    const optionAssetPrice = option.assetPriceAtEntry || currentPrice;

    let pl = 0;
    if (calculatorMode === CALCULATOR_MODES.FUTURES) {
      pl = calculateFuturesOptionPLValue(
        tempOpt,
        targetAssetPrice,
        optionDaysRemaining,
        contractMultiplier,
        optionVolatility
      );
    } else {
      pl = calculateOptionPLValue(
        tempOpt,
        targetAssetPrice,
        optionAssetPrice,
        optionDaysRemaining,
        optionVolatility,
        dividendYield
      );
    }

    if (calculatorMode === CALCULATOR_MODES.STOCKS && stockClassification) {
      pl = adjustPLByStockGroup(pl, stockClassification);
    }

    // Якорная формула: полностью идентична таблице опционов (OptionsTableV3.jsx:1108-1157)
    if (option.actualPL !== null && option.actualPL !== undefined && option.actualPLDate) {
      const anchorDateObj = new Date(option.actualPLDate + 'T00:00:00Z');
      const anchorDaysPassed = Math.round((anchorDateObj - oldestEntry) / MS_IN_DAY);

      // Условие аналогично `daysPassed >= anchorDaysPassed` в таблице опционов
      if (stepSimDays >= anchorDaysPassed) {
        const anchorDaysToExp = calculateDaysRemainingUTC(option, anchorDaysPassed, 30, oldestEntry);

        // ВАЖНО: manualIvOverride передаётся как процент (без /100) — строго как в OptionsTableV3
        const anchorIV = option.manualIvOverride !== null && option.manualIvOverride !== undefined
          ? option.manualIvOverride
          : optionVolatility;

        const anchorPrice = option.actualPLPrice || currentPrice;

        let plAtAnchor = calculatorMode === CALCULATOR_MODES.FUTURES
          ? calculateFuturesOptionPLValue(tempOpt, anchorPrice, anchorDaysToExp, contractMultiplier, anchorIV)
          : calculateOptionPLValue(tempOpt, anchorPrice, optionAssetPrice, anchorDaysToExp, anchorIV, dividendYield);

        if (calculatorMode === CALCULATOR_MODES.STOCKS && stockClassification) {
          plAtAnchor = adjustPLByStockGroup(plAtAnchor, stockClassification);
        }

        const plBeforeAnchor = pl;
        // Масштабируем якорь по количеству шага: actualPL соответствует actualPLQuantity (всей позиции в момент ввода),
        // а текущий шаг закрывает step.quantity контрактов — пересчитываем долю якоря
        // ЗАЧЕМ: Дельта (pl − plAtAnchor) уже считается по step.quantity (через tempOpt.quantity),
        // якорь тоже должен быть в долях шага, иначе суммы не совпадут с таблицей опционов
        const anchorQtyExit = Number(option.actualPLQuantity) > 0 ? Number(option.actualPLQuantity) : (Number(option.quantity) || 1);
        const stepQty = Number(step.quantity) || 0;
        const anchorRatioExit = anchorQtyExit > 0 ? (stepQty / anchorQtyExit) : 0;
        pl = option.actualPL * anchorRatioExit + (pl - plAtAnchor);

        console.log(`[План выхода] 🎯 Якорная формула применена:`, {
          actualPL: option.actualPL,
          actualPLQuantity: option.actualPLQuantity,
          stepQuantity: step.quantity,
          anchorRatio: anchorRatioExit,
          anchorPrice,
          stepSimDays,
          anchorDaysPassed,
          plBeforeAnchor: Math.round(plBeforeAnchor),
          plAtAnchor: Math.round(plAtAnchor),
          delta: Math.round(plBeforeAnchor - plAtAnchor),
          plAfterAnchor: Math.round(pl)
        });
      }
    }

    return Math.round(pl);
  };

  return (
    <Card className="w-full relative" style={{ borderColor: '#22c55e' }}>
      <CardContent className="pt-6 pb-6 px-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-green-700 dark:text-green-300">
            План выхода
          </h3>
          {steps.length > 0 && ticker && (
            <div className="flex gap-2">
              {!slicesSent ? (
                <button
                  onClick={handleSendSrezki}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
                >
                  Отправить срезки на график
                </button>
              ) : (
                <>
                  <button
                    onClick={handleGoToChart}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                  >
                    Перейти на график
                  </button>
                  <button
                    onClick={handleClearSrezki}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                  >
                    Удалить срезки
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="px-3 py-3 text-left font-medium w-16">Шаг</th>
                <th className="px-3 py-3 text-left font-medium w-48">Опцион</th>
                <th className="px-3 py-3 text-left font-medium w-32">Цель актива +%</th>
                <th className="px-3 py-3 text-left font-medium w-32">Цель актива $</th>
                <th className="px-3 py-3 text-left font-medium w-24">Количество</th>
                <th className="px-3 py-3 text-left font-medium w-32">Дата выхода</th>
                <th className="px-3 py-3 text-right font-medium w-32">P&L</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step, index) => (
                <tr key={step.id} className="border-t">
                  <td className="px-3 py-3 font-medium">Шаг {step.id}</td>
                  <td className="px-3 py-3 text-sm text-muted-foreground">
                    {formatOptionName(step.optionRef)}
                  </td>
                  
                  <td className="px-3 py-2">
                    <div className="relative">
                      <input
                        type="number"
                        value={percentInputState[index] !== undefined ? percentInputState[index] : step.percent}
                        onChange={(e) => handlePercentInput(index, e.target.value)}
                        onFocus={(e) => setPercentInputState(prev => ({ ...prev, [index]: String(step.percent) }))}
                        onBlur={() => handlePercentBlur(index)}
                        onKeyDown={(e) => handlePercentKeyDown(index, e)}
                        className="w-full h-8 px-2 pr-6 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-transparent"
                        step="0.1"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                  </td>
                  
                  <td className="px-3 py-2">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                      <input
                        type="number"
                        value={dollarsInputState[index] !== undefined ? dollarsInputState[index] : step.dollars}
                        onChange={(e) => handleDollarsInput(index, e.target.value)}
                        onFocus={(e) => setDollarsInputState(prev => ({ ...prev, [index]: String(step.dollars) }))}
                        onBlur={() => handleDollarsBlur(index)}
                        onKeyDown={(e) => handleDollarsKeyDown(index, e)}
                        className="w-full h-8 pl-5 pr-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-transparent"
                        step="0.01"
                      />
                    </div>
                  </td>
                  
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={step.quantity}
                      onChange={(e) => handleQuantityChange(index, e.target.value)}
                      className="w-full h-8 px-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-center bg-transparent"
                      min="0"
                    />
                  </td>
                  
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={step.exitDate || ''}
                      onChange={(e) => handleExitDateChange(index, e.target.value)}
                      max={step.optionRef?.date || ''}
                      className="w-full h-8 px-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-transparent"
                    />
                  </td>
                  
                  <td className="px-3 py-3 text-right font-medium">
                    {(() => {
                      const pl = calculateStepPL(step);
                      const isPositive = pl >= 0;
                      const colorClass = isPositive ? 'text-green-600' : 'text-red-600';
                      const sign = isPositive ? '+' : '';
                      return (
                        <span className={colorClass}>
                          {sign}${pl.toLocaleString()}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
              
              {/* Итоговая строка с общей суммой P&L */}
              {steps.length > 0 && (
                <tr className="border-t-2 border-gray-300 bg-gray-50 dark:bg-gray-800 font-bold">
                  <td className="px-3 py-3" colSpan="6">Итого:</td>
                  <td className="px-3 py-3 text-right">
                    {(() => {
                      const totalPL = steps.reduce((sum, step) => sum + calculateStepPL(step), 0);
                      const isPositive = totalPL >= 0;
                      const colorClass = isPositive ? 'text-green-600' : 'text-red-600';
                      const sign = isPositive ? '+' : '';
                      return (
                        <span className={colorClass}>
                          {sign}${totalPL.toLocaleString()}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default ExitPlanTable;
