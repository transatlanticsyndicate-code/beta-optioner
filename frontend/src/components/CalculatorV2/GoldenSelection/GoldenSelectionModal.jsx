/**
 * Модальное окно "Золотой подбор" опционов
 * Сценарий 1: Проверка на пустое состояние калькулятора
 */

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Crown, AlertCircle, CheckCircle, Loader2, Link, ChevronDown, ChevronUp } from 'lucide-react';
import {
    findBestGoldenBuyCall,
    findBestGoldenBuyPut,
    selectBestGoldenCall,
    selectBestGoldenPut
} from './goldenSelectionLogic';
import { sendRefreshSingleStrikeCommand } from '../../../hooks/useExtensionData';

/**
 * Компонент модального окна золотого подбора
 */
function GoldenSelectionModal({
    isOpen,
    positions = [],
    options = [],
    currentPrice = 0,
    selectedTicker = '',
    availableDates = [],
    onAddOption,
    onClose,
    onSetSimulationParams,
    isFromExtension = false // Флаг: данные от расширения TradingView (для универсального калькулятора)
}) {
    // Состояния для Сценария 2
    const [step, setStep] = React.useState('check'); // 'check', 'input', 'searching', 'result'
    const [minDays, setMinDays] = React.useState(90);
    const [maxDays, setMaxDays] = React.useState(300);
    const [growthPercent, setGrowthPercent] = React.useState(5);
    const [growthPriceInput, setGrowthPriceInput] = React.useState(''); // State for direct price input for scenario 2
    const [strikeRangePercentCall, setStrikeRangePercentCall] = React.useState(5);
    const [profitTolerancePercentCall, setProfitTolerancePercentCall] = React.useState(5);
    const [searchResult, setSearchResult] = React.useState(null);
    const [error, setError] = React.useState(null);
    // Состояния для Сценария 3 (Buy Put)
    const [minDaysPut, setMinDaysPut] = React.useState(8);
    const [maxDaysPut, setMaxDaysPut] = React.useState(100);
    const [dropPercent, setDropPercent] = React.useState(-2.5);
    const [exitDay, setExitDay] = React.useState(5);
    const [strikeRangePercent, setStrikeRangePercent] = React.useState(5);
    const [profitTolerancePercentPut, setProfitTolerancePercentPut] = React.useState(5);
    const [targetPriceInput, setTargetPriceInput] = React.useState(''); // State for direct price input
    const [progress, setProgress] = React.useState('');
    const [isParamsCollapsed, setIsParamsCollapsed] = React.useState(true);

    // НОВОЕ: Состояние ожидания ответа от расширения
    const [isWaitingForExtension, setIsWaitingForExtension] = React.useState(false);

    // Проверка условия Сценария 1: Калькулятор должен быть пуст
    const isEmptyState = positions.length === 0 && options.length === 0;

    // Проверка условия Сценария 3: Есть ровно один Buy CALL опцион
    // Используем более гибкую проверку типов и стейта
    const hasOneCall = options.length === 1 && (
        (options[0].type && options[0].type.toUpperCase() === 'CALL') ||
        (options[0].optionType && options[0].optionType.toUpperCase() === 'CALL')
    );
    const isBuy = options.length === 1 && (
        (options[0].side && options[0].side.toLowerCase() === 'long') ||
        (options[0].action && options[0].action.toUpperCase() === 'BUY')
    );
    const isScenario3 = hasOneCall && isBuy && positions.length === 0;

    // TODO: Удалить логи после отладки
    React.useEffect(() => {
        if (isOpen) {
            console.log('🔍 GoldenModal Debug:', {
                isOpen,
                optionsCount: options.length,
                positionsCount: positions.length,
                firstOption: options[0],
                isScenario3,
                check: { hasOneCall, isBuy }
            });
        }
    }, [isOpen, options, positions, isScenario3, hasOneCall, isBuy]);

    // Initialize targetPriceInput when modal opens or defaults change (Scenario 3)
    React.useEffect(() => {
        if (isOpen && currentPrice && dropPercent) {
            const price = currentPrice * (1 + Number(dropPercent) / 100);
            setTargetPriceInput(price.toFixed(2));
        }
    }, [isOpen, currentPrice]); // Only on open to avoid overriding user input during typing if we added dropPercent dependency carelessly

    // Initialize growthPriceInput when modal opens or defaults change (Scenario 2)
    // ЗАЧЕМ: Рассчитываем цену при ПАДЕНИИ актива на growthPercent%
    React.useEffect(() => {
        if (isOpen && currentPrice && growthPercent) {
            // Формула падения: currentPrice * (1 - percent / 100)
            const price = currentPrice * (1 - Number(growthPercent) / 100);
            setGrowthPriceInput(price.toFixed(2));
        }
    }, [isOpen, currentPrice]); // Only on open to avoid overriding user input during typing

    // Активный сценарий
    const activeScenario = isEmptyState ? 'SCENARIO_2' : (isScenario3 ? 'SCENARIO_3' : 'INVALID');

    // Сброс шагов при открытии/закрытии
    React.useEffect(() => {
        if (isOpen) {
            console.log('👑 GoldenModal: Модальное окно открыто, activeScenario:', activeScenario, 'step:', step);
            setStep('check');
            setSearchResult(null);
            setError(null);
            setIsWaitingForExtension(false);
        }
    }, [isOpen]);

    // Handlers for two-way binding
    const handleDropPercentChange = (e) => {
        const val = e.target.value;
        setDropPercent(val);
        if (currentPrice && !isNaN(parseFloat(val))) {
            const price = currentPrice * (1 + parseFloat(val) / 100);
            setTargetPriceInput(price.toFixed(2));
        } else {
            setTargetPriceInput('');
        }
    };

    const handleTargetPriceChange = (e) => {
        const val = e.target.value;
        setTargetPriceInput(val);
        if (currentPrice && !isNaN(parseFloat(val)) && parseFloat(val) > 0) {
            const percent = ((parseFloat(val) - currentPrice) / currentPrice) * 100;
            setDropPercent(percent.toFixed(2));
        } else {
            // If empty or invalid, maybe don't update percent immediately or set to 0?
            // Let's keep percent as is or set to 0 if cleared? 
            // Better to let it be flexible.
        }
    };

    // Handlers for two-way binding (Scenario 2)
    // Обработчик изменения процента падения (Scenario 2)
    // ЗАЧЕМ: При вводе процента падения пересчитываем целевую цену
    const handleGrowthPercentChange = (e) => {
        const val = e.target.value;
        setGrowthPercent(val);
        if (currentPrice && !isNaN(parseFloat(val))) {
            // Формула падения: currentPrice * (1 - percent / 100)
            const price = currentPrice * (1 - parseFloat(val) / 100);
            setGrowthPriceInput(price.toFixed(2));
        } else {
            setGrowthPriceInput('');
        }
    };

    // Обработчик изменения целевой цены падения (Scenario 2)
    // ЗАЧЕМ: При вводе цены пересчитываем процент падения
    const handleGrowthPriceChange = (e) => {
        const val = e.target.value;
        setGrowthPriceInput(val);
        if (currentPrice && !isNaN(parseFloat(val)) && parseFloat(val) > 0) {
            // Формула: percent = (currentPrice - targetPrice) / currentPrice * 100
            // Положительный процент = падение цены
            const percent = ((currentPrice - parseFloat(val)) / currentPrice) * 100;
            setGrowthPercent(percent.toFixed(2));
        }
    };

    // НОВОЕ: Эффект для обработки ответа от расширения
    // ЗАЧЕМ: Когда мы ждем обновления от расширения, мы следим за изменением массива options
    React.useEffect(() => {
        if (!isWaitingForExtension || !isFromExtension) return;

        // Если это первый запуск и опционов еще нет, ждем
        if (options.length === 0) return;

        console.log('👑 [Extension Response] Опционы обновлены, запускаем подбор...', {
            optionsCount: options.length,
            waiting: isWaitingForExtension
        });

        // Запускаем логику подбора на НОВЫХ данных
        let result;
        if (activeScenario === 'SCENARIO_2') {
            result = selectBestGoldenCall({
                options: options,
                currentPrice,
                growthPercent: Number(growthPercent),
                strikeRangePercent: Number(strikeRangePercentCall),
                profitTolerancePercent: Number(profitTolerancePercentCall)
            });
        } else if (activeScenario === 'SCENARIO_3') {
            result = selectBestGoldenPut({
                options: options, // В этом списке могут быть и CALL и PUT, функция сама отфильтрует
                currentPrice,
                dropPercent: Number(dropPercent),
                exitDay: Number(exitDay),
                strikeRangePercent: Number(strikeRangePercent),
                profitTolerancePercent: Number(profitTolerancePercentPut)
            });
        }

        console.log('👑 [Extension Response] Результат подбора:', result);

        if (result && !result.error) {
            addOptionToTable(result);
            setIsWaitingForExtension(false);
        } else {
            // Возможно пришли не те данные (например только CALL, а мы ждем PUT)
            // Продолжаем ждать или показываем ошибку если таймаут?
            // Пока просто логируем ошибку поиска, но не сбрасываем ожидание сразу, вдруг данные еще догружаются?
            // Или сбрасываем? Обычно расширение обновляет все сразу.
            console.log('👑 [Extension Response] Ошибка подбора:', result?.message);
            // Если ошибка "Нет валидных...", возможно данные еще не пришли полностью?
            // Но мы реагируем на КАЖДОЕ обновление options.
            // Если результат отрицательный, лучше показать ошибку в UI
            setError(result?.message || 'Не удалось подобрать опцион по обновленным данным');
            setStep('input');
            setIsWaitingForExtension(false);
        }

    }, [
        options, // Следим за изменением опционов
        isWaitingForExtension,
        isFromExtension,
        activeScenario,
        currentPrice,
        growthPercent,
        strikeRangePercentCall,
        profitTolerancePercentCall,
        dropPercent,
        exitDay,
        strikeRangePercent,
        profitTolerancePercentPut
    ]);

    const handleSearch = async () => {
        console.log('👑 handleSearch: Начинаем поиск, сценарий:', activeScenario);
        setStep('searching');
        setError(null);
        setProgress('Начинаем поиск...');

        // РЕЖИМ РАСШИРЕНИЯ: Отправляем команду refresh_single_strike в расширение TradingView
        // ЗАЧЕМ: Расширение соберет данные опционов с одним страйком (currentPrice + strikePercent%)
        if (isFromExtension) {
            setIsWaitingForExtension(true);
            setProgress('Ожидание данных от расширения...');

            if (activeScenario === 'SCENARIO_2') {
                // Шаг 1: BuyCALL — страйк = currentPrice + strikeRangePercentCall%
                sendRefreshSingleStrikeCommand(
                    Number(minDays),              // daysFrom: из UI, по умолчанию 90
                    Number(maxDays),              // daysTo: из UI, по умолчанию 300
                    Number(strikeRangePercentCall) // strikePercent: +5% от текущей цены
                );
                console.log(`📤 [Extension] Отправлена команда refresh_single_strike для BuyCALL: days ${minDays}-${maxDays}, strike +${strikeRangePercentCall}%`);
            } else if (activeScenario === 'SCENARIO_3') {
                // Шаг 2: BuyPUT — страйк = currentPrice + strikeRangePercent%
                sendRefreshSingleStrikeCommand(
                    Number(minDaysPut),           // daysFrom: из UI, по умолчанию 8
                    Number(maxDaysPut),           // daysTo: из UI, по умолчанию 100
                    Number(strikeRangePercent)    // strikePercent: +5% от текущей цены
                );
                console.log(`📤 [Extension] Отправлена команда refresh_single_strike для BuyPUT: days ${minDaysPut}-${maxDaysPut}, strike +${strikeRangePercent}%`);
            }

            // Больше ничего не делаем, ждем useEffect который сработает при обновлении options
            return;
        }

        try {
            let result;

            if (activeScenario === 'SCENARIO_2') {
                console.log('👑 handleSearch: Вызываем findBestGoldenBuyCall с параметрами:', {
                    ticker: selectedTicker,
                    currentPrice,
                    minDays: Number(minDays),
                    maxDays: Number(maxDays),
                    growthPercent: Number(growthPercent),
                    strikeRangePercent: Number(strikeRangePercentCall),
                    profitTolerancePercent: Number(profitTolerancePercentCall)
                });
                result = await findBestGoldenBuyCall({
                    ticker: selectedTicker,
                    currentPrice,
                    availableDates,
                    minDays: Number(minDays),
                    maxDays: Number(maxDays),
                    growthPercent: Number(growthPercent),
                    strikeRangePercent: Number(strikeRangePercentCall),
                    profitTolerancePercent: Number(profitTolerancePercentCall),
                    onProgress: (p) => {
                        if (p.stage === 'loading') setProgress(`Загрузка даты ${p.current}/${p.total}...`);
                        if (p.stage === 'calculating') setProgress('Расчет прибыли...');
                    }
                });
                console.log('👑 handleSearch: Результат findBestGoldenBuyCall:', result);
            } else if (activeScenario === 'SCENARIO_3') {
                result = await findBestGoldenBuyPut({
                    ticker: selectedTicker,
                    currentPrice,
                    availableDates,
                    minDays: Number(minDaysPut),
                    maxDays: Number(maxDaysPut),
                    dropPercent: Number(dropPercent),
                    exitDay: Number(exitDay),
                    strikeRangePercent: Number(strikeRangePercent),
                    profitTolerancePercent: Number(profitTolerancePercentPut),
                    existingCallOption: options[0], // Передаем существующий CALL опцион
                    onProgress: (p) => {
                        if (p.stage === 'loading') setProgress(`Загрузка даты ${p.current}/${p.total}...`);
                        if (p.stage === 'calculating') setProgress('Расчет прибыли PUT опционов...');
                    }
                });
            }

            console.log('👑 handleSearch: Проверяем результат - error:', result?.error, 'result:', result);
            if (result && !result.error) {
                console.log('👑 handleSearch: Результат успешный, добавляем опцион');
                // СРАЗУ добавляем опцион в таблицу и закрываем окно
                addOptionToTable(result);
            } else {
                console.log('👑 handleSearch: Ошибка или нет результата:', result?.message);
                setError(result?.message || 'Не удалось найти опцион');
                setStep('input');
            }
        } catch (err) {
            console.error('👑 handleSearch: Исключение:', err);
            setError('Произошла ошибка при поиске');
            setStep('input');
        }
    };

    const addOptionToTable = (result) => {
        if (result && onAddOption) {
            // Определяем тип опциона по сценарию
            const optionType = activeScenario === 'SCENARIO_2' ? 'CALL' : 'PUT';

            // Форматируем для добавления в таблицу
            const optionToAdd = {
                ...result,
                type: optionType,
                side: 'long', // Buy
                strike: result.strike,
                premium: result.premium || result.ask || result.last_price,
                // Shim: expiration -> date (как ожидает таблица)
                date: result.expiration_date || result.expiration,
                expiration_date: result.expiration_date || result.expiration,
                expirationDate: result.expiration_date || result.expiration, // ВАЖНО: OptionsCalculatorBasic ждет именно это поле
                action: 'Buy', // Явно указываем action
                isGoldenOption: result.isGoldenOption || false // Флаг для визуальной индикации золотой короны
            };
            console.log('👑 GoldenModal: Добавляем опцион с флагом isGoldenOption:', optionToAdd.isGoldenOption, optionToAdd);
            onAddOption(optionToAdd);

            // Для Сценария 2: устанавливаем параметры симуляции (цена при падении, 5 дней)
            if (activeScenario === 'SCENARIO_2' && result.dropPrice && onSetSimulationParams) {
                onSetSimulationParams({
                    targetPrice: result.dropPrice,
                    daysPassed: 5
                });
            }

            // Для Сценария 3: устанавливаем параметры симуляции
            if (activeScenario === 'SCENARIO_3' && result.dropPrice && result.exitDay && onSetSimulationParams) {
                onSetSimulationParams({
                    targetPrice: result.dropPrice,
                    daysPassed: result.exitDay
                });
            }

            onClose();
        }
    };

    // Стили для шапки модального окна (золотой градиент)
    const headerStyle = {
        background: 'linear-gradient(135deg, #facc15 0%, #eab308 50%, #ca8a04 100%)',
        margin: '-24px -24px 16px -24px',
        padding: '16px 24px',
        borderRadius: '8px 8px 0 0',
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent
                className="sm:max-w-[450px] border-0 [&>button]:text-white [&>button]:hover:text-white/80"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <DialogHeader style={headerStyle}>
                    <DialogTitle className="text-white text-lg font-semibold flex items-center gap-2">
                        <Crown className="h-5 w-5" />
                        Золотой подбор
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {activeScenario === 'INVALID' && (
                        // Условия НЕ выполнены (Сценарий 1 не прошел и не Сценарий 3)
                        <div className="space-y-4 text-center">
                            <div className="flex justify-center text-amber-500 mb-2">
                                <AlertCircle className="h-12 w-12" />
                            </div>
                            <h3 className="text-lg font-medium text-foreground">Внимание</h3>
                            <p className="text-muted-foreground">
                                Для работы "Золотой кнопки" необходимо очистить калькулятор или иметь ровно один Buy CALL опцион!
                            </p>

                            <div className="bg-muted/50 p-4 rounded-md text-left text-sm space-y-2">
                                <div className="flex items-center gap-2">
                                    {positions.length === 0 ? (
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <AlertCircle className="h-4 w-4 text-red-500" />
                                    )}
                                    <span>Позиции базового актива: {positions.length} (должно быть 0)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* Сложная логика для галочки опционов */}
                                    {options.length === 0 || (options.length === 1 && options[0].type === 'CALL' && options[0].side === 'long') ? (
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <AlertCircle className="h-4 w-4 text-red-500" />
                                    )}
                                    <span>Опционы: {options.length} (0 или 1 Buy CALL)</span>
                                </div>
                            </div>

                            <Button onClick={onClose} className="bg-amber-500 hover:bg-amber-600 text-white w-full">
                                Закрыть
                            </Button>
                        </div>
                    )}

                    {activeScenario !== 'INVALID' && (
                        <>
                            {/* ШАГ: Ввод параметров (Показываем сразу, если step='check' или 'input') */}
                            {(step === 'check' || step === 'input') && (
                                <div className="space-y-4">
                                    {activeScenario === 'SCENARIO_2' && (
                                        <>
                                            <p className="text-sm text-muted-foreground mb-4">
                                                <span className="font-semibold">ШАГ 1</span><br />
                                                Подбор опциона <span className="font-semibold text-green-600">BuyCALL</span> с минимальным убытком при падении актива.
                                            </p>

                                            {/* Сворачиваемый блок параметров */}
                                            <div className="border border-gray-200 rounded-md overflow-hidden mb-4">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsParamsCollapsed(!isParamsCollapsed)}
                                                    className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
                                                >
                                                    <span className="text-sm text-muted-foreground">Параметры подбора</span>
                                                    {isParamsCollapsed ? (
                                                        <ChevronDown size={16} className="text-muted-foreground" />
                                                    ) : (
                                                        <ChevronUp size={16} className="text-muted-foreground" />
                                                    )}
                                                </button>

                                                {!isParamsCollapsed && (
                                                    <div className="p-3 space-y-3 border-t border-gray-200">
                                                        {/* Строка 1: Экспирации */}
                                                        <div className="space-y-1">
                                                            <Label className="text-sm font-medium">
                                                                Диапазон дат экспирации <span className="text-muted-foreground text-xs">(дней от сегодня)</span>
                                                            </Label>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <Input
                                                                    type="number"
                                                                    value={minDays}
                                                                    onChange={(e) => setMinDays(e.target.value)}
                                                                    placeholder="Min"
                                                                    className="h-9"
                                                                />
                                                                <Input
                                                                    type="number"
                                                                    value={maxDays}
                                                                    onChange={(e) => setMaxDays(e.target.value)}
                                                                    placeholder="Max"
                                                                    className="h-9"
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Разделитель */}
                                                        <div className="h-px bg-amber-400" />

                                                        {/* Строка 2: Падение */}
                                                        <div className="space-y-1">
                                                            <Label className="text-sm font-medium">
                                                                Ищем опцион с минимальным убытком при падении актива на <span className="text-muted-foreground text-xs">(% и Цена)</span>
                                                            </Label>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div className="relative">
                                                                    <Input
                                                                        type="number"
                                                                        value={growthPercent}
                                                                        onChange={handleGrowthPercentChange}
                                                                        placeholder="5"
                                                                        className="h-9 pr-8"
                                                                    />
                                                                    <span className="absolute right-2 top-2 text-xs text-muted-foreground">%</span>
                                                                </div>
                                                                <div className="relative">
                                                                    <Input
                                                                        type="number"
                                                                        value={growthPriceInput}
                                                                        onChange={handleGrowthPriceChange}
                                                                        placeholder="Price"
                                                                        className="h-9 pr-4"
                                                                    />
                                                                    <span className="absolute right-2 top-2 text-xs text-muted-foreground">$</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Разделитель */}
                                                        <div className="h-px bg-amber-400" />

                                                        {/* Строка 3: Диапазон страйков */}
                                                        <div className="space-y-1">
                                                            <Label className="text-sm font-medium">
                                                                Страйк <span className="text-muted-foreground text-xs">(+%)</span>
                                                            </Label>
                                                            <Input
                                                                type="number"
                                                                value={strikeRangePercentCall}
                                                                onChange={(e) => setStrikeRangePercentCall(e.target.value)}
                                                                placeholder="5"
                                                                className="h-9"
                                                            />
                                                        </div>

                                                        {/* Разделитель */}
                                                        <div className="h-px bg-amber-400" />

                                                        {/* Строка 4: Погрешность равной прибыли */}
                                                        <div className="space-y-1">
                                                            <Label className="text-sm font-medium">
                                                                Погрешность равной прибыли <span className="text-muted-foreground text-xs">(%)</span>
                                                            </Label>
                                                            <Input
                                                                type="number"
                                                                value={profitTolerancePercentCall}
                                                                onChange={(e) => setProfitTolerancePercentCall(e.target.value)}
                                                                placeholder="5"
                                                                className="h-9"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}

                                    {activeScenario === 'SCENARIO_3' && (
                                        <>
                                            <p className="text-sm text-muted-foreground mb-4">
                                                <span className="font-semibold">ШАГ 2</span><br />
                                                Подбор опциона <span className="font-semibold text-red-600">BuyPUT</span> для компенсации убытков при выходе по низу.
                                            </p>

                                            {/* Сворачиваемый блок параметров */}
                                            <div className="border border-gray-200 rounded-md overflow-hidden mb-4">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsParamsCollapsed(!isParamsCollapsed)}
                                                    className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
                                                >
                                                    <span className="text-sm text-muted-foreground">Параметры подбора</span>
                                                    {isParamsCollapsed ? (
                                                        <ChevronDown size={16} className="text-muted-foreground" />
                                                    ) : (
                                                        <ChevronUp size={16} className="text-muted-foreground" />
                                                    )}
                                                </button>

                                                {!isParamsCollapsed && (
                                                    <div className="p-3 space-y-3 border-t border-gray-200">
                                                        {/* Строка 1: Экспирации */}
                                                        <div className="space-y-1">
                                                            <Label className="text-sm font-medium">
                                                                Диапазон дат экспирации <span className="text-muted-foreground text-xs">(дней от сегодня)</span>
                                                            </Label>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <Input
                                                                    type="number"
                                                                    value={minDaysPut}
                                                                    onChange={(e) => setMinDaysPut(e.target.value)}
                                                                    placeholder="Min"
                                                                    className="h-9"
                                                                />
                                                                <Input
                                                                    type="number"
                                                                    value={maxDaysPut}
                                                                    onChange={(e) => setMaxDaysPut(e.target.value)}
                                                                    placeholder="Max"
                                                                    className="h-9"
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Разделитель */}
                                                        <div className="h-px bg-amber-400" />

                                                        {/* Строка 2: Падение и Выход */}
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div className="space-y-1 col-span-2">
                                                                <Label className="text-sm font-medium">
                                                                    Цель падения <span className="text-muted-foreground text-xs">(% и Цена)</span>
                                                                </Label>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <div className="relative">
                                                                        <Input
                                                                            type="number"
                                                                            value={dropPercent}
                                                                            onChange={handleDropPercentChange}
                                                                            placeholder="-2.5%"
                                                                            className="h-9 pr-8"
                                                                        />
                                                                        <span className="absolute right-2 top-2 text-xs text-muted-foreground">%</span>
                                                                    </div>
                                                                    <div className="relative">
                                                                        <Input
                                                                            type="number"
                                                                            value={targetPriceInput}
                                                                            onChange={handleTargetPriceChange}
                                                                            placeholder="Price"
                                                                            className="h-9 pr-4"
                                                                        />
                                                                        <span className="absolute right-2 top-2 text-xs text-muted-foreground">$</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <Label className="text-sm font-medium">
                                                                    Выход на <span className="text-muted-foreground text-xs">(день)</span>
                                                                </Label>
                                                                <Input
                                                                    type="number"
                                                                    value={exitDay}
                                                                    onChange={(e) => setExitDay(e.target.value)}
                                                                    placeholder="5"
                                                                    className="h-9"
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Разделитель */}
                                                        <div className="h-px bg-amber-400" />

                                                        {/* Строка 3: Страйк */}
                                                        <div className="space-y-1">
                                                            <Label className="text-sm font-medium">
                                                                Страйк <span className="text-muted-foreground text-xs">(+%)</span>
                                                            </Label>
                                                            <Input
                                                                type="number"
                                                                value={strikeRangePercent}
                                                                onChange={(e) => setStrikeRangePercent(e.target.value)}
                                                                placeholder="5"
                                                                className="h-9"
                                                            />
                                                        </div>

                                                        {/* Разделитель */}
                                                        <div className="h-px bg-amber-400" />

                                                        {/* Строка 4: Погрешность равной прибыли */}
                                                        <div className="space-y-1">
                                                            <Label className="text-sm font-medium">
                                                                Погрешность равной прибыли <span className="text-muted-foreground text-xs">(%)</span>
                                                            </Label>
                                                            <Input
                                                                type="number"
                                                                value={profitTolerancePercentPut}
                                                                onChange={(e) => setProfitTolerancePercentPut(e.target.value)}
                                                                placeholder="5"
                                                                className="h-9"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}

                                    {error && (
                                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                                            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                            <span className="whitespace-pre-line">{error}</span>
                                        </div>
                                    )}

                                    <Button
                                        onClick={() => {
                                            console.log('👑 КНОПКА НАЖАТА! Вызываем handleSearch');
                                            handleSearch();
                                        }}
                                        className="w-full text-white border-0 transition-all duration-200 hover:opacity-90"
                                        style={{
                                            background: 'linear-gradient(135deg, #facc15 0%, #eab308 50%, #ca8a04 100%)',
                                            boxShadow: '0 2px 8px rgba(234, 179, 8, 0.4)',
                                        }}
                                        disabled={
                                            activeScenario === 'SCENARIO_2'
                                                ? (!minDays || !maxDays || !growthPercent)
                                                : (!minDaysPut || !maxDaysPut || !dropPercent || !exitDay || !strikeRangePercent)
                                        }
                                    >
                                        {activeScenario === 'SCENARIO_2' ? (
                                            <>
                                                <Crown className="h-4 w-4 mr-2" />
                                                Найти самый прибыльный опцион
                                            </>
                                        ) : (
                                            <>
                                                <Crown className="h-4 w-4 mr-2" />
                                                Подобрать хеджирующий BuyPUT
                                            </>
                                        )}
                                    </Button>
                                </div>
                            )}

                            {/* ШАГ: Поиск... */}
                            {step === 'searching' && (
                                <div className="py-8 text-center space-y-4">
                                    <Loader2 className="h-10 w-10 text-amber-500 animate-spin mx-auto" />
                                    <p className="text-muted-foreground">{progress}</p>
                                </div>
                            )}

                            {/* ШАГ: Результат - удален, так как добавляем автоматически */}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default GoldenSelectionModal;
