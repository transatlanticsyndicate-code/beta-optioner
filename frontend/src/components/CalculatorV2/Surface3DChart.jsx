import React, { useMemo, useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Cuboid } from 'lucide-react';

/**
 * Surface3DChart - 3D график P&L в зависимости от цены и времени до экспирации
 */
function Surface3DChart({ options = [], currentPrice = 0, daysRemaining = 0 }) {
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

    const visibleOptions = options.filter(opt => opt.visible);
    if (visibleOptions.length === 0) {
      return null;
    }

    const priceRange = 0.50;
    const minPrice = currentPrice * (1 - priceRange);
    const maxPrice = currentPrice * (1 + priceRange);
    
    const maxDays = Math.max(daysRemaining || 30, 30);
    
    const pricePoints = 30;
    const daysPoints = 20;
    
    const prices = [];
    const days = [];
    const z = [];

    const priceStep = (maxPrice - minPrice) / pricePoints;
    const daysStep = maxDays / daysPoints;

    for (let i = 0; i <= pricePoints; i++) {
      prices.push(minPrice + i * priceStep);
    }

    for (let i = 0; i <= daysPoints; i++) {
      days.push(i * daysStep);
    }

    for (let dayIdx = 0; dayIdx <= daysPoints; dayIdx++) {
      const zRow = [];
      const currentDays = days[dayIdx];

      for (let priceIdx = 0; priceIdx <= pricePoints; priceIdx++) {
        const price = prices[priceIdx];
        let totalPL = 0;

        visibleOptions.forEach(opt => {
          const { type, strike, premium, action } = opt;
          const timeDecayFactor = currentDays / (daysRemaining || 30);
          
          let intrinsicValue = 0;
          if (type === 'CALL') {
            intrinsicValue = Math.max(0, price - strike);
          } else {
            intrinsicValue = Math.max(0, strike - price);
          }

          const moneyness = Math.abs(price - strike) / strike;
          const timeValue = premium * Math.sqrt(Math.max(0, timeDecayFactor)) * Math.exp(-moneyness * 2);
          const optionValue = intrinsicValue + timeValue;
          
          if (action === 'Buy' || action === 'buy') {
            totalPL += (optionValue - premium) * 100;
          } else {
            totalPL += (premium - optionValue) * 100;
          }
        });

        zRow.push(totalPL);
      }

      z.push(zRow);
    }

    const themeColors = {
      background: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)',
      paper: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)',
      text: isDarkMode ? 'hsl(0, 0%, 90%)' : 'hsl(222.2, 47.4%, 11.2%)',
      grid: isDarkMode ? 'hsl(0, 0%, 20%)' : 'hsl(214.3, 31.8%, 91.4%)'
    };

    const trace = {
      x: prices,
      y: days,
      z: z,
      type: 'surface',
      colorscale: [
        [0, '#ef4444'],
        [0.5, '#f5f5f5'],
        [1, '#10b981']
      ],
      showscale: true,
      colorbar: {
        title: 'P&L ($)',
        thickness: 15,
        len: 0.7,
        tickfont: {
          color: themeColors.text
        }
      }
    };

    const layout = {
      title: {
        text: '3D P&L Surface (Цена × Дни)',
        font: {
          color: themeColors.text,
          size: 14
        }
      },
      scene: {
        xaxis: {
          title: 'Stock Price ($)',
          backgroundcolor: themeColors.background,
          gridcolor: themeColors.grid,
          showbackground: true,
          titlefont: { color: themeColors.text },
          tickfont: { color: themeColors.text }
        },
        yaxis: {
          title: 'Days to Expiration',
          backgroundcolor: themeColors.background,
          gridcolor: themeColors.grid,
          showbackground: true,
          titlefont: { color: themeColors.text },
          tickfont: { color: themeColors.text }
        },
        zaxis: {
          title: 'P&L ($)',
          backgroundcolor: themeColors.background,
          gridcolor: themeColors.grid,
          showbackground: true,
          titlefont: { color: themeColors.text },
          tickfont: { color: themeColors.text }
        },
        camera: {
          eye: { x: 1.5, y: 1.5, z: 1.3 }
        }
      },
      paper_bgcolor: themeColors.paper,
      plot_bgcolor: themeColors.background,
      font: {
        color: themeColors.text,
        family: 'Inter, system-ui, sans-serif'
      },
      margin: { l: 0, r: 0, b: 0, t: 40 },
      autosize: true
    };

    const config = {
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      toImageButtonOptions: {
        format: 'png',
        filename: 'options_3d_surface',
        height: 800,
        width: 1200,
        scale: 2
      }
    };

    return { trace, layout, config };
  }, [options, currentPrice, daysRemaining, isDarkMode]);

  if (!chartData) {
    return (
      <div className="h-96 flex items-center justify-center border-2 border-dashed border-border rounded-lg">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">3D график недоступен</p>
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
      style={{ width: '100%', height: '500px' }}
      useResizeHandler={true}
    />
  );
}

export default Surface3DChart;
