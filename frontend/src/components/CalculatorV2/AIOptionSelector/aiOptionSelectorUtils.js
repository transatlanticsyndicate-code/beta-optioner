/**
 * Утилиты для ИИ подбора опционов
 * ЗАЧЕМ: Вспомогательные функции для алгоритма подбора BuyPUT
 * Затрагивает: AIOptionSelectorDialog
 * 
 * ВАЖНО: Используем ту же модель Black-Scholes что и в калькуляторе
 * для согласованности P&L расчётов
 */

import apiClient from '../../../services/apiClient';
import { calculateOptionPLValue } from '../../../utils/optionPricing';
import { getOptionVolatility } from '../../../utils/volatilitySurface';

// ============================================================================
// КОНСТАНТЫ
// ============================================================================

// Максимальный горизонт экспирации (дней вперёд)
// ЗАЧЕМ: Анализируем ВСЕ даты экспирации в этом диапазоне
export const MAX_DAYS_AHEAD = 60;

// Диапазон страйков относительно текущей цены (±20%)
const STRIKE_RANGE_PERCENT = 20;

// ============================================================================
// РАБОТА С ДАТАМИ ЭКСПИРАЦИИ
// ============================================================================

/**
 * Вычисляет количество дней между двумя датами
 * ВАЖНО: Использует UTC для избежания проблем с часовыми поясами
 * @param {string} dateStr - Дата в формате YYYY-MM-DD
 * @returns {number} Количество дней от сегодня
 */
export function getDaysUntilExpiration(dateStr) {
  // Используем UTC для консистентности между часовыми поясами
  // ЗАЧЕМ: Пользователи в разных часовых поясах должны видеть одинаковые результаты
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  
  // Парсим дату экспирации как UTC (YYYY-MM-DD)
  const [year, month, day] = dateStr.split('-').map(Number);
  const expDateUTC = Date.UTC(year, month - 1, day); // month - 1, т.к. месяцы 0-indexed
  
  const diffTime = expDateUTC - todayUTC;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Получает ВСЕ даты экспирации в диапазоне от minDays до maxDays
 * ЗАЧЕМ: Анализируем все доступные даты, а не только фиксированные периоды
 * Это даёт больше вариантов для подбора и стабильные результаты
 * 
 * @param {string} ticker - Тикер инструмента
 * @param {number} minDays - Минимальное количество дней (обычно daysAfterEntry + 1)
 * @param {number} maxDays - Максимальное количество дней (дистанция просмотра)
 * @returns {Promise<{date: string, daysUntil: number}[]>} Массив объектов с датами
 */
export async function getAllExpirationDatesInRange(ticker, minDays = 1, maxDays = MAX_DAYS_AHEAD) {
  try {
    // Получаем все даты экспирации через существующий apiClient
    const response = await apiClient.getExpirationDates(ticker);
    const allDates = response?.dates || response || [];
    
    if (!allDates || allDates.length === 0) {
      console.warn(`[AISelector] Нет дат экспирации для ${ticker}`);
      return [];
    }
    
    console.log(`[AISelector] Получено ${allDates.length} дат экспирации для ${ticker}:`, allDates.slice(0, 5));
    
    // Фильтруем даты: > minDays и <= maxDays
    const result = [];
    
    for (const date of allDates) {
      const daysUntil = getDaysUntilExpiration(date);
      
      // Логируем первые несколько дат для отладки
      if (result.length < 3) {
        console.log(`[AISelector] Дата ${date}: ${daysUntil} дней, диапазон ${minDays + 1}-${maxDays}`);
      }
      
      // Пропускаем даты вне диапазона
      if (daysUntil <= minDays || daysUntil > maxDays) continue;
      
      result.push({
        date,
        daysUntil
      });
    }
    
    // Сортируем по дате (ближайшие сначала)
    result.sort((a, b) => a.daysUntil - b.daysUntil);
    
    console.log(`[AISelector] Отфильтровано ${result.length} дат в диапазоне ${minDays + 1}-${maxDays} дней`);
    
    return result;
    
  } catch (error) {
    console.error('[AISelector] Ошибка получения дат экспирации:', error);
    throw error;
  }
}

// ============================================================================
// РАБОТА СО СТРАЙКАМИ
// ============================================================================

/**
 * Фильтрует страйки в диапазоне ±20% от текущей цены
 * ЗАЧЕМ: Отсекаем слишком далёкие страйки, которые не подходят для защиты
 * @param {number[]} strikes - Массив страйков
 * @param {number} currentPrice - Текущая цена актива
 * @returns {number[]} Отфильтрованные страйки
 */
export function filterStrikesByRange(strikes, currentPrice) {
  if (!strikes || strikes.length === 0 || !currentPrice) return [];
  
  const minStrike = currentPrice * (1 - STRIKE_RANGE_PERCENT / 100);
  const maxStrike = currentPrice * (1 + STRIKE_RANGE_PERCENT / 100);
  
  return strikes.filter(strike => strike >= minStrike && strike <= maxStrike);
}

/**
 * Получает опционную цепочку для даты экспирации и фильтрует PUT опционы
 * ЗАЧЕМ: Загружает данные опционов и выбирает только PUT в нужном диапазоне страйков
 * @param {string} ticker - Тикер инструмента
 * @param {string} expirationDate - Дата экспирации (YYYY-MM-DD)
 * @param {number} currentPrice - Текущая цена актива
 * @returns {Promise<{strike: number, premium: number, bid: number, ask: number}[]>} Массив PUT опционов
 */
export async function getPutOptionsForExpiration(ticker, expirationDate, currentPrice) {
  try {
    // Получаем опционную цепочку через существующий apiClient
    const response = await apiClient.getOptionsChain(ticker, expirationDate);
    const options = response?.options || response || [];
    
    if (!options || options.length === 0) {
      console.warn(`[AISelector] Нет опционов для ${ticker} на ${expirationDate}`);
      return [];
    }
    
    // Фильтруем только PUT опционы (проверяем разные форматы)
    const putOptions = options.filter(opt => {
      const type = (opt.option_type || opt.type || opt.optionType || '').toLowerCase();
      return type === 'put';
    });
    
    console.log(`[AISelector] Найдено ${putOptions.length} PUT опционов для ${expirationDate}`);
    
    // Фильтруем по диапазону страйков
    const minStrike = currentPrice * (1 - STRIKE_RANGE_PERCENT / 100);
    const maxStrike = currentPrice * (1 + STRIKE_RANGE_PERCENT / 100);
    
    const filteredPuts = putOptions.filter(opt => {
      const strike = opt.strike || opt.strikePrice;
      return strike >= minStrike && strike <= maxStrike;
    });
    
    console.log(`[AISelector] После фильтрации по диапазону: ${filteredPuts.length} PUT опционов`);
    
    // Нормализуем формат данных
    // ЛОГИРОВАНИЕ: Проверяем наличие bid/ask в данных API
    const normalizedPuts = filteredPuts.map(opt => {
      // Премия: приоритет last > close > mid(bid,ask)
      const bid = opt.bid || 0;
      const ask = opt.ask || 0;
      const mid = (bid && ask) ? (bid + ask) / 2 : 0;
      const premium = opt.last || opt.lastPrice || opt.close || mid || 0;
      const strike = opt.strike || opt.strikePrice;
      
      return {
        strike,
        premium,
        bid,
        ask,
        volume: opt.volume || 0,
        openInterest: opt.openInterest || opt.open_interest || opt.oi || 0,
        iv: opt.impliedVolatility || opt.implied_volatility || opt.iv || 0,
        delta: opt.delta || 0,
        gamma: opt.gamma || 0,
        theta: opt.theta || 0,
        vega: opt.vega || 0
      };
    });
    
    // ЛОГИРОВАНИЕ: Выводим первые 3 опциона с bid/ask/iv для диагностики
    const samplePuts = normalizedPuts.slice(0, 3);
    console.log(`[AISelector] 📊 BID/ASK/IV данные для ${expirationDate} (первые ${samplePuts.length} PUT):`);
    samplePuts.forEach(p => {
      console.log(`  Strike $${p.strike}: BID=$${p.bid.toFixed(2)}, ASK=$${p.ask.toFixed(2)}, Premium=$${p.premium.toFixed(2)}, IV=${p.iv} (raw)`);
    });
    
    // Проверяем сколько опционов имеют bid/ask
    const withBidAsk = normalizedPuts.filter(p => p.bid > 0 && p.ask > 0).length;
    const withoutBidAsk = normalizedPuts.length - withBidAsk;
    if (withoutBidAsk > 0) {
      console.warn(`[AISelector] ⚠️ ${withoutBidAsk} из ${normalizedPuts.length} PUT опционов БЕЗ bid/ask данных!`);
    } else {
      console.log(`[AISelector] ✅ Все ${normalizedPuts.length} PUT опционов имеют bid/ask данные`);
    }
    
    return normalizedPuts;
    
  } catch (error) {
    console.error(`[AISelector] Ошибка получения опционов для ${expirationDate}:`, error);
    throw error;
  }
}

/**
 * Получает ВСЕ PUT опционы для ВСЕХ дат экспирации в заданном диапазоне
 * ЗАЧЕМ: Анализируем все доступные опционы, а не только фиксированные периоды
 * @param {string} ticker - Тикер инструмента
 * @param {number} currentPrice - Текущая цена актива
 * @param {number} daysAfterEntry - Дней после входа (для фильтрации минимальной даты)
 * @param {number} maxDaysAhead - Дистанция просмотра в днях (максимальная дата экспирации)
 * @returns {Promise<{date: string, daysUntil: number, puts: array}[]>} Массив данных по датам
 */
export async function getAllPutOptionsForAnalysis(ticker, currentPrice, daysAfterEntry = 0, maxDaysAhead = MAX_DAYS_AHEAD) {
  // Шаг 1: Получаем ВСЕ даты экспирации в диапазоне
  // Минимальная дата = daysAfterEntry (опцион должен жить дольше чем планируемый выход)
  const expirationDates = await getAllExpirationDatesInRange(ticker, daysAfterEntry, maxDaysAhead);
  
  if (expirationDates.length === 0) {
    throw new Error(`Не найдены даты экспирации в диапазоне ${daysAfterEntry + 1}-${maxDaysAhead} дней`);
  }
  
  console.log(`[AISelector] Загружаем опционы для ${expirationDates.length} дат экспирации...`);
  
  // Шаг 2: Параллельно загружаем PUT опционы для всех дат
  // ЗАЧЕМ: Ускоряем загрузку при большом количестве дат
  const promises = expirationDates.map(async (expData) => {
    try {
      const puts = await getPutOptionsForExpiration(ticker, expData.date, currentPrice);
      return {
        date: expData.date,
        daysUntil: expData.daysUntil,
        puts
      };
    } catch (error) {
      console.warn(`[AISelector] Ошибка для ${expData.date}:`, error.message);
      return null; // Пропускаем ошибочные даты
    }
  });
  
  const results = await Promise.all(promises);
  
  // Фильтруем null и пустые результаты
  const validResults = results.filter(r => r !== null && r.puts.length > 0);
  
  console.log(`[AISelector] Загружено ${validResults.length} дат с PUT опционами`);
  
  return validResults;
}

// ============================================================================
// РАСЧЁТ P&L И ФИЛЬТРАЦИЯ ПО КРИТЕРИЮ РИСКА
// ============================================================================

/**
 * Рассчитывает P&L позиции базового актива при целевой цене
 * ЗАЧЕМ: Определяем убыток/прибыль от движения цены
 * @param {number} entryPrice - Цена входа в позицию
 * @param {number} targetPrice - Целевая цена
 * @param {number} quantity - Количество (положительное для LONG, отрицательное для SHORT)
 * @returns {number} P&L в долларах
 */
export function calculatePositionPL(entryPrice, targetPrice, quantity) {
  // Для LONG: прибыль если цена выросла, убыток если упала
  // Для SHORT: прибыль если цена упала, убыток если выросла
  return (targetPrice - entryPrice) * quantity;
}

/**
 * Рассчитывает P&L BuyPUT опциона используя Black-Scholes (как в калькуляторе)
 * ЗАЧЕМ: Согласованность расчётов между ИИ подбором и калькулятором
 * ВАЖНО: Использует getOptionVolatility для единого источника волатильности с таблицей
 * 
 * @param {Object} putOption - Объект опциона в формате калькулятора
 * @param {number} targetPrice - Целевая цена базового актива
 * @param {number} daysRemaining - Дней до экспирации на момент выхода
 * @param {number} currentDaysToExpiration - Текущее кол-во дней до экспирации (для расчёта IV)
 * @returns {number} P&L в долларах
 */
export function calculatePutPLBlackScholes(putOption, targetPrice, daysRemaining, currentDaysToExpiration = null) {
  // Используем getOptionVolatility как в таблице опционов
  // ЗАЧЕМ: Единый источник волатильности для согласованности P/L
  const currentDays = currentDaysToExpiration !== null ? currentDaysToExpiration : daysRemaining;
  const optionVolatility = getOptionVolatility(putOption, currentDays, daysRemaining);
  
  // ЛОГИРОВАНИЕ: Выводим волатильность для диагностики
  const rawIV = putOption.impliedVolatility || putOption.implied_volatility || putOption.iv;
  console.log(`[AISelector] 📈 calculatePutPLBlackScholes: Strike $${putOption.strike}, rawIV=${rawIV}, IV=${optionVolatility.toFixed(1)}%, currentDays=${currentDays}, daysRemaining=${daysRemaining}, targetPrice=$${targetPrice}`);
  
  // Используем ту же функцию что и калькулятор, передавая волатильности явно
  const pl = calculateOptionPLValue(putOption, targetPrice, targetPrice, daysRemaining, optionVolatility);
  console.log(`[AISelector] 📈 calculatePutPLBlackScholes: P/L=$${pl.toFixed(2)}`);
  return pl;
}

/**
 * Рассчитывает комбинированный P&L (позиция + PUT опцион) на дату выхода
 * ЗАЧЕМ: Оценка эффективности защиты с использованием Black-Scholes
 * @param {Object} params - Параметры расчёта
 * @returns {number} Комбинированный P&L
 */
export function calculateCombinedPL({
  entryPrice,
  targetPrice,
  positionQuantity,
  putOption,
  daysRemaining = 0,
  currentDaysToExpiration = null // Текущее кол-во дней до экспирации для расчёта IV
}) {
  // P&L позиции базового актива
  const positionPL = calculatePositionPL(entryPrice, targetPrice, positionQuantity);
  
  // P&L опциона через Black-Scholes (как в калькуляторе)
  const putPL = calculatePutPLBlackScholes(putOption, targetPrice, daysRemaining, currentDaysToExpiration);
  
  return positionPL + putPL;
}

/**
 * Проверяет, соответствует ли PUT опцион критериям риска на дату выхода
 * ЗАЧЕМ: Фильтрация опционов по двум критериям:
 *   - По низу (targetDownPrice): общий риск = позиция + опцион
 *   - По верху (targetUpPrice): риск опциона = только стоимость премии
 * ВАЖНО: Использует Black-Scholes для согласованности с калькулятором
 * 
 * @param {Object} params - Параметры проверки
 * @returns {Object} Результат проверки с деталями
 */
export function checkRiskCriteria({
  entryPrice,
  positionQuantity,
  putData, // Данные опциона из API
  targetUpPrice,
  targetDownPrice,
  maxRiskPercent, // Общий риск, % (для расчётов по низу)
  optionRiskPercent, // Риск опциона, % (для расчётов по верху)
  daysUntilExpiration,
  daysAfterEntry
}) {
  // Стоимость позиции базового актива
  const positionValue = Math.abs(entryPrice * positionQuantity);
  
  // Количество контрактов (1 контракт на 100 акций)
  const putContracts = Math.abs(positionQuantity) / 100;
  // Цена входа: ASK для Buy (fallback на premium)
  const entryPriceOption = putData.ask > 0 ? putData.ask : putData.premium;
  const premiumCost = entryPriceOption * 100 * putContracts;
  
  // ЛОГИРОВАНИЕ: Проверяем bid/ask при расчёте риска
  // ЗАЧЕМ: Диагностика расхождений P/L между подбором и таблицей
  console.log(`[AISelector] 💰 checkRiskCriteria Strike $${putData.strike}: BID=$${putData.bid?.toFixed(2) || 'N/A'}, ASK=$${putData.ask?.toFixed(2) || 'N/A'}, Premium=$${putData.premium?.toFixed(2) || 'N/A'}, EntryPrice=$${entryPriceOption.toFixed(2)}`);
  
  // Общая стоимость (позиция + премия) — для расчёта общего риска по низу
  const totalValue = positionValue + premiumCost;
  
  // Дней до экспирации на момент выхода
  const daysRemaining = Math.max(0, daysUntilExpiration - daysAfterEntry);
  
  // Создаём объект опциона в формате калькулятора для Black-Scholes
  // ЗАЧЕМ: Передаём ask/bid для корректного расчёта цены входа
  const putOption = {
    type: 'PUT',
    action: 'Buy',
    strike: putData.strike,
    premium: putData.premium,
    ask: putData.ask,
    bid: putData.bid,
    quantity: putContracts,
    impliedVolatility: putData.iv || 0.3
  };
  
  // P&L при цене "Цель вниз" на дату выхода (через Black-Scholes)
  // ЗАЧЕМ: Оценка защиты при падении цены — учитываем позицию + опцион
  // ВАЖНО: Передаём daysUntilExpiration как currentDaysToExpiration для корректного расчёта IV
  const plAtTargetDown = calculateCombinedPL({
    entryPrice,
    targetPrice: targetDownPrice,
    positionQuantity,
    putOption,
    daysRemaining,
    currentDaysToExpiration: daysUntilExpiration
  });
  
  // P&L при цене "Цель вверх" на дату выхода (через Black-Scholes)
  // ЗАЧЕМ: Оценка стоимости защиты при росте цены — учитываем позицию + опцион
  const plAtTargetUp = calculateCombinedPL({
    entryPrice,
    targetPrice: targetUpPrice,
    positionQuantity,
    putOption,
    daysRemaining,
    currentDaysToExpiration: daysUntilExpiration
  });
  
  // P&L только опциона (без позиции базового актива)
  // ЗАЧЕМ: Показать отдельно прибыль/убыток от опциона
  const optionOnlyPLDown = calculatePutPLBlackScholes(putOption, targetDownPrice, daysRemaining, daysUntilExpiration);
  const optionOnlyPLUp = calculatePutPLBlackScholes(putOption, targetUpPrice, daysRemaining, daysUntilExpiration);
  
  // === КРИТЕРИЙ 1: Общий риск по низу ===
  // Максимально допустимый убыток от общей стоимости (позиция + премия)
  const maxAllowedLossDown = totalValue * (maxRiskPercent / 100);
  // Проверяем: убыток при падении не должен превышать допустимый
  const meetsDownRiskCriteria = plAtTargetDown >= 0 || Math.abs(plAtTargetDown) <= maxAllowedLossDown;
  
  // === КРИТЕРИЙ 2: Риск опциона по верху ===
  // ЗАЧЕМ: При росте цены проверяем убыток ТОЛЬКО по опциону (не по всей позиции)
  // Максимально допустимый убыток опциона как % от стоимости позиции
  const maxAllowedOptionLoss = positionValue * (optionRiskPercent / 100);
  // optionOnlyPLUp — это P&L опциона при целевой цене вверх (обычно отрицательный)
  // Проверяем: убыток опциона не должен превышать допустимый %
  const optionLossUp = optionOnlyPLUp < 0 ? Math.abs(optionOnlyPLUp) : 0;
  const meetsUpRiskCriteria = optionLossUp <= maxAllowedOptionLoss;
  
  // Опцион подходит, если соответствует ОБОИМ критериям
  const meetsRiskCriteria = meetsDownRiskCriteria && meetsUpRiskCriteria;
  
  // Риск в % для отображения в таблице
  const riskPercentDown = plAtTargetDown < 0 ? (Math.abs(plAtTargetDown) / totalValue) * 100 : 0;
  // Риск опциона по верху = фактический убыток опциона как % от позиции
  const riskPercentUp = optionLossUp > 0 ? (optionLossUp / positionValue) * 100 : 0;
  
  return {
    meetsRiskCriteria,
    meetsDownRiskCriteria,
    meetsUpRiskCriteria,
    positionValue,
    premiumCost,
    totalValue,
    maxAllowedLossDown,
    maxAllowedOptionLoss,
    plAtTargetDown,
    plAtTargetUp,
    optionOnlyPLDown, // P&L только опциона при падении
    optionOnlyPLUp, // P&L только опциона при росте
    riskPercent: riskPercentDown, // Общий риск по низу для таблицы
    optionRiskPercentActual: riskPercentUp, // Фактический риск опциона по верху
    daysRemaining
  };
}

/**
 * Фильтрует PUT опционы по критерию риска и ликвидности, ранжирует результаты
 * ЗАЧЕМ: Основная функция подбора — выбирает лучшие опционы для защиты на дату выхода
 * @param {Object} params - Параметры подбора
 * @returns {Array} Отсортированный массив подходящих опционов
 */
export function filterAndRankPutOptions({
  optionsData,
  entryPrice,
  positionQuantity,
  targetUpPrice,
  targetDownPrice,
  maxRiskPercent, // Общий риск, % (для расчётов по низу)
  optionRiskPercent = 2, // Риск опциона, % (для расчётов по верху)
  daysAfterEntry = 5,
  filterByLiquidity = false,
  minOpenInterest = 100,
  onlyBalanced = false, // Только балансные: Опцион P&L↑ ≈ Общий P&L↓
  balanceTolerance = 10 // Погрешность балансировки, %
}) {
  const results = [];
  
  for (const expData of optionsData) {
    // Пропускаем опционы с экспирацией раньше даты выхода
    if (expData.daysUntil <= daysAfterEntry) {
      console.log(`[AISelector] Пропускаем ${expData.date}: экспирация (${expData.daysUntil}д) <= дней после входа (${daysAfterEntry}д)`);
      continue;
    }
    
    for (const put of expData.puts) {
      // Пропускаем опционы без премии
      if (!put.premium || put.premium <= 0) continue;
      
      // Фильтр по ликвидности (OI)
      if (filterByLiquidity && (put.openInterest || 0) < minOpenInterest) {
        continue;
      }
      
      // Проверяем критерии риска на дату выхода (используем Black-Scholes)
      // ЗАЧЕМ: Два критерия — общий риск по низу и риск опциона по верху
      const riskCheck = checkRiskCriteria({
        entryPrice,
        positionQuantity,
        putData: put, // Передаём весь объект опциона
        targetUpPrice,
        targetDownPrice,
        maxRiskPercent, // Общий риск по низу
        optionRiskPercent, // Риск опциона по верху
        daysUntilExpiration: expData.daysUntil,
        daysAfterEntry
      });
      
      if (riskCheck.meetsRiskCriteria) {
        // Фильтр "Только балансные": Опцион P&L↑ и Общий P&L↓ совпадают с погрешностью 10%
        // ЗАЧЕМ: Показываем опционы, где прибыль опциона при росте балансирует общий убыток при падении
        if (onlyBalanced) {
          const optionPLUp = Math.abs(riskCheck.optionOnlyPLUp);
          const totalPLDown = Math.abs(riskCheck.plAtTargetDown);
          
          // Проверяем совпадение с заданной погрешностью
          // Если одно из значений 0, проверяем что оба близки к 0
          const maxVal = Math.max(optionPLUp, totalPLDown);
          if (maxVal > 0) {
            const diff = Math.abs(optionPLUp - totalPLDown);
            const tolerance = maxVal * (balanceTolerance / 100); // Погрешность из параметра
            if (diff > tolerance) {
              continue; // Не балансный, пропускаем
            }
          }
        }
        
        results.push({
          expirationDate: expData.date,
          daysUntil: expData.daysUntil,
          strike: put.strike,
          premium: put.premium,
          bid: put.bid,
          ask: put.ask,
          volume: put.volume,
          openInterest: put.openInterest,
          delta: put.delta,
          iv: put.iv,
          ...riskCheck
        });
      }
    }
  }
  
  // Сортируем по эффективности защиты
  // ЗАЧЕМ: Выбираем опционы с лучшим соотношением защиты и стоимости
  results.sort((a, b) => {
    // Приоритет 1: Меньший риск по низу (лучшая защита при падении)
    if (a.riskPercent !== b.riskPercent) return a.riskPercent - b.riskPercent;
    
    // Приоритет 2: Меньшая премия (дешевле защита)
    if (a.premiumCost !== b.premiumCost) return a.premiumCost - b.premiumCost;
    
    // Приоритет 3: Выше ликвидность (OI) — при прочих равных
    return (b.openInterest || 0) - (a.openInterest || 0);
  });
  
  return results;
}

// ============================================================================
// ПОДБОР BuyCALL (КОМПЕНСАЦИЯ)
// ============================================================================

/**
 * Получает CALL опционы для указанной даты экспирации
 * ЗАЧЕМ: Аналог getPutOptionsForExpiration для CALL опционов
 * @param {string} ticker - Тикер инструмента
 * @param {string} expirationDate - Дата экспирации (YYYY-MM-DD)
 * @param {number} currentPrice - Текущая цена актива
 * @returns {Promise<Array>} Массив CALL опционов
 */
export async function getCallOptionsForExpiration(ticker, expirationDate, currentPrice) {
  try {
    const response = await apiClient.getOptionsChain(ticker, expirationDate);
    const options = response?.options || response || [];
    
    // Фильтруем только CALL опционы
    const callOptions = options.filter(opt => {
      const type = (opt.option_type || opt.type || opt.optionType || '').toLowerCase();
      return type === 'call';
    });
    
    console.log(`[AISelector] Найдено ${callOptions.length} CALL опционов для ${expirationDate}`);
    
    // Фильтруем по диапазону страйков (±20% от текущей цены)
    const minStrike = currentPrice * (1 - STRIKE_RANGE_PERCENT / 100);
    const maxStrike = currentPrice * (1 + STRIKE_RANGE_PERCENT / 100);
    
    const filteredCalls = callOptions.filter(opt => {
      const strike = opt.strike || opt.strikePrice;
      return strike >= minStrike && strike <= maxStrike;
    });
    
    // Нормализуем формат данных
    // ЛОГИРОВАНИЕ: Проверяем наличие bid/ask в данных API
    const normalizedCalls = filteredCalls.map(opt => {
      const bid = opt.bid || 0;
      const ask = opt.ask || 0;
      const mid = (bid && ask) ? (bid + ask) / 2 : 0;
      const premium = opt.last || opt.lastPrice || opt.close || mid || 0;
      const strike = opt.strike || opt.strikePrice;
      
      return {
        strike,
        premium,
        bid,
        ask,
        volume: opt.volume || 0,
        openInterest: opt.openInterest || opt.open_interest || opt.oi || 0,
        iv: opt.impliedVolatility || opt.implied_volatility || opt.iv || 0,
        delta: opt.delta || 0,
        gamma: opt.gamma || 0,
        theta: opt.theta || 0,
        vega: opt.vega || 0
      };
    });
    
    // ЛОГИРОВАНИЕ: Выводим первые 3 опциона с bid/ask для диагностики
    const sampleCalls = normalizedCalls.slice(0, 3);
    console.log(`[AISelector] 📊 BID/ASK данные для ${expirationDate} (первые ${sampleCalls.length} CALL):`);
    sampleCalls.forEach(c => {
      console.log(`  Strike $${c.strike}: BID=$${c.bid.toFixed(2)}, ASK=$${c.ask.toFixed(2)}, Premium=$${c.premium.toFixed(2)}`);
    });
    
    // Проверяем сколько опционов имеют bid/ask
    const withBidAsk = normalizedCalls.filter(c => c.bid > 0 && c.ask > 0).length;
    const withoutBidAsk = normalizedCalls.length - withBidAsk;
    if (withoutBidAsk > 0) {
      console.warn(`[AISelector] ⚠️ ${withoutBidAsk} из ${normalizedCalls.length} CALL опционов БЕЗ bid/ask данных!`);
    } else {
      console.log(`[AISelector] ✅ Все ${normalizedCalls.length} CALL опционов имеют bid/ask данные`);
    }
    
    return normalizedCalls;
    
  } catch (error) {
    console.error(`[AISelector] Ошибка получения CALL опционов для ${expirationDate}:`, error);
    throw error;
  }
}

/**
 * Получает ВСЕ CALL опционы для ВСЕХ дат экспирации в заданном диапазоне
 * ЗАЧЕМ: Аналог getAllPutOptionsForAnalysis для CALL опционов
 * @param {string} ticker - Тикер инструмента
 * @param {number} currentPrice - Текущая цена актива
 * @param {number} daysAfterEntry - Дней после входа
 * @param {number} maxDaysAhead - Дистанция просмотра в днях
 * @returns {Promise<Array>} Массив данных по датам с CALL опционами
 */
export async function getAllCallOptionsForAnalysis(ticker, currentPrice, daysAfterEntry = 0, maxDaysAhead = MAX_DAYS_AHEAD) {
  const expirationDates = await getAllExpirationDatesInRange(ticker, daysAfterEntry, maxDaysAhead);
  
  if (expirationDates.length === 0) {
    // Диагностика: проверяем какие даты вообще доступны
    console.warn(`[AISelector] CALL: Нет дат в диапазоне ${daysAfterEntry + 1}-${maxDaysAhead} дней`);
    throw new Error(`Не найдены даты экспирации для CALL в диапазоне ${daysAfterEntry + 1}-${maxDaysAhead} дней. Попробуйте увеличить "Дистанция просмотра" или уменьшить "Дней после входа".`);
  }
  
  console.log(`[AISelector] Загружаем CALL опционы для ${expirationDates.length} дат экспирации...`);
  
  const promises = expirationDates.map(async (expData) => {
    try {
      const calls = await getCallOptionsForExpiration(ticker, expData.date, currentPrice);
      return {
        date: expData.date,
        daysUntil: expData.daysUntil,
        calls
      };
    } catch (error) {
      console.warn(`[AISelector] Ошибка для ${expData.date}:`, error.message);
      return null;
    }
  });
  
  const results = await Promise.all(promises);
  return results.filter(r => r !== null && r.calls.length > 0);
}

/**
 * Рассчитывает P&L BuyCALL опциона используя Black-Scholes
 * ЗАЧЕМ: Согласованность расчётов с калькулятором
 * ВАЖНО: Использует getOptionVolatility для единого источника волатильности с таблицей
 * @param {Object} callOption - Объект опциона в формате калькулятора
 * @param {number} targetPrice - Целевая цена базового актива
 * @param {number} daysRemaining - Дней до экспирации на момент выхода
 * @param {number} currentDaysToExpiration - Текущее кол-во дней до экспирации (для расчёта IV)
 * @returns {number} P&L в долларах
 */
export function calculateCallPLBlackScholes(callOption, targetPrice, daysRemaining, currentDaysToExpiration = null) {
  // Используем getOptionVolatility как в таблице опционов
  // ЗАЧЕМ: Единый источник волатильности для согласованности P/L
  const currentDays = currentDaysToExpiration !== null ? currentDaysToExpiration : daysRemaining;
  const optionVolatility = getOptionVolatility(callOption, currentDays, daysRemaining);
  
  // ЛОГИРОВАНИЕ: Выводим волатильность для диагностики
  console.log(`[AISelector] 📈 calculateCallPLBlackScholes: Strike $${callOption.strike}, IV=${optionVolatility.toFixed(1)}%, daysRemaining=${daysRemaining}, currentDays=${currentDays}, targetPrice=$${targetPrice}`);
  
  // Используем ту же функцию что и калькулятор, передавая волатильность явно
  const result = calculateOptionPLValue(callOption, targetPrice, targetPrice, daysRemaining, optionVolatility);
  const pl = typeof result === 'number' && !isNaN(result) ? result : 0;
  console.log(`[AISelector] 📈 calculateCallPLBlackScholes: P/L=$${pl.toFixed(2)}`);
  return pl;
}

/**
 * Проверяет, соответствует ли CALL опцион критериям компенсации относительно PUT
 * ЗАЧЕМ: BuyCALL должен компенсировать потери от BuyPUT при росте актива
 * 
 * Критерии:
 * 1. При росте (targetUpPrice): прибыль CALL ≥ |убыток PUT|
 * 2. При падении (targetDownPrice): |убыток CALL| ≤ прибыль PUT
 * 
 * @param {Object} params - Параметры проверки
 * @returns {Object} Результат проверки с деталями
 */
export function checkCallCompensationCriteria({
  callData,           // Данные CALL опциона
  putPLAtUp,          // P&L PUT опциона при росте (обычно отрицательный)
  putPLAtDown,        // P&L PUT опциона при падении (обычно положительный)
  targetUpPrice,
  targetDownPrice,
  daysUntilExpiration,
  daysAfterEntry,
  positionQuantity
}) {
  // Количество контрактов (1 контракт на 100 акций)
  const callContracts = Math.abs(positionQuantity) / 100;
  // Цена входа: ASK для Buy (fallback на premium)
  const entryPriceOption = callData.ask > 0 ? callData.ask : callData.premium;
  const premiumCost = entryPriceOption * 100 * callContracts;
  
  // Дней до экспирации на момент выхода
  const daysRemaining = Math.max(0, daysUntilExpiration - daysAfterEntry);
  
  // Создаём объект опциона в формате калькулятора для Black-Scholes
  // ЗАЧЕМ: Передаём ask/bid для корректного расчёта цены входа
  const callOption = {
    type: 'CALL',
    action: 'Buy',
    strike: callData.strike,
    premium: callData.premium,
    ask: callData.ask,
    bid: callData.bid,
    quantity: callContracts,
    impliedVolatility: callData.iv || 0.3
  };
  
  // P&L CALL опциона при росте цены
  // ВАЖНО: Передаём daysUntilExpiration как currentDaysToExpiration для корректного расчёта IV
  const callPLAtUp = calculateCallPLBlackScholes(callOption, targetUpPrice, daysRemaining, daysUntilExpiration);
  
  // P&L CALL опциона при падении цены
  const callPLAtDown = calculateCallPLBlackScholes(callOption, targetDownPrice, daysRemaining, daysUntilExpiration);
  
  // === КРИТЕРИЙ 1: При росте прибыль CALL ≥ |убыток PUT| ===
  // putPLAtUp обычно отрицательный (убыток PUT при росте)
  const putLossAtUp = Math.abs(Math.min(0, putPLAtUp));
  const meetsUpCriteria = callPLAtUp >= putLossAtUp;
  
  // === КРИТЕРИЙ 2: При падении |убыток CALL| ≤ прибыль PUT ===
  // putPLAtDown обычно положительный (прибыль PUT при падении)
  const putProfitAtDown = Math.max(0, putPLAtDown);
  const callLossAtDown = Math.abs(Math.min(0, callPLAtDown));
  const meetsDownCriteria = callLossAtDown <= putProfitAtDown;
  
  // Опцион подходит, если соответствует ОБОИМ критериям
  const meetsCompensationCriteria = meetsUpCriteria && meetsDownCriteria;
  
  // Эффективность компенсации (насколько хорошо CALL компенсирует PUT)
  // При росте: соотношение прибыли CALL к убытку PUT (чем больше, тем лучше)
  const compensationRatioUp = putLossAtUp > 0 ? callPLAtUp / putLossAtUp : (callPLAtUp > 0 ? Infinity : 0);
  // При падении: соотношение убытка CALL к прибыли PUT (чем меньше, тем лучше)
  const lossRatioDown = putProfitAtDown > 0 ? callLossAtDown / putProfitAtDown : (callLossAtDown > 0 ? Infinity : 0);
  
  return {
    meetsCompensationCriteria,
    meetsUpCriteria,
    meetsDownCriteria,
    premiumCost,
    callPLAtUp,
    callPLAtDown,
    putPLAtUp,
    putPLAtDown,
    putLossAtUp,
    putProfitAtDown,
    callLossAtDown,
    compensationRatioUp,
    lossRatioDown,
    daysRemaining
  };
}

/**
 * Фильтрует CALL опционы по критериям компенсации относительно PUT
 * ЗАЧЕМ: Подбирает CALL опционы, которые компенсируют потери от BuyPUT при росте
 * 
 * @param {Object} params - Параметры подбора
 * @returns {Array} Отсортированный массив подходящих CALL опционов
 */
export function filterAndRankCallOptions({
  optionsData,        // Данные CALL опционов по датам
  putPLAtUp,          // P&L PUT опциона при росте
  putPLAtDown,        // P&L PUT опциона при падении
  targetUpPrice,
  targetDownPrice,
  daysAfterEntry = 5,
  positionQuantity,
  filterByLiquidity = false,
  minOpenInterest = 100,
  requireBreakevenAtDown = false // Безубыток опциона по низу (P&L >= 0 при падении)
}) {
  const results = [];
  
  for (const expData of optionsData) {
    // Пропускаем опционы с экспирацией раньше даты выхода
    if (expData.daysUntil <= daysAfterEntry) {
      continue;
    }
    
    for (const call of expData.calls) {
      // Пропускаем опционы без премии
      if (!call.premium || call.premium <= 0) continue;
      
      // Фильтр по ликвидности (OI)
      if (filterByLiquidity && (call.openInterest || 0) < minOpenInterest) {
        continue;
      }
      
      // Проверяем критерии компенсации
      const compensationCheck = checkCallCompensationCriteria({
        callData: call,
        putPLAtUp,
        putPLAtDown,
        targetUpPrice,
        targetDownPrice,
        daysUntilExpiration: expData.daysUntil,
        daysAfterEntry,
        positionQuantity
      });
      
      if (compensationCheck.meetsCompensationCriteria) {
        // Фильтр "Безубыток опциона по низу": P&L CALL при падении >= 0
        if (requireBreakevenAtDown && compensationCheck.callPLAtDown < 0) {
          continue;
        }
        
        results.push({
          expirationDate: expData.date,
          daysUntil: expData.daysUntil,
          strike: call.strike,
          premium: call.premium,
          bid: call.bid,
          ask: call.ask,
          volume: call.volume,
          openInterest: call.openInterest,
          delta: call.delta,
          iv: call.iv,
          ...compensationCheck
        });
      }
    }
  }
  
  // Сортируем по эффективности компенсации
  results.sort((a, b) => {
    // Приоритет 1: Лучшая компенсация при росте (больше = лучше)
    if (a.compensationRatioUp !== b.compensationRatioUp) {
      return b.compensationRatioUp - a.compensationRatioUp;
    }
    
    // Приоритет 2: Меньший убыток при падении (меньше = лучше)
    if (a.lossRatioDown !== b.lossRatioDown) {
      return a.lossRatioDown - b.lossRatioDown;
    }
    
    // Приоритет 3: Меньшая премия
    if (a.premiumCost !== b.premiumCost) {
      return a.premiumCost - b.premiumCost;
    }
    
    // Приоритет 4: Выше ликвидность
    return (b.openInterest || 0) - (a.openInterest || 0);
  });
  
  return results;
}

/**
 * Находит лучший день выхода для BuyCALL опциона
 * ЗАЧЕМ: Для BuyCALL важнее P&L при РОСТЕ (компенсация потерь PUT)
 * 
 * @param {Object} params - Параметры поиска
 * @returns {Object} Лучший день и P&L
 */
export function findBestExitDayForCall({
  optionData,
  targetUpPrice,
  targetDownPrice,
  maxDaysToCheck = 30
}) {
  const daysUntilExpiration = optionData.daysUntil || 30;
  
  // Создаём объект опциона в формате калькулятора
  const option = {
    type: 'CALL',
    action: 'Buy',
    strike: optionData.strike,
    premium: optionData.premium,
    ask: optionData.ask,
    bid: optionData.bid,
    quantity: 1, // Нормализуем для сравнения
    impliedVolatility: optionData.iv || 0.3,
    implied_volatility: optionData.iv || 0.3
  };
  
  let bestDay = 1;
  let bestPL = -Infinity;
  let bestPLUp = 0;
  let bestPLDown = 0;
  
  const maxDay = Math.min(maxDaysToCheck, daysUntilExpiration - 1);
  
  console.log(`[findBestExitDayForCall] Перебор дней 1-${maxDay} для CALL strike=${optionData.strike}, exp=${daysUntilExpiration}д`);
  
  for (let day = 1; day <= maxDay; day++) {
    const daysRemaining = Math.max(1, daysUntilExpiration - day);
    
    // Используем getOptionVolatility как калькулятор
    const volatility = getOptionVolatility(option, daysUntilExpiration, daysRemaining);
    
    // P&L опциона
    const plUp = calculateOptionPLValue(option, targetUpPrice, targetUpPrice, daysRemaining, volatility);
    const plDown = calculateOptionPLValue(option, targetDownPrice, targetDownPrice, daysRemaining, volatility);
    
    // Критерий для BuyCALL: максимизируем P&L при РОСТЕ
    // ЗАЧЕМ: BuyCALL компенсирует потери PUT при росте актива
    const criterionValue = plUp;
    
    if (criterionValue > bestPL) {
      bestPL = criterionValue;
      bestDay = day;
      bestPLUp = plUp;
      bestPLDown = plDown;
    }
  }
  
  console.log(`[findBestExitDayForCall] Выбран день ${bestDay} с P&L↑=${bestPL.toFixed(2)}`);
  
  return {
    bestExitDay: bestDay,
    bestPL,
    bestPLUp,
    bestPLDown
  };
}

/**
 * Расширенная версия filterAndRankCallOptions с поиском лучшего дня
 * ЗАЧЕМ: При включенном findBestDay перебираем все дни и находим оптимальный для CALL
 */
export function filterAndRankCallOptionsWithBestDay({
  optionsData,
  putPLAtUp,
  putPLAtDown,
  targetUpPrice,
  targetDownPrice,
  positionQuantity,
  filterByLiquidity = false,
  minOpenInterest = 100,
  requireBreakevenAtDown = false,
  maxDaysToCheck = 30
}) {
  const results = [];
  
  for (const expData of optionsData) {
    for (const call of expData.calls) {
      if (!call.premium || call.premium <= 0) continue;
      
      if (filterByLiquidity && (call.openInterest || 0) < minOpenInterest) {
        continue;
      }
      
      // Находим лучший день выхода
      const bestDayResult = findBestExitDayForCall({
        optionData: { ...call, daysUntil: expData.daysUntil },
        targetUpPrice,
        targetDownPrice,
        maxDaysToCheck: Math.min(maxDaysToCheck, expData.daysUntil - 1)
      });
      
      // Проверяем критерии компенсации для лучшего дня
      const compensationCheck = checkCallCompensationCriteria({
        callData: call,
        putPLAtUp,
        putPLAtDown,
        targetUpPrice,
        targetDownPrice,
        daysUntilExpiration: expData.daysUntil,
        daysAfterEntry: bestDayResult.bestExitDay,
        positionQuantity
      });
      
      if (compensationCheck.meetsCompensationCriteria) {
        if (requireBreakevenAtDown && compensationCheck.callPLAtDown < 0) {
          continue;
        }
        
        results.push({
          expirationDate: expData.date,
          daysUntil: expData.daysUntil,
          strike: call.strike,
          premium: call.premium,
          bid: call.bid,
          ask: call.ask,
          volume: call.volume,
          openInterest: call.openInterest,
          delta: call.delta,
          iv: call.iv,
          bestExitDay: bestDayResult.bestExitDay,
          ...compensationCheck
        });
      }
    }
  }
  
  // Сортируем по эффективности компенсации
  results.sort((a, b) => {
    if (a.compensationRatioUp !== b.compensationRatioUp) {
      return b.compensationRatioUp - a.compensationRatioUp;
    }
    if (a.lossRatioDown !== b.lossRatioDown) {
      return a.lossRatioDown - b.lossRatioDown;
    }
    if (a.premiumCost !== b.premiumCost) {
      return a.premiumCost - b.premiumCost;
    }
    return (b.openInterest || 0) - (a.openInterest || 0);
  });
  
  return results;
}

// ============================================================================
// ПОДБОР SellPUT (КОМПЕНСАЦИЯ) — аналог BuyCALL, но с продажей PUT
// ============================================================================

/**
 * Рассчитывает P&L SellPUT опциона используя Black-Scholes
 * ЗАЧЕМ: Sell PUT — получаем премию, но несём риск при падении цены
 * @param {Object} sellPutOption - Объект опциона в формате калькулятора (action: 'Sell')
 * @param {number} targetPrice - Целевая цена базового актива
 * @param {number} daysRemaining - Дней до экспирации на момент выхода
 * @returns {number} P&L в долларах
 */
export function calculateSellPutPLBlackScholes(sellPutOption, targetPrice, daysRemaining) {
  const result = calculateOptionPLValue(sellPutOption, targetPrice, targetPrice, daysRemaining);
  return typeof result === 'number' && !isNaN(result) ? result : 0;
}

/**
 * Проверяет, соответствует ли SellPUT опцион критериям компенсации относительно BuyPUT
 * ЗАЧЕМ: SellPUT должен компенсировать потери от BuyPUT при росте актива
 * 
 * Критерии (аналогичны BuyCALL):
 * 1. При росте (targetUpPrice): прибыль SellPUT ≥ |убыток BuyPUT|
 * 2. При падении (targetDownPrice): |убыток SellPUT| ≤ прибыль BuyPUT
 * 
 * @param {Object} params - Параметры проверки
 * @returns {Object} Результат проверки с деталями
 */
export function checkSellPutCompensationCriteria({
  putData,            // Данные PUT опциона для продажи
  buyPutPLAtUp,       // P&L BuyPUT опциона при росте (обычно отрицательный)
  buyPutPLAtDown,     // P&L BuyPUT опциона при падении (обычно положительный)
  targetUpPrice,
  targetDownPrice,
  daysUntilExpiration,
  daysAfterEntry,
  positionQuantity
}) {
  // Количество контрактов (1 контракт на 100 акций)
  const putContracts = Math.abs(positionQuantity) / 100;
  // Цена входа: BID для Sell (fallback на premium)
  const entryPriceOption = putData.bid > 0 ? putData.bid : putData.premium;
  const premiumReceived = entryPriceOption * 100 * putContracts; // Получаем премию при продаже
  
  // Дней до экспирации на момент выхода
  const daysRemaining = Math.max(0, daysUntilExpiration - daysAfterEntry);
  
  // Создаём объект опциона в формате калькулятора для Black-Scholes
  // ВАЖНО: action = 'Sell' — продаём PUT
  // ЗАЧЕМ: Передаём ask/bid для корректного расчёта цены входа
  const sellPutOption = {
    type: 'PUT',
    action: 'Sell',
    strike: putData.strike,
    premium: putData.premium,
    ask: putData.ask,
    bid: putData.bid,
    quantity: putContracts,
    impliedVolatility: putData.iv || 0.3
  };
  
  // P&L SellPUT опциона при росте цены (обычно положительный — получаем премию)
  const sellPutPLAtUp = calculateSellPutPLBlackScholes(sellPutOption, targetUpPrice, daysRemaining);
  
  // P&L SellPUT опциона при падении цены (может быть отрицательным — убыток)
  const sellPutPLAtDown = calculateSellPutPLBlackScholes(sellPutOption, targetDownPrice, daysRemaining);
  
  // === КРИТЕРИЙ 1: При росте прибыль SellPUT ≥ |убыток BuyPUT| ===
  // buyPutPLAtUp обычно отрицательный (убыток BuyPUT при росте)
  const buyPutLossAtUp = Math.abs(Math.min(0, buyPutPLAtUp));
  const meetsUpCriteria = sellPutPLAtUp >= buyPutLossAtUp;
  
  // === КРИТЕРИЙ 2: При падении |убыток SellPUT| ≤ прибыль BuyPUT ===
  // buyPutPLAtDown обычно положительный (прибыль BuyPUT при падении)
  const buyPutProfitAtDown = Math.max(0, buyPutPLAtDown);
  const sellPutLossAtDown = Math.abs(Math.min(0, sellPutPLAtDown));
  const meetsDownCriteria = sellPutLossAtDown <= buyPutProfitAtDown;
  
  // Опцион подходит, если соответствует ОБОИМ критериям
  const meetsCompensationCriteria = meetsUpCriteria && meetsDownCriteria;
  
  // Эффективность компенсации
  // При росте: соотношение прибыли SellPUT к убытку BuyPUT (чем больше, тем лучше)
  const compensationRatioUp = buyPutLossAtUp > 0 ? sellPutPLAtUp / buyPutLossAtUp : (sellPutPLAtUp > 0 ? Infinity : 0);
  // При падении: соотношение убытка SellPUT к прибыли BuyPUT (чем меньше, тем лучше)
  const lossRatioDown = buyPutProfitAtDown > 0 ? sellPutLossAtDown / buyPutProfitAtDown : (sellPutLossAtDown > 0 ? Infinity : 0);
  
  return {
    meetsCompensationCriteria,
    meetsUpCriteria,
    meetsDownCriteria,
    premiumReceived,
    sellPutPLAtUp,
    sellPutPLAtDown,
    buyPutPLAtUp,
    buyPutPLAtDown,
    buyPutLossAtUp,
    buyPutProfitAtDown,
    sellPutLossAtDown,
    compensationRatioUp,
    lossRatioDown,
    daysRemaining
  };
}

/**
 * Фильтрует PUT опционы для продажи по критериям компенсации относительно BuyPUT
 * ЗАЧЕМ: Подбирает SellPUT опционы, которые компенсируют потери от BuyPUT при росте
 * 
 * @param {Object} params - Параметры подбора
 * @returns {Array} Отсортированный массив подходящих SellPUT опционов
 */
export function filterAndRankSellPutOptions({
  optionsData,        // Данные PUT опционов по датам (используем те же данные что для BuyPUT)
  buyPutPLAtUp,       // P&L BuyPUT опциона при росте
  buyPutPLAtDown,     // P&L BuyPUT опциона при падении
  targetUpPrice,
  targetDownPrice,
  daysAfterEntry = 5,
  positionQuantity,
  filterByLiquidity = false,
  minOpenInterest = 100,
  requireBreakevenAtDown = false // Безубыток опциона по низу (P&L >= 0 при падении)
}) {
  const results = [];
  
  for (const expData of optionsData) {
    // Пропускаем опционы с экспирацией раньше даты выхода
    if (expData.daysUntil <= daysAfterEntry) {
      continue;
    }
    
    for (const put of expData.puts) {
      // Пропускаем опционы без премии
      if (!put.premium || put.premium <= 0) continue;
      
      // Фильтр по ликвидности (OI)
      if (filterByLiquidity && (put.openInterest || 0) < minOpenInterest) {
        continue;
      }
      
      // Проверяем критерии компенсации для SellPUT
      const compensationCheck = checkSellPutCompensationCriteria({
        putData: put,
        buyPutPLAtUp,
        buyPutPLAtDown,
        targetUpPrice,
        targetDownPrice,
        daysUntilExpiration: expData.daysUntil,
        daysAfterEntry,
        positionQuantity
      });
      
      if (compensationCheck.meetsCompensationCriteria) {
        // Фильтр "Безубыток опциона по низу": P&L SellPUT при падении >= 0
        if (requireBreakevenAtDown && compensationCheck.sellPutPLAtDown < 0) {
          continue;
        }
        
        results.push({
          expirationDate: expData.date,
          daysUntil: expData.daysUntil,
          strike: put.strike,
          premium: put.premium,
          bid: put.bid,
          ask: put.ask,
          volume: put.volume,
          openInterest: put.openInterest,
          delta: put.delta,
          iv: put.iv,
          ...compensationCheck
        });
      }
    }
  }
  
  // Сортируем по эффективности компенсации
  results.sort((a, b) => {
    // Приоритет 1: Лучшая компенсация при росте (больше = лучше)
    if (a.compensationRatioUp !== b.compensationRatioUp) {
      return b.compensationRatioUp - a.compensationRatioUp;
    }
    
    // Приоритет 2: Меньший убыток при падении (меньше = лучше)
    if (a.lossRatioDown !== b.lossRatioDown) {
      return a.lossRatioDown - b.lossRatioDown;
    }
    
    // Приоритет 3: Большая премия (получаем больше при продаже)
    if (a.premiumReceived !== b.premiumReceived) {
      return b.premiumReceived - a.premiumReceived;
    }
    
    // Приоритет 4: Выше ликвидность
    return (b.openInterest || 0) - (a.openInterest || 0);
  });
  
  return results;
}

/**
 * Находит лучший день выхода для SellPUT опциона
 * ЗАЧЕМ: Для SellPUT важнее P&L при РОСТЕ (получаем премию)
 * 
 * @param {Object} params - Параметры поиска
 * @returns {Object} Лучший день и P&L
 */
export function findBestExitDayForSellPut({
  optionData,
  targetUpPrice,
  targetDownPrice,
  maxDaysToCheck = 30
}) {
  const daysUntilExpiration = optionData.daysUntil || 30;
  
  // Создаём объект опциона в формате калькулятора
  const option = {
    type: 'PUT',
    action: 'Sell',
    strike: optionData.strike,
    premium: optionData.premium,
    ask: optionData.ask,
    bid: optionData.bid,
    quantity: 1, // Нормализуем для сравнения
    impliedVolatility: optionData.iv || 0.3,
    implied_volatility: optionData.iv || 0.3
  };
  
  let bestDay = 1;
  let bestPL = -Infinity;
  let bestPLUp = 0;
  let bestPLDown = 0;
  
  const maxDay = Math.min(maxDaysToCheck, daysUntilExpiration - 1);
  
  console.log(`[findBestExitDayForSellPut] Перебор дней 1-${maxDay} для SellPUT strike=${optionData.strike}, exp=${daysUntilExpiration}д`);
  
  for (let day = 1; day <= maxDay; day++) {
    const daysRemaining = Math.max(1, daysUntilExpiration - day);
    
    // Используем getOptionVolatility как калькулятор
    const volatility = getOptionVolatility(option, daysUntilExpiration, daysRemaining);
    
    // P&L опциона
    const plUp = calculateOptionPLValue(option, targetUpPrice, targetUpPrice, daysRemaining, volatility);
    const plDown = calculateOptionPLValue(option, targetDownPrice, targetDownPrice, daysRemaining, volatility);
    
    // Критерий для SellPUT: максимизируем P&L при РОСТЕ
    // ЗАЧЕМ: SellPUT получает премию при росте актива
    const criterionValue = plUp;
    
    if (criterionValue > bestPL) {
      bestPL = criterionValue;
      bestDay = day;
      bestPLUp = plUp;
      bestPLDown = plDown;
    }
  }
  
  console.log(`[findBestExitDayForSellPut] Выбран день ${bestDay} с P&L↑=${bestPL.toFixed(2)}`);
  
  return {
    bestExitDay: bestDay,
    bestPL,
    bestPLUp,
    bestPLDown
  };
}

/**
 * Расширенная версия filterAndRankSellPutOptions с поиском лучшего дня
 * ЗАЧЕМ: При включенном findBestDay перебираем все дни и находим оптимальный для SellPUT
 */
export function filterAndRankSellPutOptionsWithBestDay({
  optionsData,
  buyPutPLAtUp,
  buyPutPLAtDown,
  targetUpPrice,
  targetDownPrice,
  positionQuantity,
  filterByLiquidity = false,
  minOpenInterest = 100,
  requireBreakevenAtDown = false,
  maxDaysToCheck = 30
}) {
  const results = [];
  
  for (const expData of optionsData) {
    for (const put of expData.puts) {
      if (!put.premium || put.premium <= 0) continue;
      
      if (filterByLiquidity && (put.openInterest || 0) < minOpenInterest) {
        continue;
      }
      
      // Находим лучший день выхода
      const bestDayResult = findBestExitDayForSellPut({
        optionData: { ...put, daysUntil: expData.daysUntil },
        targetUpPrice,
        targetDownPrice,
        maxDaysToCheck: Math.min(maxDaysToCheck, expData.daysUntil - 1)
      });
      
      // Проверяем критерии компенсации для лучшего дня
      const compensationCheck = checkSellPutCompensationCriteria({
        putData: put,
        buyPutPLAtUp,
        buyPutPLAtDown,
        targetUpPrice,
        targetDownPrice,
        daysUntilExpiration: expData.daysUntil,
        daysAfterEntry: bestDayResult.bestExitDay,
        positionQuantity
      });
      
      if (compensationCheck.meetsCompensationCriteria) {
        if (requireBreakevenAtDown && compensationCheck.sellPutPLAtDown < 0) {
          continue;
        }
        
        results.push({
          expirationDate: expData.date,
          daysUntil: expData.daysUntil,
          strike: put.strike,
          premium: put.premium,
          bid: put.bid,
          ask: put.ask,
          volume: put.volume,
          openInterest: put.openInterest,
          delta: put.delta,
          iv: put.iv,
          bestExitDay: bestDayResult.bestExitDay,
          ...compensationCheck
        });
      }
    }
  }
  
  // Сортируем по эффективности компенсации
  results.sort((a, b) => {
    if (a.compensationRatioUp !== b.compensationRatioUp) {
      return b.compensationRatioUp - a.compensationRatioUp;
    }
    if (a.lossRatioDown !== b.lossRatioDown) {
      return a.lossRatioDown - b.lossRatioDown;
    }
    if (a.premiumReceived !== b.premiumReceived) {
      return b.premiumReceived - a.premiumReceived;
    }
    return (b.openInterest || 0) - (a.openInterest || 0);
  });
  
  return results;
}

// ============================================================================
// ПОИСК ЛУЧШЕГО ДНЯ ВЫХОДА
// ============================================================================

/**
 * Находит лучший день выхода для опциона, перебирая все возможные дни
 * ЗАЧЕМ: Автоматический подбор дня с максимальной прибылью или минимальным убытком
 * 
 * @param {Object} params - Параметры поиска
 * @param {Object} params.optionData - Данные опциона (strike, premium, iv, daysUntil)
 * @param {string} params.optionType - Тип опциона: 'PUT' или 'CALL'
 * @param {string} params.action - Действие: 'Buy' или 'Sell'
 * @param {number} params.targetUpPrice - Целевая цена вверх
 * @param {number} params.targetDownPrice - Целевая цена вниз
 * @param {number} params.positionQuantity - Количество акций в позиции
 * @param {number} params.entryPrice - Цена входа в позицию базового актива
 * @param {number} params.maxDaysToCheck - Максимальное количество дней для проверки
 * @returns {Object} Лучший день и P&L для этого дня
 */
export function findBestExitDay({
  optionData,
  optionType = 'PUT',
  action = 'Buy',
  targetUpPrice,
  targetDownPrice,
  positionQuantity,
  entryPrice,
  maxDaysToCheck = 30
}) {
  const contracts = Math.abs(positionQuantity) / 100;
  const daysUntilExpiration = optionData.daysUntil || 30;
  
  // Создаём объект опциона в формате калькулятора
  // ВАЖНО: Используем те же поля что и калькулятор для согласованности
  const option = {
    type: optionType,
    action: action,
    strike: optionData.strike,
    premium: optionData.premium,
    ask: optionData.ask,
    bid: optionData.bid,
    quantity: contracts,
    impliedVolatility: optionData.iv || 0.3, // IV из API
    implied_volatility: optionData.iv || 0.3  // Альтернативное поле
  };
  
  let bestDay = 1;
  let bestPL = -Infinity;
  let bestPLUp = 0;
  let bestPLDown = 0;
  
  // Перебираем все дни от 1 до min(maxDaysToCheck, daysUntilExpiration - 1)
  const maxDay = Math.min(maxDaysToCheck, daysUntilExpiration - 1);
  
  console.log(`[findBestExitDay] Перебор дней 1-${maxDay} для strike=${optionData.strike}, exp=${daysUntilExpiration}д, IV=${(optionData.iv * 100).toFixed(1)}%`);
  
  // Собираем все результаты для анализа
  const allDaysResults = [];
  
  for (let day = 1; day <= maxDay; day++) {
    // Дней до экспирации на момент выхода
    const daysRemaining = Math.max(1, daysUntilExpiration - day);
    
    // КЛЮЧЕВОЕ: Используем getOptionVolatility как калькулятор
    // currentDaysToExpiration = daysUntilExpiration (сегодня)
    // simulatedDaysToExpiration = daysRemaining (на день выхода)
    const volatility = getOptionVolatility(option, daysUntilExpiration, daysRemaining);
    
    // Рассчитываем P&L опциона с учётом прогнозируемой IV
    // ВАЖНО: Передаём volatility как 5-й параметр (как в калькуляторе)
    const plUp = calculateOptionPLValue(option, targetUpPrice, targetUpPrice, daysRemaining, volatility);
    const plDown = calculateOptionPLValue(option, targetDownPrice, targetDownPrice, daysRemaining, volatility);
    
    // P&L позиции базового актива
    const positionPLUp = (targetUpPrice - entryPrice) * positionQuantity;
    const positionPLDown = (targetDownPrice - entryPrice) * positionQuantity;
    
    // Общий P&L (позиция + опцион)
    const totalPLUp = positionPLUp + plUp;
    const totalPLDown = positionPLDown + plDown;
    
    // Критерий: максимизируем P&L по НИЗУ (защита от падения для BuyPUT)
    const criterionValue = totalPLDown;
    
    allDaysResults.push({ day, daysRemaining, volatility, plDown, plUp, totalPLDown, totalPLUp, criterionValue });
    
    if (criterionValue > bestPL) {
      bestPL = criterionValue;
      bestDay = day;
      bestPLUp = totalPLUp;
      bestPLDown = totalPLDown;
    }
  }
  
  // Логируем топ-5 лучших дней
  const sortedByCriterion = [...allDaysResults].sort((a, b) => b.criterionValue - a.criterionValue);
  console.log(`[findBestExitDay] Топ-5 дней по P&L↓:`, sortedByCriterion.slice(0, 5).map(d => 
    `Д${d.day}:↓${d.totalPLDown.toFixed(0)}(IV:${d.volatility.toFixed(0)}%)`
  ).join(', '));
  console.log(`[findBestExitDay] Выбран день ${bestDay} с P&L↓=${bestPL.toFixed(2)}`);
  
  return {
    bestExitDay: bestDay,
    bestPL,
    bestPLUp,
    bestPLDown
  };
}

/**
 * Расширенная версия filterAndRankPutOptions с поиском лучшего дня для каждого опциона
 * ЗАЧЕМ: При включенном findBestDay перебираем все дни и находим оптимальный
 * 
 * @param {Object} params - Параметры подбора (те же что у filterAndRankPutOptions + findBestDay)
 * @returns {Array} Отсортированный массив подходящих опционов с bestExitDay
 */
export function filterAndRankPutOptionsWithBestDay({
  optionsData,
  entryPrice,
  positionQuantity,
  targetUpPrice,
  targetDownPrice,
  maxRiskPercent,
  optionRiskPercent = 2,
  filterByLiquidity = false,
  minOpenInterest = 100,
  onlyBalanced = false,
  balanceTolerance = 10,
  maxDaysToCheck = 30
}) {
  const results = [];
  
  for (const expData of optionsData) {
    for (const put of expData.puts) {
      // Пропускаем опционы без премии
      if (!put.premium || put.premium <= 0) continue;
      
      // Фильтр по ликвидности (OI)
      if (filterByLiquidity && (put.openInterest || 0) < minOpenInterest) {
        continue;
      }
      
      // Находим лучший день выхода для этого опциона
      const bestDayResult = findBestExitDay({
        optionData: { ...put, daysUntil: expData.daysUntil },
        optionType: 'PUT',
        action: 'Buy',
        targetUpPrice,
        targetDownPrice,
        positionQuantity,
        entryPrice,
        maxDaysToCheck: Math.min(maxDaysToCheck, expData.daysUntil - 1)
      });
      
      // Проверяем критерии риска для лучшего дня
      const riskCheck = checkRiskCriteria({
        entryPrice,
        positionQuantity,
        putData: put,
        targetUpPrice,
        targetDownPrice,
        maxRiskPercent,
        optionRiskPercent,
        daysUntilExpiration: expData.daysUntil,
        daysAfterEntry: bestDayResult.bestExitDay
      });
      
      if (riskCheck.meetsRiskCriteria) {
        // Фильтр "Только балансные"
        if (onlyBalanced) {
          const optionPLUp = Math.abs(riskCheck.optionOnlyPLUp);
          const totalPLDown = Math.abs(riskCheck.plAtTargetDown);
          const maxVal = Math.max(optionPLUp, totalPLDown);
          if (maxVal > 0) {
            const diff = Math.abs(optionPLUp - totalPLDown);
            const tolerance = maxVal * (balanceTolerance / 100);
            if (diff > tolerance) {
              continue;
            }
          }
        }
        
        results.push({
          expirationDate: expData.date,
          daysUntil: expData.daysUntil,
          strike: put.strike,
          premium: put.premium,
          bid: put.bid,
          ask: put.ask,
          volume: put.volume,
          openInterest: put.openInterest,
          delta: put.delta,
          iv: put.iv,
          bestExitDay: bestDayResult.bestExitDay,
          ...riskCheck
        });
      }
    }
  }
  
  // Сортируем по эффективности защиты
  results.sort((a, b) => {
    // Приоритет 1: Меньший риск по низу
    if (a.riskPercent !== b.riskPercent) return a.riskPercent - b.riskPercent;
    // Приоритет 2: Меньшая премия
    if (a.premiumCost !== b.premiumCost) return a.premiumCost - b.premiumCost;
    // Приоритет 3: Выше ликвидность
    return (b.openInterest || 0) - (a.openInterest || 0);
  });
  
  return results;
}
