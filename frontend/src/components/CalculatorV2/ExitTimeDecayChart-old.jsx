import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Plot from 'react-plotly.js';
import { calculateOptionPLValue } from '../../utils/optionPricing';
import { calculateDaysRemainingUTC, getDaysUntilExpirationUTC } from '../../utils/dateUtils';
import { getOptionVolatility } from '../../utils/volatilitySurface';

/**
 * График P&L в зависимости от дней до экспирации
 * Показывает как меняется P&L при приближении даты экспирации
 * Стиль полностью синхронизирован с основным графиком PLChart
 */
function ExitTimeDecayChart({ 
  options = [], 
  positions = [], 
  currentPrice = 0,
  targetPrice = 0,  // Цена из бегунка "Цена базового актива"
  daysPassed = 0,   // Прошедшие дни от сегодня
  showOptionLines = true,
  selectedExpirationDate = null,  // Выбранная дата экспирации для расчета maxDays
  ivSurface = null  // IV Surface для точной интерполяции волатильности
}) {
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

  // Расчет P&L для позиции базового актива
  const calculateUnderlyingPL = useCallback((price, position) => {
    if (!position || !position.type) return 0;
    
    const { type, quantity, price: entryPrice } = position;
    const entryPriceNum = Number(entryPrice) || 0;
    
    if (type === 'LONG') {
      return (price - entryPriceNum) * quantity;
    } else if (type === 'SHORT') {
      return (entryPriceNum - price) * quantity;
    }
    return 0;
  }, []);

  // Вычисляет оставшиеся дни до экспирации для конкретного опциона
  // ВАЖНО: Используем UTC для консистентности между часовыми поясами
  const calculateDaysRemainingForOption = useCallback((option, currentDaysPassed) => {
    // Используем UTC-функцию для единообразного расчёта во всех часовых поясах
    return calculateDaysRemainingUTC(option, currentDaysPassed, 30);
  }, []);

  // Расчет P&L для опциона с общей моделью (как в блоке "Закрыть всё")
  // ВАЖНО: Используем единую функцию getOptionVolatility с IV Surface для точной интерполяции
  const calculateOptionPL = useCallback(
    (option, daysToExpiration) => {
      // Получаем IV из API через единую функцию (как в usePositionExitCalculator и PLChart)
      // ivSurface используется для точной интерполяции IV между датами экспирации
      const currentDaysToExpiration = calculateDaysRemainingUTC(option, 0);
      const optionVolatility = getOptionVolatility(option, currentDaysToExpiration, daysToExpiration, ivSurface);
      
      // ВАЖНО: При ручной премии обнуляем ask/bid, чтобы getEntryPrice() использовал premium
      const effectivePremium = option.isPremiumModified ? option.customPremium : option.premium;
      const tempOpt = { 
        ...option, 
        premium: effectivePremium,
        ask: option.isPremiumModified ? 0 : option.ask,
        bid: option.isPremiumModified ? 0 : option.bid
      };
      
      return calculateOptionPLValue(tempOpt, targetPrice, currentPrice, daysToExpiration, optionVolatility);
    },
    [targetPrice, currentPrice, ivSurface]
  );

  // Генерируем данные для графика
  const chartData = useMemo(() => {
    // Фильтруем только видимые опционы и позиции
    const visibleOptions = options.filter(opt => opt.visible !== false);
    const visiblePositions = positions.filter(pos => pos.visible !== false);
    
    if (!visibleOptions.length && !visiblePositions.length) return { traces: [], layout: {}, config: {} };

    // Определяем максимальное количество дней до экспирации
    // ВАЖНО: Берём максимум из ВСЕХ видимых опционов, чтобы график показывал весь диапазон
    let maxDays = 30; // По умолчанию
    
    if (visibleOptions.length > 0) {
      // ВАЖНО: Используем UTC для консистентности между часовыми поясами
      // Берём максимальную дату экспирации из всех видимых опционов
      const daysArray = visibleOptions.map(opt => {
        if (opt.date) {
          return getDaysUntilExpirationUTC(opt.date);
        }
        return 0;
      }).filter(d => d > 0);
      
      if (daysArray.length > 0) {
        maxDays = Math.max(...daysArray);
      }
    }

    // Создаем массив прошедших дней от 0 до maxDays (слева направо)
    // ЗАЧЕМ: Короткие опционы истекают раньше (в начале графика), длинные - позже
    const daysPassedArray = Array.from({ length: maxDays + 1 }, (_, i) => i);
    
    // Текущее положение на графике - это daysPassed
    const currentPosition = Math.min(daysPassed, maxDays);
    
    const traces = [];
    
    // Палитра цветов для опционов (как на основном графике)
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

    // Трассировки для позиций базового актива (если они есть)
    // P&L акций не зависит от времени - горизонтальная линия
    if (visiblePositions.length > 0) {
      visiblePositions.forEach((position) => {
        const positionPL = calculateUnderlyingPL(targetPrice, position);
        const positionQty = Math.abs(Number(position.quantity) || 0);
        const positionType = position.type === 'LONG' ? 'LONG' : 'SHORT';
        const color = position.type === 'LONG'
          ? 'rgba(34, 197, 94, 0.75)'
          : 'rgba(239, 68, 68, 0.75)';
        const series = daysPassedArray.map(() => positionPL);

        traces.push({
          x: daysPassedArray,
          y: series,
          name: `${positionType} ${positionQty} ${position.ticker || 'SHARES'}`,
          type: 'scatter',
          mode: 'lines',
          line: { color, width: 3, dash: 'dot' },
          hovertemplate:
            `<b>${positionType} ${positionQty} ${position.ticker || 'SHARES'}</b><br>` +
            `Entry: $${(Number(position.price) || 0).toFixed(2)}<br>` +
            'P&L: $%{y:.2f}<br>' +
            '<extra></extra>'
        });
      });
    }

    // Трассировки для каждого опциона
    // ВАЖНО: Короткие опционы истекают раньше (в начале графика)
    // После истечения P&L фиксируется на значении экспирации
    if (showOptionLines) {
      visibleOptions.forEach((option, idx) => {
        const optionPL = daysPassedArray.map(currentDaysPassed => {
          // Вычисляем оставшиеся дни до экспирации для этого опциона
          const daysRemaining = calculateDaysRemainingForOption(option, currentDaysPassed);
          return calculateOptionPL(option, daysRemaining);
        });
        const color = optionColors[idx % optionColors.length];
        const label = `${option.action} ${option.type} $${option.strike}`;

        traces.push({
          x: daysPassedArray,
          y: optionPL,
          name: label,
          type: 'scatter',
          mode: 'lines',
          line: { color, width: 1, dash: 'solid' },
          hovertemplate: '<b>%{fullData.name}</b><br>' +
                        'P&L: $%{y:.2f}<br>' +
                        '<extra></extra>'
        });
      });
    }

    // Трассировка для общего P&L (только видимые позиции и опционы)
    const totalPL = daysPassedArray.map(currentDaysPassed => {
      let total = 0;
      
      // P&L от видимых позиций базового актива (не зависит от времени)
      visiblePositions.forEach(pos => {
        const quantity = Number(pos.quantity) || 0;
        const entryPrice = Number(pos.price) || 0;
        
        if (pos.type === 'LONG') {
          total += targetPrice * quantity - entryPrice * quantity;
        } else if (pos.type === 'SHORT') {
          total += entryPrice * quantity - targetPrice * quantity;
        }
      });
      
      // P&L от видимых опционов (с учётом индивидуальной даты экспирации)
      visibleOptions.forEach(opt => {
        const daysRemaining = calculateDaysRemainingForOption(opt, currentDaysPassed);
        total += calculateOptionPL(opt, daysRemaining);
      });
      
      return total;
    });

    // Зеленая часть (прибыль) - точно как на основном графике
    const greenY = totalPL.map(pl => pl >= 0 ? pl : null);
    traces.push({
      x: daysPassedArray,
      y: greenY,
      type: 'scatter',
      mode: 'lines',
      name: 'Total P&L',
      line: {
        color: '#10B981', // зеленый
        width: 4
      },
      showlegend: true,
      hovertemplate: '<b>Total P&L</b><br>' +
                    'P&L: $%{y:.2f}<br>' +
                    '<extra></extra>'
    });

    // Красная часть (убыток) - точно как на основном графике
    const redY = totalPL.map(pl => pl < 0 ? pl : null);
    traces.push({
      x: daysPassedArray,
      y: redY,
      type: 'scatter',
      mode: 'lines',
      name: 'Total P&L',
      line: {
        color: '#EF4444', // красный
        width: 4
      },
      showlegend: false,
      hovertemplate: '<b>Total P&L</b><br>' +
                    'P&L: $%{y:.2f}<br>' +
                    '<extra></extra>'
    });

    // Цвета темы (точно как на основном графике)
    const themeColors = {
      background: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)',
      paper: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)',
      text: isDarkMode ? 'hsl(0, 0%, 90%)' : 'hsl(222.2, 47.4%, 11.2%)',
      grid: isDarkMode ? 'hsl(0, 0%, 20%)' : 'hsl(214.3, 31.8%, 91.4%)',
      currentDay: '#06b6d4',
      zeroline: '#06b6d4',
      annotationBg: isDarkMode ? 'rgba(10, 10, 10, 0.95)' : 'rgba(255, 255, 255, 0.95)'
    };

    // Shapes для линий (точно как на основном графике)
    const shapes = [
      // Вертикальная линия текущего положения (daysPassed)
      {
        type: 'line',
        x0: currentPosition,
        x1: currentPosition,
        yref: 'paper',
        y0: 0,
        y1: 1,
        line: {
          color: themeColors.currentDay,
          width: 1,
          dash: 'dash'
        }
      }
    ];

    // Вычисляем текущую дату на основе daysPassed
    // ВАЖНО: Используем UTC для консистентности между часовыми поясами
    let currentDateText = '';
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const simulatedDate = new Date(todayUTC);
    simulatedDate.setUTCDate(simulatedDate.getUTCDate() + currentPosition);
    
    const day = String(simulatedDate.getUTCDate()).padStart(2, '0');
    const month = String(simulatedDate.getUTCMonth() + 1).padStart(2, '0');
    const year = simulatedDate.getUTCFullYear();
    
    // Вычисляем оставшиеся дни до максимальной экспирации
    const daysRemaining = Math.max(0, maxDays - currentPosition);
    currentDateText = `${day}.${month}.${year}. Прошло: ${currentPosition} дн.`;

    // Аннотация с текстом над вертикальной линией
    const annotations = [
      {
        x: currentPosition,
        y: 1,
        yref: 'paper',
        text: currentDateText,
        showarrow: false,
        xanchor: 'center',
        yanchor: 'bottom',
        font: {
          color: themeColors.currentDay,
          size: 12,
          weight: 'bold'
        },
        bgcolor: themeColors.annotationBg,
        borderpad: 6,
        bordercolor: themeColors.currentDay,
        borderwidth: 1
      }
    ];

    // Layout для графика (точно как на основном графике)
    const layout = {
      paper_bgcolor: themeColors.paper,
      plot_bgcolor: themeColors.background,
      xaxis: {
        gridcolor: themeColors.grid,
        color: themeColors.text,
        zeroline: true,
        zerolinecolor: themeColors.zeroline,
        zerolinewidth: 2,
        showline: true,
        linecolor: themeColors.grid,
        fixedrange: false,
        title: {
          text: 'Прошедшие дни',
          font: {
            color: themeColors.text,
            size: 14
          }
        }
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

    // Config для кнопок управления (точно как на основном графике)
    const config = {
      displayModeBar: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      displaylogo: false,
      scrollZoom: false,
      toImageButtonOptions: {
        format: 'png',
        filename: 'time_decay_chart',
        height: 800,
        width: 1200,
        scale: 2
      }
    };

    return { traces, layout, config };
  }, [options, positions, currentPrice, targetPrice, daysPassed, showOptionLines, selectedExpirationDate, calculateUnderlyingPL, calculateOptionPL, calculateDaysRemainingForOption, isDarkMode]);

  if (!options.length && !positions.length) {
    return (
      <div className="h-[600px] flex items-center justify-center border border-dashed border-gray-300 rounded-lg">
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
      />
    </div>
  );
}

export default ExitTimeDecayChart;
