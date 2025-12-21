import React, { useMemo } from 'react';

/**
 * PLHeatmapTable - Тепловая карта P&L (Страйк × Дата) с цветовой кодировкой
 */
function PLHeatmapTable({ options = [], currentPrice = 0 }) {
  const tableData = useMemo(() => {
    if (!options || options.length === 0 || !currentPrice) {
      return null;
    }

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

    const plMatrix = {};
    let minPL = Infinity;
    let maxPL = -Infinity;
    
    strikes.forEach(strike => {
      plMatrix[strike] = {};
      dates.forEach(date => {
        let totalPL = 0;
        
        options.forEach(opt => {
          if (Number(opt.strike) === strike && opt.date === date && opt.visible !== false) {
            const { type, premium, action } = opt;
            
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
        minPL = Math.min(minPL, totalPL);
        maxPL = Math.max(maxPL, totalPL);
      });
    });

    return { strikes, dates, plMatrix, minPL, maxPL };
  }, [options, currentPrice]);

  const getHeatmapColor = (value, minPL, maxPL) => {
    if (minPL === maxPL) return 'bg-gray-300 dark:bg-gray-600';
    
    const normalized = (value - minPL) / (maxPL - minPL);
    
    if (normalized < 0.33) {
      // Красный (убыток)
      const intensity = Math.floor((1 - normalized / 0.33) * 255);
      return `bg-red-${Math.min(900, Math.max(100, 900 - intensity * 8))} dark:bg-red-${Math.min(900, Math.max(100, 900 - intensity * 8))}`;
    } else if (normalized < 0.67) {
      // Желтый (нейтральный)
      return 'bg-yellow-200 dark:bg-yellow-800';
    } else {
      // Зеленый (прибыль)
      const intensity = Math.floor(((normalized - 0.67) / 0.33) * 255);
      return `bg-green-${Math.min(900, Math.max(100, 100 + intensity * 8))} dark:bg-green-${Math.min(900, Math.max(100, 100 + intensity * 8))}`;
    }
  };

  const getSimpleColor = (value) => {
    if (value > 0) {
      const intensity = Math.min(value / 10000, 1);
      return `rgba(16, 185, 129, ${0.3 + intensity * 0.7})`;
    } else if (value < 0) {
      const intensity = Math.min(Math.abs(value) / 10000, 1);
      return `rgba(239, 68, 68, ${0.3 + intensity * 0.7})`;
    }
    return 'rgba(200, 200, 200, 0.5)';
  };

  if (!tableData) {
    return (
      <div className="h-96 flex items-center justify-center border-2 border-dashed border-border rounded-lg">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">Тепловая карта недоступна</p>
          <p className="text-sm text-muted-foreground/70">Добавьте опционы для отображения</p>
        </div>
      </div>
    );
  }

  const { strikes, dates, plMatrix, minPL, maxPL } = tableData;

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
            <tr key={strike}>
              <td className="border border-border px-2 py-2 font-semibold text-left bg-muted">
                ${strike.toFixed(2)}
              </td>
              {dates.map(date => {
                const pl = plMatrix[strike][date];
                const bgColor = getSimpleColor(pl);
                
                return (
                  <td
                    key={`${strike}-${date}`}
                    className="border border-border px-2 py-3 text-center font-semibold text-white"
                    style={{ backgroundColor: bgColor }}
                    title={`P&L: ${pl >= 0 ? `$${pl.toFixed(2)}` : `-$${Math.abs(pl).toFixed(2)}`}`}
                  >
                    {pl > 0 ? '+' : ''}{(pl / 1000).toFixed(1)}k
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Легенда */}
      <div className="mt-4 flex gap-4 items-center text-xs">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6" style={{ backgroundColor: 'rgba(239, 68, 68, 1)' }}></div>
          <span>Убыток</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6" style={{ backgroundColor: 'rgba(200, 200, 200, 0.5)' }}></div>
          <span>Нейтраль</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6" style={{ backgroundColor: 'rgba(16, 185, 129, 1)' }}></div>
          <span>Прибыль</span>
        </div>
      </div>
    </div>
  );
}

export default PLHeatmapTable;
