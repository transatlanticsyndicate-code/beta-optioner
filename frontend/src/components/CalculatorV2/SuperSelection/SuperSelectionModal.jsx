/**
 * Модальное окно "Супер подбор" опционов
 * ЗАЧЕМ: Предоставляет интерфейс для расширенного алгоритма подбора опционов
 * Затрагивает: калькулятор опционов, позиции базового актива, таблицу опционов
 */

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Gem, AlertCircle } from 'lucide-react';

/**
 * Компонент модального окна Супер подбора
 * @param {boolean} isOpen - Состояние открытия модального окна
 * @param {function} onClose - Функция закрытия окна
 * @param {array} positions - Позиции базового актива
 * @param {array} options - Опционы в калькуляторе
 * @param {number} currentPrice - Текущая цена базового актива
 * @param {string} selectedTicker - Тикер актива
 * @param {array} availableDates - Доступные даты экспирации
 * @param {function} onAddOption - Функция добавления опциона в калькулятор
 * @param {boolean} isFromExtension - Флаг: данные от расширения TradingView
 */
function SuperSelectionModal({
    isOpen,
    onClose,
    positions = [],
    options = [],
    currentPrice = 0,
    selectedTicker = '',
    availableDates = [],
    onAddOption,
    isFromExtension = false
}) {
    // Стили для шапки модального окна с градиентом диаманда
    const headerStyle = {
        background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #0e7490 100%)',
        margin: '-24px -24px 16px -24px',
        padding: '16px 24px',
        borderRadius: '8px 8px 0 0',
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[450px] border-0 [&>button]:text-white [&>button]:hover:text-white/80">
                <DialogHeader style={headerStyle}>
                    <DialogTitle className="text-white text-lg font-semibold flex items-center gap-2">
                        <Gem className="h-5 w-5" />
                        Супер подбор
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-4 text-center">
                        <div className="flex justify-center text-cyan-500 mb-2">
                            <AlertCircle className="h-12 w-12" />
                        </div>
                        <h3 className="text-lg font-medium text-foreground">Супер подбор</h3>
                        <p className="text-muted-foreground">
                            Функционал "Супер подбор" находится в разработке.
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Здесь будет реализован расширенный алгоритм подбора опционов с дополнительными параметрами и критериями.
                        </p>

                        <div className="bg-muted/50 p-4 rounded-md text-left text-sm space-y-2">
                            <div className="font-medium mb-2">Текущие данные:</div>
                            <div className="flex items-center gap-2">
                                <span>Тикер: {selectedTicker || 'не выбран'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span>Текущая цена: ${currentPrice.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span>Позиций базового актива: {positions.length}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span>Опционов: {options.length}</span>
                            </div>
                        </div>

                        <Button 
                            onClick={onClose} 
                            className="bg-cyan-500 hover:bg-cyan-600 text-white w-full"
                        >
                            Понятно
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default SuperSelectionModal;
