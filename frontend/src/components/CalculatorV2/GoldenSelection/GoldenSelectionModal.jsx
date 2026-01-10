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
import { Crown, AlertCircle, CheckCircle, Loader2, ArrowRight } from 'lucide-react';
import { findBestGoldenBuyCall } from './goldenSelectionLogic';

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
    onClose
}) {
    // Состояния для Сценария 2
    const [step, setStep] = React.useState('check'); // 'check', 'input', 'searching', 'result'
    const [minDays, setMinDays] = React.useState(60);
    const [maxDays, setMaxDays] = React.useState(100);
    const [growthPercent, setGrowthPercent] = React.useState(50);
    const [searchResult, setSearchResult] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [progress, setProgress] = React.useState('');

    // Проверка условия Сценария 1: Калькулятор должен быть пуст
    const isEmptyState = positions.length === 0 && options.length === 0;

    // Сброс шагов при открытии/закрытии
    React.useEffect(() => {
        if (isOpen) {
            setStep('check');
            setSearchResult(null);
            setError(null);
        }
    }, [isOpen]);

    const handleSearch = async () => {
        setStep('searching');
        setError(null);
        setProgress('Начинаем поиск...');

        try {
            const result = await findBestGoldenBuyCall({
                ticker: selectedTicker,
                currentPrice,
                availableDates,
                minDays: Number(minDays),
                maxDays: Number(maxDays),
                growthPercent: Number(growthPercent),
                onProgress: (p) => {
                    if (p.stage === 'loading') setProgress(`Загрузка даты ${p.current}/${p.total}...`);
                    if (p.stage === 'calculating') setProgress('Расчет прибыли...');
                }
            });

            if (result && !result.error) {
                // СРАЗУ добавляем опцион в таблицу и закрываем окно
                addOptionToTable(result);
            } else {
                setError(result?.message || 'Не удалось найти опцион');
                setStep('input');
            }
        } catch (err) {
            console.error(err);
            setError('Произошла ошибка при поиске');
            setStep('input');
        }
    };

    const addOptionToTable = (result) => {
        if (result && onAddOption) {
            // Форматируем для добавления в таблицу
            const optionToAdd = {
                ...result,
                type: 'CALL', // Принудительно CALL
                side: 'long', // Buy
                strike: result.strike,
                premium: result.premium || result.ask || result.last_price,
                // Shim: expiration -> date (как ожидает таблица)
                date: result.expiration_date || result.expiration,
                expiration_date: result.expiration_date || result.expiration,
                expirationDate: result.expiration_date || result.expiration, // ВАЖНО: OptionsCalculatorBasic ждет именно это поле
                action: 'Buy' // Явно указываем action
            };
            onAddOption(optionToAdd);
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
                    {!isEmptyState && (
                        // Условия НЕ выполнены (Сценарий 1 не прошел)
                        <div className="space-y-4 text-center">
                            <div className="flex justify-center text-amber-500 mb-2">
                                <AlertCircle className="h-12 w-12" />
                            </div>
                            <h3 className="text-lg font-medium text-foreground">Внимание</h3>
                            <p className="text-muted-foreground">
                                Для работы "Золотой кнопки" необходимо очистить калькулятор!
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
                                    {options.length === 0 ? (
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <AlertCircle className="h-4 w-4 text-red-500" />
                                    )}
                                    <span>Опционы: {options.length} (должно быть 0)</span>
                                </div>
                            </div>

                            <Button onClick={onClose} className="bg-amber-500 hover:bg-amber-600 text-white w-full">
                                Закрыть
                            </Button>
                        </div>
                    )}

                    {isEmptyState && (
                        <>
                            {/* ШАГ: Ввод параметров (Показываем сразу, если step='check' или 'input') */}
                            {(step === 'check' || step === 'input') && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Смотреть даты экспирации в диапазоне от сегодняшнего дня (от - до)</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                type="number"
                                                value={minDays}
                                                onChange={(e) => setMinDays(e.target.value)}
                                                placeholder="Min"
                                            />
                                            <Input
                                                type="number"
                                                value={maxDays}
                                                onChange={(e) => setMaxDays(e.target.value)}
                                                placeholder="Max"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Ориентируемся на рост цены актива (%)</Label>
                                        <Input
                                            type="number"
                                            value={growthPercent}
                                            onChange={(e) => setGrowthPercent(e.target.value)}
                                            placeholder="50"
                                        />
                                    </div>

                                    {error && (
                                        <div className="text-red-500 text-sm bg-red-50 p-2 rounded flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4" />
                                            {error}
                                        </div>
                                    )}

                                    <Button
                                        onClick={handleSearch}
                                        className="bg-amber-500 hover:bg-amber-600 text-white w-full"
                                        disabled={!minDays || !maxDays || !growthPercent}
                                    >
                                        Найти самый прибыльный опцион
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
