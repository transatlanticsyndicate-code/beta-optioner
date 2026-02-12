/**
 * Модальное окно "Супер подбор" опционов
 * ЗАЧЕМ: Предоставляет интерфейс для расширенного алгоритма подбора опционов
 * Затрагивает: калькулятор опционов, позиции базового актива, таблицу опционов
 */

import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Gem, MoveRight, Loader2, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { sendRefreshRangeCommand, sendRefreshSingleStrikeCommand, readExtensionResult, useExtensionData } from '../../../hooks/useExtensionData';
import { calculateSuperSelectionScenarios } from './superSelectionLogic';

/**
 * Компонент модального окна Супер подбора
 */
function SuperSelectionModal({
    isOpen,
    onClose,
    currentPrice = 0,
    options = [], // Опционы из пропсов
    onAddOption,
    selectedTicker,
    classification = null,
    calculatorMode = 'stocks', // Режим калькулятора: 'stocks' | 'futures'
    contractMultiplier = 100 // Множитель контракта: 100 для акций, pointValue для фьючерсов
}) {
    // Получаем функцию для ручного обновления данных
    // ВАЖНО: Мы не можем использовать хук внутри useEffect, поэтому если он нужен, 
    // его лучше прокидывать пропсом или использовать контекст. 
    // Но так как useExtensionData вызывается в родителе, мы можем не иметь доступа к refreshFromStorage здесь.
    // Однако, мы можем просто импортировать логику чтения localStorage напрямую или надеяться, 
    // что родитель обновит props.options.
    // Лучшее решение: использовать polling статуса, и когда статус complete, 
    // мы знаем что данные в LS готовы.

    // Стили для шапки модального окна с градиентом диаманда
    const headerStyle = {
        background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #0e7490 100%)',
        margin: '-24px -24px 16px -24px',
        padding: '16px 24px',
        borderRadius: '8px 8px 0 0',
    };

    // --- Состояния параметров ---

    // Режим супер подбора: 'LONG' | 'SHORT'
    // LONG: Step1=CALL (мин. убыток при падении), Step2=PUT (компенсация)
    // SHORT: Step1=PUT (мин. убыток при росте), Step2=CALL (компенсация)
    const [mode, setMode] = useState('LONG');

    // Статус работы: 'idle' | 'waiting' | 'calculating' | 'result'
    const [status, setStatus] = useState('idle');
    const [progressMessage, setProgressMessage] = useState('');

    // 1. Падение актива
    const [dropPercent, setDropPercent] = useState('5');
    const [dropPrice, setDropPrice] = useState('');

    // 2. Прогноз по верху
    const [growthPercent, setGrowthPercent] = useState('50');
    const [growthPrice, setGrowthPrice] = useState('');

    // 3. Диапазон дат экспирации
    const [minDays, setMinDays] = useState('90');
    const [maxDays, setMaxDays] = useState('300');

    // 4. Режим страйков: 'range' (диапазон) или 'single' (конкретный страйк)
    const [strikeMode, setStrikeMode] = useState('range');

    // 4a. Диапазон страйков (для режима 'range')
    const [minStrikePercent, setMinStrikePercent] = useState('-5');
    const [maxStrikePercent, setMaxStrikePercent] = useState('20');

    // 4b. Конкретный страйк (для режима 'single')
    const [singleStrike, setSingleStrike] = useState('');

    // 5. Выход на день (только для шага 2)
    const [exitDay, setExitDay] = useState('0');

    // Результаты расчета
    const [results, setResults] = useState([]);

    // Выбранные опционы для добавления в калькулятор (только для Шага 1)
    const [selectedOptions, setSelectedOptions] = useState(new Set());

    // Определение текущего шага и автоматическое определение режима
    // ЗАЧЕМ: Если есть супер-опцион, определяем режим по его типу
    const superOptions = options.filter(opt => opt.isSuperOption);
    
    // Автоматическое определение режима на основе существующего супер-опциона
    // CALL → LONG режим, PUT → SHORT режим
    const detectedMode = superOptions.length === 1 
        ? (superOptions[0].type === 'CALL' ? 'LONG' : 'SHORT')
        : mode;
    
    // ШАГ 2 только если есть ровно один опцион "Супер подбора"
    const step = superOptions.length === 1 ? 2 : 1;

    // Тип опциона для текущего шага (используем detectedMode для корректности)
    // LONG: Step1=CALL, Step2=PUT
    // SHORT: Step1=PUT, Step2=CALL
    const currentOptionType = detectedMode === 'LONG'
        ? (step === 1 ? 'CALL' : 'PUT')
        : (step === 1 ? 'PUT' : 'CALL');
    
    // Активный режим для UI (используем detectedMode для Step 2)
    const activeMode = step === 2 ? detectedMode : mode;

    // Блокировка Шага 1, если калькулятор не пуст
    const isBlocked = step === 1 && options.length > 0;

    // Сброс статуса и инициализация параметров при открытии
    useEffect(() => {
        if (isOpen) {
            setStatus('idle');
            setResults([]);
            setProgressMessage('');
            setSelectedOptions(new Set()); // Сбрасываем выбранные опционы
            setStrikeMode('range'); // Сбрасываем режим страйков
            setSingleStrike(''); // Сбрасываем конкретный страйк

            // Установка дефолтных значений в зависимости от шага и режима калькулятора
            let newDropPercent = '5';
            let newGrowthPercent = calculatorMode === 'futures' ? '5' : '10';

            if (step === 2) {
                newDropPercent = '2.5';
                setDropPercent(newDropPercent);
                setGrowthPercent(newGrowthPercent);
                setMinDays('8');
                setMaxDays('100');
                setMinStrikePercent('1');
                setMaxStrikePercent('20');
                setExitDay('5');
            } else {
                newDropPercent = '5';
                setDropPercent(newDropPercent);
                setGrowthPercent(newGrowthPercent);
                setMinDays('90');
                setMaxDays('300');
                setMinStrikePercent('1');
                setMaxStrikePercent('7');
                setExitDay('10');
            }

            // Обновляем цену падения и роста
            if (currentPrice) {
                const priceDown = currentPrice * (1 - parseFloat(newDropPercent) / 100);
                setDropPrice(priceDown.toFixed(2));
                
                const priceUp = currentPrice * (1 + parseFloat(newGrowthPercent) / 100);
                setGrowthPrice(priceUp.toFixed(2));
            }
        }
    }, [isOpen]); // step и currentPrice не добавляем в зависимости, чтобы не сбрасывать при их изменении внутри модалки (хотя они не должны меняться)

    // Пересчет цен при переключении режима LONG/SHORT
    // ЗАЧЕМ: При смене режима направление расчета цен меняется
    useEffect(() => {
        if (currentPrice && dropPercent) {
            // LONG: падение (1 - percent), SHORT: рост (1 + percent)
            const dropMultiplier = activeMode === 'LONG' ? (1 - parseFloat(dropPercent) / 100) : (1 + parseFloat(dropPercent) / 100);
            setDropPrice((currentPrice * dropMultiplier).toFixed(2));
        }
        if (currentPrice && growthPercent) {
            // LONG: рост (1 + percent), SHORT: падение (1 - percent)
            const growthMultiplier = activeMode === 'LONG' ? (1 + parseFloat(growthPercent) / 100) : (1 - parseFloat(growthPercent) / 100);
            setGrowthPrice((currentPrice * growthMultiplier).toFixed(2));
        }
    }, [mode, activeMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- ЛОГИКА ОЖИДАНИЯ ОТВЕТА ОТ РАСШИРЕНИЯ ---
    useEffect(() => {
        let intervalId;

        if (status === 'waiting') {
            intervalId = setInterval(() => {
                const result = readExtensionResult();

                if (result) {
                    if (result.status === 'collecting') {
                        setProgressMessage(result.message || `Сбор данных... ${result.progress || 0}%`);
                    } else if (result.status === 'complete') {
                        clearInterval(intervalId);

                        // Данные в localStorage обновлены экстеншеном.
                        // Родительский компонент через useExtensionData должен получить storage event 
                        // и обновить проп options.
                        // НО: storage event может прийти чуть позже или раньше.
                        // Проблема: Мы полагаемся на проп options, который обновляется асинхронно.

                        // Решение: Переходим в состояние calculating, но ждем небольшую задержку,
                        // чтобы дать React время обновить пропсы.
                        setStatus('calculating');
                        setProgressMessage('Обработка данных...');
                    } else if (result.status === 'error') {
                        setProgressMessage(`Ошибка: ${result.message}`);
                        // Можно добавить кнопку "Попробовать снова" или сбросить статус
                        // setStatus('idle'); // Пока оставим висеть ошибку, чтобы пользователь увидел
                    }
                }
            }, 500);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [status]);

    // --- ЛОГИКА РАСЧЕТА ---
    // Срабатывает когда status переключился в calculating
    useEffect(() => {
        if (status === 'calculating') {
            const timer = setTimeout(() => {
                // Читаем данные напрямую из localStorage, чтобы не зависеть от пропсов
                // и гарантировать получение свежих данных сразу после сигнала 'complete'
                try {

                    const savedState = localStorage.getItem('calculatorState');
                    const state = savedState ? JSON.parse(savedState) : {};

                    // ВАЖНО: Проверяем несколько источников:
                    // 1. Результат выполнения команды (самый свежий источник)
                    // 2. rangeOptions в стейте
                    // 3. обычные options в стейте
                    let freshOptions = [];

                    const result = readExtensionResult();
                    if (result && result.status === 'complete' && result.data?.options) {
                        freshOptions = result.data.options;
                    } else if (strikeMode === 'single' && state.singleStrikeOptions && Array.isArray(state.singleStrikeOptions)) {
                        // Режим конкретного страйка: расширение записывает данные в singleStrikeOptions
                        freshOptions = state.singleStrikeOptions;
                    } else if (state.rangeOptions && Array.isArray(state.rangeOptions)) {
                        freshOptions = state.rangeOptions;
                    } else if (state.singleStrikeOptions && Array.isArray(state.singleStrikeOptions)) {
                        // Fallback: если rangeOptions пуст, пробуем singleStrikeOptions
                        freshOptions = state.singleStrikeOptions;
                    } else if (state.options && Array.isArray(state.options)) {
                        // Fallback на обычные options
                        freshOptions = state.options;
                    }

                    // Вычисляем тип опциона непосредственно здесь для гарантии актуальности
                    // LONG: Step1=CALL, Step2=PUT
                    // SHORT: Step1=PUT, Step2=CALL
                    const targetType = activeMode === 'LONG'
                        ? (step === 1 ? 'CALL' : 'PUT')
                        : (step === 1 ? 'PUT' : 'CALL');
                    
                    const calculated = calculateSuperSelectionScenarios(
                        freshOptions,
                        currentPrice,
                        Number(dropPercent),
                        Number(growthPercent),
                        targetType,
                        Number(exitDay), // День выхода (для Time Decay)
                        classification, // Тэг классификации для корректировки P&L
                        calculatorMode, // Режим калькулятора: 'stocks' | 'futures'
                        contractMultiplier // Множитель контракта
                    );

                    setResults(calculated);
                    setStatus('result');

                } catch (error) {
                    setStatus('result'); // Показать что есть (пусто), чтобы не висеть вечно
                }
            }, 1000);

            return () => clearTimeout(timer);
        }
    }, [status, currentPrice, dropPercent, growthPercent, step, currentOptionType, mode, strikeMode]);

    // Обработчик изменения процента для второго параметра (мин. убыток)
    // LONG: падение → цена уменьшается
    // SHORT: рост → цена увеличивается
    const handleDropPercentChange = (e) => {
        const val = e.target.value;
        setDropPercent(val);
        if (currentPrice && !isNaN(parseFloat(val))) {
            // LONG: падение (1 - percent), SHORT: рост (1 + percent)
            const multiplier = activeMode === 'LONG' ? (1 - parseFloat(val) / 100) : (1 + parseFloat(val) / 100);
            const price = currentPrice * multiplier;
            setDropPrice(price.toFixed(2));
        } else {
            setDropPrice('');
        }
    };

    // Обработчик изменения цены для второго параметра
    const handleDropPriceChange = (e) => {
        const val = e.target.value;
        setDropPrice(val);
        if (currentPrice && !isNaN(parseFloat(val)) && parseFloat(val) > 0) {
            // LONG: percent = (currentPrice - targetPrice) / currentPrice * 100
            // SHORT: percent = (targetPrice - currentPrice) / currentPrice * 100
            const percent = activeMode === 'LONG'
                ? ((currentPrice - parseFloat(val)) / currentPrice) * 100
                : ((parseFloat(val) - currentPrice) / currentPrice) * 100;
            setDropPercent(Math.abs(percent).toFixed(2));
        }
    };

    // Обработчик изменения процента для первого параметра (прогноз)
    // LONG: рост → цена увеличивается
    // SHORT: падение → цена уменьшается
    const handleGrowthPercentChange = (e) => {
        const val = e.target.value;
        setGrowthPercent(val);
        if (currentPrice && !isNaN(parseFloat(val))) {
            // LONG: рост (1 + percent), SHORT: падение (1 - percent)
            const multiplier = activeMode === 'LONG' ? (1 + parseFloat(val) / 100) : (1 - parseFloat(val) / 100);
            const price = currentPrice * multiplier;
            setGrowthPrice(price.toFixed(2));
        } else {
            setGrowthPrice('');
        }
    };

    // Обработчик изменения цены для первого параметра
    const handleGrowthPriceChange = (e) => {
        const val = e.target.value;
        setGrowthPrice(val);
        if (currentPrice && !isNaN(parseFloat(val)) && parseFloat(val) > 0) {
            // LONG: percent = (targetPrice - currentPrice) / currentPrice * 100
            // SHORT: percent = (currentPrice - targetPrice) / currentPrice * 100
            const percent = activeMode === 'LONG'
                ? ((parseFloat(val) - currentPrice) / currentPrice) * 100
                : ((currentPrice - parseFloat(val)) / currentPrice) * 100;
            setGrowthPercent(Math.abs(percent).toFixed(2));
        }
    };

    // Запуск подбора
    // ЗАЧЕМ: В зависимости от режима страйков отправляем разные команды расширению
    const handleStartSelection = () => {
        // Очищаем предыдущие результаты в localStorage (опционально, но полезно)
        localStorage.removeItem('tvc_refresh_result');

        if (strikeMode === 'single' && singleStrike) {
            // Режим конкретного страйка: передаём абсолютный страйк напрямую через exactStrike
            // ЗАЧЕМ: Устраняет погрешность конвертации через проценты (currentPrice на фронте и в расширении могут отличаться)
            // strikePercent передаётся как fallback для обратной совместимости
            const strikePercent = ((Number(singleStrike) - currentPrice) / currentPrice) * 100;
            sendRefreshSingleStrikeCommand(
                Number(minDays),
                Number(maxDays),
                strikePercent,
                Number(singleStrike) // exactStrike — расширение использует его напрямую
            );
        } else {
            // Режим диапазона страйков: используем существующую логику
            sendRefreshRangeCommand(
                Number(minDays),
                Number(maxDays),
                Number(minStrikePercent),
                Number(maxStrikePercent)
            );
        }

        // Переходим в режим ожидания
        setStatus('waiting');
        setProgressMessage('Инициализация...');
    };

    // Переключение выбора опциона (для чекбоксов)
    const handleToggleOption = (optionId) => {
        setSelectedOptions(prev => {
            const newSet = new Set(prev);
            if (newSet.has(optionId)) {
                newSet.delete(optionId);
            } else {
                newSet.add(optionId);
            }
            return newSet;
        });
    };

    // Добавление опциона в калькулятор
    const handleAddOption = (option) => {
        if (onAddOption) {
            // Адаптация формата (аналогично adaptOption в useExtensionData)
            const premium = parseFloat(option.ask || option.premium || 0);

            // IV нормализация
            let iv = parseFloat(option.askIV || option.impliedVolatility || option.iv || 0);
            if (iv > 10) iv = iv / 100;
            if (iv === 0) iv = 0.5;

            // Вычисляем тип опциона для текущего шага
            // LONG: Step1=CALL, Step2=PUT
            // SHORT: Step1=PUT, Step2=CALL
            const optionType = activeMode === 'LONG'
                ? (step === 1 ? 'CALL' : 'PUT')
                : (step === 1 ? 'PUT' : 'CALL');

            // Формируем готовый объект для калькулятора
            // Уникальный ID: timestamp + случайное число + страйк + дата для гарантии уникальности
            const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${option.strike}`;
            const adaptedOption = {
                id: uniqueId,
                ticker: selectedTicker || option.ticker,
                type: optionType,
                action: 'Buy',
                strike: parseFloat(option.strike),
                date: option.expirationISO || option.date || option.expiration, // Приоритет ISO даты
                quantity: 1,
                premium: premium,
                impliedVolatility: iv,
                delta: parseFloat(option.delta || 0),
                gamma: parseFloat(option.gamma || 0),
                theta: parseFloat(option.theta || 0),
                vega: parseFloat(option.vega || 0),
                // Сохраняем и сырые данные на всякий случай
                bid: parseFloat(option.bid || 0),
                ask: parseFloat(option.ask || 0),
                volume: parseFloat(option.volume || 0),
                isSuperOption: true, // Флаг для отображения иконки бриллианта
                // Передаем целевую цену падения для симуляции (для обоих шагов)
                simulationTargetPrice: dropPrice ? parseFloat(dropPrice) : undefined,
                // Передаем дней прошло для симуляции (только для Шага 2)
                simulationDaysPassed: step === 2 ? Number(exitDay) : undefined,
            };

            onAddOption(adaptedOption);
        }
    };

    // Добавление всех выбранных опционов в калькулятор (для Шага 1)
    const handleAddSelectedOptions = () => {
        if (selectedOptions.size === 0) return;
        
        // Находим все выбранные опционы и добавляем их
        results.forEach((opt, idx) => {
            // Уникальный ID: комбинация страйка, экспирации и индекса (должен совпадать с ID в таблице)
            const optId = `${opt.strike}_${opt.expirationISO || opt.expiration || opt.date}_${idx}`;
            if (selectedOptions.has(optId)) {
                handleAddOption(opt);
            }
        });
        
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className={`border-0 overflow-hidden [&>button]:text-white [&>button]:hover:text-white/80 transition-all duration-300 max-w-[95vw] ${status === 'result' ? (step === 1 ? 'sm:max-w-[1100px]' : 'sm:max-w-[700px]') : 'sm:max-w-[500px]'}`}
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <DialogHeader style={headerStyle}>
                    <DialogTitle className="text-white text-lg font-semibold flex items-center gap-2">
                        <Gem className="h-5 w-5" />
                        Супер подбор — {status === 'result' ? 'Результаты' : `Шаг ${step}`}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">

                    {/* Режим ОЖИДАНИЯ */}
                    {(status === 'waiting' || status === 'calculating') && (
                        <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
                            <Loader2 className="h-12 w-12 text-cyan-500 animate-spin" />
                            <div className="space-y-1">
                                <h3 className="font-medium text-lg">
                                    {status === 'calculating' ? 'Анализируем опционы...' : 'Ожидание ответа от расширения...'}
                                </h3>
                                <p className="text-muted-foreground text-sm">
                                    {progressMessage || 'Собираем опционы с заданными параметрами.'}
                                </p>
                            </div>
                        </div>
                    )}


                    {/* БЛОКИРОВКА */}
                    {isBlocked && status === 'idle' && (
                        <div className="py-8 text-center space-y-4">
                            <div className="flex justify-center text-amber-500">
                                <AlertTriangle className="h-12 w-12" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-medium text-lg">Калькулятор не пуст</h3>
                                <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                                    Для использования Шага 1 "Супер подбора" необходимо, чтобы в калькуляторе не было других опционов.
                                </p>
                            </div>
                            <Button variant="outline" onClick={onClose} className="!text-black hover:!text-black/80">
                                Закрыть
                            </Button>
                        </div>
                    )}

                    {/* Режим НАСТРОЙКИ (IDLE) */}
                    {status === 'idle' && !isBlocked && (
                        <>
                            {/* Переключатель LONG / SHORT */}
                            <div className="flex items-center justify-center gap-2 p-2 bg-slate-100 rounded-lg">
                                <button
                                    onClick={() => setMode('LONG')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
                                        activeMode === 'LONG'
                                            ? 'bg-green-500 text-white shadow-md'
                                            : 'bg-white text-gray-600 hover:bg-green-50'
                                    }`}
                                >
                                    <TrendingUp className="h-4 w-4" />
                                    LONG
                                </button>
                                <button
                                    onClick={() => setMode('SHORT')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
                                        activeMode === 'SHORT'
                                            ? 'bg-red-500 text-white shadow-md'
                                            : 'bg-white text-gray-600 hover:bg-red-50'
                                    }`}
                                >
                                    <TrendingDown className="h-4 w-4" />
                                    SHORT
                                </button>
                            </div>

                            {/* Заголовок Шага */}
                            <div className="space-y-1">
                                <h3 className="font-semibold text-base">ШАГ {step}</h3>
                                <p className="text-sm text-muted-foreground">
                                    {activeMode === 'LONG' ? (
                                        // LONG: Step1=CALL, Step2=PUT
                                        step === 1 ? (
                                            <>Подбор опциона <span className="text-green-600 font-medium">BuyCALL</span> с минимальным убытком при падении актива.</>
                                        ) : (
                                            <>Подбор опциона <span className="text-red-500 font-medium">BuyPUT</span> для компенсации убытков при выходе по низу.</>
                                        )
                                    ) : (
                                        // SHORT: Step1=PUT, Step2=CALL
                                        step === 1 ? (
                                            <>Подбор опциона <span className="text-red-500 font-medium">BuyPUT</span> с минимальным убытком при росте актива.</>
                                        ) : (
                                            <>Подбор опциона <span className="text-green-600 font-medium">BuyCALL</span> для компенсации убытков при выходе по верху.</>
                                        )
                                    )}
                                </p>
                            </div>

                            <div className="space-y-4 border rounded-lg p-4 bg-slate-50">
                                {/* 1. Прогноз (верх/низ в зависимости от режима) */}
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">
                                        {activeMode === 'LONG'
                                            ? "Показать прогноз по верху (% и Цена)"
                                            : "Показать прогноз по низу (% и Цена)"
                                        }
                                    </Label>
                                    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                value={growthPercent}
                                                onChange={handleGrowthPercentChange}
                                                className="pr-8 bg-white"
                                                placeholder="50"
                                            />
                                            <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">%</span>
                                        </div>

                                        <MoveRight className="h-4 w-4 text-muted-foreground" />

                                        <div className="relative">
                                            <Input
                                                type="number"
                                                value={growthPrice}
                                                onChange={handleGrowthPriceChange}
                                                className="pr-6 bg-white"
                                                placeholder="Цена"
                                            />
                                            <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">$</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Разделитель */}
                                <div className="h-px bg-slate-200" />

                                {/* 2. Цель падения/роста */}
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">
                                        {activeMode === 'LONG' ? (
                                            step === 1
                                                ? "Ищем опцион с минимальным убытком при падении актива на (% и Цена)"
                                                : "Ищем опцион с максимальной прибылью при падении актива на (% и Цена)"
                                        ) : (
                                            step === 1
                                                ? "Ищем опцион с минимальным убытком при росте актива на (% и Цена)"
                                                : "Ищем опцион с максимальной прибылью при росте актива на (% и Цена)"
                                        )}
                                    </Label>
                                    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                value={dropPercent}
                                                onChange={handleDropPercentChange}
                                                className="pr-8 bg-white"
                                                placeholder="5"
                                            />
                                            <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">%</span>
                                        </div>

                                        <MoveRight className="h-4 w-4 text-muted-foreground" />

                                        <div className="relative">
                                            <Input
                                                type="number"
                                                value={dropPrice}
                                                onChange={handleDropPriceChange}
                                                className="pr-6 bg-white"
                                                placeholder="Цена"
                                            />
                                            <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">$</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Разделитель */}
                                <div className="h-px bg-slate-200" />

                                {/* 3. Выход на день (для обоих шагов) */}
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">
                                        Выход на (день)
                                    </Label>
                                    <div className="flex items-center gap-2">
                                        <div className="relative w-full">
                                            <Input
                                                type="number"
                                                value={exitDay}
                                                onChange={(e) => setExitDay(e.target.value)}
                                                className="pr-8 bg-white"
                                            />
                                            <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">дн</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Разделитель */}
                                <div className="h-px bg-slate-200" />

                                {/* 2. Диапазон дат экспирации */}
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">
                                        Диапазон дат экспирации (дней от сегодня)
                                    </Label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground whitespace-nowrap">от</span>
                                        <Input
                                            type="number"
                                            value={minDays}
                                            onChange={(e) => setMinDays(e.target.value)}
                                            className="bg-white"
                                        />
                                        <span className="text-sm text-muted-foreground whitespace-nowrap">до</span>
                                        <Input
                                            type="number"
                                            value={maxDays}
                                            onChange={(e) => setMaxDays(e.target.value)}
                                            className="bg-white"
                                        />
                                    </div>
                                </div>

                                {/* Разделитель */}
                                <div className="h-px bg-slate-200" />

                                {/* 3. Переключатель режима страйков */}
                                {/* ЗАЧЕМ: Позволяет выбрать между диапазоном страйков и конкретным страйком */}
                                <div className="space-y-3">
                                    <Label className="text-sm font-medium">Режим подбора страйков</Label>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setStrikeMode('range')}
                                            className={`flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all ${
                                                strikeMode === 'range'
                                                    ? 'bg-cyan-600 text-white shadow-md'
                                                    : 'bg-white text-gray-600 hover:bg-cyan-50 border border-gray-200'
                                            }`}
                                        >
                                            По диапазону страйков
                                        </button>
                                        <button
                                            onClick={() => setStrikeMode('single')}
                                            className={`flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all ${
                                                strikeMode === 'single'
                                                    ? 'bg-cyan-600 text-white shadow-md'
                                                    : 'bg-white text-gray-600 hover:bg-cyan-50 border border-gray-200'
                                            }`}
                                        >
                                            По одному страйку
                                        </button>
                                    </div>

                                    {/* Условный рендеринг: диапазон или конкретный страйк */}
                                    {strikeMode === 'range' ? (
                                        // Режим диапазона страйков (существующий функционал)
                                        <div className="space-y-2">
                                            <Label className="text-sm font-medium">
                                                Диапазон Страйков (±%)
                                            </Label>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-muted-foreground whitespace-nowrap">от</span>
                                                <div className="relative w-full">
                                                    <Input
                                                        type="number"
                                                        value={minStrikePercent}
                                                        onChange={(e) => setMinStrikePercent(e.target.value)}
                                                        className="pr-6 bg-white"
                                                    />
                                                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">%</span>
                                                </div>
                                                <span className="text-sm text-muted-foreground whitespace-nowrap">до</span>
                                                <div className="relative w-full">
                                                    <Input
                                                        type="number"
                                                        value={maxStrikePercent}
                                                        onChange={(e) => setMaxStrikePercent(e.target.value)}
                                                        className="pr-6 bg-white"
                                                    />
                                                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">%</span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        // Режим конкретного страйка (новый функционал)
                                        <div className="space-y-2">
                                            <Label className="text-sm font-medium">
                                                Введите конкретный страйк
                                            </Label>
                                            <div className="relative w-full">
                                                <Input
                                                    type="number"
                                                    value={singleStrike}
                                                    onChange={(e) => setSingleStrike(e.target.value)}
                                                    className="pr-6 bg-white"
                                                    placeholder=""
                                                />
                                                <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">$</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <Button
                                onClick={handleStartSelection}
                                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
                            >
                                Начать подбор
                            </Button>
                        </>
                    )}

                    {/* Режим РЕЗУЛЬТАТЫ */}
                    {status === 'result' && (
                        <>
                            <div className="space-y-2">
                                {activeMode === 'LONG' ? (
                                    // LONG режим: Step1=CALL, Step2=PUT
                                    step === 2 ? (
                                        <>
                                            <h3 className="font-semibold text-base">ШАГ 2 — Результаты BuyPUT</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Подобранные опционы с максимальной прибылью при падении актива на <span className="text-red-500 font-medium">{dropPercent}% (${dropPrice})</span>.
                                                <br />
                                                Клик по конкретному опциону добавит его в Калькулятор.
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <h3 className="font-semibold text-base">ШАГ 1 — Результаты BuyCALL</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Подобранные опционы с минимальным убытком при падении актива на <span className="text-red-500 font-medium">{dropPercent}% (${dropPrice})</span>.
                                                <br />
                                                Клик по конкретному опциону добавит его в Калькулятор.
                                            </p>
                                        </>
                                    )
                                ) : (
                                    // SHORT режим: Step1=PUT, Step2=CALL
                                    step === 2 ? (
                                        <>
                                            <h3 className="font-semibold text-base">ШАГ 2 — Результаты BuyCALL</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Подобранные опционы с максимальной прибылью при росте актива на <span className="text-green-600 font-medium">{dropPercent}% (${dropPrice})</span>.
                                                <br />
                                                Клик по конкретному опциону добавит его в Калькулятор.
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <h3 className="font-semibold text-base">ШАГ 1 — Результаты BuyPUT</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Подобранные опционы с минимальным убытком при росте актива на <span className="text-green-600 font-medium">{dropPercent}% (${dropPrice})</span>.
                                                <br />
                                                Клик по конкретному опциону добавит его в Калькулятор.
                                            </p>
                                        </>
                                    )
                                )}
                            </div>

                            <div className="max-h-[400px] overflow-y-auto border rounded-lg">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
                                        {step === 1 ? (
                                            /* Шаг 1: 4 колонки P&L (только на ЭКСП.) + чекбокс */
                                            <tr>
                                                <th className="px-3 py-3">Экспирация</th>
                                                <th className="px-3 py-3">Страйк</th>
                                                <th className="px-3 py-3 text-right">ASK</th>
                                                <th className="px-3 py-3 text-right">Vol</th>
                                                <th className="px-3 py-3 text-right">
                                                    {activeMode === 'LONG' ? `P&L Низ (-${dropPercent}%)` : `P&L Верх (+${dropPercent}%)`}<br/>на ЭКСП.
                                                </th>
                                                <th className="px-3 py-3 text-right">
                                                    {activeMode === 'LONG' ? `P&L Верх (+${growthPercent}%)` : `P&L Низ (-${growthPercent}%)`}<br/>на ЭКСП.
                                                </th>
                                                <th className="px-3 py-3 text-center w-12"></th>
                                            </tr>
                                        ) : (
                                            /* Шаг 2: стандартные 2 колонки P&L */
                                            <tr>
                                                <th className="px-4 py-3">Экспирация</th>
                                                <th className="px-4 py-3">Страйк</th>
                                                <th className="px-4 py-3 text-right">ASK</th>
                                                <th className="px-4 py-3 text-right">Vol</th>
                                                <th className="px-4 py-3 text-right">
                                                    {activeMode === 'LONG' ? `P&L Низ (-${dropPercent}%)` : `P&L Верх (+${dropPercent}%)`}
                                                </th>
                                                <th className="px-4 py-3 text-right">
                                                    {activeMode === 'LONG' ? `P&L Верх (+${growthPercent}%)` : `P&L Низ (-${growthPercent}%)`}
                                                </th>
                                                <th className="px-4 py-3"></th>
                                            </tr>
                                        )}
                                    </thead>
                                    <tbody>
                                        {results.map((opt, idx) => {
                                            // Уникальный ID: комбинация страйка, экспирации и индекса
                                            const optId = `${opt.strike}_${opt.expirationISO || opt.expiration || opt.date}_${idx}`;
                                            const isSelected = selectedOptions.has(optId);
                                            
                                            return (
                                                <tr
                                                    key={optId}
                                                    onClick={() => handleToggleOption(optId)}
                                                    className={`border-b cursor-pointer transition-all duration-200 ease-in-out ${
                                                        isSelected 
                                                            ? 'bg-cyan-50 hover:bg-cyan-100' 
                                                            : 'bg-white hover:bg-cyan-100'
                                                    }`}
                                                >
                                                    <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">
                                                        {opt.expirationISO || opt.expiration || opt.date}
                                                    </td>
                                                    <td className="px-3 py-3 font-medium">
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded mr-2 font-bold ${opt.type === 'CALL' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                            {opt.type}
                                                        </span>
                                                        {opt.strike}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-semibold text-cyan-700">
                                                        {(opt.ask || 0).toFixed(2)}
                                                    </td>
                                                    <td className="px-3 py-3 text-right text-muted-foreground">
                                                        {opt.volume || 0}
                                                    </td>
                                                    {/* P&L Низ на экспирацию */}
                                                    <td className={`px-3 py-3 text-right font-medium ${opt.calculated.pnlDown >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                        {opt.calculated.pnlDown > 0 ? '+' : ''}{opt.calculated.pnlDown.toFixed(2)}
                                                    </td>
                                                    {/* P&L Верх на экспирацию */}
                                                    <td className={`px-3 py-3 text-right font-medium ${opt.calculated.pnlUp >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                        {opt.calculated.pnlUp > 0 ? '+' : ''}{opt.calculated.pnlUp.toFixed(2)}
                                                    </td>
                                                    {/* Чекбокс для выбора опциона */}
                                                    <td className="px-3 py-3 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => handleToggleOption(optId)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="w-4 h-4 text-cyan-600 bg-gray-100 border-gray-300 rounded focus:ring-cyan-500 cursor-pointer"
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}

                                        {results.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                                                    Не найдено подходящих опционов
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Кнопки навигации */}
                            <div className="flex justify-between gap-4">
                                <Button
                                    variant="outline"
                                    onClick={() => setStatus('idle')}
                                    className="border-cyan-500 text-cyan-600 hover:bg-cyan-50"
                                >
                                    Назад к параметрам
                                </Button>
                                
                                <Button
                                    onClick={handleAddSelectedOptions}
                                    disabled={selectedOptions.size === 0}
                                    className="bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Добавить выбранные в калькулятор ({selectedOptions.size})
                                </Button>
                            </div>
                        </>
                    )}

                </div>
            </DialogContent>
        </Dialog>
    );
}

export default SuperSelectionModal;
