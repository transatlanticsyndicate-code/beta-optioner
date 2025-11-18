import React, { useMemo } from 'react';
import { Card, CardContent } from '../ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Label,
  Legend
} from 'recharts';

/**
 * OwnDataChart - график только пользовательских данных:
 * - цены входа (entry) - по шагам
 * - цены выхода (exit) - по шагам
 * - стоп-лосс (stopLoss)
 * - средняя цена входа (averagePrice)
 */
const OwnDataChart = ({ entryPrices = [], exitPrices = [], stopLoss = null, averagePrice = null }) => {
  // Группируем входы по шагам (одинаковые цены = один шаг)
  const entrySteps = useMemo(() => {
    const steps = [];
    let currentPrice = null;
    let currentCount = 0;
    
    entryPrices.forEach((price) => {
      if (price === currentPrice) {
        currentCount++;
      } else {
        if (currentPrice !== null) {
          steps.push({ price: currentPrice, count: currentCount });
        }
        currentPrice = price;
        currentCount = 1;
      }
    });
    
    if (currentPrice !== null) {
      steps.push({ price: currentPrice, count: currentCount });
    }
    
    return steps;
  }, [entryPrices]);

  // Создаем данные для графика с разделением входов и выходов
  const chartData = useMemo(() => {
    const data = [];
    
    // Добавляем шаги входов
    entrySteps.forEach((step, i) => {
      data.push({
        step: `Вход ${i + 1}`,
        entry: step.price,
        exit: null,
      });
    });
    
    // Затем добавляем шаги выходов (нумерация с 1)
    exitPrices.forEach((price, i) => {
      data.push({
        step: `Выход ${i + 1}`,
        entry: null,
        exit: price,
      });
    });
    
    return data;
  }, [entrySteps, exitPrices]);

  // Границы оси Y с округлением
  const allPrices = [...entryPrices, ...exitPrices];
  if (stopLoss !== null) allPrices.push(stopLoss);
  if (averagePrice !== null) allPrices.push(averagePrice);
  
  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
  const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 100;
  const range = maxPrice - minPrice;
  
  // Определяем шаг округления в зависимости от диапазона
  let step;
  if (range > 100) step = 10;
  else if (range > 50) step = 5;
  else if (range > 10) step = 2;
  else if (range > 5) step = 1;
  else if (range > 1) step = 0.5;
  else step = 0.25;
  
  const minY = Math.floor(minPrice / step) * step - step;
  const maxY = Math.ceil(maxPrice / step) * step + step;

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <div className="mb-2 text-lg font-semibold">План: входы, выходы, стоп-лосс</div>
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="step" />
            <YAxis domain={[minY, maxY]} tickFormatter={v => v.toFixed(2)} />
            <Tooltip formatter={(v) => v ? v.toFixed(2) : 'N/A'} />
            <Legend 
              payload={[
                { value: 'Вход', type: 'line', id: 'entry', color: '#10B981' },
                { value: 'Выход', type: 'line', id: 'exit', color: '#3B82F6' },
                ...(averagePrice !== null ? [{ value: 'Средняя цена', type: 'line', id: 'avg', color: '#F59E0B' }] : []),
                ...(stopLoss !== null ? [{ value: 'Стоп-лосс', type: 'line', id: 'sl', color: '#EF4444' }] : [])
              ]}
            />
            {/* Линия входов - ступенчатая */}
            <Line 
              type="stepAfter" 
              dataKey="entry" 
              stroke="#10B981" 
              strokeWidth={2}
              name="Вход"
              dot={{ r: 5, fill: '#10B981' }} 
              activeDot={{ r: 7 }}
              connectNulls={false}
            />
            {/* Линия выходов - ступенчатая */}
            <Line 
              type="stepAfter" 
              dataKey="exit" 
              stroke="#3B82F6" 
              strokeWidth={2}
              name="Выход"
              dot={{ r: 5, fill: '#3B82F6' }} 
              activeDot={{ r: 7 }}
              connectNulls={false}
            />
            {/* Средняя цена входа */}
            {averagePrice !== null && (
              <ReferenceLine y={averagePrice} stroke="#F59E0B" strokeWidth={2} strokeDasharray="3 3">
                <Label position="right" fill="#F59E0B" value={`${averagePrice.toFixed(2)}`} />
              </ReferenceLine>
            )}
            {/* Стоп-лосс - сплошная линия */}
            {stopLoss !== null && (
              <ReferenceLine y={stopLoss} stroke="#EF4444" strokeWidth={2}>
                <Label position="right" fill="#EF4444" value={`${stopLoss.toFixed(2)}`} />
              </ReferenceLine>
            )}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default OwnDataChart;
