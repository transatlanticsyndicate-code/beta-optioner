import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { generateEntryChartData } from '../../utils/gradualStrategyCalculations';

const EntryChart = ({ entryResults, currentPrice, targetPrice }) => {
  if (!entryResults) return null;

  const data = generateEntryChartData(entryResults, currentPrice, targetPrice);

  return (
    <div className="chart-container">
      <h4>📊 График P&L входа</h4>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="price"
            label={{ value: 'Цена актива', position: 'insideBottom', offset: -5 }}
          />
          <YAxis
            label={{ value: 'Средняя цена входа', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
            formatter={(value, name) => {
              if (name === 'avgCost') return [`$${value}`, 'Средняя цена'];
              if (name === 'contractsOpened') return [value, 'Открыто контрактов'];
              return value;
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="avgCost"
            stroke="#10b981"
            strokeWidth={2}
            name="Средняя цена входа"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#6366f1"
            strokeWidth={2}
            strokeDasharray="5 5"
            name="Текущая цена"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="chart-description">
        <p className="text-sm text-muted-foreground">
          График показывает, как меняется средневзвешенная цена входа по мере падения цены актива.
          Зеленая линия — ваша средняя цена, синяя пунктирная — текущая цена рынка.
        </p>
      </div>
    </div>
  );
};

export default EntryChart;
