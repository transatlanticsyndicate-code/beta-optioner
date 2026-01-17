import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import LockIcon from './LockIcon';

/**
 * Получает минимальную дату входа из опционов
 * ЗАЧЕМ: Использовать дату входа как дату сохранения конфигурации вместо текущей даты
 * Если несколько опционов с разными датами входа, берем наименьшую (самую раннюю)
 * @param options - массив опционов
 * @returns ISO строка даты (YYYY-MM-DD) или текущая дата если нет опционов
 */
const getMinEntryDate = (options) => {
  if (!options || options.length === 0) {
    return new Date().toISOString();
  }

  // Фильтруем опционы с установленной датой входа
  const optionsWithEntryDate = options.filter(opt => opt.entryDate);
  
  if (optionsWithEntryDate.length === 0) {
    // Если нет опционов с датой входа, используем текущую дату
    return new Date().toISOString();
  }

  // Находим минимальную дату входа
  const minEntryDate = optionsWithEntryDate.reduce((min, opt) => {
    return opt.entryDate < min ? opt.entryDate : min;
  }, optionsWithEntryDate[0].entryDate);

  // Преобразуем ISO дату (YYYY-MM-DD) в полный ISO формат с временем
  // Добавляем время 00:00:00 UTC
  return `${minEntryDate}T00:00:00.000Z`;
};

/**
 * Получает дату экспирации из опционов для отображения
 * ЗАЧЕМ: Показывать правильную дату экспирации в свойствах конфигурации
 * @param options - массив опционов
 * @returns строка даты в формате DD.MM.YY или '—' если нет опционов
 */
const getExpirationDateFromOptions = (options) => {
  if (!options || options.length === 0) {
    return '—';
  }

  // Берем дату из первого опциона (все опционы обычно имеют одну дату экспирации)
  const firstOptionWithDate = options.find(opt => opt.date);
  
  if (!firstOptionWithDate || !firstOptionWithDate.date) {
    return '—';
  }

  // Форматируем дату из ISO (YYYY-MM-DD) в DD.MM.YY
  const [year, month, day] = firstOptionWithDate.date.split('-');
  return `${day}.${month}.${year.slice(-2)}`;
};

/**
 * Генерирует автоматическое название для конфигурации
 * ЗАЧЕМ: Удобное название с информацией о позициях
 * Формат: [FIXED] AAPL 100L @280 | 1 BuyCALL 09.01.26 290
 * @param currentState - текущее состояние калькулятора
 * @param isLocked - добавлять ли маркер фиксации в начало
 */
const generateConfigName = (currentState, isLocked = false) => {
  const parts = [];
  
  // Добавляем маркер фиксации только для зафиксированных позиций
  if (isLocked) {
    parts.push('🔴');
  }
  
  // Базовый актив: TICKER QTY+TYPE @PRICE
  // Например: AAPL 100L @280
  if (currentState.positions && currentState.positions.length > 0) {
    const positionParts = currentState.positions.map(pos => {
      const qty = pos.quantity || 0;
      const type = pos.type === 'LONG' ? 'L' : 'S';
      const price = pos.price ? `@${Math.round(pos.price)}` : '';
      return `${qty}${type}${price}`;
    });
    parts.push(`${currentState.selectedTicker || ''} ${positionParts.join(' ')}`);
  } else if (currentState.selectedTicker) {
    parts.push(currentState.selectedTicker);
  }
  
  // Опционы: количество, тип, дата, страйк
  // Например: 1 BuyCALL 09.01.26 290
  if (currentState.options && currentState.options.length > 0) {
    const optionParts = currentState.options.map(opt => {
      const qty = Math.abs(opt.quantity || 1);
      const action = opt.action || 'Buy';
      const type = opt.type || 'CALL';
      // Форматируем дату из ISO (YYYY-MM-DD) в DD.MM.YY
      let dateStr = '';
      if (opt.date) {
        const [year, month, day] = opt.date.split('-');
        dateStr = `${day}.${month}.${year.slice(-2)}`;
      }
      const strike = opt.strike ? Math.round(opt.strike) : '';
      return `${qty} ${action}${type} ${dateStr} ${strike}`.trim();
    });
    if (optionParts.length > 0) {
      parts.push(`| ${optionParts.join(', ')}`);
    }
  }
  
  return parts.join(' ');
};

/**
 * Диалог сохранения конфигурации калькулятора
 * ЗАЧЕМ: Позволяет сохранить текущее состояние калькулятора для быстрого доступа
 * 
 * @param isLocked - если true, позиции будут зафиксированы (не обновляются при загрузке)
 */
function SaveConfigurationDialog({ isOpen, onClose, onSave, currentState, isLocked = false }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  
  // Автозаполнение названия при открытии диалога
  // ЗАЧЕМ: Удобное название с информацией о позициях генерируется автоматически
  useEffect(() => {
    if (isOpen && currentState) {
      const autoName = generateConfigName(currentState, isLocked);
      setName(autoName);
    }
  }, [isOpen, isLocked, currentState]);

  const handleSave = () => {
    if (!name.trim()) {
      alert('Пожалуйста, введите название конфигурации');
      return;
    }

    // Формируем объект конфигурации
    // ЗАЧЕМ: Сохраняем полное состояние калькулятора для последующего восстановления
    const configuration = {
      id: Date.now().toString(),
      name: name.trim(),
      description: description.trim(),
      author: author.trim() || 'Неизвестный автор',
      ticker: currentState.selectedTicker || '',
      // Используем текущее время для отображения даты/времени создания
      // ЗАЧЕМ: Показывать реальное время сохранения конфигурации
      createdAt: new Date().toISOString(),
      // Сохраняем минимальную дату входа отдельно для расчетов
      // ЗАЧЕМ: Дата входа служит точкой отсчета для расчета дней, прошедших и оставшихся до экспирации
      entryDate: getMinEntryDate(currentState.options),
      // isLocked: если true — позиции зафиксированы, данные не обновляются при загрузке
      isLocked: isLocked,
      state: {
        selectedTicker: currentState.selectedTicker,
        currentPrice: currentState.currentPrice,
        priceChange: currentState.priceChange,
        // При фиксации помечаем каждую позицию/опцион флагом isLockedPosition
        // и сохраняем initialDaysToExpiration для корректного расчёта P&L
        // ЗАЧЕМ: Позволяет добавлять новые позиции к зафиксированным, сохраняя старые заблокированными
        options: isLocked 
          ? (currentState.options || []).map(opt => {
              // Вычисляем дни до экспирации на момент сохранения
              let initialDaysToExpiration = 30; // default
              if (opt.date) {
                const now = new Date();
                const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
                const [year, month, day] = opt.date.split('-').map(Number);
                const expDateUTC = Date.UTC(year, month - 1, day);
                initialDaysToExpiration = Math.ceil((expDateUTC - todayUTC) / (1000 * 60 * 60 * 24));
              }
              return { ...opt, isLockedPosition: true, initialDaysToExpiration };
            })
          : currentState.options,
        positions: isLocked
          ? (currentState.positions || []).map(pos => ({ ...pos, isLockedPosition: true }))
          : currentState.positions,
        selectedExpirationDate: currentState.selectedExpirationDate,
        daysPassed: currentState.daysPassed,
        showOptionLines: currentState.showOptionLines,
        showProbabilityZones: currentState.showProbabilityZones,
        chartDisplayMode: currentState.chartDisplayMode,
      },
    };

    onSave(configuration);
    
    // Очистка полей
    setName('');
    setDescription('');
    setAuthor('');
    onClose();
  };

  const handleCancel = () => {
    setName('');
    setDescription('');
    setAuthor('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] z-[9999]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isLocked && <LockIcon size={20} />}
            {isLocked ? 'Зафиксировать позиции' : 'Сохранить конфигурацию калькулятора'}
          </DialogTitle>
          <DialogDescription>
            {isLocked 
              ? 'Позиции будут зафиксированы. При загрузке данные НЕ будут обновляться с рынка.'
              : 'Сохраните текущее состояние калькулятора для быстрого доступа в будущем'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="config-name">
              Название <span className="text-destructive">*</span>
            </Label>
            <Input
              id="config-name"
              placeholder="Например: Bull Call Spread на SPY"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="config-description">Описание (опционально)</Label>
            <Textarea
              id="config-description"
              placeholder="Краткое описание стратегии или заметки..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="config-author">Автор</Label>
            <Input
              id="config-author"
              placeholder="Ваше имя"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>

          {currentState.selectedTicker && (
            <div className={`rounded-lg p-3 text-sm ${isLocked ? 'bg-red-50 border border-red-200' : 'bg-muted'}`}>
              <div className="font-medium mb-1 flex items-center gap-1">
                {isLocked && <LockIcon size={14} />}
                {isLocked ? 'Будет зафиксировано:' : 'Будет сохранено:'}
              </div>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Тикер: {currentState.selectedTicker}</li>
                <li>• Опционов: {currentState.options?.length || 0}</li>
                <li>• Позиций базового актива: {currentState.positions?.length || 0}</li>
                <li>• Дата экспирации: {getExpirationDateFromOptions(currentState.options)}</li>
                {isLocked && (
                  <li className="text-red-600 font-medium">• Данные НЕ будут обновляться при загрузке</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Отмена
          </Button>
          <Button 
            onClick={handleSave}
            className={isLocked ? 'bg-red-500 hover:bg-red-600 flex items-center gap-1' : ''}
          >
            {isLocked && <LockIcon size={16} className="[&_path]:fill-white" />}
            {isLocked ? 'Зафиксировать' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SaveConfigurationDialog;
