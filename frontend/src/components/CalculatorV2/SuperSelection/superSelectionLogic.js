/**
 * Логика для Супер Подбора (Super Selection)
 * ЗАЧЕМ: Расчет сценариев P&L для подобранных опционов
 */

import { calculateOptionPrice } from '../../../utils/blackScholes';

/**
 * Рассчитывает сценарии для списка опционов
 * 
 * @param {Array} options - Список опционов от расширения
 * @param {number} currentPrice - Текущая цена актива
 * @param {number} dropPercent - Процент падения (для сценария "Низ")
 * @param {number} growthPercent - Процент роста (для сценария "Верх", по дефолту 50%)
 * @returns {Array} Отсортированный список опционов с рассчитанными P&L
 */
export function calculateSuperSelectionScenarios(options, currentPrice, dropPercent, growthPercent = 50, targetType = 'CALL', exitDay = 0) {
    if (!options || options.length === 0 || !currentPrice) {
        return [];
    }

    // 1. Фильтрация по типу опциона и наличию объема
    const relevantOptions = options.filter(opt =>
        (opt.type === targetType || opt.optionType === targetType) && parseFloat(opt.volume || 0) > 0
    );

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
    const riskFreeRate = 0.05;
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
        // Если exitDay > 0, мы как бы перемещаемся в будущее на эти дни
        let adjustedTimeToExpiration = timeToExpiration;
        if (exitDay > 0) {
            adjustedTimeToExpiration = Math.max(0.0001, timeToExpiration - (exitDay / 365));
        }

        // Расчет цены при падении (Target Down)
        const priceDown = calculateOptionPrice(
            targetPriceDown,
            strike,
            adjustedTimeToExpiration,
            riskFreeRate,
            iv,
            targetType // 'CALL' or 'PUT'
        );

        // Расчет цены при росте (Target Up)
        const priceUp = calculateOptionPrice(
            targetPriceUp,
            strike,
            adjustedTimeToExpiration,
            riskFreeRate,
            iv,
            targetType // 'CALL' or 'PUT'
        );

        // P&L
        const pnlDown = priceDown - premium;
        const pnlUp = priceUp - premium;

        return {
            ...option,
            calculated: {
                priceDown,
                priceUp,
                pnlDown,
                pnlUp,
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
