import React, { useState } from 'react';
import { Eye, EyeOff, Copy, Trash2, Edit2, Check, X } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';

/**
 * PositionItem - элемент списка позиций с возможностью редактирования
 */
function PositionItem({ position, onToggleVisibility, onDuplicate, onRemove, onUpdate }) {
  const { id, type, strike, direction, size, price, expiration, commission, visible, iv } = position;
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    type,
    direction,
    expiration
  });

  // Общая стоимость позиции
  const totalCost = (price * size * 100 + commission * size).toFixed(2);

  // Обработчики редактирования
  const handleEdit = () => {
    setEditData({ type, direction, expiration });
    setIsEditing(true);
  };

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(id, editData);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData({ type, direction, expiration });
    setIsEditing(false);
  };

  return (
    <div className={`transition-all ${
      visible 
        ? 'bg-card' 
        : 'bg-muted opacity-60'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          {isEditing ? (
            /* Режим редактирования */
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {/* B/S Toggle */}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setEditData(prev => ({ 
                    ...prev, 
                    direction: prev.direction === 'buy' ? 'sell' : 'buy' 
                  }))}
                  variant={editData.direction === 'buy' ? 'default' : 'destructive'}
                  className="h-8 px-3 font-bold"
                >
                  {editData.direction === 'buy' ? 'BUY' : 'SELL'}
                </Button>

                {/* Type Select */}
                <Select
                  value={editData.type}
                  onValueChange={(value) => setEditData(prev => ({ ...prev, type: value }))}
                >
                  <SelectTrigger className="h-8 w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">CALL</SelectItem>
                    <SelectItem value="put">PUT</SelectItem>
                  </SelectContent>
                </Select>

                <span className="font-bold text-lg">${strike}</span>
              </div>

              {/* Expiration Input */}
              <Input
                type="date"
                value={editData.expiration}
                onChange={(e) => setEditData(prev => ({ ...prev, expiration: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
          ) : (
            /* Обычный режим */
            <>
              <div className="flex items-center gap-2 mb-2">
                <Badge 
                  variant={direction === 'buy' ? 'default' : 'destructive'} 
                  className={`font-bold ${
                    direction === 'sell' ? 'bg-red-500 text-white hover:bg-red-600' : ''
                  }`}
                >
                  {direction.toUpperCase()}
                </Badge>
                <Badge 
                  variant="secondary" 
                  className={`font-bold ${type === 'call' ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-orange-500 text-white hover:bg-orange-600'}`}
                >
                  {type.toUpperCase()}
                </Badge>
                <span className="font-bold text-lg">
                  ${strike}
                </span>
              </div>
              
              <div className="text-sm text-muted-foreground">
                Exp: {expiration ? new Date(expiration + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                }) : 'Not set'}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {isEditing ? (
            /* Кнопки сохранения/отмены */
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleSave}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-green-500 hover:text-green-600"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Сохранить</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleCancel}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Отмена</TooltipContent>
              </Tooltip>
            </>
          ) : (
            /* Обычные кнопки */
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => onToggleVisibility(id)}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                  >
                    {visible ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4 opacity-50" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {visible ? 'Скрыть на графике' : 'Показать на графике'}
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleEdit}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Редактировать</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => onDuplicate(position)}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Дублировать позицию
                </TooltipContent>
              </Tooltip>
            </>
          )}
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => onRemove(id)}
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Удалить позицию
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-muted-foreground">Price:</span>
          <span className="ml-2 font-medium">${price.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Size:</span>
          <span className="ml-2 font-medium">{size}x</span>
        </div>
        {iv && (
          <div>
            <span className="text-muted-foreground">IV:</span>
            <span className="ml-2 font-medium">{(iv * 100).toFixed(1)}%</span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Commission:</span>
          <span className="ml-2 font-medium">${(commission * size).toFixed(2)}</span>
        </div>
      </div>

      {/* Total Cost */}
      <div className="mt-2 pt-2 border-t">
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Total Cost:</span>
          <span className="font-semibold">${totalCost}</span>
        </div>
      </div>
    </div>
  );
}

export default PositionItem;
