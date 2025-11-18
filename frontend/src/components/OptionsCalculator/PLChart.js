import React, { useMemo, useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { LineChart } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';

/**
 * PLChart - график P&L с использованием Plotly.js
 * Поддерживает темную и светлую темы
 */
function PLChart({ positions, currentPrice, settings }) {
  // Отслеживание темы
  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.classList.contains('dark')
  );

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
  // Расчет данных для графика и layout (объединено для соблюдения правил хуков)
  const chartData = useMemo(() => {
    if (positions.length === 0 || !currentPrice) {
      return null;
    }

    const visiblePositions = positions.filter(pos => pos.visible);
    if (visiblePositions.length === 0) {
      return null;
    }

    // Диапазон цен для графика
    const priceRange = settings?.priceRange || 0.20;
    const chartPoints = settings?.chartPoints || 200;
    
    const minPrice = currentPrice.price * (1 - priceRange);
    const maxPrice = currentPrice.price * (1 + priceRange);
    const step = (maxPrice - minPrice) / chartPoints;

    // Массив цен для оси X
    const prices = [];
    for (let price = minPrice; price <= maxPrice; price += step) {
      prices.push(price);
    }

    // Расчет P&L для каждой позиции
    const traces = [];
    const totalPLArray = new Array(prices.length).fill(0);

    visiblePositions.forEach((pos, index) => {
      const { type, strike, direction, size, price: premium, commission } = pos;
      const plArray = [];

      prices.forEach(price => {
        let pl = 0;

        // Расчет P&L для опциона
        if (type === 'call') {
          const intrinsicValue = Math.max(0, price - strike);
          if (direction === 'buy') {
            pl = (intrinsicValue - premium) * size * 100 - commission * size;
          } else {
            pl = (premium - intrinsicValue) * size * 100 - commission * size;
          }
        } else { // put
          const intrinsicValue = Math.max(0, strike - price);
          if (direction === 'buy') {
            pl = (intrinsicValue - premium) * size * 100 - commission * size;
          } else {
            pl = (premium - intrinsicValue) * size * 100 - commission * size;
          }
        }

        plArray.push(pl);
      });

      // Добавляем к общему P&L
      plArray.forEach((pl, i) => {
        totalPLArray[i] += pl;
      });

      // Цвет и стиль линии
      const color = type === 'call' ? '#3B82F6' : '#F97316'; // blue для call, orange для put
      const dash = direction === 'buy' ? 'solid' : 'dash';

      // Trace для позиции
      traces.push({
        x: prices,
        y: plArray,
        type: 'scatter',
        mode: 'lines',
        name: `${direction.toUpperCase()} ${type.toUpperCase()} $${strike}`,
        line: {
          color: color,
          width: 2,
          dash: dash
        },
        hovertemplate: '<b>%{fullData.name}</b><br>' +
                      'Price: $%{x:.2f}<br>' +
                      'P&L: $%{y:.2f}<br>' +
                      '<extra></extra>'
      });
    });

    // Trace для суммарного P&L (жирная линия)
    const totalColor = totalPLArray.some(pl => pl > 0) ? '#10B981' : '#EF4444';
    traces.push({
      x: prices,
      y: totalPLArray,
      type: 'scatter',
      mode: 'lines',
      name: 'Total P&L',
      line: {
        color: totalColor,
        width: 4
      },
      hovertemplate: '<b>Total P&L</b><br>' +
                    'Price: $%{x:.2f}<br>' +
                    'P&L: $%{y:.2f}<br>' +
                    '<extra></extra>'
    });

    // Заливка зон прибыли и убытка
    const profitZone = {
      x: prices,
      y: totalPLArray.map(pl => pl > 0 ? pl : 0),
      type: 'scatter',
      mode: 'none',
      fill: 'tozeroy',
      fillcolor: 'rgba(16, 185, 129, 0.1)', // зеленый с прозрачностью
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
      fillcolor: 'rgba(239, 68, 68, 0.1)', // красный с прозрачностью
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
        breakevenPoints.push(prices[i]);
      }
    }

    // Цвета темы (синхронизированы с Card)
    const themeColors = {
      // Фон графика = фон Card
      background: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)', // bg-card
      paper: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)', // bg-card
      // Текст
      text: isDarkMode ? 'hsl(0, 0%, 90%)' : 'hsl(222.2, 47.4%, 11.2%)', // text-foreground
      // Сетка
      grid: isDarkMode ? 'hsl(0, 0%, 20%)' : 'hsl(214.3, 31.8%, 91.4%)', // border
      // Специальные цвета
      currentPrice: '#06b6d4', // cyan
      breakeven: '#f59e0b', // amber
      zeroline: isDarkMode ? 'hsl(0, 0%, 30%)' : 'hsl(215.4, 16.3%, 46.9%)', // muted-foreground
      annotationBg: isDarkMode ? 'rgba(10, 10, 10, 0.95)' : 'rgba(255, 255, 255, 0.95)'
    };

    // Shapes для вертикальных линий
    const shapes = [
      // Горизонтальная линия на уровне 0 (break-even line)
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
        x0: currentPrice.price,
        x1: currentPrice.price,
        yref: 'paper',
        y0: 0,
        y1: 1,
        line: {
          color: themeColors.currentPrice,
          width: 3,
          dash: 'dash'
        }
      }
    ];

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
          width: 2,
          dash: 'dot'
        }
      });
    });

    // Annotations для меток
    const annotations = [
      // Метка текущей цены
      {
        x: currentPrice.price,
        y: 1,
        yref: 'paper',
        text: `Current: $${currentPrice.price.toFixed(2)}`,
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

    // Метки для breakeven points
    breakevenPoints.forEach((point, index) => {
      annotations.push({
        x: point,
        y: 0,
        text: `BE: $${point.toFixed(2)}`,
        showarrow: false,
        xanchor: 'center',
        yanchor: 'top',
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
        showline: true,
        linecolor: themeColors.grid
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
        linecolor: themeColors.grid
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
        l: 70,
        r: 40,
        t: 80,
        b: 70
      },
      autosize: true
    };

    // Config для кнопок управления
    const config = {
      displayModeBar: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      displaylogo: false,
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
      prices,
      totalPLArray,
      breakevenPoints,
      minPrice,
      maxPrice,
      layout,
      config
    };
  }, [positions, currentPrice, settings, isDarkMode]);

  if (!chartData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-primary" />
            P&L Chart
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center border-2 border-dashed border-border rounded-lg">
            <div className="text-center">
              <p className="text-muted-foreground mb-2">График недоступен</p>
              <p className="text-sm text-muted-foreground/70">
                Добавьте позиции и выберите тикер
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { traces, layout, config } = chartData;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LineChart className="h-5 w-5 text-primary" />
          P&L Chart
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Plot
          data={traces}
          layout={layout}
          config={config}
          style={{ width: '100%', height: '600px' }}
          useResizeHandler={true}
        />
      </CardContent>
    </Card>
  );
}

export default PLChart;
