import React, { useState } from 'react';
import { Eye, EyeOff, Edit2, Check, X, Copy, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';

/**
 * PositionItemTable - строка таблицы позиций
 */
function PositionItemTable({ position, onToggleVisibility, onDuplicate, onRemove, onUpdate }) {
  const { id, type, strike, direction, size, price, expiration, commission, visible } = position;
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    type,
    direction,
    expiration
  });

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

  // Расчеты
  const totalCost = (price * size * 100).toFixed(2);
  const totalCommission = (commission * Math.abs(size)).toFixed(2);
  const netCost = (parseFloat(totalCost) + parseFloat(totalCommission)).toFixed(2);

  // Форматирование даты
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  };

  return (
    <tr className={`border-b hover:bg-muted/50 transition-colors ${
      !visible ? 'opacity-50' : ''
    }`}>
      {/* Visibility Toggle */}
      <td className="px-2 py-2">
        <Button
          onClick={() => onToggleVisibility(id)}
          variant="ghost"
          size="icon"
          className="h-6 w-6"
        >
          {visible ? (
            <Eye className="h-3 w-3" />
          ) : (
            <EyeOff className="h-3 w-3 opacity-50" />
          )}
        </Button>
      </td>

      {/* Direction (Buy/Sell) */}
      <td className="px-2 py-2">
        {isEditing ? (
          <Button
            type="button"
            size="sm"
            onClick={() => setEditData(prev => ({ 
              ...prev, 
              direction: prev.direction === 'buy' ? 'sell' : 'buy' 
            }))}
            variant={editData.direction === 'buy' ? 'default' : 'destructive'}
            className={`h-6 px-2 text-xs font-bold ${
              editData.direction === 'sell' ? 'bg-red-500 text-white hover:bg-red-600' : ''
            }`}
          >
            {editData.direction === 'buy' ? 'Buy' : 'Sell'}
          </Button>
        ) : (
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
            direction === 'buy' 
              ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100' 
              : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-100'
          }`}>
            {direction === 'buy' ? 'Buy' : 'Sell'}
          </span>
        )}
      </td>

      {/* Type (Call/Put) */}
      <td className="px-2 py-2">
        {isEditing ? (
          <Select
            value={editData.type}
            onValueChange={(value) => setEditData(prev => ({ ...prev, type: value }))}
          >
            <SelectTrigger className="h-6 w-16 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="call">CALL</SelectItem>
              <SelectItem value="put">PUT</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold text-white ${
            type === 'call' ? 'bg-blue-500' : 'bg-orange-500'
          }`}>
            {type.toUpperCase()}
          </span>
        )}
      </td>

      {/* Strike */}
      <td className="px-2 py-2 text-sm font-semibold">
        {strike}
      </td>

      {/* Expiration */}
      <td className="px-2 py-2 text-sm text-muted-foreground">
        {isEditing ? (
          <Input
            type="date"
            value={editData.expiration}
            onChange={(e) => setEditData(prev => ({ ...prev, expiration: e.target.value }))}
            className="h-6 text-xs w-28"
          />
        ) : (
          formatDate(expiration)
        )}
      </td>

      {/* Size */}
      <td className="px-2 py-2 text-sm text-center">
        {size}
      </td>

      {/* Price */}
      <td className="px-2 py-2 text-sm font-medium">
        ${price.toFixed(2)}
      </td>

      {/* Total Cost */}
      <td className="px-2 py-2 text-sm font-medium text-green-600">
        ${totalCost}
      </td>

      {/* Commission */}
      <td className="px-2 py-2 text-sm text-red-600">
        ${totalCommission}
      </td>

      {/* Net Cost */}
      <td className="px-2 py-2 text-sm font-semibold">
        ${netCost}
      </td>

      {/* Actions */}
      <td className="px-2 py-2">
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <Button
                onClick={handleSave}
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-green-500 hover:text-green-600"
              >
                <Check className="h-3 w-3" />
              </Button>
              <Button
                onClick={handleCancel}
                variant="ghost"
                size="icon"
                className="h-6 w-6"
              >
                <X className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={handleEdit}
                variant="ghost"
                size="icon"
                className="h-6 w-6"
              >
                <Edit2 className="h-3 w-3" />
              </Button>
              <Button
                onClick={() => onDuplicate(position)}
                variant="ghost"
                size="icon"
                className="h-6 w-6"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </>
          )}
          <Button
            onClick={() => onRemove(id)}
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

export default PositionItemTable;
