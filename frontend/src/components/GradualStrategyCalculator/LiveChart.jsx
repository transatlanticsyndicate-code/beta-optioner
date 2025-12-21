import React, { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { Card, CardContent } from '../ui/card';

/**
 * LiveChart - График с использованием TradingView Lightweight Charts
 * Загружает данные из публичных источников (Yahoo Finance)
 */
const LiveChart = ({ ticker }) => {
  // Если тикер не выбран, используем дефолтный SPY
  const actualTicker = ticker && ticker.trim() !== '' ? ticker : 'SPY';
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Инициализация графика
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Создаем график
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 500,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#e0e0e0',
      },
      rightPriceScale: {
        borderColor: '#e0e0e0',
      },
      crosshair: {
        mode: 1,
      },
    });

    // Создаем серию свечей (v5)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderUpColor: '#10B981',
      borderDownColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Обработка изменения размера окна
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
        candleSeriesRef.current = null;
      }
    };
  }, []);

  // Загрузка данных при изменении тикера
  useEffect(() => {
    console.log('📊 Загрузка данных для тикера:', ticker);
    
    if (!actualTicker) {
      console.log('⚠️ Тикер не выбран');
      return;
    }
    
    if (!candleSeriesRef.current) {
      console.log('⚠️ График еще не инициализирован');
      return;
    }

    // Генерация демо-данных (30 дней)
    const generateDemoData = (basePrice = 400, days = 30) => {
      const data = [];
      let price = basePrice;
      for (let i = days - 1; i >= 0; i--) {
        const date = Math.floor(Date.now() / 1000) - i * 24 * 60 * 60;
        const change = (Math.random() - 0.5) * basePrice * 0.02;
        const open = price;
        const close = price + change;
        const high = Math.max(open, close) + Math.abs(change) * 0.5;
        const low = Math.min(open, close) - Math.abs(change) * 0.5;
        data.push({ time: date, open, high, low, close });
        price = close;
      }
      return data;
    };

    const fetchChartData = async () => {
      console.log(`🔄 Начинаем загрузку данных для ${actualTicker}...`);
      setIsLoading(true);
      setError(null);

      try {
        // Используем Yahoo Finance API
        const period1 = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60; // 30 дней назад
        const period2 = Math.floor(Date.now() / 1000); // сейчас
        
        const url = `/api/yahoo-proxy?symbol=${actualTicker}&interval=1d&range_days=30`;
        
        console.log('📡 URL запроса:', url);
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });

        console.log('📦 Ответ получен:', response.status, response.statusText);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('📊 Данные получены:', data);
        
        if (!data.chart || !data.chart.result || !data.chart.result[0]) {
          throw new Error('Нет данных для этого тикера');
        }

        const result = data.chart.result[0];
        const timestamps = result.timestamp;
        const quotes = result.indicators.quote[0];

        console.log(`✅ Получено ${timestamps.length} свечей`);

        // Преобразуем данные в формат lightweight-charts
        let chartData = timestamps.map((timestamp, index) => ({
          time: timestamp,
          open: quotes.open[index],
          high: quotes.high[index],
          low: quotes.low[index],
          close: quotes.close[index],
        })).filter(item => 
          item.open !== null && 
          item.high !== null && 
          item.low !== null && 
          item.close !== null
        );

        // Если данных нет — fallback на демо
        if (!chartData || chartData.length === 0) {
          chartData = generateDemoData(result.meta?.regularMarketPrice || 400, 30);
        }

        console.log(`📈 После фильтрации: ${chartData.length} свечей`);
        console.log('📈 Первая свеча:', chartData[0]);
        console.log('📈 Последняя свеча:', chartData[chartData.length - 1]);

        // Устанавливаем данные
        candleSeriesRef.current.setData(chartData);
        console.log('✅ Данные установлены на график');

        // Автоматически подгоняем видимый диапазон
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
          console.log('✅ Масштаб подогнан');
        }
      } catch (err) {
        // Fallback: демо-данные при ошибке (включая AbortError)
        const demo = generateDemoData(400, 30);
        candleSeriesRef.current.setData(demo);
        setError(`Ошибка: ${err?.name === 'AbortError' ? 'Запрос отменён или прерван' : err.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchChartData();
  }, [ticker]);

  // График всегда виден, даже если тикер не выбран


  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            График {actualTicker}
          </h3>
          {isLoading && (
            <p className="text-sm text-gray-500 mt-1">Загрузка данных...</p>
          )}
          {error && (
            <p className="text-sm text-red-500 mt-1">{error}</p>
          )}
        </div>
        <div
          ref={chartContainerRef}
          className="w-full"
          style={{ height: '500px', minHeight: 400, minWidth: 300 }}
        />
      </CardContent>
    </Card>
  );
};

export default LiveChart;
