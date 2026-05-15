import React from 'react';
import { Eye, EyeOff, ChevronDown, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import LockIcon from './LockIcon';

import { CALCULATOR_MODES } from '../../utils/universalPricing';
import { getMarginPerContract } from '../../utils/futuresSettings';

// ЗАЧЕМ: В фьючерсном режиме в строке позиции БА отображаем не цену актива
// (как в акциях), а маржин на 1 контракт из настроек. Цена в state сохраняется
// для расчёта P&L базового актива — её просто не показываем.
const formatMarginCompact = (n) => {
  if (n == null || isNaN(n)) return null;
  return '$ ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

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
            data-stock-price={position.price === '' ? '' : position.price}
            className={`flex items-center gap-2 text-sm border rounded-md p-2 ${
              !position.visible ? "[&_*]:text-[#AAAAAA]" : ""
            }`}
          >
            {/* Иконка видимости — всегда Eye/EyeOff, чтобы пользователь мог временно
                исключить базовый актив из расчёта в любом режиме (включая зафиксированные).
                Замочек убран как избыточный визуал — статус «зафиксирована» виден в шапке. */}
            <button
              onClick={() => togglePositionVisibility(position.id)}
              className="flex justify-center text-muted-foreground hover:text-foreground cursor-pointer flex-shrink-0"
              title={position.visible ? 'Скрыть' : 'Показать'}
            >
              {position.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            {/* В этот flex-контейнер расширение IBKR Bridge инжектит кнопку открытия/закрытия позиции в TWS. */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className={`font-medium ${position.type === "LONG" ? "text-green-600" : "text-red-600"}`}>
                {position.type}
              </span>
              <span className="ibkr-stock-close-slot" />
            </div>
            {/* Поля количества и цены: рамка прозрачная по умолчанию, появляется при фокусе.
                Ширина — по контенту через inline style (ch — ширина символа «0»). */}
            <Input
              type="text"
              value={String(position.quantity)}
              onChange={(e) => {
                if (position.isLockedPosition) return;
                const filtered = handleNumericInput(e.target.value, false);
                updatePosition(position.id, 'quantity', parseInt(filtered) || 0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.target.blur();
              }}
              className="h-6 text-xs text-right border border-transparent shadow-none bg-transparent focus:border-input focus:bg-background px-1 py-0 min-w-0 flex-shrink-0"
              style={{ width: `${Math.max(2, String(position.quantity).length) + 1.5}ch` }}
              disabled={position.isLockedPosition}
            />
            <span className="font-medium flex-shrink-0">{position.ticker}</span>
            {calculatorMode === CALCULATOR_MODES.FUTURES ? (
              // Фьючерсный режим: вместо цены входа показываем маржин на 1 контракт
              // из настроек. Если не задан — предупреждающая иконка с тултипом.
              (() => {
                const margin = getMarginPerContract(position.ticker);
                if (margin != null) {
                  return (
                    <span
                      className="text-xs text-right font-medium tabular-nums flex-shrink-0 px-1"
                      title={`Маржин на 1 контракт — задаётся на странице /settings?section=futures`}
                    >
                      {formatMarginCompact(margin)}
                    </span>
                  );
                }
                return (
                  <span
                    className="text-xs flex items-center gap-1 text-amber-600 flex-shrink-0 px-1"
                    title={`Маржин на 1 контракт для ${position.ticker} не задан в настройках. Откройте /settings?section=futures, найдите соответствующий тикер и заполните колонку «Маржин на 1 контракт».`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    маржин не задан
                  </span>
                );
              })()
            ) : (
              <Input
                type="number"
                step="0.01"
                min="0"
                value={position.price === '' ? '' : position.price}
                onChange={(e) => {
                  if (position.isLockedPosition) return;
                  const value = e.target.value;
                  updatePosition(position.id, 'price', value === '' ? '' : parseFloat(value) || 0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.target.blur();
                }}
                className="h-6 text-xs text-right border border-transparent shadow-none bg-transparent focus:border-input focus:bg-background px-1 py-0 min-w-0 flex-shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                style={{ width: `${Math.max(3, String(position.price).length) + 1.5}ch` }}
                disabled={position.isLockedPosition}
              />
            )}
            {/* Кнопка удаления — прижата к правому краю через ml-auto. */}
            {!position.isLockedPosition ? (
              <button
                onClick={() => deletePosition(position.id)}
                className="text-muted-foreground hover:text-destructive flex justify-center flex-shrink-0 ml-auto"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : (
              <div className="ml-auto" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default BaseAssetPositions;
