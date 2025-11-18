import React, { useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff, ChevronDown, Trash2, Download } from 'lucide-react';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import { getPositionsByTicker, addPosition as savePosition } from '../../utils/portfolioStorage';

function BaseAssetPositions({ 
  positions, 
  togglePositionVisibility, 
  deletePosition, 
  addPosition,
  selectedTicker,
  currentPrice,
  updatePosition 
}) {
  const [savedPositions, setSavedPositions] = useState([]);
  const [showLoadButton, setShowLoadButton] = useState(false);

  // Проверяем наличие сохраненных позиций при изменении тикера
  useEffect(() => {
    if (selectedTicker) {
      const saved = getPositionsByTicker(selectedTicker);
      setSavedPositions(saved);
      setShowLoadButton(saved.length > 0);
    }
  }, [selectedTicker]);

  // Функция для фильтрации числового ввода
  const handleNumericInput = (value, isFloat = false) => {
    // Разрешаем цифры, точку (для float), backspace, delete, стрелки
    const regex = isFloat ? /^[0-9]*\.?[0-9]*$/ : /^[0-9]*$/;
    return regex.test(value) ? value : value.replace(/[^0-9.]/g, '');
  };

  // Добавить позицию и сохранить в localStorage
  const handleAddPosition = (type) => {
    const quantity = 100;
    const price = currentPrice || 3000; // Используем currentPrice или дефолтное значение
    
    // Добавляем в калькулятор
    addPosition(type, quantity, price);
    
    // Сохраняем в localStorage
    if (selectedTicker) {
      savePosition(selectedTicker, type, quantity, price);
    }
  };

  // Загрузить сохраненные позиции
  const loadSavedPositions = useCallback(() => {
    savedPositions.forEach(saved => {
      addPosition(saved.type, saved.quantity, saved.price);
    });
    setShowLoadButton(false);
  }, [savedPositions, addPosition]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Позиции базового актива</h3>
        <div className="flex gap-2">
          {showLoadButton && (
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 w-8 p-0 bg-transparent text-cyan-500 hover:text-cyan-600"
              // eslint-disable-next-line no-undef
              onClick={loadSavedPositions}
              title={`Загрузить сохраненные позиции (${savedPositions.length})`}
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
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
                <span className="text-muted-foreground">100 {selectedTicker || "AAPL"}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddPosition("SHORT")}>
                <span className="text-red-600 font-medium mr-2">SHORT</span>
                <span className="text-muted-foreground">100 {selectedTicker || "AAPL"}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="space-y-2">
        {positions.map((position) => (
          <div
            key={position.id}
            className={`grid grid-cols-[30px_50px_60px_72px_100px_30px] items-center text-sm border rounded-md p-2 ${
              !position.visible ? "[&>*]:text-[#AAAAAA]" : ""
            }`}
            style={{ gap: 0 }}
          >
            <button
              onClick={() => togglePositionVisibility(position.id)}
              className="text-muted-foreground hover:text-foreground flex justify-center"
            >
              {position.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <span className={`font-medium ml-2 ${position.type === "LONG" ? "text-green-600" : "text-red-600"}`}>
              {position.type}
            </span>
            <div className="ml-2">
              <Input
                type="text"
                value={String(position.quantity)}
                onChange={(e) => {
                  const filtered = handleNumericInput(e.target.value, false);
                  updatePosition(position.id, 'quantity', parseInt(filtered) || 0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.target.blur();
                  }
                }}
                className="w-full h-6 text-xs text-right"
              />
            </div>
            <div className="relative w-[72px] overflow-hidden ml-2">
              <span className="font-medium block">{position.ticker}</span>
            </div>
            <div className="ml-2">
              <Input
                type="text"
                value={position.price === '' ? '' : `$${position.price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`}
                onChange={(e) => {
                  const cleanValue = e.target.value.replace(/[\$\s]/g, '');
                  updatePosition(position.id, 'price', cleanValue === '' ? '' : parseFloat(cleanValue) || 0);
                }}
                onFocus={(e) => {
                  if (position.price === '' || position.price === 0) {
                    e.target.value = '';
                  } else {
                    e.target.value = position.price.toString();
                  }
                }}
                onBlur={(e) => {
                  const numValue = e.target.value.replace(/[\$\s]/g, '');
                  const parsedValue = numValue === '' ? 0 : parseFloat(numValue) || 0;
                  updatePosition(position.id, 'price', parsedValue);
                  e.target.value = parsedValue === 0 ? '' : `$${parsedValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.target.blur();
                  }
                }}
                className="w-full h-6 text-xs text-right"
              />
            </div>
            <button
              onClick={() => deletePosition(position.id)}
              className="text-muted-foreground hover:text-destructive flex justify-center"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default BaseAssetPositions;
