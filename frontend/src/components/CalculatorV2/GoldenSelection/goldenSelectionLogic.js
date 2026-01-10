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
 * Найти лучший Buy CALL опцион (Золотой подбор)
 * 
 * Параметры подбора:
 * - Дата экспирации: minDays - maxDays
 * - Страйк: все страйки в диапазоне ±strikeRangePercent% от текущей цены
 * - Ожидаемый рост: growthPercent
 * - Погрешность равной прибыли: profitTolerancePercent
 * 
 * Критерий выбора: 
 * 1. Максимальная прибыль при достижении целевой цены
 * 2. При одинаковой прибыли (разница ≤ profitTolerancePercent%) - минимальная стоимость (премия)
 */
export const findBestGoldenBuyCall = async ({
    ticker,
    currentPrice,
    availableDates = [],
    minDays = 60,
    maxDays = 100,
    growthPercent = 50,
    strikeRangePercent = 20,
    profitTolerancePercent = 5,
    onProgress = () => { }
}) => {
    console.log('👑 Начинаем золотой подбор BuyCALL...', {
        ticker,
        currentPrice,
        minDays,
        maxDays,
        growthPercent,
        strikeRangePercent,
        profitTolerancePercent
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

            // Фильтр: страйки в диапазоне ±strikeRangePercent% от текущей цены
            const minStrike = currentPrice * (1 - strikeRangePercent / 100);
            const maxStrike = currentPrice * (1 + strikeRangePercent / 100);

            console.log(`🎯 Диапазон страйков для цены $${currentPrice.toFixed(2)} (±${strikeRangePercent}%): $${minStrike.toFixed(2)} - $${maxStrike.toFixed(2)}`);

            const rangeStrikeOptions = validOptions.filter(opt => 
                opt.strike >= minStrike && opt.strike <= maxStrike
            );

            console.log(`📦 Дата ${date}: найдено ${rangeStrikeOptions.length} CALL опционов в диапазоне страйков`);
            allCandidates.push(...rangeStrikeOptions);

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

    // Шаг 4: Сортировка по прибыли (desc), при одинаковой прибыли - по стоимости (asc)
    // ЗАЧЕМ: Максимизируем прибыль, при равной прибыли (в пределах погрешности) выбираем более дешевый опцион
    
    console.log('='.repeat(80));
    console.log(`📊 СОРТИРОВКА: Всего кандидатов = ${candidatesWithProfit.length}`);
    
    // Сначала сортируем по прибыли (по убыванию)
    candidatesWithProfit.sort((a, b) => b.profit - a.profit);
    
    console.log(`🔝 Топ-3 по прибыли:`);
    candidatesWithProfit.slice(0, 3).forEach(c => {
        console.log(`   Страйк ${c.strike}: прибыль $${c.profit.toFixed(2)}, премия $${c.premium.toFixed(2)}`);
    });
    
    // Находим группу опционов с максимальной прибылью (в пределах погрешности)
    if (candidatesWithProfit.length > 0) {
        const maxProfit = candidatesWithProfit[0].profit;
        console.log(`💰 Макс прибыль: $${maxProfit.toFixed(2)}, Погрешность: ${profitTolerancePercent}%`);
        
        // Фильтруем опционы, чья прибыль в пределах погрешности от максимума
        const topCandidates = candidatesWithProfit.filter(c => {
            const percentDiff = (Math.abs(maxProfit - c.profit) / Math.abs(maxProfit)) * 100;
            return percentDiff <= profitTolerancePercent;
        });
        
        console.log(`✅ В группе "равной прибыли": ${topCandidates.length} опционов`);
        topCandidates.forEach(c => {
            const percentDiff = (Math.abs(maxProfit - c.profit) / Math.abs(maxProfit)) * 100;
            console.log(`   Страйк ${c.strike}: прибыль $${c.profit.toFixed(2)}, разница ${percentDiff.toFixed(2)}%, стоимость $${(c.premium * 100).toFixed(2)}`);
        });
        
        // Среди всех опционов с "равной прибылью" (в пределах 5%) выбираем самый дешевый
        topCandidates.sort((a, b) => {
            const costA = a.premium * 100;
            const costB = b.premium * 100;
            return costA - costB;
        });
        
        console.log(`💵 Топ-3 самых дешевых в группе:`);
        topCandidates.slice(0, 3).forEach(c => {
            const percentDiff = (Math.abs(maxProfit - c.profit) / Math.abs(maxProfit)) * 100;
            console.log(`   Страйк ${c.strike}: стоимость $${(c.premium * 100).toFixed(2)}, прибыль $${c.profit.toFixed(2)} (${percentDiff.toFixed(2)}%)`);
        });
        
        // Выбираем лучший (максимальная прибыль + минимальная стоимость)
        const bestOption = topCandidates[0];
        console.log(`✨ ВЫБРАН: Страйк ${bestOption.strike}, прибыль $${bestOption.profit.toFixed(2)}, стоимость $${(bestOption.premium * 100).toFixed(2)}`);
        console.log('='.repeat(80));

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
    }

    return { error: 'NO_PROFITABLE_OPTIONS', message: 'Не найдено прибыльных опционов при заданном росте' };
};

/**
 * Найти лучший Buy PUT опцион (Золотой подбор - Сценарий 3)
 * Хеджирование рисков
 * 
 * @param {object} existingCallOption - Существующий BuyCALL опцион для расчета убытка
 * @param {number} profitTolerancePercent - Погрешность равной прибыли (%)
 */
export const findBestGoldenBuyPut = async ({
    ticker,
    currentPrice,
    availableDates = [],
    minDays = 5,
    maxDays = 10,
    dropPercent = -2.5,
    exitDay = 5,
    strikeRangePercent = 20,
    minOI = 100,
    profitTolerancePercent = 5,
    existingCallOption = null,
    onProgress = () => { }
}) => {
    console.log('🛡️ Начинаем золотой подбор BuyPUT (Hedge)...', {
        ticker,
        currentPrice,
        minDays,
        maxDays,
        dropPercent,
        exitDay,
        strikeRangePercent,
        minOI,
        existingCallOption
    });

    // Шаг 1: Вычисляем цену базового актива при падении
    const dropPrice = currentPrice * (1 + dropPercent / 100);
    console.log(`📉 Цена при падении на ${dropPercent}%: $${dropPrice.toFixed(2)}`);

    // Шаг 2: Вычисляем убыток BuyCALL опциона через exitDay дней
    let callLoss = 0;
    if (existingCallOption) {
        // Рассчитываем дни до экспирации CALL на момент выхода
        const callExpirationDate = existingCallOption.expiration_date || existingCallOption.expirationDate || existingCallOption.date;
        const daysToCallExpiration = calculateDaysToExpiration(callExpirationDate);
        const daysRemainingAtExit = Math.max(0, daysToCallExpiration - exitDay);

        // Подготовка объекта для расчета P&L
        const callForCalc = {
            ...existingCallOption,
            type: 'CALL',
            action: 'Buy',
            quantity: existingCallOption.quantity || 1,
            strike: existingCallOption.strike,
            premium: existingCallOption.premium || existingCallOption.ask,
            ask: existingCallOption.premium || existingCallOption.ask,
            expiration_date: callExpirationDate
        };

        try {
            callLoss = calculateOptionPLValue(
                callForCalc,
                dropPrice,           // Цена актива при падении
                currentPrice,
                daysRemainingAtExit, // Дней до экспирации на момент выхода
                null,                // volatility
                0                    // dividendYield
            );
        } catch (e) {
            console.error('Ошибка расчета убытка CALL:', e);
            callLoss = 0;
        }

        console.log(`💸 Убыток BuyCALL на день ${exitDay} при падении: $${callLoss.toFixed(2)}`);
    } else {
        console.warn('⚠️ Не передан existingCallOption, убыток CALL = 0');
    }

    // Шаг 3: Фильтрация дат экспирации
    const filteredDates = filterDatesByRange(availableDates, minDays, maxDays);
    console.log(`📅 Подходящие даты (${minDays}-${maxDays} дней): ${filteredDates.length}`);

    if (filteredDates.length === 0) {
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

    // Шаг 4: Вычисляем диапазон страйков
    const minStrike = currentPrice * (1 - strikeRangePercent / 100);
    const maxStrike = currentPrice * (1 + strikeRangePercent / 100);
    console.log(`🎯 Диапазон страйков: $${minStrike.toFixed(2)} - $${maxStrike.toFixed(2)}`);

    const allCandidates = [];

    // Шаг 5: Сбор кандидатов PUT опционов
    for (let i = 0; i < filteredDates.length; i++) {
        const date = filteredDates[i];
        onProgress({ stage: 'loading', total: filteredDates.length, current: i + 1, date });

        try {
            const response = await fetch(`/api/polygon/ticker/${ticker}/options?expiration_date=${date}`);
            if (!response.ok) continue;

            const data = await response.json();
            if (data.status !== 'success' || !data.options) continue;

            // Фильтр: только PUT
            const putOptions = data.options.filter(opt => {
                const type = (opt.type || opt.contract_type || opt.optionType || '').toLowerCase();
                return type === 'put';
            });

            // Фильтр: валидная цена (ask > 0)
            const validOptions = putOptions.filter(opt => (opt.ask || 0) > 0);

            // Фильтр: страйки в диапазоне
            const strikeFilteredOptions = validOptions.filter(opt => {
                const strike = opt.strike;
                return strike >= minStrike && strike <= maxStrike;
            });

            // Фильтр: минимальный Open Interest
            const liquidOptions = strikeFilteredOptions.filter(opt => {
                const oi = opt.open_interest || opt.openInterest || 0;
                return oi >= minOI;
            });

            console.log(`📦 Дата ${date}: найдено ${liquidOptions.length} PUT опционов (OI >= ${minOI})`);
            allCandidates.push(...liquidOptions);

        } catch (error) {
            console.error(`Ошибка загрузки ${date}:`, error);
        }
    }

    if (allCandidates.length === 0) {
        return { 
            error: 'NO_CANDIDATES', 
            message: `Не найдено PUT опционов с OI >= ${minOI} в диапазоне страйков ±${strikeRangePercent}%` 
        };
    }

    console.log(`📦 Всего кандидатов PUT: ${allCandidates.length}`);
    onProgress({ stage: 'calculating', total: allCandidates.length, current: 0 });

    // Шаг 6: Расчет прибыли PUT опционов и выбор оптимального
    const candidatesWithMetrics = allCandidates.map((opt) => {
        const premium = opt.ask || opt.last_price || 0;
        const strike = opt.strike;
        const expiration = opt.expiration_date || opt.expiration;
        const openInterest = opt.open_interest || opt.openInterest || 0;

        // Рассчитываем дни до экспирации PUT на момент выхода
        const daysToExpiration = calculateDaysToExpiration(expiration);
        const daysRemainingAtExit = Math.max(0, daysToExpiration - exitDay);

        // Подготовка объекта для расчета P&L
        const putForCalc = {
            ...opt,
            type: 'PUT',
            action: 'Buy',
            quantity: 1,
            strike: strike,
            premium: premium,
            ask: premium,
            expiration_date: expiration
        };

        // Расчет прибыли PUT при падении цены на exitDay
        let putProfit = 0;
        try {
            putProfit = calculateOptionPLValue(
                putForCalc,
                dropPrice,           // Цена актива при падении
                currentPrice,
                daysRemainingAtExit, // Дней до экспирации на момент выхода
                null,                // volatility
                0                    // dividendYield
            );
        } catch (e) {
            console.error('Ошибка расчета прибыли PUT:', e);
            putProfit = 0;
        }

        // Защита от NaN
        if (!Number.isFinite(putProfit)) {
            putProfit = 0;
        }

        // Стоимость покупки PUT (премия × 100)
        const cost = premium * 100;

        // Чистая компенсация = прибыль PUT - убыток CALL
        const netCompensation = putProfit + callLoss; // callLoss отрицательный, поэтому +

        return {
            candidate: { ...opt, expiration_date: expiration },
            premium,
            strike,
            putProfit,
            cost,
            netCompensation,
            openInterest,
            daysToExp: daysToExpiration,
            coversLoss: netCompensation >= 0 // Перекрывает ли убыток
        };
    });

    // Фильтруем только те PUT, которые перекрывают убыток CALL
    const coveringPuts = candidatesWithMetrics.filter(c => c.coversLoss);

    if (coveringPuts.length === 0) {
        // Если нет PUT, которые полностью перекрывают убыток, берем лучший по компенсации
        console.warn('⚠️ Нет PUT опционов, полностью перекрывающих убыток. Выбираем лучший по компенсации.');
        candidatesWithMetrics.sort((a, b) => b.netCompensation - a.netCompensation);
        const bestPartial = candidatesWithMetrics[0];
        
        if (bestPartial) {
            console.log('✨ Лучший PUT (частичная компенсация):', bestPartial);
            return {
                ...bestPartial.candidate,
                calculatedProfit: bestPartial.putProfit,
                calculatedCost: bestPartial.cost,
                netCompensation: bestPartial.netCompensation,
                dropPrice: dropPrice,
                exitDay: exitDay,
                warning: `Частичная компенсация: $${bestPartial.netCompensation.toFixed(2)}`
            };
        }
    } else {
        // Сортируем по прибыли PUT опциона (по убыванию) - выбираем с максимальной прибылью
        // ЗАЧЕМ: Максимизируем прибыль PUT опциона, при равной прибыли (в пределах погрешности) выбираем более дешевый
        
        // Сначала сортируем по прибыли PUT (по убыванию)
        coveringPuts.sort((a, b) => b.putProfit - a.putProfit);
        
        // Находим группу PUT опционов с максимальной прибылью (в пределах погрешности)
        const maxPutProfit = coveringPuts[0].putProfit;
        const topPuts = coveringPuts.filter(c => {
            const percentDiff = (Math.abs(maxPutProfit - c.putProfit) / Math.abs(maxPutProfit)) * 100;
            return percentDiff <= profitTolerancePercent;
        });
        
        // Среди PUT с равной прибылью выбираем самый дешевый
        topPuts.sort((a, b) => a.cost - b.cost);
        
        const bestPut = topPuts[0];

        console.log('✨ Лучший PUT (полная компенсация):', bestPut);
        console.log(`   Чистая компенсация: $${bestPut.netCompensation.toFixed(2)}, Стоимость: $${bestPut.cost.toFixed(2)}, Страйк: $${bestPut.strike}`);
        return {
            ...bestPut.candidate,
            calculatedProfit: bestPut.putProfit,
            calculatedCost: bestPut.cost,
            netCompensation: bestPut.netCompensation,
            dropPrice: dropPrice,
            exitDay: exitDay
        };
    }

    return { 
        error: 'NO_SUITABLE_OPTIONS', 
        message: 'Не найдено подходящих PUT опционов' 
    };
};
