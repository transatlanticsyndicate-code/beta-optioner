import React, { useMemo, useState, useEffect } from 'react';
import Plot from 'react-plotly.js';

/**
 * PLHeatmapChart - Тепловая карта P&L (Страйки × Даты) с использованием Plotly
 */
function PLHeatmapChart({ options = [], currentPrice = 0, positions = [] }) {
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
    if (!options || options.length === 0 || !currentPrice) {
      return null;
    }

    // Собираем уникальные страйки и даты
    const strikeSet = new Set();
    const dateSet = new Set();

    options.forEach(opt => {
      if (opt.visible !== false) {
        strikeSet.add(Number(opt.strike));
        if (opt.date) dateSet.add(opt.date);
      }
    });

    const strikes = Array.from(strikeSet).sort((a, b) => b - a); // От большего к меньшему (как на скриншоте)
    const dates = Array.from(dateSet).sort();

    if (strikes.length === 0 || dates.length === 0) {
      return null;
    }

    // Создаем матрицу P&L
    const plMatrix = [];
    const textMatrix = [];
    
    strikes.forEach(strike => {
      const plRow = [];
      const textRow = [];
      
      dates.forEach(date => {
        let totalPL = 0;
        
        // Рассчитываем P&L для всех опционов с данным страйком и датой
        options.forEach(opt => {
          if (Number(opt.strike) === strike && opt.date === date && opt.visible !== false) {
            const { type, premium, action, quantity } = opt;
            
            let intrinsicValue = 0;
            if (type === 'CALL') {
              intrinsicValue = Math.max(0, currentPrice - strike);
            } else {
              intrinsicValue = Math.max(0, strike - currentPrice);
            }
            
            const qty = Math.abs(quantity || 1);
            
            if (action === 'Buy' || action === 'buy') {
              totalPL += (intrinsicValue - premium) * 100 * qty;
            } else {
              totalPL += (premium - intrinsicValue) * 100 * qty;
            }
          }
        });
        
        plRow.push(totalPL);
        // Форматируем текст для отображения
        const sign = totalPL > 0 ? '+' : '';
        textRow.push(`${sign}${Math.round(totalPL)}`);
      });
      
      plMatrix.push(plRow);
      textMatrix.push(textRow);
    });

    const themeColors = {
      background: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)',
      paper: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)',
      text: isDarkMode ? 'hsl(0, 0%, 90%)' : 'hsl(222.2, 47.4%, 11.2%)',
      grid: isDarkMode ? 'hsl(0, 0%, 20%)' : 'hsl(214.3, 31.8%, 91.4%)'
    };

    // Форматируем даты для отображения
    const formattedDates = dates.map(date => {
      const d = new Date(date + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    // Форматируем страйки для отображения
    const formattedStrikes = strikes.map(s => `$${s.toFixed(0)}`);

    const trace = {
      x: formattedDates,
      y: formattedStrikes,
      z: plMatrix,
      text: textMatrix,
      type: 'heatmap',
      colorscale: [
        [0, '#ef4444'],      // Красный (убыток)
        [0.5, '#f5f5f5'],    // Белый (нейтраль)
        [1, '#10b981']       // Зеленый (прибыль)
      ],
      hovertemplate: 'Strike: %{y}<br>Date: %{x}<br>P&L: $%{z:,.0f}<extra></extra>',
      texttemplate: '%{text}',
      textfont: {
        size: 10,
        color: isDarkMode ? '#fff' : '#000'
      },
      showscale: true,
      colorbar: {
        title: 'P&L ($)',
        titleside: 'right',
        tickmode: 'auto',
        tickfont: { color: themeColors.text },
        titlefont: { color: themeColors.text }
      }
    };

    const layout = {
      title: {
        text: 'P&L Heatmap: Страйки × Даты',
        font: { color: themeColors.text, size: 16 }
      },
      paper_bgcolor: themeColors.paper,
      plot_bgcolor: themeColors.background,
      xaxis: {
        title: 'Дата экспирации',
        color: themeColors.text,
        gridcolor: themeColors.grid,
        tickangle: -45
      },
      yaxis: {
        title: 'Страйк',
        color: themeColors.text,
        gridcolor: themeColors.grid
      },
      font: { color: themeColors.text, family: 'Inter, system-ui, sans-serif' },
      margin: { l: 80, r: 80, b: 100, t: 80 },
      autosize: true,
      height: 600
    };

    const config = {
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      toImageButtonOptions: {
        format: 'png',
        filename: 'pl_heatmap',
        height: 800,
        width: 1200,
        scale: 2
      }
    };

    return { trace, layout, config };
  }, [options, currentPrice, positions, isDarkMode]);

  if (!chartData) {
    return (
      <div className="h-96 flex items-center justify-center border-2 border-dashed border-border rounded-lg">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">Тепловая карта P&L недоступна</p>
          <p className="text-sm text-muted-foreground/70">Добавьте опционы для отображения</p>
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
      style={{ width: '100%', height: '600px' }}
      useResizeHandler={true}
    />
  );
}

export default PLHeatmapChart;
