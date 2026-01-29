/**
 * Логика для Супер Подбора (Super Selection)
 * ЗАЧЕМ: Расчет сценариев P&L для подобранных опционов
 * Поддерживает режимы: Акции (Black-Scholes) и Фьючерсы (Black-76)
 */

import { calculateOptionPrice } from '../../../utils/blackScholes';
import { getRiskFreeRateSync } from '../../../hooks/useRiskFreeRate';
import { adjustPLByStockGroup } from '../../../utils/optionPricing';

/**
 * Рассчитывает сценарии для списка опционов
 * 
 * @param {Array} options - Список опционов от расширения
 * @param {number} currentPrice - Текущая цена актива
 * @param {number} dropPercent - Процент падения (для сценария "Низ")
 * @param {number} growthPercent - Процент роста (для сценария "Верх", по дефолту 50%)
 * @param {string} targetType - Тип опциона ('CALL' или 'PUT')
 * @param {number} exitDay - День выхода (для Time Decay)
 * @param {string} classification - Классификация акции (только для stocks)
 * @param {string} calculatorMode - Режим калькулятора: 'stocks' | 'futures'
 * @param {number} contractMultiplier - Множитель контракта (100 для акций, pointValue для фьючерсов)
 * @returns {Array} Отсортированный список опционов с рассчитанными P&L
 */
export function calculateSuperSelectionScenarios(options, currentPrice, dropPercent, growthPercent = 50, targetType = 'CALL', exitDay = 0, classification = null, calculatorMode = 'stocks', contractMultiplier = 100) {
    if (!options || options.length === 0 || !currentPrice) {
        return [];
    }

    // 1. Фильтрация по типу опциона
    const targetTypeUpper = targetType.toUpperCase();

    // Сначала пробуем найти с объемом > 0
    let relevantOptions = options.filter(opt => {
        const optType = (opt.type || opt.optionType || '').toUpperCase();
        return optType === targetTypeUpper && parseFloat(opt.volume || 0) > 0;
    });

    // Если ничего не нашли с объемом, берем все подходящего типа (даже с 0 объемом)
    if (relevantOptions.length === 0) {
        relevantOptions = options.filter(opt => {
            const optType = (opt.type || opt.optionType || '').toUpperCase();
            return optType === targetTypeUpper;
        });
    }

    // Удаляем дубликаты (по страйку и дате)
    const uniqueOptions = [];
    const seen = new Set();

    relevantOptions.forEach(opt => {
        // Уникальный ключ: Страйк-Дата-Тип
        const dateStr = opt.expirationISO || opt.date || opt.expiration || '';
        const key = `${opt.strike}-${dateStr}-${opt.type || ''}`;

        if (!seen.has(key)) {
            seen.add(key);
            uniqueOptions.push(opt);
        }
    });

    // Целевые цены
    const targetPriceDown = currentPrice * (1 - Math.abs(dropPercent) / 100);
    const targetPriceUp = currentPrice * (1 + Math.abs(growthPercent) / 100);

    // Параметры для Black-Scholes
    const riskFreeRate = getRiskFreeRateSync();
    const now = new Date();

    const results = uniqueOptions.map(option => {
        // Парсинг даты экспирации
        const dateStr = option.expirationISO || option.date || option.expiration || option.expirationDate;
        if (!dateStr) return null;

        const expirationDate = new Date(dateStr);

        // Время до экспирации в годах
        const timeToExpiration = (expirationDate - now) / (1000 * 60 * 60 * 24 * 365);
        if (timeToExpiration <= 0.0001) return null;

        // Парсинг числовых значений
        const strike = parseFloat(option.strike);

        // Для Buy (Long) цена покупки - это ASK
        const premium = parseFloat(option.ask || option.premium || option.last_price || 0);

        // IV normalization
        let rawIv = parseFloat(option.askIV || option.impliedVolatility || option.iv || 0);
        if (isNaN(rawIv)) rawIv = 0;

        let iv = rawIv;
        if (iv > 10) {
            iv = iv / 100;
        }
        if (iv === 0) iv = 0.5;

        // Корректировка времени экспирации с учетом дня выхода (Time Decay)
        // ЗАЧЕМ: Для разных сценариев используем разное время
        // ШАГ 1 (CALL): основные сценарии на экспирацию + дополнительные на exitDay
        // ШАГ 2 (PUT): Считаем на указанный exitDay
        
        // Время на экспирацию (для основных расчетов)
        const timeAtExpiration = 0.0001;
        
        // Время на указанный день выхода
        const timeAtExitDay = exitDay > 0 
            ? Math.max(0.0001, timeToExpiration - (exitDay / 365))
            : timeToExpiration;

        // Расчет цены опциона при целевых ценах
        let priceDown, priceUp;
        let priceDownOnDay, priceUpOnDay; // Дополнительные расчеты на конкретный день
        
        if (calculatorMode === 'futures') {
            // Для фьючерсов: внутренняя стоимость на экспирации
            // CALL: max(0, F - K), PUT: max(0, K - F)
            if (targetType === 'CALL') {
                priceDown = Math.max(0, targetPriceDown - strike);
                priceUp = Math.max(0, targetPriceUp - strike);
                priceDownOnDay = priceDown; // Для фьючерсов одинаково
                priceUpOnDay = priceUp;
            } else {
                priceDown = Math.max(0, strike - targetPriceDown);
                priceUp = Math.max(0, strike - targetPriceUp);
                priceDownOnDay = priceDown;
                priceUpOnDay = priceUp;
            }
        } else {
            if (targetType === 'CALL') {
                // Для CALL (Шаг 1): основные расчеты на экспирацию
                priceDown = calculateOptionPrice(
                    targetPriceDown,
                    strike,
                    timeAtExpiration,
                    riskFreeRate,
                    iv,
                    targetType
                );
                
                priceUp = calculateOptionPrice(
                    targetPriceUp,
                    strike,
                    timeAtExpiration,
                    riskFreeRate,
                    iv,
                    targetType
                );
                
                // Дополнительные расчеты на конкретный день (exitDay)
                priceDownOnDay = calculateOptionPrice(
                    targetPriceDown,
                    strike,
                    timeAtExitDay,
                    riskFreeRate,
                    iv,
                    targetType
                );
                
                priceUpOnDay = calculateOptionPrice(
                    targetPriceUp,
                    strike,
                    timeAtExitDay,
                    riskFreeRate,
                    iv,
                    targetType
                );
            } else {
                // Для PUT (Шаг 2): все расчеты на exitDay
                priceDown = calculateOptionPrice(
                    targetPriceDown,
                    strike,
                    timeAtExitDay,
                    riskFreeRate,
                    iv,
                    targetType
                );
                
                priceUp = calculateOptionPrice(
                    targetPriceUp,
                    strike,
                    timeAtExitDay,
                    riskFreeRate,
                    iv,
                    targetType
                );
                
                // Для PUT на Шаге 2 дополнительные колонки не нужны
                priceDownOnDay = priceDown;
                priceUpOnDay = priceUp;
            }
        }

        // P&L на экспирацию
        let pnlDown = priceDown - premium;
        let pnlUp = priceUp - premium;
        
        // P&L на конкретный день
        let pnlDownOnDay = priceDownOnDay - premium;
        let pnlUpOnDay = priceUpOnDay - premium;

        // Применяем корректировку по группе акций (ТОЛЬКО для режима stocks)
        if (calculatorMode === 'stocks' && classification) {
            pnlDown = adjustPLByStockGroup(pnlDown, classification);
            pnlUp = adjustPLByStockGroup(pnlUp, classification);
            pnlDownOnDay = adjustPLByStockGroup(pnlDownOnDay, classification);
            pnlUpOnDay = adjustPLByStockGroup(pnlUpOnDay, classification);
        }

        // Умножаем на мультипликатор контракта
        // Для акций: 100 (стандартный контракт)
        // Для фьючерсов: pointValue (например, 50 для ES)
        pnlDown *= contractMultiplier;
        pnlUp *= contractMultiplier;
        pnlDownOnDay *= contractMultiplier;
        pnlUpOnDay *= contractMultiplier;

        return {
            ...option,
            calculated: {
                priceDown,
                priceUp,
                pnlDown,
                pnlUp,
                pnlDownOnDay,
                pnlUpOnDay,
                targetPriceDown,
                targetPriceUp
            }
        };
    }).filter(item => item !== null);

    // Сортировка
    // Для обоих шагов мы ищем "лучший результат при падении".
    // Шаг 1 (CALL): Минимальный убыток (максимальный P&L Down, т.к. он скорее всего отрицательный)
    // Шаг 2 (PUT): Максимальная прибыль (максимальный P&L Down, он будет положительным)
    // В обоих случаях сортируем по убыванию P&L Down.
    results.sort((a, b) => b.calculated.pnlDown - a.calculated.pnlDown);

    return results;
}
