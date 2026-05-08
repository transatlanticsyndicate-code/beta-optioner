import React from 'react';
import { Eye, EyeOff, ChevronDown, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import LockIcon from './LockIcon';

import { CALCULATOR_MODES } from '../../utils/universalPricing';

function BaseAssetPositions({ 
  positions, 
  togglePositionVisibility, 
  deletePosition, 
  addPosition,
  selectedTicker,
  currentPrice,
  updatePosition,
  onAddOption,
  isLocked = false,
  options = [], // Опционы из калькулятора для проверки наличия BuyPUT
  isAIEnabled = false,
  isTickerSupported = false,
  calculatorMode = CALCULATOR_MODES.STOCKS // Режим калькулятора (stocks/futures)
}) {
  // Для фьючерсов добавляем 1 контракт, для крипто и акций - 100 штук
  // ЗАЧЕМ: Фьючерсный контракт уже включает множитель (pointValue), поэтому quantity = 1
  // Крипто и акции используют quantity = 100 (множитель применяется при расчёте P&L)
  const defaultQuantity = calculatorMode === CALCULATOR_MODES.FUTURES ? 1 : 100;
  // Проверяем, есть ли позиции базового актива
  const hasPositions = positions && positions.length > 0;


  // Функция для фильтрации числового ввода
  const handleNumericInput = (value, isFloat = false) => {
    // Разрешаем цифры, точку (для float), backspace, delete, стрелки
    const regex = isFloat ? /^[0-9]*\.?[0-9]*$/ : /^[0-9]*$/;
    return regex.test(value) ? value : value.replace(/[^0-9.]/g, '');
  };

  // Добавить позицию
  // ЗАЧЕМ: Позиции автоматически сохраняются через автосохранение состояния калькулятора
  const handleAddPosition = (type) => {
    const quantity = defaultQuantity; // 1 для фьючерсов, 100 для акций
    const price = currentPrice || 3000; // Используем currentPrice или дефолтное значение
    
    // Добавляем в калькулятор (автосохранение произойдет автоматически)
    addPosition(type, quantity, price);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Базовый актив</h3>
        </div>
        <div className="flex gap-2">
          {/* Кнопки добавления доступны всегда (даже для зафиксированных позиций) */}
          {/* ЗАЧЕМ: Позволяет добавлять новые позиции к зафиксированным */}
          <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 bg-transparent">
                    Добавить
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => handleAddPosition("LONG")}>
                    <span className="text-green-600 font-medium mr-2">LONG</span>
                    <span className="text-muted-foreground">{defaultQuantity} {selectedTicker || "AAPL"}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddPosition("SHORT")}>
                    <span className="text-red-600 font-medium mr-2">SHORT</span>
                    <span className="text-muted-foreground">{defaultQuantity} {selectedTicker || "AAPL"}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
          </>
        </div>
      </div>

      <div className="space-y-2">
        {positions.map((position) => (
          <div
            key={position.id}
            data-stock-row="1"
            data-stock-ticker={position.ticker || ''}
            data-stock-quantity={position.quantity}
            data-stock-side={position.type}
            className={`grid grid-cols-[30px_80px_60px_72px_100px_30px] items-center text-sm border rounded-md p-2 ${
              !position.visible ? "[&>*]:text-[#AAAAAA]" : ""
            }`}
            style={{ gap: 0 }}
          >
            {/* Иконка видимости — всегда Eye/EyeOff, чтобы пользователь мог временно
                исключить базовый актив из расчёта в любом режиме (включая зафиксированные).
                Замочек убран как избыточный визуал — статус «зафиксирована» виден в шапке. */}
            <button
              onClick={() => togglePositionVisibility(position.id)}
              className="flex justify-center text-muted-foreground hover:text-foreground cursor-pointer"
              title={position.visible ? 'Скрыть' : 'Показать'}
            >
              {position.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            {/* В этот flex-контейнер расширение IBKR Bridge инжектит кнопку «−» (закрытие позиции в TWS). */}
            <div className="flex items-center gap-1 ml-2">
              <span className={`font-medium ${position.type === "LONG" ? "text-green-600" : "text-red-600"}`}>
                {position.type}
              </span>
              <span className="ibkr-stock-close-slot" />
            </div>
            <div className="ml-2">
              <Input
                type="text"
                value={String(position.quantity)}
                onChange={(e) => {
                  if (position.isLockedPosition) return; // Блокируем изменение для зафиксированных
                  const filtered = handleNumericInput(e.target.value, false);
                  updatePosition(position.id, 'quantity', parseInt(filtered) || 0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.target.blur();
                  }
                }}
                className="w-full h-6 text-xs text-right"
                disabled={position.isLockedPosition}
              />
            </div>
            <div className="relative w-[72px] overflow-hidden ml-2">
              <span className="font-medium block">{position.ticker}</span>
            </div>
            <div className="ml-2">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={position.price === '' ? '' : position.price}
                onChange={(e) => {
                  if (position.isLockedPosition) return; // Блокируем изменение для зафиксированных
                  const value = e.target.value;
                  updatePosition(position.id, 'price', value === '' ? '' : parseFloat(value) || 0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.target.blur();
                  }
                }}
                className="w-full h-6 text-xs text-right"
                disabled={position.isLockedPosition}
              />
            </div>
            {/* Кнопка удаления скрыта для зафиксированных позиций */}
            {/* ЗАЧЕМ: Проверяем isLockedPosition на уровне каждой позиции */}
            {!position.isLockedPosition && (
              <button
                onClick={() => deletePosition(position.id)}
                className="text-muted-foreground hover:text-destructive flex justify-center"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {position.isLockedPosition && <div className="w-[30px]" />}
          </div>
        ))}
      </div>
    </div>
  );
}

export default BaseAssetPositions;
