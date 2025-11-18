import React, { useMemo, useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Cuboid } from 'lucide-react';

/**
 * Surface3D - 3D график P&L в зависимости от цены и времени до экспирации
 * Отображает поверхность P&L с осями: цена, дни до экспирации, P&L
 */
function Surface3D({ options = [], currentPrice = 0, daysRemaining = 0 }) {
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

  // Функция расчета P&L для опциона
  const calculateOptionPL = (price, daysLeft, option) => {
    if (!option) return 0;

    const { type, strike, premium, direction } = option;
    const timeValue = (daysLeft / 365) * 0.5; // Упрощенный расчет временной стоимости
    
    let intrinsicValue = 0;
    if (type === 'CALL') {
      intrinsicValue = Math.max(0, price - strike);
    } else {
      intrinsicValue = Math.max(0, strike - price);
    }

    const optionValue = intrinsicValue + timeValue * premium;
    
    if (direction === 'buy' || direction === 'Buy') {
      return (optionValue - premium) * 100;
    } else {
      return (premium - optionValue) * 100;
    }
  };

  // Расчет 3D данных
  const chartData = useMemo(() => {
    if (!options || options.length === 0 || !currentPrice) {
      return null;
    }

    const visibleOptions = options.filter(opt => opt.visible);
    if (visibleOptions.length === 0) {
      return null;
    }

    // Диапазон цен: ±50% от текущей цены
    const priceRange = 0.50;
    const minPrice = currentPrice * (1 - priceRange);
    const maxPrice = currentPrice * (1 + priceRange);
    
    // Диапазон дней: от 0 до максимального количества дней
    const maxDays = Math.max(daysRemaining || 30, 30);
    
    // Количество точек для сетки
    const pricePoints = 30;
    const daysPoints = 20;
    
    // Создаем массивы цен и дней
    const prices = [];
    const days = [];
    const z = [];

    const priceStep = (maxPrice - minPrice) / pricePoints;
    const daysStep = maxDays / daysPoints;

    // Заполняем массивы
    for (let i = 0; i <= pricePoints; i++) {
      prices.push(minPrice + i * priceStep);
    }

    for (let i = 0; i <= daysPoints; i++) {
      days.push(i * daysStep);
    }

    // Расчет P&L для каждой комбинации цены и дней
    for (let dayIdx = 0; dayIdx <= daysPoints; dayIdx++) {
      const zRow = [];
      const currentDays = days[dayIdx];

      for (let priceIdx = 0; priceIdx <= pricePoints; priceIdx++) {
        const price = prices[priceIdx];
        let totalPL = 0;

        visibleOptions.forEach(opt => {
          totalPL += calculateOptionPL(price, currentDays, opt);
        });

        zRow.push(totalPL);
      }

      z.push(zRow);
    }

    // Цвета темы
    const themeColors = {
      background: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)',
      paper: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)',
      text: isDarkMode ? 'hsl(0, 0%, 90%)' : 'hsl(222.2, 47.4%, 11.2%)',
      grid: isDarkMode ? 'hsl(0, 0%, 20%)' : 'hsl(214.3, 31.8%, 91.4%)'
    };

    // Создаем trace для поверхности
    const trace = {
      x: prices,
      y: days,
      z: z,
      type: 'surface',
      colorscale: [
        [0, '#ef4444'],      // красный для убытков
        [0.5, '#f5f5f5'],    // серый для нуля
        [1, '#10b981']       // зеленый для прибыли
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

    // Layout для графика
    const layout = {
      title: {
        text: '3D P&L Surface (Цена × Дни до экспирации)',
        font: {
          color: themeColors.text,
          size: 16
        }
      },
      scene: {
        xaxis: {
          title: 'Stock Price ($)',
          backgroundcolor: themeColors.background,
          gridcolor: themeColors.grid,
          showbackground: true,
          titlefont: {
            color: themeColors.text
          },
          tickfont: {
            color: themeColors.text
          }
        },
        yaxis: {
          title: 'Days to Expiration',
          backgroundcolor: themeColors.background,
          gridcolor: themeColors.grid,
          showbackground: true,
          titlefont: {
            color: themeColors.text
          },
          tickfont: {
            color: themeColors.text
          }
        },
        zaxis: {
          title: 'Profit / Loss ($)',
          backgroundcolor: themeColors.background,
          gridcolor: themeColors.grid,
          showbackground: true,
          titlefont: {
            color: themeColors.text
          },
          tickfont: {
            color: themeColors.text
          }
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
      margin: {
        l: 0,
        r: 0,
        b: 0,
        t: 50
      },
      autosize: true
    };

    // Config для кнопок управления
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

    return {
      trace,
      layout,
      config
    };
  }, [options, currentPrice, daysRemaining, isDarkMode]);

  if (!chartData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cuboid className="h-5 w-5 text-cyan-500" />
            3D График P&L
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center border-2 border-dashed border-border rounded-lg">
            <div className="text-center">
              <p className="text-muted-foreground mb-2">3D график недоступен</p>
              <p className="text-sm text-muted-foreground/70">
                Добавьте опционы для отображения
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { trace, layout, config } = chartData;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cuboid className="h-5 w-5 text-cyan-500" />
          3D График P&L
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Plot
          data={[trace]}
          layout={layout}
          config={config}
          style={{ width: '100%', height: '600px' }}
          useResizeHandler={true}
        />
      </CardContent>
    </Card>
  );
}

export default Surface3D;
