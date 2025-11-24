import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Plot from 'react-plotly.js';
import {
  calculateOptionPLValue,
  calculateOptionExpirationPLValue,
} from '../../utils/optionPricing';

/**
 * Компонент графика прибыли/убытка (P&L Chart) с использованием Plotly.js
 * Адаптирован из V1 для работы с V2
 */
function PLChart({ options = [], currentPrice = 0, positions = [], showOptionLines = true, daysRemaining = 0, showProbabilityZones = true, targetPrice = 0 }) {
  // Отслеживание темы
  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.classList.contains('dark')
  );
  
  // Отслеживание видимого диапазона для динамического пересчета данных
  const [xAxisRange, setXAxisRange] = useState(null);

  // Слушаем изменения темы
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setIsDarkMode(document.documentElement.classList.contains('dark'));
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  // Функция расчета P&L для позиции базового актива
  const calculateUnderlyingPL = useCallback((price, position) => {
    if (!position || !position.type) return 0;
    
    const { type, quantity, price: entryPrice } = position;
    const entryPriceNum = Number(entryPrice) || 0;
    // quantity уже содержит количество в штуках (не в контрактах)
    // Опционы используют quantity * 100 потому что 1 контракт = 100 акций
    // Позиции базового актива - это просто акции, поэтому quantity = количество акций
    
    const qty = parseFloat(quantity) || 0;
    const entry = parseFloat(entryPrice) || 0;
    
    if (type === 'LONG') {
      return (price - entryPriceNum) * quantity;
    } else if (type === 'SHORT') {
      return (entryPriceNum - price) * quantity;
    }
    return 0;
  }, []);

  // Расчет данных для графика
  const chartData = useMemo(() => {
    if (!currentPrice || (options.length === 0 && positions.length === 0)) {
      return null;
    }

    const visibleOptions = options.filter(opt => opt.visible);
    const visiblePositions = positions.filter(pos => pos.visible !== false);
    
    // График отображается, если есть видимые опционы ИЛИ видимые позиции базового актива
    if (visibleOptions.length === 0 && visiblePositions.length === 0) {
      return null;
    }

    // Диапазон цен для графика - расширенный для поддержки zoom/pan
    // Если есть видимый диапазон (xAxisRange) - используем его
    // Иначе используем ±50% от текущей цены
    let minPrice, maxPrice;
    
    if (xAxisRange && xAxisRange[0] !== undefined && xAxisRange[1] !== undefined) {
      // При zoom/pan используем видимый диапазон
      minPrice = xAxisRange[0];
      maxPrice = xAxisRange[1];
    } else {
      // По умолчанию: ±50% от текущей цены
      const priceRange = 0.50;
      minPrice = currentPrice * (1 - priceRange);
      maxPrice = currentPrice * (1 + priceRange);
    }
    
    const chartPoints = 500; // Больше точек для гладкой кривой при zoom
    const step = (maxPrice - minPrice) / chartPoints;

    // Массив цен для оси X
    const prices = [];
    for (let price = minPrice; price <= maxPrice; price += step) {
      prices.push(price);
    }

    // Расчет P&L для каждого опциона и позиций базового актива
    const traces = [];
    const totalPLArray = new Array(prices.length).fill(0);

    // Сначала добавляем P&L от позиций базового актива
    visiblePositions.forEach((position) => {
      const positionPLArray = prices.map(price => calculateUnderlyingPL(price, position));
      
      // Добавляем к общему P&L
      positionPLArray.forEach((pl, i) => {
        totalPLArray[i] += pl;
      });
      
      // Цвет и стиль линии с прозрачностью 75%
      // Зеленая пунктирная линия для LONG позиций, красная для SHORT
      const color = position.type === 'LONG' ? 'rgba(34, 197, 94, 0.75)' : 'rgba(239, 68, 68, 0.75)';
      const positionType = position.type === 'LONG' ? 'LONG' : 'SHORT';
      const positionQty = Math.abs(parseFloat(position.quantity) || 0);
      
      // Trace для позиции базового актива (только если showOptionLines = true)
      if (showOptionLines) {
        traces.push({
          x: prices,
          y: positionPLArray,
          type: 'scatter',
          mode: 'lines',
          name: `${positionType} ${positionQty} ${position.ticker || 'SHARES'}`,
          line: {
            color: color,
            width: 4,
            dash: 'dot'
          },
          hovertemplate: `<b>${positionType} ${positionQty} ${position.ticker || 'SHARES'}</b><br>` +
                        `Entry: $${(Number(position.price) || 0).toFixed(2)}<br>` +
                        'P&L: $%{y:.2f}<br>' +
                        '<extra></extra>'
        });
      }
    });

    // Палитра цветов для опционов (разные цвета для каждого)
    const optionColors = [
      'rgba(59, 130, 246, 0.5)',    // синий
      'rgba(249, 115, 22, 0.5)',    // оранжевый
      'rgba(168, 85, 247, 0.5)',    // фиолетовый
      'rgba(34, 197, 94, 0.5)',     // зеленый
      'rgba(239, 68, 68, 0.5)',     // красный
      'rgba(14, 165, 233, 0.5)',    // голубой
      'rgba(236, 72, 153, 0.5)',    // розовый
      'rgba(251, 146, 60, 0.5)',    // оранжевый светлый
    ];

    visibleOptions.forEach((option, index) => {
      const { action, type, strike } = option;
      const plArray = prices.map((price) =>
        calculateOptionPLValue(option, price, currentPrice, daysRemaining)
      );

      plArray.forEach((pl, i) => {
        totalPLArray[i] += pl;
      });

      // Выбираем уникальный цвет для каждого опциона
      const color = optionColors[index % optionColors.length];

      // Trace для опциона (только если showOptionLines = true)
      if (showOptionLines) {
        traces.push({
          x: prices,
          y: plArray,
          type: 'scatter',
          mode: 'lines',
          name: `${action} ${type} $${strike}`,
          line: {
            color: color,
            width: 1,
            dash: 'solid'
          },
          hovertemplate: '<b>%{fullData.name}</b><br>' +
                        'P&L: $%{y:.2f}<br>' +
                        '<extra></extra>'
        });
      }
    });

    // Если daysRemaining > 0, добавляем линию для дня экспирации (0 дней) с прозрачностью 50%
    if (daysRemaining > 0) {
      const expirationPLArray = new Array(prices.length).fill(0);
      
      // Сначала добавляем P&L от позиций базового актива (они не зависят от экспирации)
      visiblePositions.forEach((position) => {
        const positionPLArray = prices.map(price => calculateUnderlyingPL(price, position));
        positionPLArray.forEach((pl, i) => {
          expirationPLArray[i] += pl;
        });
      });
      
      // Затем добавляем P&L от опционов на экспирации
      visibleOptions.forEach((option) => {
        prices.forEach((price, i) => {
          const pl = calculateOptionExpirationPLValue(option, price);
          expirationPLArray[i] += pl;
        });
      });
      
      const expirationHoverArray = expirationPLArray.map(pl => Math.abs(pl) < 0.01 ? 0 : pl);

      // Зеленая часть экспирации (прибыль) с прозрачностью 50%
      const expirationGreenY = expirationPLArray.map(pl => pl >= 0 ? pl : null);
      traces.push({
        x: prices,
        y: expirationGreenY,
        type: 'scatter',
        mode: 'lines',
        name: 'Expiration P&L (Profit)',
        line: {
          color: 'rgba(16, 185, 129, 0.5)', // зеленый с 50% прозрачностью
          width: 3,
          dash: 'dot'
        },
        showlegend: false,
        hoverinfo: 'skip'
      });
      
      // Красная часть экспирации (убыток) с прозрачностью 50%
      const expirationRedY = expirationPLArray.map(pl => pl < 0 ? pl : null);
      traces.push({
        x: prices,
        y: expirationRedY,
        type: 'scatter',
        mode: 'lines',
        name: 'Expiration P&L',
        line: {
          color: 'rgba(239, 68, 68, 0.5)', // красный с 50% прозрачностью
          width: 3,
          dash: 'dot'
        },
        showlegend: false,
        hoverinfo: 'skip'
      });

      traces.push({
        x: prices,
        y: expirationPLArray,
        type: 'scatter',
        mode: 'lines',
        name: 'Expiration Day P&L',
        line: {
          color: 'rgba(0,0,0,0)',
          width: 0
        },
        customdata: expirationHoverArray,
        hovertemplate: '<b>В день экспирации</b><br>' +
                      'P&L: $%{customdata:.2f}<br>' +
                      '<extra></extra>',
        showlegend: false
      });
    }
    
    // Trace для суммарного P&L - разделяем на зеленую (выше 0) и красную (ниже 0) части
    // Зеленая часть (прибыль)
    const greenY = totalPLArray.map(pl => pl >= 0 ? pl : null);
    const totalHoverArray = totalPLArray.map(pl => Math.abs(pl) < 0.01 ? 0 : pl);
    traces.push({
      x: prices,
      y: greenY,
      type: 'scatter',
      mode: 'lines',
      name: 'Total P&L',
      line: {
        color: '#10B981', // зеленый
        width: 4
      },
      showlegend: true,
      hoverinfo: 'skip'
    });
    
    // Красная часть (убыток)
    const redY = totalPLArray.map(pl => pl < 0 ? pl : null);
    traces.push({
      x: prices,
      y: redY,
      type: 'scatter',
      mode: 'lines',
      name: 'Total P&L',
      line: {
        color: '#EF4444', // красный
        width: 4
      },
      showlegend: false,
      hoverinfo: 'skip'
    });

    traces.push({
      x: prices,
      y: totalPLArray,
      type: 'scatter',
      mode: 'lines',
      name: 'Total P&L (значение)',
      line: {
        color: 'rgba(0,0,0,0)',
        width: 0
      },
      customdata: totalHoverArray,
      hovertemplate: '<b>Total P&L</b><br>' +
                    'P&L: $%{customdata:.2f}<br>' +
                    '<extra></extra>',
      showlegend: false
    });

    // Заливка зон прибыли и убытка
    const profitZone = {
      x: prices,
      y: totalPLArray.map(pl => pl > 0 ? pl : 0),
      type: 'scatter',
      mode: 'none',
      fill: 'tozeroy',
      fillcolor: 'rgba(16, 185, 129, 0.15)', // зеленый с прозрачностью
      name: 'Profit Zone',
      showlegend: false,
      hoverinfo: 'skip'
    };

    const lossZone = {
      x: prices,
      y: totalPLArray.map(pl => pl < 0 ? pl : 0),
      type: 'scatter',
      mode: 'none',
      fill: 'tozeroy',
      fillcolor: 'rgba(239, 68, 68, 0.15)', // красный с прозрачностью
      name: 'Loss Zone',
      showlegend: false,
      hoverinfo: 'skip'
    };

    // Добавляем зоны в начало (чтобы они были под линиями)
    traces.unshift(lossZone);
    traces.unshift(profitZone);

    // Поиск breakeven points
    const breakevenPoints = [];
    for (let i = 1; i < totalPLArray.length; i++) {
      const prev = totalPLArray[i - 1];
      const curr = totalPLArray[i];
      
      // Пересечение нуля
      if ((prev < 0 && curr > 0) || (prev > 0 && curr < 0)) {
        const ratio = Math.abs(prev) / (Math.abs(prev) + Math.abs(curr));
        const breakeven = prices[i - 1] + (prices[i] - prices[i - 1]) * ratio;
        breakevenPoints.push(breakeven);
      }
    }

    // Расчет зон вероятности (стандартные отклонения)
    // Используем упрощенную модель: σ = цена × волатильность × √(дни/365)
    // Предполагаем годовую волатильность 25% (типичная для акций)
    const annualVolatility = 0.25;
    const daysToExpiry = daysRemaining || 30; // По умолчанию 30 дней
    const sigma = currentPrice * annualVolatility * Math.sqrt(daysToExpiry / 365);
    
    // Зоны: 1σ ≈ 68%, 2σ ≈ 95%, 3σ ≈ 99.7%
    const sigma1Lower = currentPrice - sigma;
    const sigma1Upper = currentPrice + sigma;
    const sigma2Lower = currentPrice - 2 * sigma;
    const sigma2Upper = currentPrice + 2 * sigma;
    const sigma3Lower = currentPrice - 3 * sigma;
    const sigma3Upper = currentPrice + 3 * sigma;

    // Расчет вероятности прибыли (POP)
    // Считаем процент точек где P&L > 0 в пределах 1σ
    let profitablePoints = 0;
    let totalPointsInSigma = 0;
    
    prices.forEach((price, i) => {
      if (price >= sigma1Lower && price <= sigma1Upper) {
        totalPointsInSigma++;
        if (totalPLArray[i] > 0) {
          profitablePoints++;
        }
      }
    });
    
    const probabilityOfProfit = totalPointsInSigma > 0 
      ? ((profitablePoints / totalPointsInSigma) * 100).toFixed(1)
      : 0;

    // Цвета темы
    const themeColors = {
      background: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)',
      paper: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)',
      text: isDarkMode ? 'hsl(0, 0%, 90%)' : 'hsl(222.2, 47.4%, 11.2%)',
      grid: isDarkMode ? 'hsl(0, 0%, 20%)' : 'hsl(214.3, 31.8%, 91.4%)',
      currentPrice: '#06b6d4',
      breakeven: '#f59e0b',
      zeroline: '#06b6d4',
      annotationBg: isDarkMode ? 'rgba(10, 10, 10, 0.95)' : 'rgba(255, 255, 255, 0.95)'
    };

    // Shapes для линий
    const shapes = [
      // Горизонтальная линия на уровне 0
      {
        type: 'line',
        x0: minPrice,
        x1: maxPrice,
        y0: 0,
        y1: 0,
        line: {
          color: themeColors.zeroline,
          width: 2,
          dash: 'dot'
        }
      },
      // Вертикальная линия текущей цены
      {
        type: 'line',
        x0: currentPrice,
        x1: currentPrice,
        yref: 'paper',
        y0: 0,
        y1: 1,
        line: {
          color: themeColors.currentPrice,
          width: 1,
          dash: 'dash'
        }
      }
    ];

    // Добавляем вертикальную линию симулированной цены (если отличается от текущей)
    if (targetPrice && targetPrice !== currentPrice && targetPrice >= minPrice && targetPrice <= maxPrice) {
      shapes.push({
        type: 'line',
        x0: targetPrice,
        x1: targetPrice,
        yref: 'paper',
        y0: 0,
        y1: 1,
        line: {
          color: '#6b7280', // gray-500
          width: 1,
          dash: 'solid'
        }
      });
    }

    // Добавляем зоны вероятности (прямоугольники) - только если включено
    if (showProbabilityZones) {
      // 3σ зона (99.7%) - самая светлая
      shapes.push({
      type: 'rect',
      x0: sigma3Lower,
      x1: sigma3Upper,
      yref: 'paper',
      y0: 0,
      y1: 1,
      fillcolor: 'rgba(147, 51, 234, 0.03)', // фиолетовый, очень прозрачный
      line: { width: 0 },
      layer: 'below'
    });

    // 2σ зона (95%)
    shapes.push({
      type: 'rect',
      x0: sigma2Lower,
      x1: sigma2Upper,
      yref: 'paper',
      y0: 0,
      y1: 1,
      fillcolor: 'rgba(147, 51, 234, 0.05)', // фиолетовый, прозрачный
      line: { width: 0 },
      layer: 'below'
    });

    // 1σ зона (68%) - самая темная
    shapes.push({
      type: 'rect',
      x0: sigma1Lower,
      x1: sigma1Upper,
      yref: 'paper',
      y0: 0,
      y1: 1,
      fillcolor: 'rgba(147, 51, 234, 0.08)', // фиолетовый, полупрозрачный
      line: { width: 0 },
      layer: 'below'
    });

    // Вертикальные линии границ 1σ
    shapes.push({
      type: 'line',
      x0: sigma1Lower,
      x1: sigma1Lower,
      yref: 'paper',
      y0: 0,
      y1: 1,
      line: {
        color: 'rgba(147, 51, 234, 0.4)',
        width: 1,
        dash: 'dot'
      }
    });

    shapes.push({
      type: 'line',
      x0: sigma1Upper,
      x1: sigma1Upper,
      yref: 'paper',
      y0: 0,
      y1: 1,
      line: {
        color: 'rgba(147, 51, 234, 0.4)',
        width: 1,
        dash: 'dot'
      }
    });
    } // Конец if (showProbabilityZones)

    // Добавляем вертикальные линии для breakeven points
    breakevenPoints.forEach(point => {
      shapes.push({
        type: 'line',
        x0: point,
        x1: point,
        yref: 'paper',
        y0: 0,
        y1: 1,
        line: {
          color: themeColors.breakeven,
          width: 1,
          dash: 'dot'
        }
      });
    });


    // Annotations для меток
    const annotations = [
      // Метка текущей цены
      {
        x: currentPrice,
        y: 1,
        yref: 'paper',
        text: `Current: $${currentPrice.toFixed(2)}`,
        showarrow: false,
        xanchor: 'center',
        yanchor: 'bottom',
        font: {
          color: themeColors.currentPrice,
          size: 12,
          weight: 'bold'
        },
        bgcolor: themeColors.annotationBg,
        borderpad: 6,
        bordercolor: themeColors.currentPrice,
        borderwidth: 1
      }
    ];

    // Добавляем метку симулированной цены (если отличается от текущей)
    if (targetPrice && targetPrice !== currentPrice && targetPrice >= minPrice && targetPrice <= maxPrice) {
      annotations.push({
        x: targetPrice,
        y: 0.95,
        yref: 'paper',
        text: `Target: $${targetPrice.toFixed(2)}`,
        showarrow: false,
        xanchor: 'center',
        yanchor: 'bottom',
        font: {
          color: '#6b7280', // gray-500
          size: 12,
          weight: 'bold'
        },
        bgcolor: themeColors.annotationBg,
        borderpad: 6,
        bordercolor: '#6b7280', // gray-500
        borderwidth: 1
      });
    }

    // Метки для зон вероятности (размещаем внизу) - только если включено
    if (showProbabilityZones) {
      annotations.push({
      x: sigma1Lower,
      y: 0,
      yref: 'paper',
      text: '1σ (68%)',
      showarrow: false,
      xanchor: 'center',
      yanchor: 'top',
      font: {
        color: 'rgba(147, 51, 234, 0.7)',
        size: 9
      },
      bgcolor: 'rgba(147, 51, 234, 0.1)',
      borderpad: 3,
      bordercolor: 'rgba(147, 51, 234, 0.3)',
      borderwidth: 1
    });

    annotations.push({
      x: sigma1Upper,
      y: 0,
      yref: 'paper',
      text: '1σ',
      showarrow: false,
      xanchor: 'center',
      yanchor: 'top',
      font: {
        color: 'rgba(147, 51, 234, 0.7)',
        size: 9
      },
      bgcolor: 'rgba(147, 51, 234, 0.1)',
      borderpad: 3,
      bordercolor: 'rgba(147, 51, 234, 0.3)',
      borderwidth: 1
    });

    // Метка POP (вероятность прибыли) в центре 1σ зоны
    annotations.push({
      x: currentPrice,
      y: 0.05,
      yref: 'paper',
      text: `POP: ${probabilityOfProfit}%`,
      showarrow: false,
      xanchor: 'center',
      yanchor: 'bottom',
      font: {
        color: probabilityOfProfit > 50 ? '#10B981' : '#EF4444',
        size: 12,
        weight: 'bold'
      },
      bgcolor: themeColors.annotationBg,
      borderpad: 6,
      bordercolor: probabilityOfProfit > 50 ? '#10B981' : '#EF4444',
      borderwidth: 2
    });
    } // Конец if (showProbabilityZones) для аннотаций

    // Метки для breakeven points (размещаем вверху графика)
    const maxPL = Math.max(...totalPLArray);
    breakevenPoints.forEach((point, index) => {
      annotations.push({
        x: point,
        y: maxPL,
        text: `BE: $${point.toFixed(2)}`,
        showarrow: false,
        xanchor: 'center',
        yanchor: 'bottom',
        font: {
          color: themeColors.breakeven,
          size: 11,
          weight: 'bold'
        },
        bgcolor: themeColors.annotationBg,
        borderpad: 5,
        bordercolor: themeColors.breakeven,
        borderwidth: 1
      });
    });

    // Layout для графика
    const layout = {
      title: {
        text: 'Profit & Loss Chart',
        font: {
          color: themeColors.text,
          size: 18,
          family: 'Inter, system-ui, sans-serif'
        }
      },
      paper_bgcolor: themeColors.paper,
      plot_bgcolor: themeColors.background,
      xaxis: {
        title: {
          text: 'Stock Price',
          font: {
            color: themeColors.text,
            size: 14
          }
        },
        gridcolor: themeColors.grid,
        color: themeColors.text,
        tickformat: '$,.2f',
        zeroline: true,
        zerolinecolor: themeColors.zeroline,
        zerolinewidth: 2,
        showline: true,
        linecolor: themeColors.grid,
        fixedrange: false
      },
      yaxis: {
        title: {
          text: 'Profit / Loss',
          font: {
            color: themeColors.text,
            size: 14
          }
        },
        gridcolor: themeColors.grid,
        color: themeColors.text,
        tickformat: '$,.0f',
        zeroline: true,
        zerolinecolor: themeColors.zeroline,
        zerolinewidth: 2,
        showline: true,
        linecolor: themeColors.grid,
        fixedrange: false
      },
      hovermode: 'x unified',
      showlegend: true,
      legend: {
        x: 0.02,
        y: 0.98,
        bgcolor: isDarkMode ? 'rgba(26, 26, 26, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        bordercolor: themeColors.grid,
        borderwidth: 1,
        font: {
          color: themeColors.text,
          size: 12
        }
      },
      shapes: shapes,
      annotations: annotations,
      margin: {
        l: 100,
        r: 40,
        t: 80,
        b: 70
      },
      autosize: true,
      dragmode: 'pan'
    };

    // Config для кнопок управления - оставляем только lasso2d и select2d для удаления
    const config = {
      displayModeBar: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      displaylogo: false,
      scrollZoom: false,
      toImageButtonOptions: {
        format: 'png',
        filename: 'options_pl_chart',
        height: 800,
        width: 1200,
        scale: 2
      }
    };


    return {
      traces,
      layout,
      config
    };
  }, [options, currentPrice, positions, isDarkMode, showOptionLines, daysRemaining, showProbabilityZones, xAxisRange, calculateUnderlyingPL, targetPrice]);

  if (!chartData) {
    return (
      <div className="h-[400px] flex items-center justify-center border border-dashed border-gray-300 rounded-lg">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">График недоступен</p>
          <p className="text-sm text-muted-foreground/70">
            Добавьте опционы или позиции базового актива для отображения графика
          </p>
        </div>
      </div>
    );
  }

  const { traces, layout, config } = chartData;

  // Обработчик для пересчета данных при zoom/pan
  const handleRelayout = (relayoutData) => {
    // Игнорируем события от кнопок autoscale и reset
    if (relayoutData['xaxis.autorange'] !== undefined || relayoutData['yaxis.autorange'] !== undefined) {
      console.log('📊 Autoscale/Reset detected, clearing xAxisRange');
      setXAxisRange(null);
      return;
    }
    
    // Когда пользователь зумирует или сдвигает график,
    // обновляем видимый диапазон для пересчета данных
    if (relayoutData['xaxis.range[0]'] !== undefined && relayoutData['xaxis.range[1]'] !== undefined) {
      setXAxisRange([relayoutData['xaxis.range[0]'], relayoutData['xaxis.range[1]']]);
      console.log('📊 Graph zoomed/panned:', relayoutData['xaxis.range[0]'], 'to', relayoutData['xaxis.range[1]']);
    }
  };

  return (
    <div className="w-full h-[600px]">
      <Plot
        data={traces}
        layout={{
          ...layout,
          autosize: true,
          margin: {
            l: 100,
            r: 40,
            t: 80,
            b: 70
          }
        }}
        config={config}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler={true}
        onRelayout={handleRelayout}
      />
    </div>
  );
}

/**
 * Вспомогательная функция для расчета P&L данных
 * Используется для расчета метрик (MAX прибыль, MAX убыток, Break-even)
 * @param {Array} options - массив опционов
 * @param {number} currentPrice - текущая цена актива
 * @param {Array} positions - массив позиций базового актива
 * @returns {Object} - { prices, totalPLArray } для расчета метрик
 */
export function calculatePLDataForMetrics(options = [], currentPrice = 0, positions = [], daysRemaining = 0) {
  if (!currentPrice || (options.length === 0 && positions.length === 0)) {
    return { prices: [], totalPLArray: [] };
  }

  const visibleOptions = options.filter(opt => opt.visible !== false);
  const visiblePositions = positions.filter(pos => pos.visible !== false);
  
  if (visibleOptions.length === 0 && visiblePositions.length === 0) {
    return { prices: [], totalPLArray: [] };
  }

  // Диапазон цен (±50% от текущей цены)
  const priceRange = 0.50;
  const minPrice = currentPrice * (1 - priceRange);
  const maxPrice = currentPrice * (1 + priceRange);
  
  const chartPoints = 500;
  const step = (maxPrice - minPrice) / chartPoints;

  // Массив цен
  const prices = [];
  for (let price = minPrice; price <= maxPrice; price += step) {
    prices.push(price);
  }

  // Расчет P&L для каждой цены
  const totalPLArray = new Array(prices.length).fill(0);

  // Добавляем P&L от позиций базового актива
  visiblePositions.forEach((position) => {
    prices.forEach((price, i) => {
      const { type, quantity, price: entryPrice } = position;
      const entryPriceNum = Number(entryPrice) || 0;
      let pl = 0;
      if (type === 'LONG') {
        pl = (price - entryPriceNum) * quantity;
      } else if (type === 'SHORT') {
        pl = (entryPriceNum - price) * quantity;
      }
      totalPLArray[i] += pl;
    });
  });

  // Добавляем P&L от опционов
  visibleOptions.forEach((option) => {
    const { type, strike, action, quantity, premium, date } = option;
    const optionQuantity = Math.abs(parseFloat(quantity) || 0);
    const premiumValue = parseFloat(premium) || 0;
    const strikeValue = Number(strike) || 0;

    // Используем ту же модель тайм-декея, что и основной график
    let maxDaysToExpiration = 30;
    if (date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expirationDate = new Date(date);
      expirationDate.setHours(0, 0, 0, 0);
      maxDaysToExpiration = Math.max(1, Math.ceil((expirationDate - today) / (1000 * 60 * 60 * 24)));
    }

    const safeMaxDays = Math.max(1, maxDaysToExpiration);
    const clampedDaysRemaining = Math.max(0, Math.min(daysRemaining, safeMaxDays));
    const timeDecayFactor = safeMaxDays === 0 ? 0 : clampedDaysRemaining / safeMaxDays;

    prices.forEach((price, i) => {
      let optionValue = 0;
      let intrinsicValue = 0;

      if (type === 'CALL') {
        intrinsicValue = Math.max(0, price - strikeValue);
      } else {
        intrinsicValue = Math.max(0, strikeValue - price);
      }

      if (clampedDaysRemaining <= 0) {
        optionValue = intrinsicValue;
      } else {
        const denominator = Math.abs(strikeValue) > 0 ? Math.abs(strikeValue) : Math.max(1, currentPrice);
        const moneyness = denominator === 0 ? 0 : Math.abs(price - strikeValue) / denominator;
        const timeValue = premiumValue * Math.sqrt(timeDecayFactor) * Math.exp(-moneyness * 2);
        optionValue = intrinsicValue + timeValue;
      }

      let pl = 0;
      if (action === 'Buy') {
        pl = (optionValue - premiumValue) * optionQuantity * 100;
      } else {
        pl = (premiumValue - optionValue) * optionQuantity * 100;
      }

      totalPLArray[i] += pl;
    });
  });

  return { prices, totalPLArray };
}

export default PLChart;
