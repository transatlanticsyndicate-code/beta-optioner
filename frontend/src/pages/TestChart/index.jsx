/**
 * TestChart - интерактивный график с управлением позициями
 * ЗАЧЕМ: Визуализация торговых позиций на графике цены
 * Затрагивает: графики, кэширование, управление состоянием
 */

import React, { useRef, useEffect } from 'react';
import { createChart } from 'lightweight-charts';
import { ChartControls, DisplayToggles } from './components';
import { useChartState } from './hooks/useChartState';
import { getCachedData, setCachedData } from './utils/cacheManager';
import { resetPageState } from './utils/stateStorage';
import { API_KEY, DEFAULT_TICKER } from './config/chartConfig';

const TestChart = () => {
  const {
    ticker, setTicker,
    data, setData,
    loading, setLoading,
    error, setError,
    cachingEnabled, setCachingEnabled,
    showEntries, setShowEntries,
    showAverage, setShowAverage,
    showStopLoss, setShowStopLoss,
    showExits, setShowExits,
    showOptions, setShowOptions,
    entry1, handleEntry1Change,
    entry2, handleEntry2Change,
    averageEntry,
    stopLoss, setStopLoss,
    exit1, setExit1,
    exit2, setExit2,
    savePageState
  } = useChartState();

  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);

  const fetchData = async (symbol) => {
    if (!symbol.trim()) return;

    const cached = getCachedData(symbol, cachingEnabled);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=100&apikey=${API_KEY}`
      );
      const result = await response.json();

      if (result.status === 'error') {
        throw new Error(result.message);
      }

      const chartData = result.values.reverse().map(item => ({
        time: Math.floor(new Date(item.datetime).getTime() / 1000),
        open: parseFloat(item.open),
        high: parseFloat(item.high),
        low: parseFloat(item.low),
        close: parseFloat(item.close)
      }));

      setData(chartData);
      setCachedData(symbol, chartData, cachingEnabled);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createChartInstance = () => {
    if (!chartContainerRef.current || data.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 600,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333'
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' }
      }
    });

    const candlestickSeries = chart.addCandlestickSeries();
    candlestickSeries.setData(data);

    chartRef.current = chart;
  };

  const handleReset = () => {
    setTicker(DEFAULT_TICKER);
    handleEntry1Change('');
    handleEntry2Change('');
    setStopLoss('');
    setExit1('');
    setExit2('');
    setCachingEnabled(true);
    setShowEntries(true);
    setShowAverage(true);
    setShowStopLoss(true);
    setShowExits(true);
    setShowOptions(true);
    resetPageState();
  };

  useEffect(() => {
    fetchData(ticker);
  }, []);

  useEffect(() => {
    createChartInstance();
  }, [data]);

  return (
    <div className="container mx-auto p-4 space-y-4">
      <h1 className="text-3xl font-bold">Тестовый График</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-4">
          <ChartControls
            ticker={ticker}
            onTickerChange={setTicker}
            onTickerSubmit={fetchData}
            entry1={entry1}
            onEntry1Change={handleEntry1Change}
            entry2={entry2}
            onEntry2Change={handleEntry2Change}
            averageEntry={averageEntry}
            stopLoss={stopLoss}
            onStopLossChange={setStopLoss}
            exit1={exit1}
            onExit1Change={setExit1}
            exit2={exit2}
            onExit2Change={setExit2}
            onReset={handleReset}
            loading={loading}
          />
          
          <DisplayToggles
            cachingEnabled={cachingEnabled}
            onCachingChange={setCachingEnabled}
            showEntries={showEntries}
            onShowEntriesChange={setShowEntries}
            showAverage={showAverage}
            onShowAverageChange={setShowAverage}
            showStopLoss={showStopLoss}
            onShowStopLossChange={setShowStopLoss}
            showExits={showExits}
            onShowExitsChange={setShowExits}
            showOptions={showOptions}
            onShowOptionsChange={setShowOptions}
          />
        </div>

        <div className="lg:col-span-2">
          <div ref={chartContainerRef} />
          {error && (
            <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
              Ошибка: {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TestChart;
