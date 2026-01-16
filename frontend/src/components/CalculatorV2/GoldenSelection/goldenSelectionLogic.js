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
 * НОВАЯ ЛОГИКА ПОДБОРА:
 * 1. К текущей цене базового актива прибавляем значение параметра "Страйк (+%)" и ищем наиболее близкий страйк к этой цене
 * 2. Перебираем все даты экспирации соответствующие параметру "Диапазон даты экспирации" для вычисленного страйка
 * 3. Вычисляем убыток для всех выше найденных опционов при падении цены актива на значение из параметра "Ищем опцион с минимальным убытком при падении актива на (%)"
 * 4. Находим опцион с самым низким убытком. При сравнении убытков используем параметр "Погрешность равной прибыли (%)"
 * 5. Найденный опцион возвращаем с флагом isGoldenOption для визуальной индикации
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
    console.log('👑 Начинаем золотой подбор BuyCALL (НОВАЯ ЛОГИКА)...', {
        ticker,
        currentPrice,
        minDays,
        maxDays,
        growthPercent,
        strikeRangePercent,
        profitTolerancePercent
    });

    // ШАГ 1: Вычисляем целевой страйк (currentPrice + strikeRangePercent%)
    const targetStrikePrice = currentPrice * (1 + strikeRangePercent / 100);
    console.log(`🎯 Целевой страйк: $${targetStrikePrice.toFixed(2)} (+${strikeRangePercent}% от текущей цены $${currentPrice.toFixed(2)})`);

    // Цена при падении на growthPercent%
    const dropPrice = currentPrice * (1 - growthPercent / 100);
    console.log(`📉 Цена при падении на ${growthPercent}%: $${dropPrice.toFixed(2)}`);

    // Фильтрация дат экспирации
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

    const allCandidates = [];

    // ШАГ 2: Перебираем даты экспирации и ищем опционы с ближайшим страйком к целевому
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

            if (validOptions.length === 0) {
                console.log(`📦 Дата ${date}: нет валидных CALL опционов`);
                continue;
            }

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
                console.log(`📦 Дата ${date}: найден ближайший страйк $${closestOption.strike} (разница: $${minDifference.toFixed(2)})`);
                allCandidates.push(closestOption);
            }

        } catch (error) {
            console.error(`Ошибка загрузки ${date}:`, error);
        }
    }

    if (allCandidates.length === 0) {
        return { error: 'NO_CANDIDATES', message: 'Не найдено подходящих опционов' };
    }

    console.log(`📦 Всего кандидатов: ${allCandidates.length}`);
    onProgress({ stage: 'calculating', total: allCandidates.length, current: 0 });

    // ШАГ 3: Вычисляем убыток для каждого кандидата при падении цены
    const candidatesWithLoss = allCandidates.map((opt) => {
        const premium = opt.ask || opt.last_price || 0;
        const strike = opt.strike;
        const expiration = opt.expiration_date || opt.expiration;

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

    // ШАГ 4: Сортировка по убытку (минимальный убыток = минимальное absoluteLoss)
    console.log('='.repeat(80));
    console.log(`👑 СПИСОК ВСЕХ КАНДИДАТОВ (${candidatesWithLoss.length} шт.):`);
    console.log(`👑 Цена при падении: $${dropPrice.toFixed(2)} (падение на ${growthPercent}%)`);
    console.log('-'.repeat(80));
    
    // Выводим все кандидаты с их убытками
    candidatesWithLoss.forEach((c, index) => {
        const costPerContract = c.premium * 100;
        console.log(`👑 ${index + 1}. Страйк $${c.strike} | Экспирация: ${c.candidate.expiration_date} | Дней: ${c.daysToExp} | Премия: $${c.premium.toFixed(2)} | Контракт: $${costPerContract.toFixed(2)} | Убыток: $${c.loss.toFixed(2)}`);
    });
    console.log('-'.repeat(80));
    
    // Сортируем по убытку (по возрастанию absoluteLoss)
    candidatesWithLoss.sort((a, b) => a.absoluteLoss - b.absoluteLoss);
    
    console.log(`🔝 Топ-3 с минимальным убытком:`);
    candidatesWithLoss.slice(0, 3).forEach(c => {
        console.log(`   Страйк ${c.strike}: убыток $${c.loss.toFixed(2)}, премия $${c.premium.toFixed(2)}`);
    });
    
    // Находим группу опционов с минимальным убытком (в пределах погрешности)
    if (candidatesWithLoss.length > 0) {
        const minLoss = candidatesWithLoss[0].absoluteLoss;
        console.log(`💰 Мин убыток: $${candidatesWithLoss[0].loss.toFixed(2)}, Погрешность: ${profitTolerancePercent}%`);
        
        // Фильтруем опционы, чей убыток в пределах погрешности от минимума
        const topCandidates = candidatesWithLoss.filter(c => {
            // Если minLoss = 0, используем абсолютную разницу
            if (minLoss === 0) {
                return c.absoluteLoss <= (currentPrice * c.premium * profitTolerancePercent / 100);
            }
            const percentDiff = (Math.abs(minLoss - c.absoluteLoss) / minLoss) * 100;
            return percentDiff <= profitTolerancePercent;
        });
        
        console.log(`✅ В группе "равного убытка": ${topCandidates.length} опционов`);
        topCandidates.forEach(c => {
            const percentDiff = minLoss === 0 ? 0 : (Math.abs(minLoss - c.absoluteLoss) / minLoss) * 100;
            console.log(`   Страйк ${c.strike}: убыток $${c.loss.toFixed(2)}, разница ${percentDiff.toFixed(2)}%, стоимость $${(c.premium * 100).toFixed(2)}`);
        });
        
        // Среди опционов с "равным убытком" выбираем самый дешевый
        topCandidates.sort((a, b) => {
            const costA = a.premium * 100;
            const costB = b.premium * 100;
            return costA - costB;
        });
        
        console.log(`💵 Топ-3 самых дешевых в группе:`);
        topCandidates.slice(0, 3).forEach(c => {
            const percentDiff = minLoss === 0 ? 0 : (Math.abs(minLoss - c.absoluteLoss) / minLoss) * 100;
            console.log(`   Страйк ${c.strike}: стоимость $${(c.premium * 100).toFixed(2)}, убыток $${c.loss.toFixed(2)} (${percentDiff.toFixed(2)}%)`);
        });
        
        // Выбираем лучший (минимальный убыток + минимальная стоимость)
        const bestOption = topCandidates[0];
        console.log(`✨ ВЫБРАН: Страйк ${bestOption.strike}, убыток $${bestOption.loss.toFixed(2)}, стоимость $${(bestOption.premium * 100).toFixed(2)}`);
        console.log('='.repeat(80));

        if (bestOption) {
            console.log('✨ Лучший Golden Option:', bestOption);
            return {
                ...bestOption.candidate,
                calculatedLoss: bestOption.loss,
                dropPrice: dropPrice,
                isGoldenOption: true // Флаг для визуальной индикации
            };
        }
    }

    return { error: 'NO_OPTIONS', message: 'Не найдено опционов' };
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
    minDays = 8,
    maxDays = 100,
    dropPercent = -2.5,
    exitDay = 5,
    strikeRangePercent = 5,
    profitTolerancePercent = 5,
    existingCallOption = null,
    onProgress = () => { }
}) => {
    console.log('👑 Начинаем золотой подбор BuyPUT (НОВАЯ ЛОГИКА)...', {
        ticker,
        currentPrice,
        minDays,
        maxDays,
        dropPercent,
        exitDay,
        strikeRangePercent,
        profitTolerancePercent
    });

    // ШАГ 1: Вычисляем целевой страйк (currentPrice + strikeRangePercent%)
    // ЗАЧЕМ: Для PUT опциона ищем страйк ВЫШЕ текущей цены для защиты от падения
    const targetStrikePrice = currentPrice * (1 + strikeRangePercent / 100);
    console.log(`👑 Целевой страйк: $${targetStrikePrice.toFixed(2)} (+${strikeRangePercent}% от текущей цены $${currentPrice.toFixed(2)})`);

    // Цена при падении на dropPercent%
    const dropPrice = currentPrice * (1 + dropPercent / 100);
    console.log(`👑 Цена при падении на ${dropPercent}%: $${dropPrice.toFixed(2)}`);

    // Фильтрация дат экспирации
    const filteredDates = filterDatesByRange(availableDates, minDays, maxDays);
    console.log(`👑 Подходящие даты (${minDays}-${maxDays} дней): ${filteredDates.length}`);

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

    const allCandidates = [];

    // ШАГ 2: Перебираем даты экспирации и ищем опционы с ближайшим страйком к целевому
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

            if (validOptions.length === 0) {
                console.log(`👑 Дата ${date}: нет валидных PUT опционов`);
                continue;
            }

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
                console.log(`👑 Дата ${date}: найден ближайший страйк $${closestOption.strike} (разница: $${minDifference.toFixed(2)})`);
                allCandidates.push(closestOption);
            }

        } catch (error) {
            console.error(`Ошибка загрузки ${date}:`, error);
        }
    }

    if (allCandidates.length === 0) {
        return { error: 'NO_CANDIDATES', message: 'Не найдено подходящих PUT опционов' };
    }

    console.log(`👑 Всего кандидатов: ${allCandidates.length}`);
    onProgress({ stage: 'calculating', total: allCandidates.length, current: 0 });

    // ШАГ 3: Вычисляем прибыль для каждого кандидата при падении цены на день exitDay
    const candidatesWithProfit = allCandidates.map((opt) => {
        const premium = opt.ask || opt.last_price || 0;
        const strike = opt.strike;
        const expiration = opt.expiration_date || opt.expiration;

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
    console.log('='.repeat(80));
    console.log(`👑 СПИСОК ВСЕХ КАНДИДАТОВ (${candidatesWithProfit.length} шт.):`);
    console.log(`👑 Цена при падении: $${dropPrice.toFixed(2)} (падение на ${dropPercent}%)`);
    console.log(`👑 День выхода: ${exitDay}`);
    console.log('-'.repeat(80));
    
    // Выводим все кандидаты с их прибылью
    candidatesWithProfit.forEach((c, index) => {
        const costPerContract = c.premium * 100;
        console.log(`👑 ${index + 1}. Страйк $${c.strike} | Экспирация: ${c.candidate.expiration_date} | Дней: ${c.daysToExp} | Премия: $${c.premium.toFixed(2)} | Контракт: $${costPerContract.toFixed(2)} | Прибыль: $${c.profit.toFixed(2)}`);
    });
    console.log('-'.repeat(80));
    
    // Сортируем по прибыли (по убыванию)
    candidatesWithProfit.sort((a, b) => b.profit - a.profit);
    
    console.log(`👑 Топ-3 с максимальной прибылью:`);
    candidatesWithProfit.slice(0, 3).forEach(c => {
        console.log(`   Страйк ${c.strike}: прибыль $${c.profit.toFixed(2)}, премия $${c.premium.toFixed(2)}`);
    });
    
    // Находим группу опционов с максимальной прибылью (в пределах погрешности)
    if (candidatesWithProfit.length > 0) {
        const maxProfit = candidatesWithProfit[0].profit;
        console.log(`👑 Макс прибыль: $${maxProfit.toFixed(2)}, Погрешность: ${profitTolerancePercent}%`);
        
        // Фильтруем опционы, чья прибыль в пределах погрешности от максимума
        const topCandidates = candidatesWithProfit.filter(c => {
            // Если maxProfit <= 0, используем абсолютную разницу
            if (maxProfit <= 0) {
                return c.profit >= maxProfit - (currentPrice * c.premium * profitTolerancePercent / 100);
            }
            const percentDiff = (Math.abs(maxProfit - c.profit) / maxProfit) * 100;
            return percentDiff <= profitTolerancePercent;
        });
        
        console.log(`👑 В группе "равной прибыли": ${topCandidates.length} опционов`);
        topCandidates.forEach(c => {
            const percentDiff = maxProfit <= 0 ? 0 : (Math.abs(maxProfit - c.profit) / maxProfit) * 100;
            console.log(`   Страйк ${c.strike}: прибыль $${c.profit.toFixed(2)}, разница ${percentDiff.toFixed(2)}%, стоимость $${(c.premium * 100).toFixed(2)}`);
        });
        
        // Среди опционов с "равной прибылью" выбираем самый дешевый
        topCandidates.sort((a, b) => {
            const costA = a.premium * 100;
            const costB = b.premium * 100;
            return costA - costB;
        });
        
        console.log(`👑 Топ-3 самых дешевых в группе:`);
        topCandidates.slice(0, 3).forEach(c => {
            const percentDiff = maxProfit <= 0 ? 0 : (Math.abs(maxProfit - c.profit) / maxProfit) * 100;
            console.log(`   Страйк ${c.strike}: стоимость $${(c.premium * 100).toFixed(2)}, прибыль $${c.profit.toFixed(2)} (${percentDiff.toFixed(2)}%)`);
        });
        
        // Выбираем лучший (максимальная прибыль + минимальная стоимость)
        const bestOption = topCandidates[0];
        console.log(`👑 ВЫБРАН: Страйк ${bestOption.strike}, прибыль $${bestOption.profit.toFixed(2)}, стоимость $${(bestOption.premium * 100).toFixed(2)}`);
        console.log('='.repeat(80));

        if (bestOption) {
            console.log('👑 Лучший Golden PUT Option:', bestOption);
            return {
                ...bestOption.candidate,
                calculatedProfit: bestOption.profit,
                dropPrice: dropPrice,
                exitDay: exitDay,
                isGoldenOption: true // Флаг для визуальной индикации
            };
        }
    }

    return { error: 'NO_OPTIONS', message: 'Не найдено опционов' };
};
