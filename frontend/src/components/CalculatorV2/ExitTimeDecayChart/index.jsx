/**
 * График P&L в зависимости от дней до экспирации
 * ЗАЧЕМ: Показывает как меняется P&L при приближении даты экспирации
 * Затрагивает: визуализация временного распада опционов
 */

import React, { useMemo, useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { getDaysUntilExpirationUTC } from '../../../utils/dateUtils';
import { calculateUnderlyingPL, calculateDaysRemainingForOption, calculateOptionPL } from './utils/calculations';
import { getChartConfig, getChartLayout, OPTION_COLORS } from './config/chartConfig';

function ExitTimeDecayChart({ 
  options = [], 
  positions = [], 
  currentPrice = 0,
  targetPrice = 0,
  daysPassed = 0,
  showOptionLines = true,
  selectedExpirationDate = null,
  ivSurface = null,
  dividendYield = 0,
  isAIEnabled = false,
  aiVolatilityMap = {},
  selectedTicker = ''
}) {
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
    console.log('🤖 [ExitTimeDecayChart] Перерисовка графика:', {
      isAIEnabled,
      selectedTicker,
      aiVolatilityMapSize: Object.keys(aiVolatilityMap || {}).length,
      targetPrice,
      optionsCount: options.length
    });
    
    const visibleOptions = options.filter(opt => opt.visible !== false);
    const visiblePositions = positions.filter(pos => pos.visible !== false);
    
    if (!visibleOptions.length && !visiblePositions.length) return { traces: [], layout: {}, config: {} };

    let maxDays = 30;
    
    if (selectedExpirationDate) {
      const daysUntilExpiration = getDaysUntilExpirationUTC(selectedExpirationDate);
      maxDays = Math.max(daysUntilExpiration, 7);
    } else if (visibleOptions.length > 0) {
      maxDays = Math.max(...visibleOptions.map(opt => calculateDaysRemainingForOption(opt, 0)));
    }

    const daysRange = Array.from({ length: maxDays + 1 }, (_, i) => i);
    const traces = [];

    // Линии опционов
    if (showOptionLines && visibleOptions.length > 0) {
      visibleOptions.forEach((option, index) => {
        const plValues = daysRange.map(days => {
          const daysRemaining = calculateDaysRemainingForOption(option, daysPassed);
          if (days > daysRemaining) return null;
          return calculateOptionPL(option, days, targetPrice, currentPrice, ivSurface, dividendYield, isAIEnabled, aiVolatilityMap, selectedTicker);
        });

        traces.push({
          x: daysRange,
          y: plValues,
          type: 'scatter',
          mode: 'lines',
          name: `${option.type.toUpperCase()} $${option.strike}`,
          line: { 
            color: OPTION_COLORS[index % OPTION_COLORS.length],
            width: 1.5,
            dash: 'dot'
          },
          hovertemplate: '<b>%{fullData.name}</b><br>Дни: %{x}<br>P&L: $%{y:,.0f}<extra></extra>'
        });
      });
    }

    // Суммарная линия P&L
    const totalPL = daysRange.map(days => {
      let total = 0;
      
      visibleOptions.forEach(option => {
        const daysRemaining = calculateDaysRemainingForOption(option, daysPassed);
        if (days <= daysRemaining) {
          total += calculateOptionPL(option, days, targetPrice, currentPrice, ivSurface, dividendYield, isAIEnabled, aiVolatilityMap, selectedTicker);
        }
      });
      
      visiblePositions.forEach(position => {
        total += calculateUnderlyingPL(targetPrice, position);
      });
      
      return total;
    });

    traces.push({
      x: daysRange,
      y: totalPL,
      type: 'scatter',
      mode: 'lines',
      name: 'Суммарный P&L',
      line: { color: '#10b981', width: 3 },
      hovertemplate: '<b>Суммарный P&L</b><br>Дни: %{x}<br>P&L: $%{y:,.0f}<extra></extra>'
    });

    // Вертикальная линия текущего дня
    if (daysPassed > 0 && daysPassed <= maxDays) {
      const currentDayPL = totalPL[daysPassed] || 0;
      traces.push({
        x: [daysPassed, daysPassed],
        y: [Math.min(...totalPL) * 1.1, Math.max(...totalPL) * 1.1],
        type: 'scatter',
        mode: 'lines',
        name: `День ${daysPassed}`,
        line: { color: '#ef4444', width: 2, dash: 'dash' },
        hovertemplate: `<b>Текущий день: ${daysPassed}</b><br>P&L: $${currentDayPL.toFixed(0)}<extra></extra>`
      });
    }

    return {
      traces,
      layout: getChartLayout(isDarkMode, maxDays),
      config: getChartConfig()
    };
  }, [options, positions, targetPrice, currentPrice, daysPassed, showOptionLines, selectedExpirationDate, ivSurface, isDarkMode, dividendYield, isAIEnabled, JSON.stringify(aiVolatilityMap), selectedTicker]);

  if (!chartData.traces || chartData.traces.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        <p>Добавьте опционы или позиции для отображения графика</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Plot
        data={chartData.traces}
        layout={chartData.layout}
        config={chartData.config}
        style={{ width: '100%', height: '400px' }}
        useResizeHandler={true}
      />
    </div>
  );
}

export default ExitTimeDecayChart;
