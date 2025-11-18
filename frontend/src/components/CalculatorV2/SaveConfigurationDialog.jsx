import React, { useState } from 'react';
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

function SaveConfigurationDialog({ isOpen, onClose, onSave, currentState }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');

  const handleSave = () => {
    if (!name.trim()) {
      alert('Пожалуйста, введите название конфигурации');
      return;
    }

    const configuration = {
      id: Date.now().toString(),
      name: name.trim(),
      description: description.trim(),
      author: author.trim() || 'Неизвестный автор',
      ticker: currentState.selectedTicker || '',
      createdAt: new Date().toISOString(),
      state: {
        selectedTicker: currentState.selectedTicker,
        currentPrice: currentState.currentPrice,
        priceChange: currentState.priceChange,
        options: currentState.options,
        positions: currentState.positions,
        selectedExpirationDate: currentState.selectedExpirationDate,
        daysRemaining: currentState.daysRemaining,
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
          <DialogTitle>Сохранить конфигурацию калькулятора</DialogTitle>
          <DialogDescription>
            Сохраните текущее состояние калькулятора для быстрого доступа в будущем
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
              className="text-right"
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
              className="text-right"
            />
          </div>

          {currentState.selectedTicker && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <div className="font-medium mb-1">Будет сохранено:</div>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Тикер: {currentState.selectedTicker}</li>
                <li>• Опционов: {currentState.options?.length || 0}</li>
                <li>• Позиций базового актива: {currentState.positions?.length || 0}</li>
                <li>• Дата экспирации: {currentState.selectedExpirationDate || '—'}</li>
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Отмена
          </Button>
          <Button onClick={handleSave}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SaveConfigurationDialog;
