import React, { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { Button } from './ui/button';

/**
 * AdvancedChart - Продвинутый график TradingView с загрузкой реальных данных
 */
function AdvancedChart({ ticker, currentPrice = 0 }) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const [period, setPeriod] = useState('1M'); // 1D, 1W, 1M, 3M, 1Y
  const [isLoading, setIsLoading] = useState(false);

  // Функция загрузки реальных данных с Polygon API
  const fetchHistoricalData = async (tickerSymbol, timeframe) => {
    try {
      setIsLoading(true);
      
      // Определяем количество дней в зависимости от периода
      let daysBack = 30;
      let multiplier = 1;
      let timeUnit = 'day';
      
      switch(timeframe) {
        case '1D':
          daysBack = 1;
          break;
        case '1W':
          daysBack = 7;
          break;
        case '1M':
          daysBack = 30;
          break;
        case '3M':
          daysBack = 90;
          break;
        case '1Y':
          daysBack = 365;
          break;
        default:
          daysBack = 30;
      }

      // Вычисляем даты
      const toDate = new Date();
      const fromDate = new Date(toDate);
      fromDate.setDate(fromDate.getDate() - daysBack);

      const formatDate = (date) => date.toISOString().split('T')[0];
      
      // Загружаем данные с API
      const response = await fetch(
        `/api/polygon/ticker/${tickerSymbol}/bars?from=${formatDate(fromDate)}&to=${formatDate(toDate)}`
      );

      if (!response.ok) {
        console.warn(`Failed to fetch data for ${tickerSymbol}, using demo data`);
        return null;
      }

      const data = await response.json();
      
      if (data.status === 'success' && data.bars && data.bars.length > 0) {
        // Преобразуем данные в формат для Lightweight Charts
        return data.bars.map(bar => ({
          time: Math.floor(new Date(bar.timestamp).getTime() / 1000),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        })).sort((a, b) => a.time - b.time);
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching historical data:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Функция генерации демо-данных (fallback)
  const generateDemoData = (basePrice, daysCount) => {
    const data = [];
    const now = new Date();
    let price = basePrice;

    for (let i = daysCount - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);

      const change = (Math.random() - 0.5) * basePrice * 0.02;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.abs(change) * 0.5;
      const low = Math.min(open, close) - Math.abs(change) * 0.5;

      data.push({
        time: Math.floor(date.getTime() / 1000),
        open,
        high,
        low,
        close,
      });

      price = close;
    }

    return data;
  };

  useEffect(() => {
    if (!chartContainerRef.current || !ticker) return;

    const initChart = async () => {
      // Создаем график
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { color: '#ffffff' },
          textColor: '#191919',
        },
        grid: {
          vertLines: { color: '#e1e1e1' },
          horzLines: { color: '#e1e1e1' },
        },
        width: chartContainerRef.current.clientWidth,
        height: 600,
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: {
          borderColor: '#cccccc',
        },
        crosshair: {
          mode: 1,
        },
      });

      chartRef.current = chart;

      // Добавляем candlestick series
      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });

      // Загружаем реальные данные
      let chartData = await fetchHistoricalData(ticker, period);
      
      // Если реальные данные не загружены, используем демо
      if (!chartData) {
        let daysCount = 30;
        switch(period) {
          case '1D': daysCount = 1; break;
          case '1W': daysCount = 7; break;
          case '1M': daysCount = 30; break;
          case '3M': daysCount = 90; break;
          case '1Y': daysCount = 365; break;
        }
        chartData = generateDemoData(currentPrice, daysCount);
      }

      candlestickSeries.setData(chartData);

      // Добавляем линию текущей цены
      if (currentPrice > 0) {
        const priceLine = {
          price: currentPrice,
          color: '#2196F3',
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: `Current: $${currentPrice.toFixed(2)}`,
        };
        candlestickSeries.createPriceLine(priceLine);
      }

      // Автомасштабирование
      chart.timeScale().fitContent();

      // Обработчик изменения размера
      const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
          });
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }
      };
    };

    initChart();
  }, [ticker, currentPrice, period]);

  if (!ticker) {
    return (
      <div className="h-[600px] flex items-center justify-center border-2 border-dashed border-border rounded-lg">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">График недоступен</p>
          <p className="text-sm text-muted-foreground/70">Выберите тикер для отображения</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Кнопки выбора периода */}
      <div className="flex gap-2 mb-4">
        {['1D', '1W', '1M', '3M', '1Y'].map((p) => (
          <Button
            key={p}
            variant={period === p ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod(p)}
            disabled={isLoading}
            className="min-w-[60px]"
          >
            {p}
          </Button>
        ))}
      </div>

      {/* График */}
      <div
        ref={chartContainerRef}
        className="w-full h-[600px] border rounded-lg"
        style={{ width: '100%', height: '600px' }}
      />
      
      {isLoading && (
        <div className="mt-2 text-sm text-muted-foreground">
          Загрузка данных...
        </div>
      )}
    </div>
  );
}

export default AdvancedChart;
