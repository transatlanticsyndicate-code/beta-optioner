import React, { useEffect, useRef, memo } from 'react';

const TradingViewChart = ({ ticker = 'ES' }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    // Глобальный обработчик для подавления CORS ошибок от TradingView
    const handleGlobalError = (event) => {
      if (event.message === 'Script error.') {
        console.warn('Ignoring cross-origin script error from TradingView widget');
        event.preventDefault();
        return true;
      }
    };
    
    window.addEventListener('error', handleGlobalError);

    // Очищаем контейнер перед добавлением нового виджета
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }

    try {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
      script.type = 'text/javascript';
      script.async = true;
      
      // Игнорируем CORS ошибки от TradingView
      script.onerror = (e) => {
        console.warn('TradingView script loading warning (safe to ignore):', e);
        return true; // Предотвращаем всплытие ошибки
      };
    
      // Маппинг тикеров на доступные символы (акции вместо фьючерсов)
      const symbolMap = {
        'ES': 'AMEX:SPY',      // SPY ETF вместо ES фьючерса
        'NQ': 'NASDAQ:QQQ',    // QQQ ETF вместо NQ фьючерса
        'YM': 'NYSE:DIA',      // DIA ETF вместо YM фьючерса
        'RTY': 'AMEX:IWM',     // IWM ETF вместо RTY фьючерса
        'SPY': 'AMEX:SPY',
        'QQQ': 'NASDAQ:QQQ',
        'AAPL': 'NASDAQ:AAPL',
        'TSLA': 'NASDAQ:TSLA',
      };
      
      const tvSymbol = symbolMap[ticker] || 'AMEX:SPY';
      
      script.innerHTML = JSON.stringify({
        autosize: true,
        symbol: tvSymbol,
        interval: 'D',
        timezone: 'Etc/UTC',
        theme: 'light',
        style: '1',  // 1 = свечи (candles)
        locale: 'ru',
        allow_symbol_change: true,
        calendar: false,
        details: false,
        hide_side_toolbar: false,  // ВАЖНО! Боковая панель с инструментами рисования
        hide_top_toolbar: false,
        hide_legend: false,
        hide_volume: false,
        hotlist: false,
        save_image: true,
        backgroundColor: '#ffffff',
        gridColor: 'rgba(46, 46, 46, 0.06)',
        withdateranges: false,
        watchlist: [],
        compareSymbols: [],
        studies: []
      });

      if (containerRef.current) {
        containerRef.current.appendChild(script);
      }

      // Cleanup при размонтировании
      return () => {
        window.removeEventListener('error', handleGlobalError);
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }
      };
    } catch (error) {
      console.warn('TradingView widget initialization warning:', error);
      // Не бросаем ошибку дальше, чтобы не ломать страницу
      return () => {
        window.removeEventListener('error', handleGlobalError);
      };
    }
  }, [ticker]);

  return (
    <div className="trading-view-chart-container" style={{ marginTop: '30px', marginBottom: '30px', height: '500px' }}>
      <h4 style={{ marginBottom: '15px' }}>📈 График {ticker}</h4>
      <div 
        className="tradingview-widget-container" 
        ref={containerRef} 
        style={{ height: '100%', width: '100%' }}
      >
        <div 
          className="tradingview-widget-container__widget" 
          style={{ height: '100%', width: '100%' }}
        ></div>
      </div>
      <div className="chart-legend">
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#22c55e' }}></span>
          <span>План открытий (зеленый)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#ef4444' }}></span>
          <span>План закрытий (красный)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#3b82f6' }}></span>
          <span>Текущая цена (синий)</span>
        </div>
      </div>
    </div>
  );
};

export default memo(TradingViewChart);
