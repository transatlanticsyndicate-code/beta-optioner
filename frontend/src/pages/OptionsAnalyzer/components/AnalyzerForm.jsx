/**
 * Форма анализатора опционов
 * ЗАЧЕМ: Ввод тикера и выбор AI модели
 * Затрагивает: пользовательский ввод, валидация
 */

import React from 'react';

export function AnalyzerForm({ 
  ticker, 
  setTicker, 
  aiModel, 
  onAiModelChange, 
  onAnalyze, 
  isLoading, 
  error 
}) {
  return (
    <div className="analyzer-form">
      <div className="form-group">
        <label htmlFor="ticker" className="form-label">Тикер</label>
        <div className="input-group">
          <input
            id="ticker"
            type="text"
            name="ticker"
            className="ticker-input"
            placeholder="SPY"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyPress={(e) => e.key === 'Enter' && onAnalyze()}
            disabled={isLoading}
            autoComplete="on"
            list="ticker-history"
          />
          <datalist id="ticker-history">
            <option value="SPY" />
            <option value="AAPL" />
            <option value="TSLA" />
            <option value="NVDA" />
            <option value="MSFT" />
          </datalist>
          <select
            className="compact-select"
            value={aiModel}
            onChange={(e) => onAiModelChange(e.target.value)}
            disabled={isLoading}
            title="AI модель"
          >
            <option value="gemini">Gemini</option>
            <option value="claude">Claude</option>
          </select>
          <button
            className="btn btn-primary"
            onClick={onAnalyze}
            disabled={isLoading}
          >
            {isLoading ? 'Анализ...' : 'Анализ'}
          </button>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
