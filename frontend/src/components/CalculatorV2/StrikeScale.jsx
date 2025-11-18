import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';

// Helper: format ISO date (YYYY-MM-DD) to display format (DD.MM.YY)
const formatDateForDisplay = (isoDate) => {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  const shortYear = year.slice(-2);
  return `${day}.${month}.${shortYear}`;
};

/**
 * StrikeScale - Полная копия кода Андрея из calculators-new
 * Этап 2: Добавляем динамические данные
 */
function StrikeScale({ 
  options = [], 
  currentPrice = 0, 
  positions = [], 
  ticker = 'SPX', 
  strikesByDate = {},
  onPositionUpdate = null, // Callback для обновления позиции при Drag & Drop
  loadOptionDetails = null, // Callback для загрузки деталей опциона после изменения страйка
  dateColorMap = {},
  forceShowDateBadges = false,
  selectedExpirationDate = null, // Выбранная дата экспирации для загрузки данных
}) {
  
  // Ref для контейнера шкалы (для автоскролла)
  const containerRef = useRef(null);
  
  // State для Drag & Drop
  const [draggingFlag, setDraggingFlag] = useState(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [previewStrike, setPreviewStrike] = useState(null); // Предпросмотр страйка при перетаскивании
  
  // State для фильтра по датам
  const [selectedDateFilter, setSelectedDateFilter] = useState('all'); // 'all' или конкретная дата
  
  // State для полной карты OI рынка (всегда включена)
  const [marketOI, setMarketOI] = useState({ calls: {}, puts: {} }); // {strike: oi}
  const [isLoadingMarketOI, setIsLoadingMarketOI] = useState(false);
  const [marketOICache, setMarketOICache] = useState({}); // Кэш по датам: {date: {calls, puts}}
  
  // State для drag-scroll
  const [isDraggingScroll, setIsDraggingScroll] = useState(false);
  const [scrollStartX, setScrollStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  
  // ========================================
  // ДИНАМИЧЕСКИЙ ДИАПАЗОН СТРАЙКОВ
  // ========================================
  
  // Рассчитываем диапазон ВОКРУГ ТЕКУЩЕЙ ЦЕНЫ для отображения полной карты OI
  const strikeRange = useMemo(() => {
    // Если нет цены - не показываем шкалу
    if (currentPrice <= 0) {
      return null;
    }
    
    // Определяем шаг страйка в зависимости от цены
    const strikeStep = currentPrice > 1000 ? 5 : 1; // SPX=5, SPY=1
    
    // ФИКСИРОВАННЫЙ широкий диапазон вокруг текущей цены
    const totalStrikes = 400; // Широкий диапазон для отображения всех данных рынка
    const halfStrikes = Math.floor(totalStrikes / 2);
    const centerStrike = Math.round(currentPrice / strikeStep) * strikeStep;
    const minStrike = centerStrike - (halfStrikes * strikeStep);
    const maxStrike = centerStrike + (halfStrikes * strikeStep);
    
    console.log('📏 Диапазон вокруг цены:', { 
      currentPrice,
      centerStrike,
      minStrike, 
      maxStrike, 
      count: totalStrikes,
      strikeStep
    });
    
    return { min: minStrike, max: maxStrike, count: totalStrikes, step: strikeStep };
  }, [currentPrice]);
  
  // Логирование входных данных
  console.log('📊 StrikeScale render:', {
    ticker,
    currentPrice,
    strikeRange,
    optionsCount: options.length,
    positionsCount: positions.length,
    sampleOption: options[0],
    samplePosition: positions[0]
  });
  
  // ========================================
  // ЭТАП 2.1: ФУНКЦИИ РАСЧЕТА (мемоизированы)
  // ========================================
  
  /**
   * Определяет расположение флага (верх/низ)
   * Верхняя шкала = все Buy (покупка)
   * Нижняя шкала = все Sell (продажа)
   */
  const isTopFlag = useCallback((position) => {
    const { action } = position;
    // Верхние: все Buy (покупка)
    // Нижние: все Sell (продажа)
    return action === 'Buy';
  }, []);
  
  /**
   * Определяет цвет флага
   * Зеленый = CALL
   * Красный = PUT
   */
  const calculateFlagColor = useCallback((position) => {
    const { type } = position;
    if (type === 'CALL') {
      return 'rgb(76, 175, 80)'; // Зеленый для CALL
    } else {
      return 'rgb(255, 107, 107)'; // Красный для PUT
    }
  }, []);
  
  /**
   * Определяет цвет бейджа даты на основе срока до экспирации
   * Формат даты: YYYY-MM-DD (ISO формат, например "2025-10-31")
   */
  const calculateDateColor = useCallback((date) => {
    if (!date) return null;
    
    // Приоритет: внешний маппер цветов дат
    if (dateColorMap && dateColorMap[date]) {
      return dateColorMap[date];
    }
    
    try {
      // Парсим дату из ISO формата YYYY-MM-DD
      const expirationDate = new Date(date);
      const today = new Date();
      const daysUntilExpiration = Math.floor((expirationDate - today) / (1000 * 60 * 60 * 24));
      
      // Цвет в зависимости от срока
      if (daysUntilExpiration < 7) return 'rgb(99, 102, 241)';  // Indigo
      if (daysUntilExpiration < 30) return 'rgb(139, 92, 246)'; // Фиолетовый
      return 'rgb(59, 130, 246)'; // Синий
    } catch (error) {
      console.warn('Ошибка парсинга даты:', date, error);
      return 'rgb(139, 92, 246)'; // Дефолтный фиолетовый
    }
  }, [dateColorMap]);
  
  // ========================================
  // ГРУППИРОВКА ПО ДАТАМ ЭКСПИРАЦИИ
  // ========================================
  
  // Получаем уникальные даты из опционов
  const uniqueDates = useMemo(() => {
    const dates = new Set();
    options.forEach(opt => {
      if (opt.date) dates.add(opt.date);
    });
    return Array.from(dates).sort(); // Сортируем по возрастанию
  }, [options]);
  
  // ========================================
  // ЭТАП 2.2: ПРЕОБРАЗОВАНИЕ POSITIONS → FLAGS
  // ========================================
  
  /**
   * Преобразуем options в flags с мемоизацией
   * Разделяем на верхние и нижние флаги
   * ЭТАП 2.4: Добавлена группировка по страйкам
   * ЭТАП 3.7: Добавлена фильтрация по датам
   */
  const { topFlags, bottomFlags, topYLevels, bottomYLevels } = useMemo(() => {
    console.log('🔄 Преобразование options → flags, опционов:', options.length);
    
    // Если нет диапазона - возвращаем пустые массивы
    if (!strikeRange) {
      return { topFlags: [], bottomFlags: [], topYLevels: {}, bottomYLevels: {} };
    }
    
    // Используем опционы (не positions - там базовые активы!)
    // Фильтруем только видимые и с заполненным страйком
    // ЭТАП 3.7: Добавлена фильтрация по дате
    const validOptions = options.filter(opt => {
      const hasStrike = opt.strike != null && Number(opt.strike) > 0;
      const hasType = opt.type === 'CALL' || opt.type === 'PUT';
      const isVisible = opt.visible !== false;
      
      // Фильтрация по дате экспирации
      const matchesDateFilter = selectedDateFilter === 'all' || opt.date === selectedDateFilter;
      
      return hasStrike && hasType && isVisible && matchesDateFilter;
    });
    
    // ========================================
    // ЭТАП 2.4: ГРУППИРОВКА ПО СТРАЙКАМ
    // ========================================
    // Если на одном страйке несколько позиций одного типа → группируем
    const grouped = {};
    
    validOptions.forEach(opt => {
      // Ключ: страйк + тип + действие
      const key = `${opt.strike}-${opt.type}-${opt.action}`;
      
      if (!grouped[key]) {
        grouped[key] = {
          ...opt,
          quantity: 0,
          ids: [], // Сохраняем все ID для группы
        };
      }
      
      // Используем абсолютное значение для суммирования
      grouped[key].quantity += Math.abs(opt.quantity);
      grouped[key].ids.push(opt.id);
    });
    
    // Преобразуем в массив
    const groupedOptions = Object.values(grouped);
    
    console.log('📦 Группировка завершена:', {
      было: validOptions.length,
      стало: groupedOptions.length
    });
    
    // Создаем флаги из сгруппированных опционов
    const top = [];
    const bottom = [];
    
    groupedOptions.forEach(opt => {
      // Используем абсолютное значение quantity (может быть отрицательным для Sell)
      const absQuantity = Math.abs(opt.quantity);
      
      const flag = {
        id: opt.ids.length === 1 ? opt.ids[0] : opt.ids.join('-'), // Если группа → объединяем ID
        optionIds: opt.ids, // Массив ID опционов для обновления при Drag & Drop
        price: Number(opt.strike), // Конвертируем в число (может быть строкой)
        color: calculateFlagColor(opt),
        count: absQuantity > 1 ? absQuantity : null, // Показываем только если > 1
        type: 'option',
        date: opt.date,
        dateColor: calculateDateColor(opt.date),
      };
      
      if (isTopFlag(opt)) {
        top.push(flag);
      } else {
        bottom.push(flag);
      }
    });
    
    // Добавляем флаг тикера (текущая цена)
    // ВАЖНО: Используем centerStrike из strikeRange чтобы флаг был ТОЧНО в центре!
    if (currentPrice > 0 && strikeRange) {
      const centerStrike = Math.round(currentPrice / strikeRange.step) * strikeRange.step;
      top.push({
        id: 'ticker',
        price: centerStrike, // Используем округленный центральный страйк
        color: 'rgb(75, 85, 99)', // Серый
        label: ticker,
        type: 'ticker',
      });
    }
    
    // ========================================
    // ЭТАП 2.4: РАСЧЕТ Y-LEVELS (уровни наложения)
    // ========================================
    /**
     * Рассчитываем уровни по вертикали чтобы флаги не накладывались
     * Если флаги на одном страйке или близко (< 15 страйков) → поднимаем на уровень выше
     */
    const calculateYLevels = (flagsList) => {
      const levels = {};
      const sortedFlags = [...flagsList].sort((a, b) => a.price - b.price);
      
      // Группируем флаги по страйкам для точной проверки наложения
      const strikeGroups = {};
      sortedFlags.forEach((flag) => {
        if (!strikeGroups[flag.price]) {
          strikeGroups[flag.price] = [];
        }
        strikeGroups[flag.price].push(flag);
      });
      
      sortedFlags.forEach((flag, index) => {
        let level = 0;
        
        // Проверяем наложение с предыдущими флагами
        for (let i = 0; i < index; i++) {
          const prevFlag = sortedFlags[i];
          const distance = Math.abs(flag.price - prevFlag.price);
          
          // Если на ОДНОМ страйке → всегда поднимаем на следующий уровень
          if (distance === 0) {
            const currentLevel = levels[prevFlag.id];
            if (currentLevel >= level) {
              level = currentLevel + 1;
            }
          }
          // Если расстояние < 7 страйков и на том же уровне → поднимаем
          else if (distance < 7 && levels[prevFlag.id] === level) {
            level++;
          }
        }
        
        levels[flag.id] = Math.min(level, 4); // Максимум 5 уровней (0-4)
      });
      
      console.log('🎚️ Y-levels рассчитаны:', levels);
      
      return levels;
    };
    
    const topLevels = calculateYLevels(top);
    const bottomLevels = calculateYLevels(bottom);
    
    console.log('✅ Флаги созданы:', { 
      верхних: top.length, 
      нижних: bottom.length,
      уровнейВерх: Object.keys(topLevels).length,
      уровнейНиз: Object.keys(bottomLevels).length
    });
    
    return { 
      topFlags: top, 
      bottomFlags: bottom,
      topYLevels: topLevels,
      bottomYLevels: bottomLevels
    };
  }, [options, currentPrice, ticker, strikeRange, selectedDateFilter]);
  
  // ========================================
  // ЭТАП 4.1: МАРКЕРЫ "HOT STRIKE" (популярные страйки)
  // ========================================
  
  // Находим страйки с максимальным OI для маркировки "🔥"
  const hotStrikes = useMemo(() => {
    if (options.length === 0) return new Set();
    
    // Собираем OI по страйкам
    const strikeOI = {};
    options.forEach(opt => {
      const strike = Number(opt.strike);
      if (!strikeOI[strike]) {
        strikeOI[strike] = 0;
      }
      strikeOI[strike] += opt.oi || 0;
    });
    
    // Находим максимальный OI
    const maxOI = Math.max(...Object.values(strikeOI));
    
    // Отмечаем как "Hot" страйки с OI > 70% от максимума
    const hotThreshold = maxOI * 0.7;
    const hot = new Set();
    Object.entries(strikeOI).forEach(([strike, oi]) => {
      if (oi >= hotThreshold && oi > 50000) { // Минимум 50k OI
        hot.add(Number(strike));
      }
    });
    
    console.log('🔥 Hot Strikes (популярные):', Array.from(hot), 'с OI >', hotThreshold);
    return hot;
  }, [options]);
  
  // Находим страйки с максимальным Volume для маркировки "⚡"
  const highVolumeStrikes = useMemo(() => {
    if (options.length === 0) return new Set();
    
    // Собираем Volume по страйкам
    const strikeVolume = {};
    options.forEach(opt => {
      const strike = Number(opt.strike);
      if (!strikeVolume[strike]) {
        strikeVolume[strike] = 0;
      }
      strikeVolume[strike] += opt.volume || 0;
    });
    
    // Находим максимальный Volume
    const maxVolume = Math.max(...Object.values(strikeVolume));
    
    // Отмечаем как "High Volume" страйки с Volume > 80% от максимума
    const volumeThreshold = maxVolume * 0.8;
    const highVol = new Set();
    Object.entries(strikeVolume).forEach(([strike, volume]) => {
      if (volume >= volumeThreshold && volume > 1000) { // Минимум 1000 контрактов
        highVol.add(Number(strike));
      }
    });
    
    console.log('⚡ High Volume Strikes:', Array.from(highVol), 'с объемом >', volumeThreshold);
    return highVol;
  }, [options]);
  
  // Находим страйки с риском пиннинга "🎯" (Pin Risk)
  // Это страйки с большим OI близко к текущей цене перед экспирацией
  const pinRiskStrikes = useMemo(() => {
    if (options.length === 0 || currentPrice <= 0) return new Set();
    
    const pin = new Set();
    const priceRange = currentPrice * 0.05; // ±5% от текущей цены
    
    // Собираем OI по страйкам только близких к цене
    const nearbyStrikes = {};
    options.forEach(opt => {
      const strike = Number(opt.strike);
      if (Math.abs(strike - currentPrice) <= priceRange) {
        if (!nearbyStrikes[strike]) {
          nearbyStrikes[strike] = 0;
        }
        nearbyStrikes[strike] += opt.oi || 0;
      }
    });
    
    // Отмечаем страйки с высоким OI рядом с ценой
    Object.entries(nearbyStrikes).forEach(([strike, oi]) => {
      if (oi > 100000) { // Минимум 100k OI для Pin Risk
        pin.add(Number(strike));
      }
    });
    
    console.log('🎯 Pin Risk Strikes (риск пиннинга):', Array.from(pin));
    return pin;
  }, [options, currentPrice]);
  
  // ========================================
  // ЭТАП 2.3: РАСЧЕТ ВЫСОТЫ СТОЛБИКОВ ИЗ OPTIONS
  // ========================================
  
  /**
   * Рассчитываем высоты столбиков на основе Open Interest
   * Зеленые = CALL, Красные = PUT
   */
  const { greenBarHeights, redBarHeights } = useMemo(() => {
    if (!strikeRange) {
      return { greenBarHeights: [], redBarHeights: [] };
    }
    
    const callOI = Array(strikeRange.count).fill(0);
    const putOI = Array(strikeRange.count).fill(0);
    
    // Используем данные рынка если:
    // 1. Выбрана конкретная дата (не 'all')
    // 2. ИЛИ если дата только одна (uniqueDates.length === 1)
    const isSingleDate = uniqueDates && uniqueDates.length === 1;
    const hasMarketData = (selectedDateFilter !== 'all' || isSingleDate) && marketOI && marketOI.calls && Object.keys(marketOI.calls).length > 0;
    
    if (hasMarketData) {
      // Используем рыночные данные если выбрана конкретная дата
      // Заполняем из данных рынка для ВСЕх страйков в диапазоне
      for (let i = 0; i < strikeRange.count; i++) {
        const strike = strikeRange.min + i * strikeRange.step;
        callOI[i] = marketOI.calls[strike] || 0;
        putOI[i] = marketOI.puts[strike] || 0;
      }
      const callsCount = callOI.filter(v => v > 0).length;
      const putsCount = putOI.filter(v => v > 0).length;
      console.log('✅ Используем полные рыночные данные для даты:', selectedDateFilter, callsCount, 'calls,', putsCount, 'puts');
    } else {
      // Fallback: используем только опционы из таблицы (если нет рыночных данных или выбрано 'all')
      if (selectedDateFilter === 'all') {
        console.log('⚠️ Выбрано "Все даты" - рыночные данные не показываются');
      } else {
        console.log('⚠️ Рыночные данные не загружены, используем опционы из таблицы');
      }
    }
    
    // Находим максимумы для нормализации
    const maxCallOI = Math.max(...callOI, 1); // Минимум 1 чтобы избежать деления на 0
    const maxPutOI = Math.max(...putOI, 1);
    
    // Нормализуем высоты (0-30px)
    const greenHeights = callOI.map(oi => Math.floor((oi / maxCallOI) * 30));
    const redHeights = putOI.map(oi => Math.floor((oi / maxPutOI) * 30));
    
    
    return { 
      greenBarHeights: greenHeights, 
      redBarHeights: redHeights 
    };
  }, [options, strikeRange, marketOI, selectedDateFilter, uniqueDates]);
  
  // ========================================
  // ФИНАЛЬНЫЕ ДАННЫЕ (используем реальные или пустые)
  // ========================================
  
  // Используем реальные флаги или пустые массивы
  const flags = topFlags;
  const displayBottomFlags = bottomFlags;
  
  // Используем рассчитанные Y-levels или пустые объекты
  const flagYLevels = topYLevels || {};
  const displayBottomFlagYLevels = bottomYLevels || {};

  // Создаем стабильную зависимость для страйков опционов
  const optionsStrikesKey = useMemo(() => {
    return options.map(o => o.strike).filter(Boolean).sort().join(',');
  }, [options]);

  // ========================================
  // АВТОСКРОЛЛ ОТКЛЮЧЕН
  // ========================================
  // Автоскролл к центру (флажку тикера) при загрузке, если нет опционов
  useEffect(() => {
    // Эти переменные нужны для других частей кода
    const allFlags = [...flags, ...displayBottomFlags].filter(f => f.type === 'option');
    const optionsCount = allFlags.length;
    
    // Если есть опционы - не скроллим автоматически
    if (optionsCount > 0) {
      console.log('ℹ️ Автоскролл отключен - есть опционы');
      return;
    }
    
    // Если нет опционов, но есть текущая цена - центрируем по флажку тикера
    if (!containerRef.current || !strikeRange || currentPrice <= 0) {
      return;
    }
    
    console.log('🎯 Автоскролл к центру (флажок тикера)');
    
    // Небольшая задержка для рендера
    setTimeout(() => {
      if (!containerRef.current) return;
      
      const container = containerRef.current;
      const containerWidth = container.offsetWidth;
      const scrollWidth = container.scrollWidth;
      
      // Проверяем что контейнер отрендерился
      if (scrollWidth <= containerWidth) {
        console.warn('⚠️ Шкала еще не отрендерилась');
        return;
      }
      
      // Находим позицию флажка тикера (текущая цена)
      const centerStrike = Math.round(currentPrice / strikeRange.step) * strikeRange.step;
      const tickerIndex = Math.floor((centerStrike - strikeRange.min) / strikeRange.step);
      const tickerPosition = tickerIndex * 6; // 6px на страйк
      
      // Центрируем по флажку
      const scrollPosition = tickerPosition - (containerWidth / 2);
      container.scrollLeft = Math.max(0, scrollPosition);
      
      console.log('✅ Центрирование по флажку тикера:', {
        currentPrice,
        centerStrike,
        tickerIndex,
        tickerPosition,
        scrollPosition: container.scrollLeft
      });
    }, 150);
    
    return; // Отключаем старый автоскролл
    
    /* ОТКЛЮЧЕННЫЙ КОД АВТОСКРОЛЛА
    if (!containerRef.current || !strikeRange) return;
    
    // ВАЖНО: Не скроллим если нет опционов с установленными страйками
    // Это предотвращает преждевременный скролл при первой загрузке
    const optionsWithStrikes = options.filter(opt => opt.strike && Number(opt.strike) > 0);
    if (optionsWithStrikes.length === 0 && currentPrice <= 0) {
      console.log('⏸️ Автоскролл пропущен: нет опционов с страйками');
      return;
    }
    */
    
    // Используем requestAnimationFrame для гарантии что DOM отрендерился
    const performScroll = () => {
      if (!containerRef.current) {
        console.warn('⚠️ containerRef.current не существует');
        return;
      }
      
      const container = containerRef.current;
      const containerWidth = container.offsetWidth;
      const scrollWidth = container.scrollWidth;
      
      // КРИТИЧНО: Проверяем что контейнер отрендерился
      if (scrollWidth <= containerWidth) {
        console.warn('⚠️ Шкала еще не отрендерилась полностью, повторная попытка через 100ms:', {
          containerWidth,
          scrollWidth,
          strikeCount: strikeRange.count
        });
        // Повторные попытки с увеличивающейся задержкой
        const retryDelays = [100, 300, 500];
        retryDelays.forEach((delay, index) => {
          setTimeout(() => {
            if (containerRef.current && containerRef.current.scrollWidth > containerRef.current.offsetWidth) {
              console.log(`✅ Шкала отрендерилась, повторный скролл (попытка ${index + 1})`);
              performScroll();
            } else if (index === retryDelays.length - 1) {
              console.warn('❌ Шкала так и не отрендерилась после всех попыток');
            }
          }, delay);
        });
        return;
      }
      
      let targetPosition = 0;
      
      // Приоритет 1: Скролл к текущей цене (если есть)
      if (currentPrice > 0) {
        const centerStrike = Math.round(currentPrice / strikeRange.step) * strikeRange.step;
        const tickerIndex = Math.floor((centerStrike - strikeRange.min) / strikeRange.step);
        targetPosition = tickerIndex * 6; // 6px на страйк
        
        console.log('🎯 Автоскролл к тикеру:', {
          centerStrike,
          tickerIndex,
          targetPosition,
          containerWidth,
          scrollWidth
        });
      }
      // Приоритет 2: Скролл к первому флажку опциона (если нет цены)
      else if (allFlags.length > 0) {
        // Находим минимальный страйк среди опционов
        const minStrike = Math.min(...allFlags.map(f => f.price));
        const flagIndex = Math.floor((minStrike - strikeRange.min) / strikeRange.step);
        targetPosition = flagIndex * 6;
        
        console.log('🎯 Автоскролл к первому опциону:', {
          minStrike,
          flagIndex,
          targetPosition,
          containerWidth,
          scrollWidth,
          optionsCount
        });
      }
      
      // Скроллим так, чтобы цель была в центре экрана
      const calculatedScroll = targetPosition - (containerWidth / 2);
      const finalScroll = Math.max(0, calculatedScroll);
      
      console.log('📜 Применяем скролл:', {
        targetPosition,
        calculatedScroll,
        finalScroll,
        containerWidth,
        scrollWidth
      });
      
      container.scrollLeft = finalScroll;
      
      // Проверяем что скролл применился
      setTimeout(() => {
        console.log('✅ Скролл после применения:', {
          scrollLeft: container.scrollLeft,
          ожидалось: finalScroll,
          успешно: container.scrollLeft === finalScroll
        });
      }, 50);
      
    };
    
    // Двойной requestAnimationFrame для гарантии полного рендера
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        performScroll();
      });
    });
  }, [currentPrice, strikeRange, options.length, optionsStrikesKey, flags, displayBottomFlags]); // Зависимость от количества и страйков опционов

  // ========================================
  // АВТОЦЕНТРИРОВАНИЕ ПРИ ИЗМЕНЕНИИ ОПЦИОНОВ
  // ========================================
  // Центрируем шкалу по группе флажков при любом изменении опционов
  useEffect(() => {
    if (!containerRef.current || !strikeRange) return;
    
    // Собираем все видимые опционы со страйками
    const visibleOptions = options.filter(opt => opt.visible && opt.strike && Number(opt.strike) > 0);
    
    if (visibleOptions.length === 0) return; // Если нет видимых опционов - не центрируем
    
    console.log('🎯 Автоцентрирование по группе флажков');
    
    setTimeout(() => {
      if (!containerRef.current) return;
      
      const container = containerRef.current;
      const containerWidth = container.offsetWidth;
      
      // Находим минимальный и максимальный страйки среди видимых опционов
      const strikes = visibleOptions.map(opt => Number(opt.strike));
      const minStrike = Math.min(...strikes);
      const maxStrike = Math.max(...strikes);
      
      // Вычисляем центр группы флажков
      const centerStrike = (minStrike + maxStrike) / 2;
      
      // Находим позицию центра группы на шкале
      const centerIndex = (centerStrike - strikeRange.min) / strikeRange.step;
      const centerPosition = centerIndex * 6; // 6px на страйк
      
      // Центрируем по группе
      const scrollPosition = centerPosition - (containerWidth / 2);
      container.scrollLeft = Math.max(0, scrollPosition);
      
      console.log('✅ Центрирование по группе флажков:', {
        visibleOptionsCount: visibleOptions.length,
        minStrike,
        maxStrike,
        centerStrike,
        centerPosition,
        scrollPosition: container.scrollLeft
      });
    }, 150);
  }, [options, strikeRange]); // Зависимость от options (любое изменение: добавление, удаление, изменение страйка, visible)

  // ========================================
  // DRAG & DROP ОБРАБОТЧИКИ
  // ========================================
  
  const handleFlagMouseDown = (e, flag) => {
    // Только для опционных флагов, не для тикера
    if (flag.type === 'ticker') return;
    
    e.preventDefault();
    setDraggingFlag(flag);
    setDragStartX(e.clientX);
    setDragOffset(0);
    
    console.log('🖱️ Начало перетаскивания:', flag);
  };
  
  const handleMouseMove = useCallback((e) => {
    if (!draggingFlag || !strikeRange) return;
    
    const currentX = e.clientX;
    const offset = currentX - dragStartX;
    setDragOffset(offset);
    
    // Вычисляем предполагаемый страйк для предпросмотра
    const currentIndex = Math.floor((draggingFlag.price - strikeRange.min) / strikeRange.step);
    const currentLeftPosition = currentIndex * 6 + 1.5;
    const newLeftPosition = currentLeftPosition + offset;
    const newIndex = Math.round((newLeftPosition - 1.5) / 6);
    const clampedIndex = Math.max(0, Math.min(strikeRange.count - 1, newIndex));
    let calculatedStrike = strikeRange.min + (clampedIndex * strikeRange.step);
    
    // Находим ближайший доступный страйк из strikesByDate
    const option = options.find(opt => draggingFlag.optionIds?.includes(opt.id));
    const dateKey = option?.date;
    // Если есть страйки для даты - используем их, иначе собираем все уникальные страйки из всех дат
    let strikesForDate = dateKey && strikesByDate[dateKey] ? strikesByDate[dateKey] : [];
    if (strikesForDate.length === 0) {
      // Собираем все уникальные страйки из всех дат
      const allStrikes = new Set();
      Object.values(strikesByDate).forEach(strikes => {
        strikes.forEach(strike => allStrikes.add(strike));
      });
      strikesForDate = Array.from(allStrikes).sort((a, b) => a - b);
    }
    
    if (strikesForDate && strikesForDate.length > 0) {
      // Находим ближайший страйк
      const closest = strikesForDate.reduce((prev, curr) => 
        Math.abs(curr - calculatedStrike) < Math.abs(prev - calculatedStrike) ? curr : prev
      );
      calculatedStrike = closest;
    }
    
    setPreviewStrike(calculatedStrike);
    
    // Автоскролл при перетаскивании к краям
    if (containerRef.current) {
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const edgeThreshold = 50;
      const scrollSpeed = 10;
      
      if (currentX - rect.left < edgeThreshold && container.scrollLeft > 0) {
        container.scrollLeft -= scrollSpeed;
      }
      
      if (rect.right - currentX < edgeThreshold && 
          container.scrollLeft < container.scrollWidth - container.clientWidth) {
        container.scrollLeft += scrollSpeed;
      }
    }
  }, [draggingFlag, dragStartX, strikeRange, options, strikesByDate]);
  
  const handleMouseUp = useCallback(() => {
    if (!draggingFlag || !strikeRange) return;
    
    // Используем предпросмотровый страйк, который уже вычислен в handleMouseMove
    const newStrike = previewStrike || draggingFlag.price;
    
    // Проверяем, изменился ли страйк
    if (newStrike !== draggingFlag.price) {
      console.log('🎯 Привязка к страйку:', {
        старыйСтрайк: draggingFlag.price,
        новыйСтрайк: newStrike,
        смещение: dragOffset,
        flagId: draggingFlag.id
      });
      
      // Обновляем опционы через callback
      if (onPositionUpdate && draggingFlag.optionIds) {
        // Обновляем все опционы в группе (может быть несколько с одним страйком)
        draggingFlag.optionIds.forEach(optionId => {
          onPositionUpdate(optionId, { strike: newStrike });
          
          // Загружаем новые данные опциона (bid/ask/volume/oi)
          if (loadOptionDetails) {
            const option = options.find(opt => opt.id === optionId);
            if (option && option.date && option.type && ticker) {
              loadOptionDetails(optionId, ticker, option.date, newStrike, option.type);
              console.log('🔄 Загрузка деталей опциона:', { optionId, ticker, date: option.date, strike: newStrike, type: option.type });
            }
          }
        });
        console.log('✅ Опционы обновлены:', { 
          optionIds: draggingFlag.optionIds, 
          newStrike,
          count: draggingFlag.optionIds.length 
        });
      }
    } else {
      console.log('🖱️ Флаг остался на месте (отпущен близко к исходной позиции)');
    }
    
    setDraggingFlag(null);
    setDragOffset(0);
    setPreviewStrike(null);
  }, [draggingFlag, previewStrike, onPositionUpdate]);
  
  // Глобальные обработчики mouse move/up
  useEffect(() => {
    if (!draggingFlag) return;
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingFlag, handleMouseMove, handleMouseUp]);
  
  // Загрузка полной карты OI рынка
  useEffect(() => {
    // Простая логика: если нет тикера - не загружаем
    if (!ticker) {
      setMarketOI({ calls: {}, puts: {} });
      return;
    }
    
    // Определяем дату для загрузки
    // Приоритет: selectedDateFilter (если конкретная дата) > selectedExpirationDate > первая дата из опционов
    let dateToLoad = null;
    
    // Если выбрана конкретная дата в фильтре - загружаем для неё
    if (selectedDateFilter !== 'all') {
      dateToLoad = selectedDateFilter;
    } else if (selectedExpirationDate) {
      dateToLoad = selectedExpirationDate;
    } else if (uniqueDates && uniqueDates.length > 0) {
      dateToLoad = uniqueDates[0];
    }
    
    if (!dateToLoad) {
      console.log('⚠️ Нет даты для загрузки OI');
      setMarketOI({ calls: {}, puts: {} });
      return;
    }
    
    // Проверяем кэш
    if (marketOICache[dateToLoad]) {
      console.log('✅ Используем кэшированные данные для', dateToLoad);
      setMarketOI(marketOICache[dateToLoad]);
      return;
    }
    
    console.log('🔄 Загружаем OI для', ticker, dateToLoad);
    setIsLoadingMarketOI(true);
    
    // Определяем формат даты и конвертируем в YYYY-MM-DD для API
    let apiDate;
    if (dateToLoad.includes('-')) {
      // Уже в формате YYYY-MM-DD (ISO формат из V3)
      apiDate = dateToLoad;
    } else if (dateToLoad.includes('.')) {
      // Формат DD.MM.YY - конвертируем в YYYY-MM-DD
      const dateParts = dateToLoad.split('.');
      if (dateParts.length !== 3) {
        console.error('❌ Неверный формат даты:', dateToLoad);
        setIsLoadingMarketOI(false);
        return;
      }
      const [day, month, year] = dateParts;
      const fullYear = year && year.length === 2 ? `20${year}` : year;
      apiDate = `${fullYear}-${month}-${day}`;
    } else {
      console.error('❌ Неизвестный формат даты:', dateToLoad);
      setIsLoadingMarketOI(false);
      return;
    }
    
    console.log('📅 Дата для API:', apiDate, 'из', dateToLoad);
    
    // Загружаем данные
    fetch(`/api/polygon/ticker/${ticker}/options?expiration_date=${apiDate}`)
      .then(res => {
        console.log('📡 Ответ от API:', res.status);
        return res.json();
      })
      .then(data => {
        console.log('📦 Данные от API:', data);
        console.log('📦 Первый опцион:', data.options?.[0]);
        
        if (data.status === 'success' && data.options && data.options.length > 0) {
          // Группируем OI по страйкам
          const calls = {};
          const puts = {};
          
          data.options.forEach(opt => {
            const strike = Number(opt.strike); // Конвертируем в число!
            const oi = opt.open_interest || 0;
            const type = opt.contract_type || opt.type; // Пробуем оба варианта
            
            console.log('🔍 Опцион:', { strike, oi, type, contract_type: opt.contract_type, opt_type: opt.type });
            
            if (type === 'call' || type === 'CALL') {
              calls[strike] = (calls[strike] || 0) + oi;
            } else if (type === 'put' || type === 'PUT') {
              puts[strike] = (puts[strike] || 0) + oi;
            }
          });
          
          const marketData = { calls, puts };
          console.log('📊 Обработано:', Object.keys(calls).length, 'calls,', Object.keys(puts).length, 'puts');
          setMarketOI(marketData);
          // Сохраняем в кэш
          setMarketOICache(prev => ({ ...prev, [dateToLoad]: marketData }));
          console.log('✅ Загружено и установлено в state');
        } else {
          console.log('⚠️ API вернул пустой ответ или ошибку');
        }
        setIsLoadingMarketOI(false);
      })
      .catch(error => {
        console.error('Ошибка загрузки OI:', error);
        setIsLoadingMarketOI(false);
      });
  }, [ticker, uniqueDates, selectedExpirationDate, selectedDateFilter, marketOICache]);

  // Если нет диапазона (нет цены) - не показываем шкалу
  if (!strikeRange) {
    return null;
  }

  return (
    <div className="relative" style={{ maxWidth: '1140px' }}>
      {/* Фильтр по датам экспирации - показываем только если больше одной даты */}
      {uniqueDates.length > 1 && (
        <div className="flex gap-1.5 mb-3 px-4 overflow-x-auto">
          <button
            onClick={() => setSelectedDateFilter('all')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
              selectedDateFilter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            Все даты ({options.length})
          </button>
          {uniqueDates.map(date => {
            const count = options.filter(opt => opt.date === date).length;
            const dateColor = calculateDateColor(date);
            const isActive = selectedDateFilter === date;
            
            return (
              <button
                key={date}
                onClick={() => setSelectedDateFilter(date)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'text-white'
                    : 'bg-background text-foreground hover:bg-accent border'
                }`}
                style={
                  isActive 
                    ? { backgroundColor: dateColor } 
                    : { 
                        borderColor: dateColor,
                        color: dateColor
                      }
                }
              >
                {date} ({count})
              </button>
            );
          })}
        </div>
      )}
      
      <div 
        ref={containerRef} 
        className="relative pt-12 pb-12 my-[-18px] overflow-x-auto select-none" 
        style={{ cursor: isDraggingScroll ? 'grabbing' : 'grab' }}
        onMouseDown={(e) => {
          if (e.button === 0 && !e.target.closest('.pointer-events-auto')) {
            setIsDraggingScroll(true);
            setScrollStartX(e.pageX - containerRef.current.offsetLeft);
            setScrollLeft(containerRef.current.scrollLeft);
          }
        }}
        onMouseMove={(e) => {
          if (!isDraggingScroll) return;
          e.preventDefault();
          const x = e.pageX - containerRef.current.offsetLeft;
          const walk = (x - scrollStartX) * 2;
          containerRef.current.scrollLeft = scrollLeft - walk;
        }}
        onMouseUp={() => setIsDraggingScroll(false)}
        onMouseLeave={() => setIsDraggingScroll(false)}
      >
        {/* Верхние флажки */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-50">
        {flags.map((flag) => {
          const index = Math.floor((flag.price - strikeRange.min) / strikeRange.step);
          let leftPosition = index * 6 + 1.5;
          const yLevel = flagYLevels[flag.id] || 0;
          const topPosition = 48 + 8 - yLevel * 38;
          
          // Применяем смещение если флаг перетаскивается
          const isDragging = draggingFlag?.id === flag.id;
          if (isDragging) {
            leftPosition += dragOffset;
          }

          return (
            <div
              key={flag.id}
              className={`absolute pointer-events-auto select-none ${
                flag.type === "ticker" ? "cursor-default" : isDragging ? "cursor-grabbing" : "cursor-grab"
              }`}
              style={{
                left: `${leftPosition}px`,
                top: `${topPosition}px`,
                transform: "translateX(-50%)",
                opacity: isDragging ? 0.7 : 1,
                zIndex: isDragging ? 100 : 'auto',
              }}
              onMouseDown={(e) => handleFlagMouseDown(e, flag)}
            >
              <div
                className="relative rounded-md px-2 py-1 flex items-center gap-1 shadow-md"
                style={{ backgroundColor: flag.color }}
              >
                <span className="text-white font-bold text-sm whitespace-nowrap">
                  {isDragging && previewStrike ? previewStrike : (flag.label || flag.price)}
                </span>

                {flag.count && (
                  <div className="absolute -right-[13px] top-1/2 -translate-y-1/2 bg-black rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                    <span className="text-white text-xs font-bold">{flag.count}</span>
                  </div>
                )}

                <div
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{
                    bottom: "-6px",
                    width: 0,
                    height: 0,
                    borderLeft: "6px solid transparent",
                    borderRight: "6px solid transparent",
                    borderTop: `6px solid ${flag.color}`,
                  }}
                />
              </div>

              {(forceShowDateBadges && flag.date) && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 rounded shadow-sm"
                  style={{
                    backgroundColor: calculateDateColor(flag.date),
                    bottom: "calc(100% - 5px)",
                    padding: "1px 3px",
                    left: "calc(50% + 10px)",
                  }}
                >
                  <span
                    className="text-white font-medium text-[10px] whitespace-nowrap leading-none"
                    style={{ margin: "2px", display: "block" }}
                  >
                    {formatDateForDisplay(flag.date)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Нижние флажки */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-50">
        {displayBottomFlags.map((flag) => {
          const index = Math.floor((flag.price - strikeRange.min) / strikeRange.step);
          let leftPosition = index * 6 + 1.5;
          const yLevel = displayBottomFlagYLevels[flag.id] || 0;
          const topPosition = 134 + yLevel * 38;
          
          // Применяем смещение если флаг перетаскивается
          const isDragging = draggingFlag?.id === flag.id;
          if (isDragging) {
            leftPosition += dragOffset;
          }

          return (
            <div
              key={flag.id}
              className={`absolute pointer-events-auto select-none ${
                isDragging ? "cursor-grabbing" : "cursor-grab"
              }`}
              style={{
                left: `${leftPosition}px`,
                top: `${topPosition}px`,
                transform: "translateX(-50%)",
                opacity: isDragging ? 0.7 : 1,
                zIndex: isDragging ? 100 : 'auto',
              }}
              onMouseDown={(e) => handleFlagMouseDown(e, flag)}
            >
              {(forceShowDateBadges && flag.date) && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 rounded shadow-sm"
                  style={{
                    backgroundColor: calculateDateColor(flag.date),
                    top: "calc(100% - 5px)",
                    padding: "1px 3px",
                    left: "calc(50% + 10px)",
                    zIndex: 100,
                  }}
                >
                  <span
                    className="text-white font-medium text-[10px] whitespace-nowrap leading-none"
                    style={{ margin: "2px", display: "block" }}
                  >
                    {formatDateForDisplay(flag.date)}
                  </span>
                </div>
              )}

              <div
                className="relative rounded-md px-2 py-1 flex items-center gap-1 shadow-md pt-1"
                style={{ backgroundColor: flag.color }}
              >
                <span className="text-white font-bold text-sm whitespace-nowrap">
                  {isDragging && previewStrike ? previewStrike : flag.price}
                </span>

                {flag.count && (
                  <div className="absolute -right-[13px] top-1/2 -translate-y-1/2 bg-black rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                    <span className="text-white text-xs font-bold">{flag.count}</span>
                  </div>
                )}

                <div
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{
                    top: "-6px",
                    width: 0,
                    height: 0,
                    borderLeft: "6px solid transparent",
                    borderRight: "6px solid transparent",
                    borderBottom: `6px solid ${flag.color}`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-0">
        {/* Верхняя шкала (зелёные полосы) */}
        <div className="inline-flex gap-[3px] py-2 pb-0" style={{ minWidth: `${strikeRange.count * 6}px` }}>
          {Array.from({ length: strikeRange.count }, (_, i) => strikeRange.min + i * strikeRange.step).map((price, index) => {
            const isTenth = price % 10 === 0;
            const isFifth = price % (strikeRange.step === 1 ? 5 : 5) === 0;
            const isBlack = isFifth;
            const height = isTenth ? "h-[10px]" : "h-[5px]";
            const color = isBlack ? "bg-black" : "bg-gray-400";
            const greenBarHeight = greenBarHeights[index];

            return (
              <div key={price} className="flex flex-col items-center h-[43px] justify-end">
                <div
                  className="w-[3px] mb-[3px]"
                  style={{ height: `${greenBarHeight}px`, backgroundColor: '#39eda0' }}
                />
                <div className="h-[10px] flex items-start">
                  <div className={`w-px ${height} ${color}`} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Метки цен */}
        <div className="relative inline-flex gap-[3px] h-[20px]" style={{ minWidth: `${strikeRange.count * 6}px` }}>
          {Array.from({ length: strikeRange.count }, (_, i) => strikeRange.min + i * strikeRange.step).map((price, index) => {
            const isTenth = price % 10 === 0;
            const leftPosition = index * 6 + 1.5;
            const isHotStrike = hotStrikes.has(price);
            const isHighVolume = highVolumeStrikes.has(price);
            const isPinRisk = pinRiskStrikes.has(price);

            return (
              <div key={`label-${price}`} className="w-[3px] h-full">
                {isTenth && (
                  <span
                    className="absolute text-xs font-medium text-gray-700 whitespace-nowrap"
                    style={{
                      left: `${leftPosition}px`,
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    {price}
                    {isHotStrike && (
                      <span 
                        className="ml-1 text-orange-500" 
                        title="Популярный страйк (высокий OI)"
                      >
                        🔥
                      </span>
                    )}
                    {isHighVolume && (
                      <span 
                        className="ml-1 text-yellow-500" 
                        title="Высокий объем торгов"
                      >
                        ⚡
                      </span>
                    )}
                    {isPinRisk && (
                      <span 
                        className="ml-1 text-red-500" 
                        title="Риск пиннинга (близко к цене)"
                      >
                        🎯
                      </span>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Нижняя шкала (красные полосы) */}
        <div className="inline-flex gap-[3px] py-2 pt-0 pb-2" style={{ minWidth: `${strikeRange.count * 6}px` }}>
          {Array.from({ length: strikeRange.count }, (_, i) => strikeRange.min + i * strikeRange.step).map((price, index) => {
            const isTenth = price % 10 === 0;
            const isFifth = price % (strikeRange.step === 1 ? 5 : 5) === 0;
            const isBlack = isFifth;
            const height = isTenth ? "h-[10px]" : "h-[5px]";
            const color = isBlack ? "bg-black" : "bg-gray-400";
            const redBarHeight = redBarHeights[index];

            return (
              <div key={`bottom-${price}`} className="flex flex-col items-center h-[43px] justify-start">
                <div className="h-[10px] flex items-end">
                  <div className={`w-px ${height} ${color}`} />
                </div>
                <div
                  className="w-[3px] mt-[3px]"
                  style={{ height: `${redBarHeight}px`, backgroundColor: '#ffa8c9' }}
                />
              </div>
            );
          })}
        </div>
      </div>

      </div>
    </div>
  );
}

export default StrikeScale;
