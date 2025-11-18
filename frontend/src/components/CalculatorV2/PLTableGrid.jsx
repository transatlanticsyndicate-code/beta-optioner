import React, { useMemo } from 'react';
import { Card, CardContent } from '../ui/card';

/**
 * PLTableGrid - Таблица P&L для всех комбинаций (Страйк × Дата экспирации)
 */
function PLTableGrid({ options = [], currentPrice = 0 }) {
  const tableData = useMemo(() => {
    if (!options || options.length === 0 || !currentPrice) {
      return null;
    }

    // Собираем уникальные страйки и даты
    const strikeSet = new Set();
    const dateSet = new Set();

    options.forEach(opt => {
      strikeSet.add(Number(opt.strike));
      if (opt.date) dateSet.add(opt.date);
    });

    const strikes = Array.from(strikeSet).sort((a, b) => a - b);
    const dates = Array.from(dateSet).sort();

    if (strikes.length === 0 || dates.length === 0) {
      return null;
    }

    // Создаем матрицу P&L
    const plMatrix = {};
    
    strikes.forEach(strike => {
      plMatrix[strike] = {};
      dates.forEach(date => {
        let totalPL = 0;
        
        options.forEach(opt => {
          if (Number(opt.strike) === strike && opt.date === date && opt.visible !== false) {
            const { type, premium, action } = opt;
            
            // Расчет P&L на экспирацию (intrinsic value)
            let intrinsicValue = 0;
            if (type === 'CALL') {
              intrinsicValue = Math.max(0, currentPrice - strike);
            } else {
              intrinsicValue = Math.max(0, strike - currentPrice);
            }
            
            if (action === 'Buy' || action === 'buy') {
              totalPL += (intrinsicValue - premium) * 100;
            } else {
              totalPL += (premium - intrinsicValue) * 100;
            }
          }
        });
        
        plMatrix[strike][date] = totalPL;
      });
    });

    return { strikes, dates, plMatrix };
  }, [options, currentPrice]);

  const getColorClass = (value) => {
    if (value > 0) return 'bg-green-100 dark:bg-green-900 text-green-900 dark:text-green-100';
    if (value < 0) return 'bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100';
    return 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  };

  if (!tableData) {
    return (
      <div className="h-96 flex items-center justify-center border-2 border-dashed border-border rounded-lg">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">Таблица P&L недоступна</p>
          <p className="text-sm text-muted-foreground/70">Добавьте опционы для отображения</p>
        </div>
      </div>
    );
  }

  const { strikes, dates, plMatrix } = tableData;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-muted">
            <th className="border border-border px-2 py-2 text-left font-semibold">Strike</th>
            {dates.map(date => (
              <th key={date} className="border border-border px-2 py-2 text-center font-semibold whitespace-nowrap">
                {new Date(date).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {strikes.map(strike => (
            <tr key={strike} className="hover:bg-muted/50">
              <td className="border border-border px-2 py-2 font-semibold text-left">
                ${strike.toFixed(2)}
              </td>
              {dates.map(date => {
                const pl = plMatrix[strike][date];
                return (
                  <td
                    key={`${strike}-${date}`}
                    className={`border border-border px-2 py-2 text-center font-semibold ${getColorClass(pl)}`}
                  >
                    {pl > 0 ? '+' : ''}{(pl / 1000).toFixed(2)}k
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PLTableGrid;
