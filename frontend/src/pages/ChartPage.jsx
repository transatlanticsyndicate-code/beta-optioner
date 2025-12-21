import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import CandlestickChart from '../components/CandlestickChart';

function ChartPage() {
  const [ticker, setTicker] = useState('AAPL');

  return (
    <div className="py-6">
      <div className="mb-6 px-4">
        <h1 className="text-2xl font-bold text-foreground">График</h1>
        <p className="text-muted-foreground">Страница для отображения графиков и аналитики</p>
        <div className="mt-4 max-w-xs">
          <Input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Введите тикер (например, AAPL)"
            className="w-full"
          />
        </div>
      </div>

      <Card className="mx-4">
        <CardHeader>
          <CardTitle>График {ticker || 'инструмента'}</CardTitle>
        </CardHeader>
        <CardContent>
          <CandlestickChart ticker={ticker} />
        </CardContent>
      </Card>
    </div>
  );
}

export default ChartPage;
