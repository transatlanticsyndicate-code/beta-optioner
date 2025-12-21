/**
 * Переключатели отображения элементов графика
 * ЗАЧЕМ: Управление видимостью линий и маркеров
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Label } from '../../../components/ui/label';
import { Switch } from '../../../components/ui/switch';

export function DisplayToggles({
  cachingEnabled,
  onCachingChange,
  showEntries,
  onShowEntriesChange,
  showAverage,
  onShowAverageChange,
  showStopLoss,
  onShowStopLossChange,
  showExits,
  onShowExitsChange,
  showOptions,
  onShowOptionsChange
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Настройки отображения</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="caching">Кэширование данных</Label>
          <Switch
            id="caching"
            checked={cachingEnabled}
            onCheckedChange={onCachingChange}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="showEntries">Показать входы</Label>
          <Switch
            id="showEntries"
            checked={showEntries}
            onCheckedChange={onShowEntriesChange}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="showAverage">Показать среднюю</Label>
          <Switch
            id="showAverage"
            checked={showAverage}
            onCheckedChange={onShowAverageChange}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="showStopLoss">Показать стоп-лосс</Label>
          <Switch
            id="showStopLoss"
            checked={showStopLoss}
            onCheckedChange={onShowStopLossChange}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="showExits">Показать выходы</Label>
          <Switch
            id="showExits"
            checked={showExits}
            onCheckedChange={onShowExitsChange}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="showOptions">Показать опционы</Label>
          <Switch
            id="showOptions"
            checked={showOptions}
            onCheckedChange={onShowOptionsChange}
          />
        </div>
      </CardContent>
    </Card>
  );
}
