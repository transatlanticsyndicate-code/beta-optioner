import React, { useMemo, useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { Flame } from 'lucide-react';

/**
 * HeatmapChart - Тепловая карта страйков vs метрики (OI, Volume, Greeks)
 */
function HeatmapChart({ options = [], currentPrice = 0 }) {
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

    const strikeMap = {};
    
    options.forEach(opt => {
      const strike = Number(opt.strike);
      if (!strikeMap[strike]) {
        strikeMap[strike] = {
          strike,
          callOI: 0,
          callVolume: 0,
          callDelta: 0,
          putOI: 0,
          putVolume: 0,
          putDelta: 0
        };
      }
      
      if (opt.type === 'CALL') {
        strikeMap[strike].callOI = opt.oi || 0;
        strikeMap[strike].callVolume = opt.volume || 0;
        strikeMap[strike].callDelta = opt.delta || 0;
      } else {
        strikeMap[strike].putOI = opt.oi || 0;
        strikeMap[strike].putVolume = opt.volume || 0;
        strikeMap[strike].putDelta = opt.delta || 0;
      }
    });

    const sortedStrikes = Object.values(strikeMap).sort((a, b) => a.strike - b.strike);

    const strikes = sortedStrikes.map(s => s.strike);
    const callOI = sortedStrikes.map(s => s.callOI);
    const putOI = sortedStrikes.map(s => s.putOI);
    const callVolume = sortedStrikes.map(s => s.callVolume);
    const putVolume = sortedStrikes.map(s => s.putVolume);

    const themeColors = {
      background: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)',
      paper: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)',
      text: isDarkMode ? 'hsl(0, 0%, 90%)' : 'hsl(222.2, 47.4%, 11.2%)',
      grid: isDarkMode ? 'hsl(0, 0%, 20%)' : 'hsl(214.3, 31.8%, 91.4%)'
    };

    const traces = [
      {
        y: ['CALL OI'],
        x: strikes,
        z: [callOI],
        type: 'heatmap',
        colorscale: 'Blues',
        name: 'CALL OI',
        hovertemplate: 'Strike: $%{x:.2f}<br>OI: %{z:,.0f}<extra></extra>'
      },
      {
        y: ['PUT OI'],
        x: strikes,
        z: [putOI],
        type: 'heatmap',
        colorscale: 'Reds',
        name: 'PUT OI',
        hovertemplate: 'Strike: $%{x:.2f}<br>OI: %{z:,.0f}<extra></extra>'
      },
      {
        y: ['CALL Volume'],
        x: strikes,
        z: [callVolume],
        type: 'heatmap',
        colorscale: 'Greens',
        name: 'CALL Volume',
        hovertemplate: 'Strike: $%{x:.2f}<br>Volume: %{z:,.0f}<extra></extra>'
      },
      {
        y: ['PUT Volume'],
        x: strikes,
        z: [putVolume],
        type: 'heatmap',
        colorscale: 'Oranges',
        name: 'PUT Volume',
        hovertemplate: 'Strike: $%{x:.2f}<br>Volume: %{z:,.0f}<extra></extra>'
      }
    ];

    const layout = {
      title: {
        text: 'Heatmap: Strikes vs Metrics',
        font: { color: themeColors.text, size: 14 }
      },
      paper_bgcolor: themeColors.paper,
      plot_bgcolor: themeColors.background,
      xaxis: {
        title: 'Strike Price ($)',
        color: themeColors.text,
        gridcolor: themeColors.grid
      },
      yaxis: {
        title: 'Metric',
        color: themeColors.text
      },
      font: { color: themeColors.text, family: 'Inter, system-ui, sans-serif' },
      margin: { l: 80, r: 40, b: 60, t: 60 },
      autosize: true
    };

    const config = {
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      toImageButtonOptions: {
        format: 'png',
        filename: 'options_heatmap',
        height: 600,
        width: 1200,
        scale: 2
      }
    };

    return { traces, layout, config };
  }, [options, currentPrice, isDarkMode]);

  if (!chartData) {
    return (
      <div className="h-96 flex items-center justify-center border-2 border-dashed border-border rounded-lg">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">Тепловая карта недоступна</p>
          <p className="text-sm text-muted-foreground/70">Добавьте опционы для отображения</p>
        </div>
      </div>
    );
  }

  const { traces, layout, config } = chartData;

  return (
    <Plot
      data={traces}
      layout={layout}
      config={config}
      style={{ width: '100%', height: '500px' }}
      useResizeHandler={true}
    />
  );
}

export default HeatmapChart;
