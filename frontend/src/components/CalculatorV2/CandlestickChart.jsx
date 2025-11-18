import React, { useMemo, useState, useEffect } from 'react';
import Plot from 'react-plotly.js';

/**
 * CandlestickChart - История цены базового актива (японские свечи)
 */
function CandlestickChart({ currentPrice = 0 }) {
  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.classList.contains('dark')
  );

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

  const chartData = useMemo(() => {
    if (!currentPrice) {
      return null;
    }

    // Генерируем демо-данные свечей (20 дней)
    const dates = [];
    const opens = [];
    const highs = [];
    const lows = [];
    const closes = [];

    let price = currentPrice;
    const today = new Date();

    for (let i = 19; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);

      // Случайное движение цены
      const change = (Math.random() - 0.5) * currentPrice * 0.05;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.abs(change) * 0.3;
      const low = Math.min(open, close) - Math.abs(change) * 0.3;

      opens.push(open);
      closes.push(close);
      highs.push(high);
      lows.push(low);

      price = close;
    }

    const themeColors = {
      background: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)',
      paper: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)',
      text: isDarkMode ? 'hsl(0, 0%, 90%)' : 'hsl(222.2, 47.4%, 11.2%)',
      grid: isDarkMode ? 'hsl(0, 0%, 20%)' : 'hsl(214.3, 31.8%, 91.4%)'
    };

    const trace = {
      x: dates,
      open: opens,
      high: highs,
      low: lows,
      close: closes,
      type: 'candlestick',
      name: 'Price',
      increasing: { line: { color: '#10b981' } },
      decreasing: { line: { color: '#ef4444' } },
      hovertemplate: '<b>%{x}</b><br>Open: $%{open:.2f}<br>High: $%{high:.2f}<br>Low: $%{low:.2f}<br>Close: $%{close:.2f}<extra></extra>'
    };

    const layout = {
      title: {
        text: 'Price History (Candlestick)',
        font: { color: themeColors.text, size: 14 }
      },
      paper_bgcolor: themeColors.paper,
      plot_bgcolor: themeColors.background,
      xaxis: {
        title: 'Date',
        color: themeColors.text,
        gridcolor: themeColors.grid,
        rangeslider: { visible: false }
      },
      yaxis: {
        title: 'Price ($)',
        color: themeColors.text,
        gridcolor: themeColors.grid
      },
      font: { color: themeColors.text, family: 'Inter, system-ui, sans-serif' },
      margin: { l: 70, r: 40, b: 60, t: 60 },
      autosize: true
    };

    const config = {
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      toImageButtonOptions: {
        format: 'png',
        filename: 'price_candlestick',
        height: 600,
        width: 1200,
        scale: 2
      }
    };

    return { trace, layout, config };
  }, [currentPrice, isDarkMode]);

  if (!chartData) {
    return (
      <div className="h-96 flex items-center justify-center border-2 border-dashed border-border rounded-lg">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">График цены недоступен</p>
          <p className="text-sm text-muted-foreground/70">Выберите тикер для отображения</p>
        </div>
      </div>
    );
  }

  const { trace, layout, config } = chartData;

  return (
    <Plot
      data={[trace]}
      layout={layout}
      config={config}
      style={{ width: '100%', height: '500px' }}
      useResizeHandler={true}
    />
  );
}

export default CandlestickChart;
