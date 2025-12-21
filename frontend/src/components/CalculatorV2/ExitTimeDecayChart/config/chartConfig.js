/**
 * Конфигурация графика временного распада
 * ЗАЧЕМ: Настройки отображения графика Plotly
 * Затрагивает: стиль и поведение графика
 */

// Базовая конфигурация графика
export const getChartConfig = () => ({
  displayModeBar: true,
  displaylogo: false,
  modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
  responsive: true
});

// Настройки layout графика
export const getChartLayout = (isDarkMode, maxDays) => ({
  title: {
    text: 'P&L от времени до экспирации',
    font: { 
      size: 16, 
      color: isDarkMode ? '#e5e7eb' : '#1f2937',
      family: 'Inter, system-ui, sans-serif'
    },
    x: 0.5,
    xanchor: 'center'
  },
  xaxis: {
    title: { 
      text: 'Дни до экспирации',
      font: { 
        size: 14,
        color: isDarkMode ? '#9ca3af' : '#6b7280'
      }
    },
    gridcolor: isDarkMode ? '#374151' : '#e5e7eb',
    zerolinecolor: isDarkMode ? '#4b5563' : '#d1d5db',
    tickfont: { color: isDarkMode ? '#9ca3af' : '#6b7280' },
    range: [0, maxDays],
    autorange: false
  },
  yaxis: {
    title: { 
      text: 'P&L ($)',
      font: { 
        size: 14,
        color: isDarkMode ? '#9ca3af' : '#6b7280'
      }
    },
    gridcolor: isDarkMode ? '#374151' : '#e5e7eb',
    zerolinecolor: isDarkMode ? '#4b5563' : '#d1d5db',
    tickfont: { color: isDarkMode ? '#9ca3af' : '#6b7280' },
    tickformat: ',.0f'
  },
  plot_bgcolor: isDarkMode ? '#1f2937' : '#ffffff',
  paper_bgcolor: isDarkMode ? '#111827' : '#f9fafb',
  hovermode: 'x unified',
  showlegend: true,
  legend: {
    orientation: 'v',
    yanchor: 'top',
    y: 1,
    xanchor: 'left',
    x: 1.02,
    bgcolor: isDarkMode ? 'rgba(31, 41, 55, 0.8)' : 'rgba(255, 255, 255, 0.8)',
    bordercolor: isDarkMode ? '#374151' : '#e5e7eb',
    borderwidth: 1,
    font: { color: isDarkMode ? '#e5e7eb' : '#1f2937' }
  },
  margin: { l: 60, r: 150, t: 60, b: 60 }
});

// Цвета для линий опционов
export const OPTION_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
];
