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
export function calculateSuperSelectionScenarios(options, currentPrice, dropPercent, growthPercent = 50) {
    if (!options || options.length === 0 || !currentPrice) {
        return [];
    }

    // 1. Фильтрация: только Buy CALL
    // Расширение возвращает сырые данные (Bid, Ask, Greeks).
    // Поле 'action' (Buy/Sell) в них отсутствует, это наше намерение.
    // Поэтому фильтруем только по типу CALL.
    const relevantOptions = options.filter(opt =>
        (opt.type === 'CALL' || opt.optionType === 'CALL')
    );

    // Целевые цены
    const targetPriceDown = currentPrice * (1 - Math.abs(dropPercent) / 100);
    const targetPriceUp = currentPrice * (1 + Math.abs(growthPercent) / 100);

    // Параметры для Black-Scholes
    // TODO: Брать ставку из настроек или использовать константу
    const riskFreeRate = 0.05;
    const now = new Date();

    const results = relevantOptions.map(option => {
        // Парсинг даты экспирации
        // Предпочитаем ISO формат (2026-05-15), если он есть
        const dateStr = option.expirationISO || option.date || option.expiration || option.expirationDate;
        if (!dateStr) return null;

        const expirationDate = new Date(dateStr);

        // Время до экспирации в годах
        const timeToExpiration = (expirationDate - now) / (1000 * 60 * 60 * 24 * 365);
        // Если опцион истекает сегодня или экспирирован - пропускаем
        if (timeToExpiration <= 0.0001) return null;

        // Парсинг числовых значений (защита от строк)
        const strike = parseFloat(option.strike);

        // Для Buy CALL цена покупки - это ASK
        const premium = parseFloat(option.ask || option.premium || option.last_price || 0);

        // IV (Implied Volatility)
        // В данных может быть askIV: 30.24 (это проценты). Формула требует 0.3024.
        // Если значение > 1, считаем что это проценты и делим на 100.
        let rawIv = parseFloat(option.askIV || option.impliedVolatility || option.iv || 0);
        if (isNaN(rawIv)) rawIv = 0;

        let iv = rawIv;
        if (iv > 10) { // Эвристика: если волатительность > 10, скорее всего это % (вряд ли IV = 1000%)
            iv = iv / 100;
        }
        // Безопасный минимум
        if (iv === 0) iv = 0.5;
        // ПРИМЕЧАНИЕ: Мы считаем "моментальный" сценарий, то есть T почти не изменилось (или прошло 0 дней).
        // Если нужно учитывать проход времени, нужно уменьшать T.
        // Пока считаем сценарий "что если цена изменится прямо сейчас".
        const priceDown = calculateOptionPrice(
            targetPriceDown,
            strike,
            timeToExpiration,
            riskFreeRate,
            iv,
            'CALL'
        );

        // Расчет теоретической цены при росте
        const priceUp = calculateOptionPrice(
            targetPriceUp,
            option.strike,
            timeToExpiration,
            riskFreeRate,
            iv,
            'CALL'
        );

        // P&L
        // (Теоретическая цена выхода - Цена входа) * 100 (размер контракта, обычно 100, но для фьючерсов может быть 1 или 50)
        // В данном калькуляторе пока считаем на 1 контракт в пунктах, умножение на мультипликатор происходит в таблице.
        // Здесь вернем P&L в пунктах цены.

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
    // Сценарий 1: "Минимальный убыток при падении".
    // Это значит P&L Down должен быть максимальным (ближе к 0 или положительным).
    results.sort((a, b) => b.calculated.pnlDown - a.calculated.pnlDown);

    return results;
}
