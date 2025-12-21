import React, { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';

/**
 * PLTableInteractive - Интерактивная таблица с сортировкой и фильтрацией
 */
function PLTableInteractive({ options = [], currentPrice = 0 }) {
  const [sortBy, setSortBy] = useState('strike');
  const [sortOrder, setSortOrder] = useState('asc');
  const [filterMin, setFilterMin] = useState(-Infinity);
  const [filterMax, setFilterMax] = useState(Infinity);

  const tableData = useMemo(() => {
    if (!options || options.length === 0 || !currentPrice) {
      return null;
    }

    const rows = [];
    const strikeSet = new Set();

    options.forEach(opt => {
      strikeSet.add(Number(opt.strike));
    });

    strikeSet.forEach(strike => {
      options.forEach(opt => {
        if (Number(opt.strike) === strike && opt.visible !== false) {
          const { type, premium, action, date } = opt;
          
          let intrinsicValue = 0;
          if (type === 'CALL') {
            intrinsicValue = Math.max(0, currentPrice - strike);
          } else {
            intrinsicValue = Math.max(0, strike - currentPrice);
          }
          
          let pl = 0;
          if (action === 'Buy' || action === 'buy') {
            pl = (intrinsicValue - premium) * 100;
          } else {
            pl = (premium - intrinsicValue) * 100;
          }
          
          rows.push({
            strike,
            type,
            action,
            premium,
            date: date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) : 'N/A',
            pl
          });
        }
      });
    });

    // Фильтрация
    let filtered = rows.filter(row => row.pl >= filterMin && row.pl <= filterMax);

    // Сортировка
    filtered.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      
      if (typeof aVal === 'string') {
        aVal = parseFloat(aVal) || aVal;
        bVal = parseFloat(bVal) || bVal;
      }
      
      const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'asc' ? result : -result;
    });

    return filtered;
  }, [options, currentPrice, sortBy, sortOrder, filterMin, filterMax]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return <ChevronUp className="w-4 h-4 opacity-30" />;
    return sortOrder === 'asc' ? 
      <ChevronUp className="w-4 h-4" /> : 
      <ChevronDown className="w-4 h-4" />;
  };

  const getColorClass = (value) => {
    if (value > 0) return 'bg-green-100 dark:bg-green-900 text-green-900 dark:text-green-100';
    if (value < 0) return 'bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100';
    return 'bg-gray-100 dark:bg-gray-800';
  };

  if (!tableData || tableData.length === 0) {
    return (
      <div className="h-96 flex items-center justify-center border-2 border-dashed border-border rounded-lg">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">Таблица недоступна</p>
          <p className="text-sm text-muted-foreground/70">Добавьте опционы для отображения</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Фильтры */}
      <div className="flex gap-4 items-end">
        <div>
          <label className="text-sm font-medium">Min P&L ($)</label>
          <input
            type="number"
            value={filterMin === -Infinity ? '' : filterMin}
            onChange={(e) => setFilterMin(e.target.value === '' ? -Infinity : parseFloat(e.target.value))}
            className="w-24 px-2 py-1 border border-border rounded text-sm"
            placeholder="Min"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Max P&L ($)</label>
          <input
            type="number"
            value={filterMax === Infinity ? '' : filterMax}
            onChange={(e) => setFilterMax(e.target.value === '' ? Infinity : parseFloat(e.target.value))}
            className="w-24 px-2 py-1 border border-border rounded text-sm"
            placeholder="Max"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setFilterMin(-Infinity);
            setFilterMax(Infinity);
          }}
        >
          Reset
        </Button>
      </div>

      {/* Таблица */}
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="border border-border px-2 py-2 text-left font-semibold cursor-pointer hover:bg-muted/80"
                  onClick={() => handleSort('strike')}>
                <div className="flex items-center gap-1">Strike <SortIcon column="strike" /></div>
              </th>
              <th className="border border-border px-2 py-2 text-left font-semibold cursor-pointer hover:bg-muted/80"
                  onClick={() => handleSort('type')}>
                <div className="flex items-center gap-1">Type <SortIcon column="type" /></div>
              </th>
              <th className="border border-border px-2 py-2 text-left font-semibold cursor-pointer hover:bg-muted/80"
                  onClick={() => handleSort('action')}>
                <div className="flex items-center gap-1">Action <SortIcon column="action" /></div>
              </th>
              <th className="border border-border px-2 py-2 text-right font-semibold cursor-pointer hover:bg-muted/80"
                  onClick={() => handleSort('premium')}>
                <div className="flex items-center justify-end gap-1">Premium <SortIcon column="premium" /></div>
              </th>
              <th className="border border-border px-2 py-2 text-left font-semibold">Date</th>
              <th className="border border-border px-2 py-2 text-right font-semibold cursor-pointer hover:bg-muted/80"
                  onClick={() => handleSort('pl')}>
                <div className="flex items-center justify-end gap-1">P&L <SortIcon column="pl" /></div>
              </th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((row, idx) => (
              <tr key={idx} className="hover:bg-muted/50">
                <td className="border border-border px-2 py-2 font-semibold">${row.strike.toFixed(2)}</td>
                <td className="border border-border px-2 py-2">{row.type.toUpperCase()}</td>
                <td className="border border-border px-2 py-2">{row.action}</td>
                <td className="border border-border px-2 py-2 text-right">{row.premium >= 0 ? `$${row.premium.toFixed(2)}` : `-$${Math.abs(row.premium).toFixed(2)}`}</td>
                <td className="border border-border px-2 py-2 text-xs">{row.date}</td>
                <td className={`border border-border px-2 py-2 text-right font-semibold ${getColorClass(row.pl)}`}>
                  {row.pl > 0 ? '+' : ''}{(row.pl / 1000).toFixed(2)}k
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground">
        Показано {tableData.length} записей
      </div>
    </div>
  );
}

export default PLTableInteractive;
