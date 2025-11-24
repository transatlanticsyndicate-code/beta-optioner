import React, { useMemo } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../ui/button';

/**
 * PLExportTable - Таблица с возможностью экспорта в CSV
 */
function PLExportTable({ options = [], currentPrice = 0 }) {
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
          const { type, premium, action, date, quantity, oi, volume, delta } = opt;
          
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
            quantity,
            date: date ? new Date(date).toLocaleDateString('en-US') : 'N/A',
            oi: oi || 0,
            volume: volume || 0,
            delta: (delta || 0).toFixed(3),
            pl,
            plPercent: premium > 0 ? ((pl / (premium * 100)) * 100).toFixed(2) : '0.00'
          });
        }
      });
    });

    return rows.sort((a, b) => a.strike - b.strike);
  }, [options, currentPrice]);

  const handleExportCSV = () => {
    if (!tableData || tableData.length === 0) return;

    const headers = ['Strike', 'Type', 'Action', 'Premium', 'Quantity', 'Date', 'OI', 'Volume', 'Delta', 'P&L ($)', 'P&L (%)'];
    
    const rows = tableData.map(row => [
      row.strike.toFixed(2),
      row.type.toUpperCase(),
      row.action,
      row.premium.toFixed(2),
      row.quantity,
      row.date,
      row.oi,
      row.volume,
      row.delta,
      row.pl.toFixed(2),
      row.plPercent
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pl-table-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
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

  const totalPL = tableData.reduce((sum, row) => sum + row.pl, 0);

  return (
    <div className="space-y-4">
      {/* Кнопка экспорта */}
      <div className="flex justify-between items-center">
        <div className="text-sm font-semibold">
          Всего P&L: <span className={totalPL > 0 ? 'text-green-600' : 'text-red-600'}>
            {totalPL > 0 ? '+' : ''}{(totalPL / 1000).toFixed(2)}k
          </span>
        </div>
        <Button
          onClick={handleExportCSV}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Таблица */}
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="border border-border px-2 py-2 text-left font-semibold">Strike</th>
              <th className="border border-border px-2 py-2 text-left font-semibold">Type</th>
              <th className="border border-border px-2 py-2 text-left font-semibold">Action</th>
              <th className="border border-border px-2 py-2 text-right font-semibold">Premium</th>
              <th className="border border-border px-2 py-2 text-right font-semibold">Qty</th>
              <th className="border border-border px-2 py-2 text-left font-semibold">Date</th>
              <th className="border border-border px-2 py-2 text-right font-semibold">OI</th>
              <th className="border border-border px-2 py-2 text-right font-semibold">Volume</th>
              <th className="border border-border px-2 py-2 text-right font-semibold">Delta</th>
              <th className="border border-border px-2 py-2 text-right font-semibold">P&L ($)</th>
              <th className="border border-border px-2 py-2 text-right font-semibold">P&L (%)</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((row, idx) => (
              <tr key={idx} className="hover:bg-muted/50">
                <td className="border border-border px-2 py-2 font-semibold">${row.strike.toFixed(2)}</td>
                <td className="border border-border px-2 py-2">{row.type.toUpperCase()}</td>
                <td className="border border-border px-2 py-2">{row.action}</td>
                <td className="border border-border px-2 py-2 text-right">{row.premium >= 0 ? `$${row.premium.toFixed(2)}` : `-$${Math.abs(row.premium).toFixed(2)}`}</td>
                <td className="border border-border px-2 py-2 text-right">{row.quantity}</td>
                <td className="border border-border px-2 py-2 text-xs">{row.date}</td>
                <td className="border border-border px-2 py-2 text-right text-xs">{row.oi.toLocaleString()}</td>
                <td className="border border-border px-2 py-2 text-right text-xs">{row.volume.toLocaleString()}</td>
                <td className="border border-border px-2 py-2 text-right text-xs">{row.delta}</td>
                <td className={`border border-border px-2 py-2 text-right font-semibold ${getColorClass(row.pl)}`}>
                  {row.pl > 0 ? '+' : ''}{(row.pl / 1000).toFixed(2)}k
                </td>
                <td className={`border border-border px-2 py-2 text-right font-semibold ${getColorClass(row.pl)}`}>
                  {row.plPercent}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PLExportTable;
