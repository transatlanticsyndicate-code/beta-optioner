import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Flame } from 'lucide-react';

/**
 * HeatmapTable - Тепловая карта страйков с метриками
 * Отображает страйки в виде таблицы с цветовой кодировкой по Open Interest и Volume
 */
function HeatmapTable({ options = [], currentPrice = 0 }) {
  const heatmapData = useMemo(() => {
    if (!options || options.length === 0 || !currentPrice) {
      return null;
    }

    // Группируем опционы по страйкам
    const strikeMap = {};
    
    options.forEach(opt => {
      const strike = Number(opt.strike);
      if (!strikeMap[strike]) {
        strikeMap[strike] = {
          strike,
          calls: null,
          puts: null,
          distance: Math.abs(strike - currentPrice),
          distancePercent: ((Math.abs(strike - currentPrice) / currentPrice) * 100).toFixed(2)
        };
      }
      
      if (opt.type === 'CALL') {
        strikeMap[strike].calls = opt;
      } else if (opt.type === 'PUT') {
        strikeMap[strike].puts = opt;
      }
    });

    // Сортируем по страйку
    const sortedStrikes = Object.values(strikeMap).sort((a, b) => a.strike - b.strike);

    // Находим макс значения для нормализации цветов
    let maxOI = 0;
    let maxVolume = 0;
    
    sortedStrikes.forEach(row => {
      if (row.calls) {
        maxOI = Math.max(maxOI, row.calls.oi || 0);
        maxVolume = Math.max(maxVolume, row.calls.volume || 0);
      }
      if (row.puts) {
        maxOI = Math.max(maxOI, row.puts.oi || 0);
        maxVolume = Math.max(maxVolume, row.puts.volume || 0);
      }
    });

    return {
      strikes: sortedStrikes,
      maxOI: maxOI || 1,
      maxVolume: maxVolume || 1
    };
  }, [options, currentPrice]);

  // Функция для расчета цвета на основе значения (от синего к красному)
  const getHeatmapColor = (value, max, type = 'oi') => {
    if (!value || max === 0) return 'bg-gray-100 dark:bg-gray-800';
    
    const ratio = Math.min(value / max, 1);
    
    if (type === 'oi') {
      // Для Open Interest: синий -> зеленый -> красный
      if (ratio < 0.33) {
        return 'bg-blue-200 dark:bg-blue-900';
      } else if (ratio < 0.66) {
        return 'bg-yellow-200 dark:bg-yellow-900';
      } else {
        return 'bg-red-200 dark:bg-red-900';
      }
    } else {
      // Для Volume: похожая схема
      if (ratio < 0.33) {
        return 'bg-cyan-200 dark:bg-cyan-900';
      } else if (ratio < 0.66) {
        return 'bg-green-200 dark:bg-green-900';
      } else {
        return 'bg-orange-200 dark:bg-orange-900';
      }
    }
  };

  // Функция для определения, является ли страйк ATM
  const isATM = (strike) => {
    return Math.abs(strike - currentPrice) < currentPrice * 0.05; // ±5%
  };

  if (!heatmapData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            Тепловая карта страйков
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center border-2 border-dashed border-border rounded-lg">
            <div className="text-center">
              <p className="text-muted-foreground mb-2">Тепловая карта недоступна</p>
              <p className="text-sm text-muted-foreground/70">
                Добавьте опционы для отображения
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { strikes, maxOI, maxVolume } = heatmapData;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          Тепловая карта страйков
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left font-semibold">Страйк</th>
                <th className="px-3 py-2 text-center font-semibold">Дистанция</th>
                <th className="px-3 py-2 text-center font-semibold">CALL OI</th>
                <th className="px-3 py-2 text-center font-semibold">CALL Vol</th>
                <th className="px-3 py-2 text-center font-semibold">CALL Цена</th>
                <th className="px-3 py-2 text-center font-semibold">PUT Цена</th>
                <th className="px-3 py-2 text-center font-semibold">PUT Vol</th>
                <th className="px-3 py-2 text-center font-semibold">PUT OI</th>
              </tr>
            </thead>
            <tbody>
              {strikes.map((row, idx) => (
                <tr
                  key={idx}
                  className={`border-b border-border/50 ${
                    isATM(row.strike) ? 'bg-primary/10' : ''
                  }`}
                >
                  {/* Страйк */}
                  <td
                    className={`px-3 py-2 font-semibold ${
                      isATM(row.strike)
                        ? 'text-primary'
                        : row.strike > currentPrice
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400'
                    }`}
                  >
                    ${row.strike.toFixed(2)}
                  </td>

                  {/* Дистанция */}
                  <td className="px-3 py-2 text-center text-muted-foreground">
                    {row.distancePercent}%
                  </td>

                  {/* CALL OI */}
                  <td
                    className={`px-3 py-2 text-center font-semibold ${getHeatmapColor(
                      row.calls?.oi,
                      maxOI,
                      'oi'
                    )}`}
                  >
                    {row.calls?.oi ? (row.calls.oi / 1000).toFixed(1) + 'k' : '-'}
                  </td>

                  {/* CALL Volume */}
                  <td
                    className={`px-3 py-2 text-center font-semibold ${getHeatmapColor(
                      row.calls?.volume,
                      maxVolume,
                      'volume'
                    )}`}
                  >
                    {row.calls?.volume ? (row.calls.volume / 1000).toFixed(1) + 'k' : '-'}
                  </td>

                  {/* CALL Цена */}
                  <td className="px-3 py-2 text-center text-blue-600 dark:text-blue-400 font-semibold">
                    {row.calls?.premium ? `$${row.calls.premium.toFixed(2)}` : '-'}
                  </td>

                  {/* PUT Цена */}
                  <td className="px-3 py-2 text-center text-red-600 dark:text-red-400 font-semibold">
                    {row.puts?.premium ? `$${row.puts.premium.toFixed(2)}` : '-'}
                  </td>

                  {/* PUT Volume */}
                  <td
                    className={`px-3 py-2 text-center font-semibold ${getHeatmapColor(
                      row.puts?.volume,
                      maxVolume,
                      'volume'
                    )}`}
                  >
                    {row.puts?.volume ? (row.puts.volume / 1000).toFixed(1) + 'k' : '-'}
                  </td>

                  {/* PUT OI */}
                  <td
                    className={`px-3 py-2 text-center font-semibold ${getHeatmapColor(
                      row.puts?.oi,
                      maxOI,
                      'oi'
                    )}`}
                  >
                    {row.puts?.oi ? (row.puts.oi / 1000).toFixed(1) + 'k' : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Легенда */}
        <div className="mt-6 pt-4 border-t border-border">
          <div className="text-sm text-muted-foreground mb-3">Легенда:</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="font-semibold mb-2">Open Interest:</div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-4 h-4 bg-blue-200 dark:bg-blue-900 rounded"></div>
                <span>Низкий</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-4 h-4 bg-yellow-200 dark:bg-yellow-900 rounded"></div>
                <span>Средний</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-200 dark:bg-red-900 rounded"></div>
                <span>Высокий</span>
              </div>
            </div>
            <div>
              <div className="font-semibold mb-2">Volume:</div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-4 h-4 bg-cyan-200 dark:bg-cyan-900 rounded"></div>
                <span>Низкий</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-4 h-4 bg-green-200 dark:bg-green-900 rounded"></div>
                <span>Средний</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-orange-200 dark:bg-orange-900 rounded"></div>
                <span>Высокий</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default HeatmapTable;
