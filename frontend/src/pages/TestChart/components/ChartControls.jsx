/**
 * Элементы управления графиком
 * ЗАЧЕМ: Ввод тикера и параметров позиций
 */

import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/ui/button';
import { TICKER_HISTORY } from '../config/chartConfig';

export function ChartControls({
  ticker,
  onTickerChange,
  onTickerSubmit,
  entry1,
  onEntry1Change,
  entry2,
  onEntry2Change,
  averageEntry,
  stopLoss,
  onStopLossChange,
  exit1,
  onExit1Change,
  exit2,
  onExit2Change,
  onReset,
  loading
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Параметры графика</span>
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Сброс
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="ticker">Тикер</Label>
          <div className="flex gap-2">
            <Input
              id="ticker"
              value={ticker}
              onChange={(e) => onTickerChange(e.target.value.toUpperCase())}
              onKeyPress={(e) => e.key === 'Enter' && onTickerSubmit(ticker)}
              placeholder="AAPL"
              list="ticker-suggestions"
              disabled={loading}
            />
            <datalist id="ticker-suggestions">
              {TICKER_HISTORY.map(t => <option key={t} value={t} />)}
            </datalist>
            <Button onClick={() => onTickerSubmit(ticker)} disabled={loading}>
              {loading ? 'Загрузка...' : 'Загрузить'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="entry1">Вход 1</Label>
            <Input
              id="entry1"
              type="number"
              value={entry1}
              onChange={(e) => onEntry1Change(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="entry2">Вход 2</Label>
            <Input
              id="entry2"
              type="number"
              value={entry2}
              onChange={(e) => onEntry2Change(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        <div>
          <Label>Средняя цена входа</Label>
          <Input value={averageEntry} disabled />
        </div>

        <div>
          <Label htmlFor="stopLoss">Стоп-лосс</Label>
          <Input
            id="stopLoss"
            type="number"
            value={stopLoss}
            onChange={(e) => onStopLossChange(e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="exit1">Выход 1</Label>
            <Input
              id="exit1"
              type="number"
              value={exit1}
              onChange={(e) => onExit1Change(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="exit2">Выход 2</Label>
            <Input
              id="exit2"
              type="number"
              value={exit2}
              onChange={(e) => onExit2Change(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
