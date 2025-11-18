import React, { useState, useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, LineSeries, createSeriesMarkers, createTextWatermark } from 'lightweight-charts';
import { RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';

const TestChart = () => {
  const [ticker, setTicker] = useState('AAPL');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cachingEnabled, setCachingEnabled] = useState(true);
  
  // Состояния для чекбоксов отображения
  const [showEntries, setShowEntries] = useState(true);
  const [showAverage, setShowAverage] = useState(true);
  const [showStopLoss, setShowStopLoss] = useState(true);
  const [showExits, setShowExits] = useState(true);
  const [showOptions, setShowOptions] = useState(true);
  
  // Параметры позиций
  const [entry1, setEntry1] = useState('');
  const [entry2, setEntry2] = useState('');
  const [averageEntry, setAverageEntry] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [exit1, setExit1] = useState('');
  const [exit2, setExit2] = useState('');
  
  // Price lines для графика
  const entry1LineRef = useRef(null);
  const entry2LineRef = useRef(null);
  const candlestickSeriesRef = useRef(null);
  const entry1LineSeriesRef = useRef(null);
  const entry2LineSeriesRef = useRef(null);
  const averagePriceLineRef = useRef(null);
  const stopLossLineRef = useRef(null);
  const exit1LineRef = useRef(null);
  const exit2LineRef = useRef(null);
  const buyPutLineRef = useRef(null);
  const sellCallLineRef = useRef(null);
  const markersPluginRef = useRef(null);
  
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);

  const API_KEY = 'd76003a3e9d846b2b98d464922a21c76'; // Замените на ваш API ключ Twelve Data

  // Функции для работы с кэшем
  const getCacheKey = (symbol) => `chart_data_${symbol}`;
  const CACHE_DURATION = 60 * 60 * 1000; // 1 час в миллисекундах

  const getCachedData = (symbol) => {
    if (!cachingEnabled) return null;

    try {
      const cacheKey = getCacheKey(symbol);
      const cached = localStorage.getItem(cacheKey);

      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();

        // Проверяем, не истек ли срок действия кэша
        if (now - parsed.timestamp < CACHE_DURATION) {
          return parsed.data;
        } else {
          // Удаляем просроченный кэш
          localStorage.removeItem(cacheKey);
        }
      }
    } catch (error) {
      console.warn('Ошибка при чтении кэша:', error);
    }

    return null;
  };

  const setCachedData = (symbol, data) => {
    if (!cachingEnabled) return;

    try {
      const cacheKey = getCacheKey(symbol);
      const cacheData = {
        data,
        timestamp: Date.now()
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Ошибка при сохранении в кэш:', error);
    }
  };

  // Функции для сохранения/загрузки состояния страницы
  const savePageState = () => {
    const state = {
      ticker,
      entry1,
      entry2,
      stopLoss,
      exit1,
      exit2,
      cachingEnabled,
      showEntries,
      showAverage,
      showStopLoss,
      showExits,
      showOptions,
    };
    localStorage.setItem('testChartState', JSON.stringify(state));
  };

  const loadPageState = () => {
    try {
      const saved = localStorage.getItem('testChartState');
      if (saved) {
        const state = JSON.parse(saved);
        setTicker(state.ticker || 'AAPL');
        setEntry1(state.entry1 || '');
        setEntry2(state.entry2 || '');
        setStopLoss(state.stopLoss || '');
        setExit1(state.exit1 || '');
        setExit2(state.exit2 || '');
        setCachingEnabled(state.cachingEnabled !== undefined ? state.cachingEnabled : true);
        setShowEntries(state.showEntries !== undefined ? state.showEntries : true);
        setShowAverage(state.showAverage !== undefined ? state.showAverage : true);
        setShowStopLoss(state.showStopLoss !== undefined ? state.showStopLoss : true);
        setShowExits(state.showExits !== undefined ? state.showExits : true);
        setShowOptions(state.showOptions !== undefined ? state.showOptions : true);
      }
    } catch (error) {
      console.warn('Ошибка при загрузке состояния:', error);
    }
  };

  const resetPageState = () => {
    setTicker('AAPL');
    setEntry1('');
    setEntry2('');
    setAverageEntry('');
    setStopLoss('');
    setExit1('');
    setExit2('');
    setCachingEnabled(true);
    setShowEntries(true);
    setShowAverage(true);
    setShowStopLoss(true);
    setShowExits(true);
    setShowOptions(true);
    localStorage.removeItem('testChartState');
  };

  // Расчет средней цены входа
  const calculateAverageEntry = (e1, e2) => {
    const entry1Val = parseFloat(e1) || 0;
    const entry2Val = parseFloat(e2) || 0;
    
    if (entry1Val && entry2Val) {
      return ((entry1Val + entry2Val) / 2).toFixed(2);
    } else if (entry1Val) {
      return entry1Val.toFixed(2);
    } else if (entry2Val) {
      return entry2Val.toFixed(2);
    }
    return '';
  };

  // Обработчики изменения входов
  const handleEntry1Change = (value) => {
    setEntry1(value);
    setAverageEntry(calculateAverageEntry(value, entry2));
    savePageState();
  };

  const handleEntry2Change = (value) => {
    setEntry2(value);
    setAverageEntry(calculateAverageEntry(entry1, value));
    savePageState();
  };

  // Обработчик изменения тикера
  const handleTickerChange = (value) => {
    setTicker(value.toUpperCase());
    savePageState();
  };

  // Обработчик изменения кэширования
  const handleCachingChange = (enabled) => {
    setCachingEnabled(enabled);
    savePageState();
  };

  // Обработчики для чекбоксов отображения
  const handleShowEntriesChange = (checked) => {
    setShowEntries(checked);
    savePageState();
  };

  const handleShowAverageChange = (checked) => {
    setShowAverage(checked);
    savePageState();
  };

  const handleShowStopLossChange = (checked) => {
    setShowStopLoss(checked);
    savePageState();
  };

  const handleShowExitsChange = (checked) => {
    setShowExits(checked);
    savePageState();
  };

  const handleShowOptionsChange = (checked) => {
    setShowOptions(checked);
    savePageState();
  };

  // Функции для управления маркерами
  const addEntryMarker = (price) => {
    if (!chartRef.current || !candlestickSeriesRef.current || !data.length) return;

    // Создаем или получаем markers plugin
    if (!markersPluginRef.current) {
      markersPluginRef.current = createSeriesMarkers(candlestickSeriesRef.current, []);
    }

    // Маркер входа - 6 ноября (стрелочка вверх)
    const currentYear = new Date().getFullYear();
    const entryDate = new Date(currentYear, 10, 6); // Ноябрь - месяц 10 (0-индексированный)
    const entryTime = Math.floor(entryDate.getTime() / 1000);

    // Маркер выхода - 27 октября (стрелочка вниз, синий)
    const exitDate = new Date(currentYear, 9, 27); // Октябрь - месяц 9 (0-индексированный)
    const exitTime = Math.floor(exitDate.getTime() / 1000);

    // Проверим, есть ли данные за эти даты
    const dataTimes = data.map(d => d.time);

    // Найдем ближайшую дату к маркеру входа
    const closestEntryTime = dataTimes.reduce((prev, curr) =>
      Math.abs(curr - entryTime) < Math.abs(prev - entryTime) ? curr : prev
    );

    // Найдем ближайшую дату к маркеру выхода
    const closestExitTime = dataTimes.reduce((prev, curr) =>
      Math.abs(curr - exitTime) < Math.abs(prev - exitTime) ? curr : prev
    );

    // Создаем маркеры
    const markers = [
      {
        time: closestEntryTime, // Маркер входа
        position: 'aboveBar',
        color: '#06b6d4', // Бирюзовый цвет
        shape: 'arrowUp', // Стрелочка вверх для входа (покупки)
        text: 'ВХОД',
        size: 1, // Уменьшен с 2 до 1
      },
      {
        time: closestExitTime, // Маркер выхода
        position: 'belowBar',
        color: '#3b82f6', // Синий цвет
        shape: 'arrowDown', // Стрелочка вниз для выхода
        text: 'ВЫХОД',
        size: 1, // Уменьшен с 2 до 1
      }
    ];

    // Устанавливаем маркеры
    markersPluginRef.current.setMarkers(markers);
  };

  // Функции для управления линиями входа
  const updatePriceLines = () => {
    if (!chartRef.current) return;

    // Удаляем существующие линии
    if (entry1LineSeriesRef.current) {
      chartRef.current.removeSeries(entry1LineSeriesRef.current);
      entry1LineSeriesRef.current = null;
    }
    if (entry2LineSeriesRef.current) {
      chartRef.current.removeSeries(entry2LineSeriesRef.current);
      entry2LineSeriesRef.current = null;
    }
    if (averagePriceLineRef.current) {
      chartRef.current.removeSeries(averagePriceLineRef.current);
      averagePriceLineRef.current = null;
    }
    if (stopLossLineRef.current) {
      chartRef.current.removeSeries(stopLossLineRef.current);
      stopLossLineRef.current = null;
    }
    if (exit1LineRef.current) {
      chartRef.current.removeSeries(exit1LineRef.current);
      exit1LineRef.current = null;
    }
    if (exit2LineRef.current) {
      chartRef.current.removeSeries(exit2LineRef.current);
      exit2LineRef.current = null;
    }
    if (buyPutLineRef.current) {
      chartRef.current.removeSeries(buyPutLineRef.current);
      buyPutLineRef.current = null;
    }
    if (sellCallLineRef.current) {
      chartRef.current.removeSeries(sellCallLineRef.current);
      sellCallLineRef.current = null;
    }

    // Получаем текущее время и время окончания данных
    const now = Math.floor(Date.now() / 1000);
    let endTime = now + (30 * 24 * 60 * 60); // По умолчанию 30 дней
    
    // Если есть данные, используем время последней свечи + запас
    if (data.length > 0) {
      const lastDataTime = data[data.length - 1].time;
      endTime = Math.max(endTime, lastDataTime + (7 * 24 * 60 * 60)); // +7 дней запаса
    }

    // Определяем даты начала для разных типов линий
    const currentYear = new Date().getFullYear();
    const entryStartDate = new Date(currentYear, 9, 8); // 8 октября (октябрь - 9)
    const exitStartDate = new Date(currentYear, 9, 23); // 23 октября (октябрь - 9)
    const optionsStartDate = new Date(currentYear, 10, 3); // 3 ноября (ноябрь - 10)

    const entryStartTime = Math.floor(entryStartDate.getTime() / 1000);
    const exitStartTime = Math.floor(exitStartDate.getTime() / 1000);
    const optionsStartTime = Math.floor(optionsStartDate.getTime() / 1000);

    // Добавляем линию для Entry 1 (Бирюзовый)
    if (entry1 && parseFloat(entry1) > 0 && showEntries) {
      entry1LineSeriesRef.current = chartRef.current.addSeries(LineSeries, {
        color: '#06b6d4', // Бирюзовый
        lineWidth: 2,
        lineStyle: 0, // Solid
        overlay: true,
        title: 'Вход 1',
      });

      const lineData1 = [
        { time: entryStartTime, value: parseFloat(entry1) },
        { time: endTime, value: parseFloat(entry1) }
      ];
      entry1LineSeriesRef.current.setData(lineData1);
    }

    // Добавляем линию для Entry 2 (Бирюзовый)
    if (entry2 && parseFloat(entry2) > 0 && showEntries) {
      entry2LineSeriesRef.current = chartRef.current.addSeries(LineSeries, {
        color: '#06b6d4', // Бирюзовый
        lineWidth: 2,
        lineStyle: 0, // Solid
        overlay: true,
        title: 'Вход 2',
      });

      const lineData2 = [
        { time: entryStartTime, value: parseFloat(entry2) },
        { time: endTime, value: parseFloat(entry2) }
      ];
      entry2LineSeriesRef.current.setData(lineData2);
    }

    // Добавляем линию для Средней цены (Темно зеленый)
    if (averageEntry && parseFloat(averageEntry) > 0 && showAverage) {
      averagePriceLineRef.current = chartRef.current.addSeries(LineSeries, {
        color: '#166534', // Темно зеленый
        lineWidth: 3,
        lineStyle: 0, // Solid
        overlay: true,
        title: 'Средняя цена',
      });

      const avgLineData = [
        { time: entryStartTime, value: parseFloat(averageEntry) },
        { time: endTime, value: parseFloat(averageEntry) }
      ];
      averagePriceLineRef.current.setData(avgLineData);
    }

    // Добавляем линию для Stop-Loss (Красный)
    if (stopLoss && parseFloat(stopLoss) > 0 && showStopLoss) {
      stopLossLineRef.current = chartRef.current.addSeries(LineSeries, {
        color: '#dc2626', // Красный
        lineWidth: 2,
        lineStyle: 0, // Solid
        overlay: true,
        title: 'Stop-Loss',
      });

      const slLineData = [
        { time: entryStartTime, value: parseFloat(stopLoss) },
        { time: endTime, value: parseFloat(stopLoss) }
      ];
      stopLossLineRef.current.setData(slLineData);
    }

    // Добавляем линию для Выход 1 (Светло синий)
    if (exit1 && parseFloat(exit1) > 0 && showExits) {
      exit1LineRef.current = chartRef.current.addSeries(LineSeries, {
        color: '#3b82f6', // Светло синий
        lineWidth: 2,
        lineStyle: 0, // Solid
        overlay: true,
        title: 'Выход 1',
      });

      const exit1LineData = [
        { time: exitStartTime, value: parseFloat(exit1) },
        { time: endTime, value: parseFloat(exit1) }
      ];
      exit1LineRef.current.setData(exit1LineData);
    }

    // Добавляем линию для Выход 2 (Светло синий)
    if (exit2 && parseFloat(exit2) > 0 && showExits) {
      exit2LineRef.current = chartRef.current.addSeries(LineSeries, {
        color: '#3b82f6', // Светло синий
        lineWidth: 2,
        lineStyle: 0, // Solid
        overlay: true,
        title: 'Выход 2',
      });

      const exit2LineData = [
        { time: exitStartTime, value: parseFloat(exit2) },
        { time: endTime, value: parseFloat(exit2) }
      ];
      exit2LineRef.current.setData(exit2LineData);
    }

    // Добавляем линию BuyPUT (салатовый, пунктир, двойная толщина)
    if (showOptions) {
      buyPutLineRef.current = chartRef.current.addSeries(LineSeries, {
        color: '#32CD32', // Салатовый цвет (limegreen)
        lineWidth: 4, // Двойная толщина
        lineStyle: 1, // Пунктир (dashed)
        overlay: true,
        title: 'BuyPUT',
      });

      const buyPutLineData = [
        { time: optionsStartTime, value: 205 },
        { time: endTime, value: 205 }
      ];
      buyPutLineRef.current.setData(buyPutLineData);

      // Добавляем линию SellCALL (розовый, пунктир, двойная толщина)
      sellCallLineRef.current = chartRef.current.addSeries(LineSeries, {
        color: '#FF1493', // Розовый цвет (deeppink)
        lineWidth: 4, // Двойная толщина
        lineStyle: 1, // Пунктир (dashed)
        overlay: true,
        title: 'SellCALL',
      });

      const sellCallLineData = [
        { time: optionsStartTime, value: 325 },
        { time: endTime, value: 325 }
      ];
      sellCallLineRef.current.setData(sellCallLineData);
    }
  };

  const fetchData = async (symbol) => {
    if (!symbol.trim()) return;

    // Сначала проверяем кэш
    const cachedData = getCachedData(symbol);
    if (cachedData) {
      setData(cachedData);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=100&apikey=${API_KEY}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.status === 'error') {
        throw new Error(result.message || 'API Error');
      }

      // Преобразование данных для Lightweight Charts
      const chartData = result.values?.map(item => ({
        time: Math.floor(new Date(item.datetime).getTime() / 1000), // Unix timestamp
        open: parseFloat(item.open),
        high: parseFloat(item.high),
        low: parseFloat(item.low),
        close: parseFloat(item.close),
      })).reverse() || []; // Reverse to chronological order

      setData(chartData);
      // Сохраняем в кэш
      setCachedData(symbol, chartData);
    } catch (err) {
      setError(err.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const createChartInstance = () => {
    if (!chartContainerRef.current || data.length === 0) return;

    // Удаляем предыдущий график
    if (chartRef.current) {
      chartRef.current.remove();
    }

    // Создаем новый график
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
    });

    // Добавляем свечную серию
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    candlestickSeries.setData(data);

    // Сохраняем ссылку на серию
    candlestickSeriesRef.current = candlestickSeries;

    // Автомасштабирование
    chart.timeScale().fitContent();

    chartRef.current = chart;

    // Добавляем водяной знак
    createTextWatermark(chart.panes()[0], {
      horzAlign: 'center',
      vertAlign: 'center',
      lines: [
        {
          text: 'SYNDICAT',
          color: 'rgba(0, 0, 0, 0.1)',
          fontSize: 48,
        },
      ],
    });

    // Добавляем price lines после создания графика
    updatePriceLines();

    // Добавляем маркер входа на цене 265 и дате 6 ноября
    addEntryMarker(265);

    // Обработка изменения размера
    const handleResize = () => {
      chart.applyOptions({ width: chartContainerRef.current.clientWidth });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        // Очищаем line series перед удалением графика
        if (entry1LineSeriesRef.current) {
          chartRef.current.removeSeries(entry1LineSeriesRef.current);
          entry1LineSeriesRef.current = null;
        }
        if (entry2LineSeriesRef.current) {
          chartRef.current.removeSeries(entry2LineSeriesRef.current);
          entry2LineSeriesRef.current = null;
        }
        if (averagePriceLineRef.current) {
          chartRef.current.removeSeries(averagePriceLineRef.current);
          averagePriceLineRef.current = null;
        }
        if (stopLossLineRef.current) {
          chartRef.current.removeSeries(stopLossLineRef.current);
          stopLossLineRef.current = null;
        }
        if (exit1LineRef.current) {
          chartRef.current.removeSeries(exit1LineRef.current);
          exit1LineRef.current = null;
        }
        if (exit2LineRef.current) {
          chartRef.current.removeSeries(exit2LineRef.current);
          exit2LineRef.current = null;
        }
        if (buyPutLineRef.current) {
          chartRef.current.removeSeries(buyPutLineRef.current);
          buyPutLineRef.current = null;
        }
        if (sellCallLineRef.current) {
          chartRef.current.removeSeries(sellCallLineRef.current);
          sellCallLineRef.current = null;
        }
        candlestickSeriesRef.current = null;
        markersPluginRef.current = null; // Очищаем markers plugin
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  };

  useEffect(() => {
    loadPageState();
    fetchData(ticker);
  }, []); // Загружаем состояние и данные по умолчанию для AAPL

  useEffect(() => {
    const cleanup = createChartInstance();
    return cleanup;
  }, [data]);

  // Обновляем price lines при изменении любых параметров позиций
  useEffect(() => {
    updatePriceLines();
  }, [entry1, entry2, averageEntry, stopLoss, exit1, exit2]);

  // Обновляем price lines при изменении состояний чекбоксов
  useEffect(() => {
    updatePriceLines();
  }, [showEntries, showAverage, showStopLoss, showExits, showOptions]);

  const handleTickerSubmit = (newTicker) => {
    setTicker(newTicker);
    fetchData(newTicker);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-4">
        <div className="flex items-end justify-between">
          <Input
            id="ticker"
            type="text"
            value={ticker}
            onChange={(e) => handleTickerChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleTickerSubmit(ticker);
              }
            }}
            placeholder="Тикер (например, AAPL)"
            className={`w-[110px] ${ticker.trim() === '' ? 'animate-border-blink-cyan' : ''}`}
          />

          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="caching"
                checked={cachingEnabled}
                onCheckedChange={handleCachingChange}
              />
              <Label htmlFor="caching" className="font-normal">Кэширование данных (1 час)</Label>
            </div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="h-8 w-8 p-0 bg-orange-500 hover:bg-orange-600 text-white"
                    onClick={() => {
                      if (window.confirm('Вы уверены? Все настройки будут сброшены.')) {
                        resetPageState();
                      }
                    }}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Сбросить все настройки</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Параметры позиций */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="entry1">Вход 1</Label>
            <Input
              id="entry1"
              type="number"
              step="0.01"
              value={entry1}
              onChange={(e) => handleEntry1Change(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div>
            <Label htmlFor="entry2">Вход 2</Label>
            <Input
              id="entry2"
              type="number"
              step="0.01"
              value={entry2}
              onChange={(e) => handleEntry2Change(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div>
            <Label htmlFor="averageEntry">Средняя цена входа</Label>
            <Input
              id="averageEntry"
              type="number"
              step="0.01"
              value={averageEntry}
              readOnly
              className="bg-gray-50"
              placeholder="Авторасчет"
            />
          </div>

          <div>
            <Label htmlFor="stopLoss">Stop-Loss</Label>
            <Input
              id="stopLoss"
              type="number"
              step="0.01"
              value={stopLoss}
              onChange={(e) => {
                setStopLoss(e.target.value);
                savePageState();
              }}
              placeholder="0.00"
            />
          </div>

          <div>
            <Label htmlFor="exit1">Выход 1</Label>
            <Input
              id="exit1"
              type="number"
              step="0.01"
              value={exit1}
              onChange={(e) => {
                setExit1(e.target.value);
                savePageState();
              }}
              placeholder="0.00"
            />
          </div>

          <div>
            <Label htmlFor="exit2">Выход 2</Label>
            <Input
              id="exit2"
              type="number"
              step="0.01"
              value={exit2}
              onChange={(e) => {
                setExit2(e.target.value);
                savePageState();
              }}
              placeholder="0.00"
            />
          </div>
        </div>
      </div>

      {/* Чекбоксы для управления отображением */}
      <div className="bg-gray-50 p-3 rounded-lg border">
        <div className="flex items-center">
          <span className="text-sm font-medium text-gray-700 mr-4">Отображать на графике:</span>
          <div className="flex space-x-4">
            <label className="flex items-center space-x-1">
              <input
                type="checkbox"
                checked={showEntries}
                onChange={(e) => handleShowEntriesChange(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm">Входы</span>
            </label>

            <label className="flex items-center space-x-1">
              <input
                type="checkbox"
                checked={showAverage}
                onChange={(e) => handleShowAverageChange(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm">Среднюю цену</span>
            </label>

            <label className="flex items-center space-x-1">
              <input
                type="checkbox"
                checked={showStopLoss}
                onChange={(e) => handleShowStopLossChange(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm">Stop-Loss</span>
            </label>

            <label className="flex items-center space-x-1">
              <input
                type="checkbox"
                checked={showExits}
                onChange={(e) => handleShowExitsChange(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm">Выходы</span>
            </label>

            <label className="flex items-center space-x-1">
              <input
                type="checkbox"
                checked={showOptions}
                onChange={(e) => handleShowOptionsChange(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm">Опционы</span>
            </label>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{ticker}</CardTitle>
        </CardHeader>
        <CardContent className="pb-6">
          {error && (
            <div className="text-red-500 mb-4">
              Ошибка: {error}
            </div>
          )}
          <div
            ref={chartContainerRef}
            className="w-full h-96 border rounded-lg"
            style={{ minHeight: '600px', paddingBottom: '1.5rem' }}
          >
            {loading && (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">Загрузка данных...</p>
              </div>
            )}
            {!loading && data.length === 0 && !error && (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">Здесь будет график для тикера: {ticker}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TestChart;
