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
import { Gem, MoveRight, Loader2, ArrowRight, AlertTriangle } from 'lucide-react';
import { sendRefreshRangeCommand, readExtensionResult, useExtensionData } from '../../../hooks/useExtensionData';
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

    // --- Состояния параметров (ШАГ 1) ---

    // Статус работы: 'idle' | 'waiting' | 'calculating' | 'result'
    const [status, setStatus] = useState('idle');
    const [progressMessage, setProgressMessage] = useState('');

    // 1. Падение актива
    const [dropPercent, setDropPercent] = useState('5');
    const [dropPrice, setDropPrice] = useState('');

    // 2. Диапазон дат экспирации
    const [minDays, setMinDays] = useState('90');
    const [maxDays, setMaxDays] = useState('300');

    // 3. Диапазон страйков
    const [minStrikePercent, setMinStrikePercent] = useState('-5');
    const [maxStrikePercent, setMaxStrikePercent] = useState('20');

    // 4. Выход на день (только для шага 2)
    const [exitDay, setExitDay] = useState('0');

    // Результаты расчета
    const [results, setResults] = useState([]);

    // Определение текущего шага
    // ШАГ 2 только если:
    // 1. Есть ровно один опцион "Супер подбора"
    // 2. Его тип CALL
    const superOptions = options.filter(opt => opt.isSuperOption);
    const step = (superOptions.length === 1 && superOptions[0].type === 'CALL') ? 2 : 1;

    // Блокировка Шага 1, если калькулятор не пуст
    const isBlocked = step === 1 && options.length > 0;

    // Сброс статуса и инициализация параметров при открытии
    useEffect(() => {
        if (isOpen) {
            setStatus('idle');
            setResults([]);
            setProgressMessage('');

            // Установка дефолтных значений в зависимости от шага
            let newDropPercent = '5';

            if (step === 2) {
                newDropPercent = '2.5';
                setDropPercent(newDropPercent);
                setMinDays('8');
                setMaxDays('100');
                setMinStrikePercent('-5');
                setMaxStrikePercent('20');
                setExitDay('5');
            } else {
                newDropPercent = '5';
                setDropPercent(newDropPercent);
                setMinDays('90');
                setMaxDays('300');
                setMinStrikePercent('-5');
                setMaxStrikePercent('20');
                setExitDay('0');
            }

            // Обновляем цену падения
            if (currentPrice) {
                const price = currentPrice * (1 - parseFloat(newDropPercent) / 100);
                setDropPrice(price.toFixed(2));
            }
        }
    }, [isOpen]); // step и currentPrice не добавляем в зависимости, чтобы не сбрасывать при их изменении внутри модалки (хотя они не должны меняться)

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
                    } else if (state.rangeOptions && Array.isArray(state.rangeOptions)) {
                        freshOptions = state.rangeOptions;
                    } else if (state.options && Array.isArray(state.options)) {
                        // Fallback на обычные options, если rangeOptions пуст
                        freshOptions = state.options;
                    }

                    const targetType = step === 2 ? 'PUT' : 'CALL';
                    const calculated = calculateSuperSelectionScenarios(
                        freshOptions,
                        currentPrice,
                        Number(dropPercent),
                        50, // Growth percent
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
    }, [status, currentPrice, dropPercent, step]); // Добавили step

    // Обработчик изменения процента падения
    const handleDropPercentChange = (e) => {
        const val = e.target.value;
        setDropPercent(val);
        if (currentPrice && !isNaN(parseFloat(val))) {
            const price = currentPrice * (1 - parseFloat(val) / 100);
            setDropPrice(price.toFixed(2));
        } else {
            setDropPrice('');
        }
    };

    // Обработчик изменения цены падения
    const handleDropPriceChange = (e) => {
        const val = e.target.value;
        setDropPrice(val);
        if (currentPrice && !isNaN(parseFloat(val)) && parseFloat(val) > 0) {
            // Формула: percent = (currentPrice - targetPrice) / currentPrice * 100
            const percent = ((currentPrice - parseFloat(val)) / currentPrice) * 100;
            setDropPercent(percent.toFixed(2));
        }
    };

    // Запуск подбора
    const handleStartSelection = () => {
        // Очищаем предыдущие результаты в localStorage (опционально, но полезно)
        localStorage.removeItem('tvc_refresh_result');

        // Отправляем команду в расширение
        sendRefreshRangeCommand(
            Number(minDays),
            Number(maxDays),
            Number(minStrikePercent),
            Number(maxStrikePercent)
        );

        // Переходим в режим ожидания
        setStatus('waiting');
        setProgressMessage('Инициализация...');
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

            // Формируем готовый объект для калькулятора
            const adaptedOption = {
                id: Date.now().toString(), // Уникальный ID
                ticker: selectedTicker || option.ticker,
                type: step === 2 ? 'PUT' : 'CALL',
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
            onClose();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className={`border-0 overflow-hidden [&>button]:text-white [&>button]:hover:text-white/80 transition-all duration-300 max-w-[95vw] ${status === 'result' ? 'sm:max-w-[700px]' : 'sm:max-w-[500px]'}`}
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
                            {/* Заголовок Шага */}
                            <div className="space-y-1">
                                <h3 className="font-semibold text-base">ШАГ {step}</h3>
                                <p className="text-sm text-muted-foreground">
                                    {step === 1 ? (
                                        <>Подбор опциона <span className="text-green-600 font-medium">BuyCALL</span> с минимальным убытком при падении актива.</>
                                    ) : (
                                        <>Подбор опциона <span className="text-red-500 font-medium">BuyPUT</span> для компенсации убытков при выходе по низу.</>
                                    )}
                                </p>
                            </div>

                            <div className="space-y-4 border rounded-lg p-4 bg-slate-50">
                                {/* 1. Цель падения */}
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">
                                        {step === 1
                                            ? "Ищем опцион с минимальным убытком при падении актива на (% и Цена)"
                                            : "Ищем опцион с максимальной прибылью при падении актива на (% и Цена)"
                                        }
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

                                {/* 1.1 Выход на день (только шаг 2) */}
                                {step === 2 && (
                                    <>
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
                                        <div className="h-px bg-slate-200" />
                                    </>
                                )}

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

                                {/* 3. Диапазон страйков */}
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
                                {step === 2 ? (
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
                                )}
                            </div>

                            <div className="max-h-[400px] overflow-y-auto border rounded-lg">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-3">Экспирация</th>
                                            <th className="px-4 py-3">Страйк</th>
                                            <th className="px-4 py-3 text-right">ASK</th>
                                            <th className="px-4 py-3 text-right">Vol</th>
                                            <th className="px-4 py-3 text-right">P&L Низ (-{dropPercent}%)</th>
                                            <th className="px-4 py-3 text-right">P&L Верх (+50%)</th>
                                            <th className="px-4 py-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.map((opt, idx) => (
                                            <tr
                                                key={opt.id + idx}
                                                onClick={() => handleAddOption(opt)}
                                                className="bg-white border-b hover:bg-cyan-100 cursor-pointer transition-all duration-200 ease-in-out"
                                            >
                                                <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                                                    {opt.expirationISO || opt.expiration || opt.date}
                                                </td>
                                                <td className="px-4 py-3 font-medium">
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded mr-2 font-bold ${opt.type === 'CALL' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        {opt.type}
                                                    </span>
                                                    {opt.strike}
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold text-cyan-700">
                                                    {(opt.ask || 0).toFixed(2)}
                                                </td>
                                                <td className="px-4 py-3 text-right text-muted-foreground">
                                                    {opt.volume || 0}
                                                </td>
                                                <td className={`px-4 py-3 text-right font-medium ${opt.calculated.pnlDown >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {opt.calculated.pnlDown > 0 ? '+' : ''}{opt.calculated.pnlDown.toFixed(2)}
                                                </td>
                                                <td className={`px-4 py-3 text-right font-medium ${opt.calculated.pnlUp >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {opt.calculated.pnlUp > 0 ? '+' : ''}{opt.calculated.pnlUp.toFixed(2)}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <ArrowRight className="h-4 w-4 text-gray-400" />
                                                </td>
                                            </tr>
                                        ))}

                                        {results.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                                                    Не найдено подходящих опционов
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <Button
                                variant="outline"
                                onClick={() => setStatus('idle')}
                                className="w-full border-cyan-500 text-cyan-600 hover:bg-cyan-50"
                            >
                                Назад к параметрам
                            </Button>
                        </>
                    )}

                </div>
            </DialogContent>
        </Dialog>
    );
}

export default SuperSelectionModal;
