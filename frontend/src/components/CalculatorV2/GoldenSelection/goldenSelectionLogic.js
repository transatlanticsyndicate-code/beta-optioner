import { calculateOptionPLValue } from '../../../utils/optionPricing';

/**
 * Получить даты экспирации в заданном диапазоне
 * @param {array} availableDates - Все доступные даты экспирации
 * @param {number} minDays - Минимальное количество дней
 * @param {number} maxDays - Максимальное количество дней
 * @returns {array} - Отфильтрованные даты
 */
export const filterDatesByRange = (availableDates, minDays = 60, maxDays = 100) => {
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
 * Логика выбора лучшего Buy Call опциона из списка кандидатов
 * @param {Array} options - Список опционов-кандидатов (должны быть уже отфильтрованы по дате/типу, но проверим)
 * @param {number} currentPrice - Текущая цена
 * @param {number} growthPercent - % падения для расчета убытка
 * @param {number} strikeRangePercent - % для целевого страйка (используется для логирования)
 * @param {number} profitTolerancePercent - Погрешность равной прибыли
 * @returns {Object} { ...option, calculatedLoss, dropPrice, isGoldenOption } or error object
 */
export const selectBestGoldenCall = ({
    options,
    currentPrice,
    growthPercent = 5,
    strikeRangePercent = 5,
    profitTolerancePercent = 5
}) => {
    if (!options || options.length === 0) {
        return { error: 'NO_CANDIDATES', message: 'Нет кандидатов для выбора' };
    }

    // Цена при падении на growthPercent%
    const dropPrice = currentPrice * (1 - growthPercent / 100);
    console.log(`📉 [Select logic] Цена при падении на ${growthPercent}%: $${dropPrice.toFixed(2)}`);

    // Фильтр: только CALL и валидная цена
    const validOptions = options.filter(opt => {
        const type = (opt.type || opt.contract_type || opt.optionType || '').toLowerCase();
        const price = opt.ask || opt.premium || opt.last_price || 0;
        return type === 'call' && price > 0;
    });

    if (validOptions.length === 0) {
        return { error: 'NO_VALID_OPTIONS', message: 'Нет валидных CALL опционов (ask > 0)' };
    }

    console.log(`📦 Всего валидных кандидатов: ${validOptions.length}`);

    // ШАГ 3 (из старой логики): Вычисляем убыток для каждого кандидата при падении цены
    const candidatesWithLoss = validOptions.map((opt) => {
        const premium = opt.ask || opt.premium || opt.last_price || 0;
        const strike = opt.strike;
        const expiration = opt.expiration_date || opt.expiration || opt.date;

        // Подготовка объекта для calculateOptionPLValue
        const optionForCalc = {
            ...opt,
            type: 'CALL',
            action: 'Buy',
            quantity: 1,
            strike: strike,
            premium: premium,
            ask: premium,
            expiration_date: expiration
        };

        // Вычисляем P&L при падении цены на момент экспирации
        let loss = 0;
        try {
            loss = calculateOptionPLValue(
                optionForCalc,
                dropPrice,
                currentPrice,
                0, // daysRemaining = 0 (на момент экспирации)
                null,
                0
            );
        } catch (e) {
            console.error('Error calculating PL:', e);
            loss = 0;
        }

        if (!Number.isFinite(loss)) {
            loss = 0;
        }

        // Убыток - это отрицательное значение P&L, поэтому берем абсолютное значение для сравнения
        const absoluteLoss = Math.abs(loss);

        return {
            candidate: { ...opt, expiration_date: expiration },
            premium,
            strike,
            loss: loss, // Реальное значение (может быть отрицательным)
            absoluteLoss: absoluteLoss, // Абсолютное значение для сортировки
            daysToExp: calculateDaysToExpiration(expiration)
        };
    });

    // ШАГ 4: Сортировка по убытку
    candidatesWithLoss.sort((a, b) => a.absoluteLoss - b.absoluteLoss);

    if (candidatesWithLoss.length > 0) {
        const minLoss = candidatesWithLoss[0].absoluteLoss;
        console.log(`💰 Мин убыток: $${candidatesWithLoss[0].loss.toFixed(2)}, Погрешность: ${profitTolerancePercent}%`);

        // Фильтруем опционы, чей убыток в пределах погрешности от минимума
        const topCandidates = candidatesWithLoss.filter(c => {
            if (minLoss === 0) {
                return c.absoluteLoss <= (currentPrice * c.premium * profitTolerancePercent / 100);
            }
            const percentDiff = (Math.abs(minLoss - c.absoluteLoss) / minLoss) * 100;
            return percentDiff <= profitTolerancePercent;
        });

        // Среди опционов с "равным убытком" выбираем самый дешевый
        topCandidates.sort((a, b) => {
            const costA = a.premium * 100;
            const costB = b.premium * 100;
            return costA - costB;
        });

        const bestOption = topCandidates[0];
        console.log(`✨ ВЫБРАН: Страйк ${bestOption.strike}, убыток $${bestOption.loss.toFixed(2)}, стоимость $${(bestOption.premium * 100).toFixed(2)}`);

        return {
            ...bestOption.candidate,
            calculatedLoss: bestOption.loss,
            dropPrice: dropPrice,
            isGoldenOption: true
        };
    }

    return { error: 'NO_OPTIONS_FOUND', message: 'Не удалось выбрать лучший опцион' };
};


/**
 * Логика выбора лучшего Buy Put опциона из списка кандидатов (для Хеджирования)
 * @param {Array} options - Список опционов-кандидатов
 * @param {number} currentPrice - Текущая цена
 * @param {number} dropPercent - Цель падения (%)
 * @param {number} exitDay - День выхода
 * @param {number} strikeRangePercent - % для целевого страйка
 * @param {number} profitTolerancePercent - Погрешность равной прибыли
 * @returns {Object} { ...option, calculatedProfit, dropPrice, exitDay, isGoldenOption } or error object
 */
export const selectBestGoldenPut = ({
    options,
    currentPrice,
    dropPercent = -2.5,
    exitDay = 5,
    strikeRangePercent = 5,
    profitTolerancePercent = 5,
}) => {
    if (!options || options.length === 0) {
        return { error: 'NO_CANDIDATES', message: 'Нет кандидатов для выбора' };
    }

    // Цена при падении на dropPercent%
    const dropPrice = currentPrice * (1 + dropPercent / 100);
    console.log(`📉 [Select logic PUT] Цена при падении на ${dropPercent}%: $${dropPrice.toFixed(2)}`);

    // Фильтр: только PUT и валидная цена
    const validOptions = options.filter(opt => {
        const type = (opt.type || opt.contract_type || opt.optionType || '').toLowerCase();
        const price = opt.ask || opt.premium || opt.last_price || 0;
        return type === 'put' && price > 0;
    });

    if (validOptions.length === 0) {
        return { error: 'NO_VALID_OPTIONS', message: 'Нет валидных PUT опционов (ask > 0)' };
    }

    // ШАГ 3 (из старой логики): Вычисляем прибыль для каждого кандидата при падении цены на день exitDay
    const candidatesWithProfit = validOptions.map((opt) => {
        const premium = opt.ask || opt.premium || opt.last_price || 0;
        const strike = opt.strike;
        const expiration = opt.expiration_date || opt.expiration || opt.date;

        // Рассчитываем дни до экспирации PUT на момент выхода
        const daysToExpiration = calculateDaysToExpiration(expiration);
        const daysRemainingAtExit = Math.max(0, daysToExpiration - exitDay);

        // Подготовка объекта для calculateOptionPLValue
        const optionForCalc = {
            ...opt,
            type: 'PUT',
            action: 'Buy',
            quantity: 1,
            strike: strike,
            premium: premium,
            ask: premium,
            expiration_date: expiration
        };

        // Вычисляем P&L при падении цены на день exitDay
        let profit = 0;
        try {
            profit = calculateOptionPLValue(
                optionForCalc,
                dropPrice,
                currentPrice,
                daysRemainingAtExit, // Дней до экспирации на момент выхода
                null,
                0
            );
        } catch (e) {
            console.error('Error calculating PL:', e);
            profit = 0;
        }

        if (!Number.isFinite(profit)) {
            profit = 0;
        }

        return {
            candidate: { ...opt, expiration_date: expiration },
            premium,
            strike,
            profit: profit,
            daysToExp: daysToExpiration,
            daysRemainingAtExit: daysRemainingAtExit
        };
    });

    // ШАГ 4: Сортировка по прибыли (максимальная прибыль = лучший опцион)
    candidatesWithProfit.sort((a, b) => b.profit - a.profit);

    if (candidatesWithProfit.length > 0) {
        const maxProfit = candidatesWithProfit[0].profit;
        console.log(`👑 Макс прибыль: $${maxProfit.toFixed(2)}, Погрешность: ${profitTolerancePercent}%`);

        // Фильтруем опционы, чья прибыль в пределах погрешности от максимума
        const topCandidates = candidatesWithProfit.filter(c => {
            if (maxProfit <= 0) {
                return c.profit >= maxProfit - (currentPrice * c.premium * profitTolerancePercent / 100);
            }
            const percentDiff = (Math.abs(maxProfit - c.profit) / maxProfit) * 100;
            return percentDiff <= profitTolerancePercent;
        });

        // Среди опционов с "равной прибылью" выбираем самый дешевый
        topCandidates.sort((a, b) => {
            const costA = a.premium * 100;
            const costB = b.premium * 100;
            return costA - costB;
        });

        const bestOption = topCandidates[0];
        console.log(`👑 ВЫБРАН: Страйк ${bestOption.strike}, прибыль $${bestOption.profit.toFixed(2)}, стоимость $${(bestOption.premium * 100).toFixed(2)}`);

        return {
            ...bestOption.candidate,
            calculatedProfit: bestOption.profit,
            dropPrice: dropPrice,
            exitDay: exitDay,
            isGoldenOption: true
        };
    }

    return { error: 'NO_OPTIONS_FOUND', message: 'Не удалось выбрать лучший опцион' };
};


/**
 * Найти лучший Buy CALL опцион (Золотой подбор) - с запросом данных API
 */
export const findBestGoldenBuyCall = async ({
    ticker,
    currentPrice,
    availableDates = [],
    minDays = 90,
    maxDays = 300,
    growthPercent = 5,
    strikeRangePercent = 5,
    profitTolerancePercent = 5,
    onProgress = () => { }
}) => {
    console.log('👑 Начинаем золотой подбор BuyCALL (API Mode)...');

    // ШАГ 1: Вычисляем целевой страйк
    const targetStrikePrice = currentPrice * (1 + strikeRangePercent / 100);

    // Фильтрация дат экспирации
    const filteredDates = filterDatesByRange(availableDates, minDays, maxDays);

    if (filteredDates.length === 0) {
        return { error: 'NO_DATES', message: `Нет дат экспирации в диапазоне ${minDays}-${maxDays} дней` };
    }

    onProgress({ stage: 'dates', total: filteredDates.length, current: 0 });

    const allCandidates = [];

    // ШАГ 2: Загружаем опционы по датам (API Polygon)
    for (let i = 0; i < filteredDates.length; i++) {
        const date = filteredDates[i];
        onProgress({ stage: 'loading', total: filteredDates.length, current: i + 1, date });

        try {
            const response = await fetch(`/api/polygon/ticker/${ticker}/options?expiration_date=${date}`);
            if (!response.ok) continue;

            const data = await response.json();
            if (data.status !== 'success' || !data.options) continue;

            // Фильтр: только CALL и > 0
            const validOptions = data.options.filter(opt => {
                const type = (opt.type || opt.contract_type || opt.optionType || '').toLowerCase();
                return type === 'call' && (opt.ask || 0) > 0;
            });

            // Находим опцион с ближайшим страйком к целевому
            let closestOption = null;
            let minDifference = Infinity;

            validOptions.forEach(opt => {
                const difference = Math.abs(opt.strike - targetStrikePrice);
                if (difference < minDifference) {
                    minDifference = difference;
                    closestOption = opt;
                }
            });

            if (closestOption) {
                allCandidates.push(closestOption);
            }

        } catch (error) {
            console.error(`Ошибка загрузки ${date}:`, error);
        }
    }

    onProgress({ stage: 'calculating', total: allCandidates.length, current: 0 });

    // ШАГ 3 & 4: Выбор лучшего
    // Вызываем новую функцию выбора
    return selectBestGoldenCall({
        options: allCandidates,
        currentPrice,
        growthPercent,
        strikeRangePercent,
        profitTolerancePercent
    });
};

/**
 * Найти лучший Buy PUT опцион (Золотой подбор - Сценарий 3) - с запросом данных API
 */
export const findBestGoldenBuyPut = async ({
    ticker,
    currentPrice,
    availableDates = [],
    minDays = 8,
    maxDays = 100,
    dropPercent = -2.5,
    exitDay = 5,
    strikeRangePercent = 5,
    profitTolerancePercent = 5,
    existingCallOption = null,
    onProgress = () => { }
}) => {
    console.log('👑 Начинаем золотой подбор BuyPUT (API Mode)...');

    // ШАГ 1: Вычисляем целевой страйк
    const targetStrikePrice = currentPrice * (1 + strikeRangePercent / 100);

    // Фильтрация дат экспирации
    const filteredDates = filterDatesByRange(availableDates, minDays, maxDays);

    if (filteredDates.length === 0) {
        return { error: 'NO_DATES', message: `Нет дат экспирации в диапазоне ${minDays}-${maxDays} дней` };
    }

    onProgress({ stage: 'dates', total: filteredDates.length, current: 0 });

    const allCandidates = [];

    // ШАГ 2: Загружаем опционы по датам
    for (let i = 0; i < filteredDates.length; i++) {
        const date = filteredDates[i];
        onProgress({ stage: 'loading', total: filteredDates.length, current: i + 1, date });

        try {
            const response = await fetch(`/api/polygon/ticker/${ticker}/options?expiration_date=${date}`);
            if (!response.ok) continue;

            const data = await response.json();
            if (data.status !== 'success' || !data.options) continue;

            const validOptions = data.options.filter(opt => {
                const type = (opt.type || opt.contract_type || opt.optionType || '').toLowerCase();
                return type === 'put' && (opt.ask || 0) > 0;
            });

            // Находим опцион с ближайшим страйком к целевому
            let closestOption = null;
            let minDifference = Infinity;

            validOptions.forEach(opt => {
                const difference = Math.abs(opt.strike - targetStrikePrice);
                if (difference < minDifference) {
                    minDifference = difference;
                    closestOption = opt;
                }
            });

            if (closestOption) {
                allCandidates.push(closestOption);
            }

        } catch (error) {
            console.error(`Ошибка загрузки ${date}:`, error);
        }
    }

    onProgress({ stage: 'calculating', total: allCandidates.length, current: 0 });

    return selectBestGoldenPut({
        options: allCandidates,
        currentPrice,
        dropPercent,
        exitDay,
        strikeRangePercent,
        profitTolerancePercent
    });
};
