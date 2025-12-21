import { useState, useEffect } from 'react';

/**
 * Хук для получения исторических данных акций
 * @param {string} symbol - Тикер актива (например, 'AAPL')
 * @param {string} interval - Интервал ('1d', '1wk', '1mo')
 * @param {number} rangeDays - Количество дней для загрузки
 * @returns {Object} { data, loading, error }
 */
export function useStockData(symbol, interval = '1d', rangeDays = 30) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!symbol) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/yahoo-proxy?symbol=${symbol}&interval=${interval}&range_days=${rangeDays}`
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const yahooData = await response.json();

        // Преобразуем данные Yahoo Finance в формат Chart.js
        const chartData = transformYahooData(yahooData);
        setData(chartData);
      } catch (err) {
        console.error('Error fetching stock data:', err);
        setError(err.message);
        // При ошибке возвращаем демо-данные
        setData(getDemoData());
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [symbol, interval, rangeDays]);

  return { data, loading, error };
}

/**
 * Преобразует данные Yahoo Finance в формат Chart.js candlestick
 */
function transformYahooData(yahooData) {
  try {
    const chart = yahooData.chart;
    if (!chart || !chart.result || !chart.result[0]) {
      throw new Error('Invalid Yahoo data structure');
    }

    const result = chart.result[0];
    const timestamps = result.timestamp;
    const quotes = result.indicators.quote[0];

    if (!timestamps || !quotes) {
      throw new Error('Missing timestamp or quote data');
    }

    const data = timestamps.map((timestamp, index) => {
      const date = new Date(timestamp * 1000);
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

      return {
        x: dateStr,
        o: quotes.open?.[index] || 0,
        h: quotes.high?.[index] || 0,
        l: quotes.low?.[index] || 0,
        c: quotes.close?.[index] || 0,
      };
    }).filter(item => item.o > 0 && item.h > 0 && item.l > 0 && item.c > 0);

    return data;
  } catch (err) {
    console.error('Error transforming Yahoo data:', err);
    return getDemoData();
  }
}

/**
 * Возвращает демо-данные при ошибке загрузки
 */
function getDemoData() {
  return [
    { x: '2025-10-20', o: 150, h: 155, l: 148, c: 152 },
    { x: '2025-10-21', o: 152, h: 158, l: 150, c: 156 },
    { x: '2025-10-22', o: 156, h: 160, l: 154, c: 158 },
    { x: '2025-10-23', o: 158, h: 162, l: 155, c: 159 },
    { x: '2025-10-24', o: 159, h: 165, l: 157, c: 163 },
    { x: '2025-10-25', o: 163, h: 168, l: 160, c: 166 },
    { x: '2025-10-26', o: 166, h: 170, l: 164, c: 168 },
    { x: '2025-10-27', o: 168, h: 172, l: 165, c: 169 },
    { x: '2025-10-28', o: 169, h: 175, l: 167, c: 173 },
    { x: '2025-10-29', o: 173, h: 178, l: 170, c: 176 },
    { x: '2025-10-30', o: 176, h: 180, l: 174, c: 178 },
  ];
}
