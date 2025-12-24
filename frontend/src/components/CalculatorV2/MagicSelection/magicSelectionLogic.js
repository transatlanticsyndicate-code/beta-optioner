/**
 * Логика подбора опционов для "Волшебного подбора"
 * ЗАЧЕМ: Автоматический поиск оптимального BuyPUT/BuyCALL опциона
 * Затрагивает: калькулятор опционов, API polygon, расчёт P/L
 */

import { calculateOptionPLValue } from '../../../utils/optionPricing';
import { getOptionVolatility } from '../../../utils/volatilitySurface';

// Константы для подбора
const MAX_DAYS_TO_EXPIRATION = 100; // Максимум 100 дней до экспирации
const MIN_DAYS_TO_EXPIRATION = 5; // Минимум 5 дней до экспирации (для расчёта P/L на 5-й день)
const EVALUATION_DAY = 5; // День оценки P/L после входа
const STRIKE_RANGE_PERCENT = 0.20; // ±20% от текущей цены
const MIN_OPEN_INTEREST = 100; // Минимальный OI для ликвидности
const MAX_LOSS_PERCENT = 0.05; // Максимальный убыток 5% от суммы позиции

/**
 * Получить даты экспирации в ближайшие N дней
 * @param {array} availableDates - Все доступные даты экспирации
 * @param {number} maxDays - Максимальное количество дней
 * @returns {array} - Отфильтрованные даты
 */
export const filterDatesByMaxDays = (availableDates, maxDays = MAX_DAYS_TO_EXPIRATION, minDays = MIN_DAYS_TO_EXPIRATION) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return availableDates.filter(dateStr => {
    const expDate = new Date(dateStr + 'T00:00:00');
    const diffTime = expDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    // Фильтруем: минимум minDays дней (для оценки на 5-й день) и максимум maxDays
    return diffDays >= minDays && diffDays <= maxDays;
  });
};

/**
 * Фильтрация страйков по диапазону ±20% от цены
 * @param {array} strikes - Все страйки
 * @param {number} currentPrice - Текущая цена актива
 * @returns {array} - Отфильтрованные страйки
 */
export const filterStrikesByRange = (strikes, currentPrice) => {
  const minStrike = currentPrice * (1 - STRIKE_RANGE_PERCENT);
  const maxStrike = currentPrice * (1 + STRIKE_RANGE_PERCENT);
  
  return strikes.filter(strike => strike >= minStrike && strike <= maxStrike);
};

/**
 * Фильтрация опционов по ликвидности (OI >= 100)
 * @param {array} options - Массив опционов
 * @returns {array} - Отфильтрованные опционы
 */
export const filterByLiquidity = (options) => {
  return options.filter(opt => (opt.open_interest || opt.oi || 0) >= MIN_OPEN_INTEREST);
};

/**
 * Рассчитать дни до экспирации
 * @param {string} expirationDate - Дата экспирации в формате YYYY-MM-DD
 * @returns {number} - Количество дней
 */
export const calculateDaysToExpiration = (expirationDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expDate = new Date(expirationDate + 'T00:00:00');
  const diffTime = expDate - today;
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
};

/**
 * Рассчитать P/L для кандидата опциона
 * ВАЖНО: Использует тот же метод расчёта, что и таблица опционов
 * 
 * @param {object} candidate - Кандидат опциона с данными из API
 * @param {number} priceUp - Цена ВЕРХ для расчёта
 * @param {number} priceDown - Цена НИЗ для расчёта
 * @param {number} currentPrice - Текущая цена актива
 * @param {object} ivSurface - IV Surface для интерполяции волатильности
 * @param {number} dividendYield - Дивидендная доходность
 * @param {number} evalDay - День выхода (оценки P/L)
 * @param {string} optionType - Тип опциона ('put' или 'call')
 * @returns {object} - { plUp, plDown, candidate }
 */
export const calculatePLForCandidate = (
  candidate,
  priceUp,
  priceDown,
  currentPrice,
  ivSurface = null,
  dividendYield = 0,
  evalDay = EVALUATION_DAY,
  optionType = 'put'
) => {
  // Получаем дату экспирации (API может возвращать 'expiration' или 'expiration_date')
  const expirationDate = candidate.expiration || candidate.expiration_date || '';
  
  // Нормализуем тип опциона
  const normalizedType = optionType.toUpperCase();
  
  // Формируем объект опциона в формате, ожидаемом calculateOptionPLValue
  const option = {
    type: normalizedType,
    action: 'Buy',
    strike: candidate.strike,
    // Используем ASK как цену входа для Buy (или last если ask недоступен)
    ask: candidate.ask || candidate.last || candidate.last_price || 0,
    bid: candidate.bid || 0,
    premium: candidate.ask || candidate.last || candidate.last_price || 0,
    quantity: 1,
    // IV из API или из ivSurface
    impliedVolatility: candidate.implied_volatility || candidate.impliedVolatility || 0,
    date: expirationDate
  };

  const daysRemaining = calculateDaysToExpiration(expirationDate);
  
  // ВАЖНО: Рассчитываем P/L на день выхода (evalDay) после входа, а не на дату экспирации
  // Это даёт более реалистичную оценку краткосрочной эффективности опциона
  const daysForEvaluation = Math.max(1, daysRemaining - evalDay);
  
  // Получаем волатильность из IV Surface если доступна
  let volatility = option.impliedVolatility;
  if (ivSurface && (!volatility || volatility === 0)) {
    volatility = getOptionVolatility(
      ivSurface,
      candidate.strike,
      daysRemaining, // Используем полный срок для получения IV
      normalizedType,
      currentPrice
    );
  }
  // Конвертируем в десятичный формат если нужно
  if (volatility > 1) {
    volatility = volatility / 100;
  }

  // Рассчитываем P/L при цене ВЕРХ на день выхода после входа
  const plUp = calculateOptionPLValue(
    option,
    priceUp,
    currentPrice,
    daysForEvaluation,
    volatility,
    dividendYield
  );

  // Рассчитываем P/L при цене НИЗ на день выхода после входа
  const plDown = calculateOptionPLValue(
    option,
    priceDown,
    currentPrice,
    daysForEvaluation,
    volatility,
    dividendYield
  );

  return {
    plUp,
    plDown,
    candidate: {
      ...candidate,
      daysRemaining,
      daysForEvaluation, // Дней до экспирации на момент оценки
      evaluationDay: evalDay,
      volatility,
      calculatedPlUp: plUp,
      calculatedPlDown: plDown
    }
  };
};

/**
 * Рассчитать P/L позиции базового актива
 * @param {object} position - Позиция базового актива
 * @param {number} targetPrice - Целевая цена
 * @returns {number} - P/L в долларах
 */
export const calculateBaseAssetPL = (position, targetPrice) => {
  const entryPrice = position.price || 0;
  const quantity = position.quantity || 100;
  const isLong = (position.type || 'LONG').toUpperCase() === 'LONG';
  
  if (isLong) {
    return (targetPrice - entryPrice) * quantity;
  } else {
    return (entryPrice - targetPrice) * quantity;
  }
};

/**
 * Фильтрация по критериям риска
 * - При ВЕРХ: убыток опциона ≤ 5% от суммы позиции
 * - При НИЗ: общий убыток (позиция + опцион) ≤ 5% от суммы позиции
 * 
 * @param {array} candidates - Кандидаты с рассчитанным P/L
 * @param {object} position - Позиция базового актива
 * @param {number} priceDown - Цена НИЗ
 * @returns {array} - Отфильтрованные кандидаты
 */
export const filterByRiskCriteria = (candidates, position, priceDown) => {
  // Сумма позиции базового актива
  const positionValue = (position.price || 0) * (position.quantity || 100);
  const maxLoss = positionValue * MAX_LOSS_PERCENT;
  
  // P/L базового актива при цене НИЗ
  const baseAssetPlDown = calculateBaseAssetPL(position, priceDown);
  
  return candidates.filter(({ plUp, plDown }) => {
    // Критерий 1: При ВЕРХ убыток опциона ≤ 5% от суммы позиции
    // plUp для BuyPUT при росте цены будет отрицательным (убыток)
    const optionLossUp = Math.abs(Math.min(0, plUp));
    if (optionLossUp > maxLoss) {
      return false;
    }
    
    // Критерий 2: При НИЗ общий убыток ≤ 5% от суммы позиции
    // Общий P/L = P/L базового актива + P/L опциона
    const totalPlDown = baseAssetPlDown + plDown;
    const totalLossDown = Math.abs(Math.min(0, totalPlDown));
    if (totalLossDown > maxLoss) {
      return false;
    }
    
    return true;
  });
};

/**
 * Выбрать лучший опцион (минимальный убыток при ВЕРХ)
 * ЛОГИКА: Из опционов, покрывающих убыток при НИЗ, выбираем с минимальным убытком при ВЕРХ
 * @param {array} candidates - Отфильтрованные кандидаты (уже прошли фильтр покрытия)
 * @returns {object|null} - Лучший кандидат или null
 */
export const selectBestOption = (candidates) => {
  if (!candidates || candidates.length === 0) {
    return null;
  }
  
  // НОВАЯ ЛОГИКА: Выбираем опцион с минимальным убытком при ВЕРХ (plUp)
  // Все кандидаты уже прошли фильтр покрытия убытка при НИЗ
  // Теперь выбираем тот, у которого наименьший убыток при росте цены
  const sorted = [...candidates].sort((a, b) => {
    // plUp отрицательный = убыток, положительный = прибыль
    // Сортируем по убыванию plUp (больший plUp = меньший убыток)
    return b.plUp - a.plUp;
  });
  
  return sorted[0];
};

/**
 * Основная функция подбора BuyPUT опциона
 * 
 * @param {object} params - Параметры подбора
 * @param {string} params.ticker - Тикер актива
 * @param {number} params.currentPrice - Текущая цена актива
 * @param {number} params.priceUp - Цена ВЕРХ
 * @param {number} params.priceDown - Цена НИЗ
 * @param {object} params.position - Позиция базового актива
 * @param {array} params.availableDates - Доступные даты экспирации
 * @param {object} params.ivSurface - IV Surface
 * @param {number} params.dividendYield - Дивидендная доходность
 * @param {function} params.onProgress - Callback для отображения прогресса
 * @param {number} params.strikeRangePercent - Диапазон страйков (0.20 = ±20%)
 * @param {number} params.minOpenInterest - Минимальный Open Interest
 * @returns {Promise<object|null>} - Лучший опцион или null
 */
export const findBestBuyPut = async ({
  ticker,
  currentPrice,
  priceUp,
  priceDown,
  position,
  availableDates,
  ivSurface = null,
  dividendYield = 0,
  onProgress = () => {},
  strikeRangePercent = STRIKE_RANGE_PERCENT,
  minOpenInterest = MIN_OPEN_INTEREST,
  // Дополнительные параметры подбора
  optionRiskUpPercent = MAX_LOSS_PERCENT, // Риск опциона вверх (по умолчанию 5%)
  totalRiskDownPercent = MAX_LOSS_PERCENT, // Общий риск вниз (по умолчанию 5%)
  maxDaysToExpiration = MAX_DAYS_TO_EXPIRATION, // Макс. дней до экспирации
  evaluationDay = EVALUATION_DAY // День выхода (оценки P/L)
}) => {
  console.log('🔮 Начинаем волшебный подбор BuyPUT...', {
    ticker,
    currentPrice,
    priceUp,
    priceDown,
    position,
    strikeRangePercent,
    minOpenInterest,
    optionRiskUpPercent,
    totalRiskDownPercent,
    maxDaysToExpiration,
    evaluationDay
  });
  
  // Статистика для диагностики
  const stats = {
    totalDates: availableDates.length,
    filteredDates: 0,
    totalPutOptions: 0,
    afterStrikeFilter: 0,
    afterLiquidityFilter: 0,
    afterRiskFilter: 0,
    rejectedByLiquidity: 0,
    rejectedByRiskDown: 0 // Не покрывают убыток базового актива при НИЗ
  };
  
  // Шаг 1: Фильтруем даты (от evaluationDay до maxDaysToExpiration дней)
  // ВАЖНО: Минимум evaluationDay дней нужен для оценки P/L на день выхода
  const minDays = evaluationDay; // Минимум дней = день выхода
  const filteredDates = filterDatesByMaxDays(availableDates, maxDaysToExpiration, minDays);
  stats.filteredDates = filteredDates.length;
  console.log(`📅 Даты для подбора (${minDays}-${maxDaysToExpiration} дней):`, filteredDates.length);
  
  if (filteredDates.length === 0) {
    console.warn(`⚠️ Нет доступных дат экспирации в диапазоне ${minDays}-${maxDaysToExpiration} дней`);
    return { error: 'NO_DATES', stats, message: `Нет доступных дат экспирации в диапазоне ${minDays}-${maxDaysToExpiration} дней` };
  }
  
  onProgress({ stage: 'dates', total: filteredDates.length, current: 0 });
  
  // Шаг 2: Собираем все кандидаты со всех дат
  const allCandidates = [];
  const allCandidatesNoLiquidityFilter = []; // Кандидаты без фильтра ликвидности для предложения
  
  for (let i = 0; i < filteredDates.length; i++) {
    const date = filteredDates[i];
    onProgress({ stage: 'loading', total: filteredDates.length, current: i + 1, date });
    
    try {
      // Загружаем опционы для даты
      const response = await fetch(
        `/api/polygon/ticker/${ticker}/options?expiration_date=${date}`
      );
      
      if (!response.ok) {
        console.warn(`⚠️ Не удалось загрузить опционы для ${date}`);
        continue;
      }
      
      const data = await response.json();
      
      if (data.status !== 'success' || !data.options) {
        continue;
      }
      
      // Логируем первый опцион для диагностики структуры данных
      if (data.options.length > 0) {
        console.log(`🔍 Пример опциона для ${date}:`, JSON.stringify(data.options[0], null, 2));
      }
      
      // Фильтруем только PUT опционы
      // ВАЖНО: API возвращает поле 'type' (не 'contract_type')
      const putOptions = data.options.filter(opt => {
        const contractType = (opt.type || opt.contract_type || opt.optionType || '').toLowerCase();
        return contractType === 'put';
      });
      stats.totalPutOptions += putOptions.length;
      
      // Логируем статистику по типам
      const callCount = data.options.filter(opt => {
        const ct = (opt.type || opt.contract_type || opt.optionType || '').toLowerCase();
        return ct === 'call';
      }).length;
      console.log(`📋 ${date}: всего ${data.options.length} опционов, PUT: ${putOptions.length}, CALL: ${callCount}`);
      
      // ВАЖНО: Фильтруем опционы с нулевой ценой (невозможно торговать)
      const validPriceOptions = putOptions.filter(opt => {
        const ask = opt.ask || 0;
        const bid = opt.bid || 0;
        const last = opt.last || opt.last_price || 0;
        // Опцион должен иметь хотя бы одну ненулевую цену
        return ask > 0 || bid > 0 || last > 0;
      });
      
      // Фильтруем по диапазону страйков (используем параметр из UI)
      const filteredByStrike = validPriceOptions.filter(opt => {
        const strike = opt.strike || 0;
        const minStrike = currentPrice * (1 - strikeRangePercent);
        const maxStrike = currentPrice * (1 + strikeRangePercent);
        return strike >= minStrike && strike <= maxStrike;
      });
      stats.afterStrikeFilter += filteredByStrike.length;
      
      // Фильтруем по ликвидности (OI > 0 обязательно, плюс минимальный порог)
      const liquidOptions = filteredByStrike.filter(opt => {
        const oi = opt.open_interest || opt.oi || opt.openInterest || 0;
        // OI должен быть > 0 и >= minOpenInterest
        return oi > 0 && oi >= minOpenInterest;
      });
      stats.afterLiquidityFilter += liquidOptions.length;
      stats.rejectedByLiquidity += (filteredByStrike.length - liquidOptions.length);
      
      // Для предложений: фильтруем только по OI > 0 (без минимального порога)
      const validForSuggestion = filteredByStrike.filter(opt => {
        const oi = opt.open_interest || opt.oi || opt.openInterest || 0;
        const ask = opt.ask || 0;
        const bid = opt.bid || 0;
        const last = opt.last || opt.last_price || 0;
        // OI > 0 и хотя бы одна цена > 0
        return oi > 0 && (ask > 0 || bid > 0 || last > 0);
      });
      
      console.log(`📊 ${date}: ${putOptions.length} PUT → ${validPriceOptions.length} с ценой → ${filteredByStrike.length} по страйкам → ${liquidOptions.length} ликвидных (OI≥${minOpenInterest})`);
      
      // Добавляем в общий список (с фильтром ликвидности)
      allCandidates.push(...liquidOptions);
      
      // Также сохраняем валидные опционы для предложения
      allCandidatesNoLiquidityFilter.push(...validForSuggestion);
      
    } catch (error) {
      console.error(`❌ Ошибка загрузки опционов для ${date}:`, error);
    }
  }
  
  console.log(`📦 Всего кандидатов после фильтрации: ${allCandidates.length}`);
  
  if (allCandidates.length === 0) {
    console.warn('⚠️ Не найдено подходящих опционов');
    // Формируем сообщение о причине
    let message = '';
    if (stats.totalPutOptions === 0) {
      message = 'Не найдено PUT опционов для данного тикера';
    } else if (stats.afterStrikeFilter === 0) {
      message = `Все ${stats.totalPutOptions} PUT опционов вне диапазона страйков (±20% от $${currentPrice.toFixed(2)})`;
    } else if (stats.afterLiquidityFilter === 0) {
      message = `Все ${stats.afterStrikeFilter} опционов имеют низкую ликвидность (OI < ${MIN_OPEN_INTEREST})`;
    }
    return { error: 'NO_CANDIDATES', stats, message };
  }
  
  onProgress({ stage: 'calculating', total: allCandidates.length, current: 0 });
  
  // Шаг 3: Рассчитываем P/L для каждого кандидата
  const candidatesWithPL = allCandidates.map((candidate, idx) => {
    if (idx % 10 === 0) {
      onProgress({ stage: 'calculating', total: allCandidates.length, current: idx });
    }
    
    return calculatePLForCandidate(
      candidate,
      priceUp,
      priceDown,
      currentPrice,
      ivSurface,
      dividendYield,
      evaluationDay // Передаём день выхода из параметров
    );
  });
  
  console.log(`💰 Рассчитан P/L для ${candidatesWithPL.length} кандидатов`);
  
  // Шаг 4: Фильтруем по новым критериям
  // КРИТЕРИЙ 1: При НИЗ прибыль опциона должна покрывать минимум 95% убытка базового актива
  // КРИТЕРИЙ 2: При ВЕРХ минимальный убыток опциона (сортировка)
  onProgress({ stage: 'filtering', total: candidatesWithPL.length, current: 0 });
  
  // Рассчитываем убыток базового актива при цене НИЗ
  const baseAssetPlDown = calculateBaseAssetPL(position, priceDown);
  const baseAssetLossDown = Math.abs(Math.min(0, baseAssetPlDown)); // Убыток как положительное число
  const minCoverageRequired = baseAssetLossDown * 0.95; // Минимум 95% покрытия убытка
  
  console.log(`📉 Убыток базового актива при НИЗ ($${priceDown}): -$${baseAssetLossDown.toFixed(2)}`);
  console.log(`📉 Требуется покрытие минимум 95%: $${minCoverageRequired.toFixed(2)}`);
  
  // Детальная фильтрация: опцион должен покрывать минимум 95% убытка базового актива при НИЗ
  const filteredByRisk = [];
  for (const { plUp, plDown, candidate } of candidatesWithPL) {
    // При НИЗ: прибыль опциона (plDown) должна быть >= 95% убытка базового актива
    // plDown > 0 означает прибыль опциона
    if (plDown < minCoverageRequired) {
      stats.rejectedByRiskDown++;
      continue;
    }
    
    // Опцион проходит критерий покрытия убытка (95%+)
    filteredByRisk.push({ plUp, plDown, candidate });
  }
  stats.afterRiskFilter = filteredByRisk.length;
  
  console.log(`🎯 После фильтрации (покрытие ≥95%): ${filteredByRisk.length} кандидатов`);
  console.log(`📊 Отклонено: ${stats.rejectedByRiskDown} (прибыль опциона < 95% убытка базового актива)`);
  
  if (filteredByRisk.length === 0) {
    console.warn('⚠️ Нет опционов, покрывающих убыток базового актива');
    
    // Находим лучший опцион по прибыли при НИЗ для информации
    const sortedByPlDown = [...candidatesWithPL].sort((a, b) => b.plDown - a.plDown);
    const bestByPlDown = sortedByPlDown[0];
    const bestPlDown = bestByPlDown ? bestByPlDown.plDown : 0;
    const coverage = bestPlDown > 0 ? ((bestPlDown / baseAssetLossDown) * 100).toFixed(0) : 0;
    
    // ПРЕДЛОЖЕНИЕ: Ищем лучший опцион БЕЗ фильтра ликвидности
    // Рассчитываем P/L для всех кандидатов без фильтра ликвидности
    let suggestion = null;
    if (allCandidatesNoLiquidityFilter.length > 0) {
      const noLiquidityCandidatesWithPL = allCandidatesNoLiquidityFilter.map(candidate => {
        return calculatePLForCandidate(
          candidate,
          priceUp,
          priceDown,
          currentPrice,
          ivSurface,
          dividendYield,
          evaluationDay
        );
      });
      
      // Сортируем по покрытию убытка (plDown) и выбираем лучший
      const sortedNoLiquidity = [...noLiquidityCandidatesWithPL].sort((a, b) => b.plDown - a.plDown);
      const bestNoLiquidity = sortedNoLiquidity[0];
      
      if (bestNoLiquidity && bestNoLiquidity.plDown > 0) {
        const suggestionCoverage = ((bestNoLiquidity.plDown / baseAssetLossDown) * 100).toFixed(1);
        const suggestionOI = bestNoLiquidity.candidate.open_interest || bestNoLiquidity.candidate.oi || 0;
        
        suggestion = {
          option: bestNoLiquidity.candidate,
          plDown: bestNoLiquidity.plDown,
          plUp: bestNoLiquidity.plUp,
          coveragePercent: parseFloat(suggestionCoverage),
          coverageAmount: bestNoLiquidity.plDown,
          openInterest: suggestionOI
        };
        
        console.log(`💡 Предложение: опцион без фильтра ликвидности покрывает ${suggestionCoverage}% ($${bestNoLiquidity.plDown.toFixed(0)}), OI=${suggestionOI}`);
      }
    }
    
    // Формируем детальное сообщение
    let message = `Проверено ${candidatesWithPL.length} опционов.\n`;
    message += `Убыток базового актива при НИЗ: $${baseAssetLossDown.toFixed(0)}\n`;
    message += `Требуется покрытие: ≥95% ($${minCoverageRequired.toFixed(0)})\n`;
    message += `Лучший опцион покрывает только ${coverage}% ($${bestPlDown.toFixed(0)})\n`;
    message += `• Ни один опцион не покрывает ≥95% убытка`;
    
    // Возвращаем ошибку с предложением
    return { error: 'NO_RISK_MATCH', stats, message, suggestion };
  }
  
  // Шаг 5: Выбираем лучший опцион
  onProgress({ stage: 'selecting', total: 1, current: 1 });
  
  const best = selectBestOption(filteredByRisk);
  
  if (best) {
    console.log('✨ Лучший BuyPUT найден:', best.candidate);
    return {
      ...best.candidate,
      passedRiskCriteria: true
    };
  }
  
  return null;
};

/**
 * Найти лучший BuyCALL опцион для компенсации затрат на BuyPUT
 * КРИТЕРИЙ: Прибыль CALL на верхней цене должна превысить убыток от BuyPUT
 * 
 * @param {object} params - Параметры подбора
 * @param {string} params.ticker - Тикер актива
 * @param {number} params.currentPrice - Текущая цена актива
 * @param {number} params.priceUp - Цена ВЕРХ для расчёта
 * @param {number} params.priceDown - Цена НИЗ для расчёта
 * @param {object} params.buyPutOption - Данные о BuyPUT опционе (для расчёта убытка)
 * @param {array} params.availableDates - Доступные даты экспирации
 * @param {object} params.ivSurface - IV Surface для интерполяции волатильности
 * @param {number} params.dividendYield - Дивидендная доходность
 * @param {function} params.onProgress - Callback для отображения прогресса
 * @param {number} params.strikeRangePercent - Диапазон страйков (±%)
 * @param {number} params.minOpenInterest - Минимальный OI
 * @param {number} params.maxDaysToExpiration - Макс. дней до экспирации
 * @param {number} params.evaluationDay - День оценки P/L
 * @returns {object|null} - Лучший опцион или null
 */
export const findBestBuyCall = async ({
  ticker,
  currentPrice,
  priceUp,
  priceDown,
  buyPutOption,
  availableDates,
  ivSurface,
  dividendYield = 0,
  onProgress = () => {},
  strikeRangePercent = 0.20,
  minOpenInterest = 100,
  maxDaysToExpiration = 100,
  evaluationDay = 5
}) => {
  console.log('🔮 Начинаем подбор BuyCALL...');
  console.log(`📊 Параметры: ticker=${ticker}, currentPrice=${currentPrice}, priceUp=${priceUp}, priceDown=${priceDown}`);
  console.log(`📊 Фильтры: strikeRange=±${(strikeRangePercent * 100).toFixed(0)}%, minOI=${minOpenInterest}, maxDays=${maxDaysToExpiration}, evalDay=${evaluationDay}`);
  
  // Статистика для отладки
  const stats = {
    totalDates: availableDates?.length || 0,
    filteredDates: 0,
    totalCallOptions: 0,
    afterStrikeFilter: 0,
    afterLiquidityFilter: 0,
    rejectedByLiquidity: 0,
    afterRiskFilter: 0,
    rejectedByRiskUp: 0
  };
  
  // Рассчитываем убыток BuyPUT при росте цены (priceUp)
  // Убыток PUT = премия * 100 (контракт = 100 акций)
  const putPremium = buyPutOption?.premium || buyPutOption?.ask || buyPutOption?.last || 0;
  const putLossAtUp = putPremium * 100; // Полная потеря премии при росте
  
  console.log(`💰 Убыток BuyPUT при ВЕРХ: $${putLossAtUp.toFixed(0)} (премия $${putPremium.toFixed(2)})`);
  
  if (putLossAtUp <= 0) {
    console.warn('⚠️ Не удалось определить убыток BuyPUT');
    return { error: 'NO_PUT_DATA', stats, message: 'Не удалось определить убыток BuyPUT опциона' };
  }
  
  // Шаг 1: Фильтруем даты экспирации
  const minDays = evaluationDay; // Минимум дней = день оценки
  const filteredDates = filterDatesByMaxDays(availableDates, maxDaysToExpiration, minDays);
  stats.filteredDates = filteredDates.length;
  
  console.log(`📅 Дат экспирации: ${filteredDates.length} из ${availableDates?.length || 0} (${minDays}-${maxDaysToExpiration} дней)`);
  
  if (filteredDates.length === 0) {
    console.warn(`⚠️ Нет доступных дат экспирации в диапазоне ${minDays}-${maxDaysToExpiration} дней`);
    return { error: 'NO_DATES', stats, message: `Нет доступных дат экспирации в диапазоне ${minDays}-${maxDaysToExpiration} дней` };
  }
  
  onProgress({ stage: 'dates', total: filteredDates.length, current: 0 });
  
  // Шаг 2: Собираем все CALL кандидаты со всех дат
  const allCandidates = [];
  const allCandidatesNoLiquidityFilter = [];
  
  for (let i = 0; i < filteredDates.length; i++) {
    const date = filteredDates[i];
    onProgress({ stage: 'loading', total: filteredDates.length, current: i + 1, date });
    
    try {
      // Загружаем опционы для даты
      const response = await fetch(
        `/api/polygon/ticker/${ticker}/options?expiration_date=${date}`
      );
      
      if (!response.ok) {
        console.warn(`⚠️ Не удалось загрузить опционы для ${date}`);
        continue;
      }
      
      const data = await response.json();
      
      if (data.status !== 'success' || !data.options) {
        continue;
      }
      
      // Фильтруем только CALL опционы
      const callOptions = data.options.filter(opt => {
        const contractType = (opt.type || opt.contract_type || opt.optionType || '').toLowerCase();
        return contractType === 'call';
      });
      stats.totalCallOptions += callOptions.length;
      
      console.log(`📋 ${date}: всего ${data.options.length} опционов, CALL: ${callOptions.length}`);
      
      // ВАЖНО: Фильтруем опционы с нулевой ценой (невозможно торговать)
      const validPriceOptions = callOptions.filter(opt => {
        const ask = opt.ask || 0;
        const bid = opt.bid || 0;
        const last = opt.last || opt.last_price || 0;
        // Опцион должен иметь хотя бы одну ненулевую цену
        return ask > 0 || bid > 0 || last > 0;
      });
      
      // Фильтруем по диапазону страйков
      const filteredByStrike = validPriceOptions.filter(opt => {
        const strike = opt.strike || 0;
        const minStrike = currentPrice * (1 - strikeRangePercent);
        const maxStrike = currentPrice * (1 + strikeRangePercent);
        return strike >= minStrike && strike <= maxStrike;
      });
      stats.afterStrikeFilter += filteredByStrike.length;
      
      // Фильтруем по ликвидности (OI > 0 обязательно, плюс минимальный порог)
      const liquidOptions = filteredByStrike.filter(opt => {
        const oi = opt.open_interest || opt.oi || opt.openInterest || 0;
        // OI должен быть > 0 и >= minOpenInterest
        return oi > 0 && oi >= minOpenInterest;
      });
      stats.afterLiquidityFilter += liquidOptions.length;
      stats.rejectedByLiquidity += (filteredByStrike.length - liquidOptions.length);
      
      // Для предложений: фильтруем только по OI > 0 (без минимального порога)
      const validForSuggestion = filteredByStrike.filter(opt => {
        const oi = opt.open_interest || opt.oi || opt.openInterest || 0;
        const ask = opt.ask || 0;
        const bid = opt.bid || 0;
        const last = opt.last || opt.last_price || 0;
        // OI > 0 и хотя бы одна цена > 0
        return oi > 0 && (ask > 0 || bid > 0 || last > 0);
      });
      
      console.log(`📊 ${date}: ${callOptions.length} CALL → ${validPriceOptions.length} с ценой → ${filteredByStrike.length} по страйкам → ${liquidOptions.length} ликвидных (OI≥${minOpenInterest})`);
      
      // Добавляем в общий список
      allCandidates.push(...liquidOptions);
      allCandidatesNoLiquidityFilter.push(...validForSuggestion);
      
    } catch (error) {
      console.error(`❌ Ошибка загрузки опционов для ${date}:`, error);
    }
  }
  
  console.log(`📦 Всего CALL кандидатов после фильтрации: ${allCandidates.length}`);
  
  if (allCandidates.length === 0) {
    console.warn('⚠️ Не найдено подходящих CALL опционов');
    let message = '';
    if (stats.totalCallOptions === 0) {
      message = 'Не найдено CALL опционов для данного тикера';
    } else if (stats.afterStrikeFilter === 0) {
      message = `Все ${stats.totalCallOptions} CALL опционов вне диапазона страйков (±${(strikeRangePercent * 100).toFixed(0)}% от $${currentPrice.toFixed(2)})`;
    } else if (stats.afterLiquidityFilter === 0) {
      message = `Все ${stats.afterStrikeFilter} опционов имеют низкую ликвидность (OI < ${minOpenInterest})`;
    }
    return { error: 'NO_CANDIDATES', stats, message };
  }
  
  onProgress({ stage: 'calculating', total: allCandidates.length, current: 0 });
  
  // Шаг 3: Рассчитываем P/L для каждого кандидата
  const candidatesWithPL = allCandidates.map((candidate, idx) => {
    if (idx % 10 === 0) {
      onProgress({ stage: 'calculating', total: allCandidates.length, current: idx });
    }
    
    // Для CALL: рассчитываем P/L на priceUp и priceDown
    return calculatePLForCandidate(
      candidate,
      priceUp,
      priceDown,
      currentPrice,
      ivSurface,
      dividendYield,
      evaluationDay,
      'call' // Указываем тип опциона
    );
  });
  
  onProgress({ stage: 'filtering', total: candidatesWithPL.length, current: 0 });
  
  // Шаг 4: Фильтруем по критерию: прибыль CALL на ВЕРХ > убыток PUT
  const filteredByRisk = [];
  
  for (const { plUp, plDown, candidate } of candidatesWithPL) {
    // plUp > 0 означает прибыль CALL при росте цены
    // Критерий: прибыль CALL на ВЕРХ должна превысить убыток PUT
    if (plUp <= putLossAtUp) {
      stats.rejectedByRiskUp++;
      continue;
    }
    
    // Опцион проходит критерий компенсации
    filteredByRisk.push({ plUp, plDown, candidate });
  }
  stats.afterRiskFilter = filteredByRisk.length;
  
  console.log(`🎯 После фильтрации (прибыль CALL > убыток PUT): ${filteredByRisk.length} кандидатов`);
  console.log(`📊 Отклонено: ${stats.rejectedByRiskUp} (прибыль CALL ≤ убыток PUT $${putLossAtUp.toFixed(0)})`);
  
  if (filteredByRisk.length === 0) {
    console.warn('⚠️ Нет CALL опционов, компенсирующих убыток PUT');
    
    // Находим лучший CALL по прибыли при ВЕРХ для информации
    const sortedByPlUp = [...candidatesWithPL].sort((a, b) => b.plUp - a.plUp);
    const bestByPlUp = sortedByPlUp[0];
    const bestPlUp = bestByPlUp ? bestByPlUp.plUp : 0;
    const coverage = bestPlUp > 0 ? ((bestPlUp / putLossAtUp) * 100).toFixed(0) : 0;
    
    // ПРЕДЛОЖЕНИЕ: Ищем лучший CALL без фильтра ликвидности
    let suggestion = null;
    if (allCandidatesNoLiquidityFilter.length > 0) {
      const noLiquidityCandidatesWithPL = allCandidatesNoLiquidityFilter.map(candidate => {
        return calculatePLForCandidate(
          candidate,
          priceUp,
          priceDown,
          currentPrice,
          ivSurface,
          dividendYield,
          evaluationDay,
          'call'
        );
      });
      
      const sortedNoLiquidity = [...noLiquidityCandidatesWithPL].sort((a, b) => b.plUp - a.plUp);
      const bestNoLiquidity = sortedNoLiquidity[0];
      
      if (bestNoLiquidity && bestNoLiquidity.plUp > 0) {
        const suggestionCoverage = ((bestNoLiquidity.plUp / putLossAtUp) * 100).toFixed(1);
        const suggestionOI = bestNoLiquidity.candidate.open_interest || bestNoLiquidity.candidate.oi || 0;
        
        suggestion = {
          option: bestNoLiquidity.candidate,
          plUp: bestNoLiquidity.plUp,
          plDown: bestNoLiquidity.plDown,
          coveragePercent: parseFloat(suggestionCoverage),
          coverageAmount: bestNoLiquidity.plUp,
          putLoss: putLossAtUp,
          openInterest: suggestionOI
        };
        
        console.log(`💡 Предложение: CALL без фильтра ликвидности покрывает ${suggestionCoverage}% ($${bestNoLiquidity.plUp.toFixed(0)}), OI=${suggestionOI}`);
      }
    }
    
    // Формируем детальное сообщение
    let message = `Проверено ${candidatesWithPL.length} CALL опционов.\n`;
    message += `Убыток BuyPUT при ВЕРХ: $${putLossAtUp.toFixed(0)}\n`;
    message += `Требуется: прибыль CALL > $${putLossAtUp.toFixed(0)}\n`;
    message += `Лучший CALL покрывает только ${coverage}% ($${bestPlUp.toFixed(0)})\n`;
    message += `• Ни один CALL не компенсирует убыток PUT`;
    
    return { error: 'NO_RISK_MATCH', stats, message, suggestion };
  }
  
  // Шаг 5: Выбираем лучший CALL (максимальная прибыль при минимальной премии)
  onProgress({ stage: 'selecting', total: 1, current: 1 });
  
  // Сортируем по соотношению прибыль/премия
  const sorted = [...filteredByRisk].sort((a, b) => {
    const premiumA = a.candidate.ask || a.candidate.last || 0;
    const premiumB = b.candidate.ask || b.candidate.last || 0;
    const ratioA = premiumA > 0 ? a.plUp / premiumA : 0;
    const ratioB = premiumB > 0 ? b.plUp / premiumB : 0;
    return ratioB - ratioA; // Максимальное соотношение прибыль/премия
  });
  
  const best = sorted[0];
  
  if (best) {
    console.log('✨ Лучший BuyCALL найден:', best.candidate);
    return {
      ...best.candidate,
      calculatedPlUp: best.plUp,
      calculatedPlDown: best.plDown,
      evaluationDay: evaluationDay,
      putLossCompensated: putLossAtUp,
      passedRiskCriteria: true
    };
  }
  
  return null;
};

/**
 * Преобразовать найденный опцион в формат для добавления в таблицу
 * @param {object} foundOption - Найденный опцион
 * @param {string} optionType - Тип опциона ('PUT' или 'CALL')
 * @returns {object} - Опцион в формате таблицы
 */
export const formatOptionForTable = (foundOption, optionType = 'PUT') => {
  // Получаем IV в правильном формате для расчётов
  const rawIV = foundOption.implied_volatility || foundOption.volatility || foundOption.iv || 0;
  
  return {
    action: 'Buy',
    type: optionType.toUpperCase(),
    strike: foundOption.strike,
    // API возвращает 'expiration', а не 'expiration_date'
    expirationDate: foundOption.expiration || foundOption.expiration_date,
    premium: foundOption.ask || foundOption.last || foundOption.last_price || 0,
    bid: foundOption.bid || 0,
    ask: foundOption.ask || 0,
    volume: foundOption.volume || 0,
    openInterest: foundOption.open_interest || foundOption.oi || 0,
    // ВАЖНО: Сохраняем IV в обоих форматах для совместимости с разными компонентами
    iv: rawIV,
    impliedVolatility: rawIV, // Для usePositionExitCalculator
    implied_volatility: rawIV, // Для volatilitySurface
    delta: foundOption.delta || 0,
    // Метаданные подбора
    isMagicSelection: true,
    passedRiskCriteria: foundOption.passedRiskCriteria,
    calculatedPlUp: foundOption.calculatedPlUp,
    calculatedPlDown: foundOption.calculatedPlDown
  };
};
