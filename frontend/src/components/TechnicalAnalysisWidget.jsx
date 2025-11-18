import React, { useState } from 'react';
import { TechnicalAnalysis } from 'react-ts-tradingview-widgets';

/**
 * Technical Analysis Widget Component
 * 
 * @param {string} symbol - Тикер (например, "AAPL", "SPY")
 * @param {string} theme - Тема ("light" или "dark")
 * @param {string} locale - Язык ("ru", "en")
 */
function TechnicalAnalysisWidget({ symbol, theme = 'dark', locale = 'ru' }) {
  const [hasError, setHasError] = useState(false);

  if (!symbol) {
    return null;
  }

  if (hasError) {
    return (
      <div className="tradingview-error tech-analysis-error">
        <div className="error-content">
          <h5>Тех. анализ недоступен</h5>
          <p>Не удалось загрузить виджет.</p>
          <button 
            className="btn btn-secondary btn-sm"
            onClick={() => setHasError(false)}
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tradingview-widget-wrapper tech-analysis-wrapper">
      <ErrorBoundary 
        onError={() => setHasError(true)}
        symbol={symbol}
      >
        <TechnicalAnalysis
          symbol={symbol}
          colorTheme={theme}
          locale={locale}
          width="100%"
          height={450}
        />
      </ErrorBoundary>
    </div>
  );
}

/**
 * Error Boundary для отлова ошибок виджета
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    console.error('TechnicalAnalysis Widget Error:', error);
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('TechnicalAnalysis Error Details:', error, errorInfo);
    if (this.props.onError) {
      this.props.onError(error);
    }
  }

  componentDidUpdate(prevProps) {
    // Сбросить ошибку при смене символа
    if (prevProps.symbol !== this.props.symbol && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

export default TechnicalAnalysisWidget;
