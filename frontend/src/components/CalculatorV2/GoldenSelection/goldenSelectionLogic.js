import { calculateOptionPLValue } from '../../../utils/optionPricing';

/**
 * Получить даты экспирации в заданном диапазоне
 * @param {array} availableDates - Все доступные даты экспирации
 * @param {number} minDays - Минимальное количество дней
 * @param {number} maxDays - Максимальное количество дней
 * @returns {array} - Отфильтрованные даты
 */
export const filterDatesByRange = (availableDates, minDays = 20, maxDays = 40) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const results = availableDates.filter(dateStr => {
        const expDate = new Date(dateStr + 'T00:00:00');
        const diffTime = expDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const isMatch = diffDays >= minDays && diffDays <= maxDays;

        // Лог для отладки
        console.log(`📅 Дата: ${dateStr}, Дней: ${diffDays}, Диапазон: [${minDays}, ${maxDays}], Подходит: ${isMatch}`);

        return isMatch;
    });

    return results;
};

/**
 * Рассчитать дни до экспирации
 * @param {string} expirationDate - Дата экспирации (YYYY-MM-DD)
 * @returns {number} - Количество дней
 */
const calculateDaysToExpiration = (expirationDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = new Date(expirationDate + 'T00:00:00');
    const diffTime = expDate - today;
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
};

/**
 * Найти лучший Buy CALL опцион (Золотой подбор)
 * 
 * Параметры подбора:
 * - Дата экспирации: minDays - maxDays
 * - Страйк: ближайшие к текущей цене
 * - Ожидаемый рост: growthPercent
 * 
 * Критерий выбора: Максимальная прибыль при достижении целевой цены
 */
export const findBestGoldenBuyCall = async ({
    ticker,
    currentPrice,
    availableDates = [],
    minDays = 20,
    maxDays = 40,
    growthPercent = 50,
    onProgress = () => { }
}) => {
    console.log('👑 Начинаем золотой подбор BuyCALL...', {
        ticker,
        currentPrice,
        minDays,
        maxDays,
        growthPercent
    });

    // Целевая цена при росте на growthPercent%
    const targetPrice = currentPrice * (1 + growthPercent / 100);
    console.log(`🎯 Целевая цена: $${targetPrice.toFixed(2)} (+${growthPercent}%)`);

    // Шаг 1: Фильтрация дат экспирации
    const filteredDates = filterDatesByRange(availableDates, minDays, maxDays);
    console.log(`📅 Подходящие даты (${minDays}-${maxDays} дней): ${filteredDates.length}`);

    if (filteredDates.length === 0) {
        // Найдем ближайшую дату для информации
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateInfos = availableDates.map(d => {
            const diff = Math.ceil((new Date(d + 'T00:00:00') - today) / (1000 * 60 * 60 * 24));
            return `${d} (${diff} дн.)`;
        }).slice(0, 3).join(', ');

        return {
            error: 'NO_DATES',
            message: `Нет дат экспирации в диапазоне ${minDays}-${maxDays} дней. Ближайшие: ${dateInfos}`
        };
    }

    onProgress({ stage: 'dates', total: filteredDates.length, current: 0 });

    const allCandidates = [];

    // Шаг 2: Сбор кандидатов
    for (let i = 0; i < filteredDates.length; i++) {
        const date = filteredDates[i];
        onProgress({ stage: 'loading', total: filteredDates.length, current: i + 1, date });

        try {
            const response = await fetch(`/api/polygon/ticker/${ticker}/options?expiration_date=${date}`);
            if (!response.ok) continue;

            const data = await response.json();
            if (data.status !== 'success' || !data.options) continue;

            // Фильтр: только CALL
            const callOptions = data.options.filter(opt => {
                const type = (opt.type || opt.contract_type || opt.optionType || '').toLowerCase();
                return type === 'call';
            });

            // Фильтр: валидная цена (ask > 0)
            const validOptions = callOptions.filter(opt => (opt.ask || 0) > 0);

            // Фильтр: ближайшие страйки к текущей цене (один сверху, один снизу)
            // Сортируем все уникальные страйки
            const allStrikes = [...new Set(validOptions.map(o => o.strike))].sort((a, b) => a - b);

            let belowStrike = null;
            let aboveStrike = null;

            // Находим ближайший снизу и сверху
            for (const s of allStrikes) {
                if (s <= currentPrice) {
                    belowStrike = s;
                } else if (s > currentPrice) {
                    aboveStrike = s;
                    break; // Первый, который больше - это ближайший сверху
                }
            }

            const targetStrikes = [];
            if (belowStrike !== null) targetStrikes.push(belowStrike);
            if (aboveStrike !== null) targetStrikes.push(aboveStrike);

            console.log(`🎯 Ближайшие страйки для цены ${currentPrice}:`, targetStrikes);

            const nearStrikeOptions = validOptions.filter(opt => targetStrikes.includes(opt.strike));
            allCandidates.push(...nearStrikeOptions);

        } catch (error) {
            console.error(`Ошибка загрузки ${date}:`, error);
        }
    }

    if (allCandidates.length === 0) {
        return { error: 'NO_CANDIDATES', message: 'Не найдено подходящих опционов' };
    }

    console.log(`📦 Всего кандидатов: ${allCandidates.length}`);
    onProgress({ stage: 'calculating', total: allCandidates.length, current: 0 });

    // Шаг 3: Расчет прибыли для каждого кандидата
    // Прибыль = Стоимость опциона при TargetPrice - Стоимость покупки (Ask)
    // Упрощенная оценка: Intrinsic Value at TargetPrice - Premium
    // Для более точной оценки (с учетом времени) можно использовать full pricing model, 
    // но "наибольшая прибыль при условии роста" часто подразумевает P&L на момент экспирации или оценки.
    // Будем оценивать P&L на МОМЕНТ ЭКСПИРАЦИИ, так как это наиболее прозрачный сценарий "target price reached".
    // Профит = Max(0, TargetPrice - Strike) - Premium

    const candidatesWithProfit = allCandidates.map((opt, idx) => {
        const premium = opt.ask || opt.last_price || 0;
        const strike = opt.strike;

        // Гарантируем наличие expiration для результата
        const expiration = opt.expiration_date || opt.expiration;

        // Подготовка объекта для calculateOptionPLValue
        const optionForCalc = {
            ...opt,
            type: 'CALL',
            action: 'Buy',
            quantity: 1,
            strike: strike,
            premium: premium,
            ask: premium, // Используем ask как цену входа
            expiration_date: expiration // Явно прописываем
        };

        // Используем P&L на момент экспирации (так как мы ждем роста к этому времени)
        // Используем P&L на момент экспирации (так как мы ждем роста к этому времени)
        // DaysRemaining = 0
        const daysRemaining = 0;

        let profit = 0;
        try {
            profit = calculateOptionPLValue(
                optionForCalc,
                targetPrice,
                currentPrice,
                0, // daysRemaining = 0 (на момент экспирации)
                null, // volatility
                0 // dividendYield
            );
        } catch (e) {
            console.error('Error calculating PL:', e);
            profit = 0;
        }

        // Защита от NaN
        if (!Number.isFinite(profit)) {
            profit = 0;
        }

        // Также можно рассчитать ROI %
        const cost = premium * 100;
        const roi = cost > 0 ? (profit / cost) * 100 : 0;

        return {
            candidate: { ...opt, expiration_date: expiration }, // Возвращаем объект с гарантированным полем expiration_date
            premium,
            strike,
            profit,
            roi,
            daysToExp: calculateDaysToExpiration(expiration)
        };
    });

    // Шаг 4: Сортировка по прибыли (desc)
    candidatesWithProfit.sort((a, b) => b.profit - a.profit);

    // Выбираем лучший
    const bestOption = candidatesWithProfit[0];

    if (bestOption && bestOption.profit > 0) {
        console.log('✨ Лучший Golden Option:', bestOption);
        return {
            ...bestOption.candidate,
            calculatedProfit: bestOption.profit,
            calculatedRoi: bestOption.roi,
            targetPrice: targetPrice
        };
    } else {
        // Если все убыточны (например, слишком дорогой премиум или недостижимый таргет)
        // Все равно вернем "лучший из худших" или null? 
        // Вернем лучший по "максимальной возможной выплате" или ROI?
        // Вернем просто с наибольшим P&L (пусть и отрицательным, хотя это странно для "best profit")
        if (bestOption) {
            return {
                ...bestOption.candidate,
                calculatedProfit: bestOption.profit,
                calculatedRoi: bestOption.roi,
                targetPrice: targetPrice,
                warning: 'Predicted profit is negative'
            };
        }
    }

    return { error: 'NO_PROFITABLE_OPTIONS', message: 'Не найдено прибыльных опционов при заданном росте' };
};
