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
  Area,
  AreaChart,
} from 'recharts';
import { generateExitChartData } from '../../utils/gradualStrategyCalculations';

const ExitChart = ({ exitResults, entryPrice }) => {
  if (!exitResults) return null;

  const data = generateExitChartData(exitResults, entryPrice);

  return (
    <div className="chart-container">
      <h4>📊 График P&L выхода</h4>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="price"
            label={{ value: 'Цена актива', position: 'insideBottom', offset: -5 }}
          />
          <YAxis
            label={{ value: 'Накопленная прибыль ($)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
            formatter={(value, name) => {
              if (name === 'profit') return [`$${value}`, 'Прибыль'];
              if (name === 'contractsClosed') return [value, 'Закрыто контрактов'];
              return value;
            }}
          />
          <Legend />
          <defs>
            <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="profit"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#colorProfit)"
            name="Накопленная прибыль"
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="chart-description">
        <p className="text-sm text-muted-foreground">
          График показывает рост вашей прибыли по мере увеличения цены актива. Зеленая область
          отображает накопленную прибыль от закрытых контрактов.
        </p>
      </div>
    </div>
  );
};

export default ExitChart;
