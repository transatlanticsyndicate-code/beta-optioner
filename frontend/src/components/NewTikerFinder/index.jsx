/**
 * Компонент NewTikerFinder - универсальный поиск тикеров с отображением цены
 * ЗАЧЕМ: Единый компонент для поиска тикеров разных типов инструментов
 * Затрагивает: калькулятор опционов, новая сделка, аналитика
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { INSTRUMENT_TYPES } from './config/constants';
import { getTickerHistory, saveTickerToHistory, removeTickerFromHistory } from './utils/tickerHistory';
import { detectInstrumentType } from './utils/instrumentDetection';
import { TickerHistory } from './components';

function NewTikerFinder({
  onTickerSelect,
  initialTicker = '',
  initialInstrumentType = 'stock',
  placeholder = 'Введите тикер...',
  showHistory = true,
  autoFocus = false,
  className = ''
}) {
  const [ticker, setTicker] = useState(initialTicker);
  const [instrumentType, setInstrumentType] = useState(initialInstrumentType);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (showHistory) {
      setHistory(getTickerHistory());
    }
  }, [showHistory]);

  const handleTickerChange = useCallback((value) => {
    const upperValue = value.toUpperCase();
    setTicker(upperValue);
    
    if (upperValue.length >= 1) {
      const detectedType = detectInstrumentType(upperValue);
      setInstrumentType(detectedType);
    }
  }, []);

  const handleSubmit = useCallback(() => {
    if (!ticker.trim()) return;
    
    const trimmedTicker = ticker.trim();
    onTickerSelect?.(trimmedTicker, instrumentType);
    
    if (showHistory) {
      const updated = saveTickerToHistory(trimmedTicker, instrumentType);
      setHistory(updated);
    }
  }, [ticker, instrumentType, onTickerSelect, showHistory]);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleHistorySelect = useCallback((historyTicker, historyType) => {
    setTicker(historyTicker);
    setInstrumentType(historyType);
    onTickerSelect?.(historyTicker, historyType);
  }, [onTickerSelect]);

  const handleHistoryRemove = useCallback((tickerToRemove) => {
    const updated = removeTickerFromHistory(tickerToRemove);
    setHistory(updated);
  }, []);

  const handleClear = useCallback(() => {
    setTicker('');
    setInstrumentType('stock');
  }, []);

  return (
    <div className={className}>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={ticker}
            onChange={(e) => handleTickerChange(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className="pl-10 pr-10"
          />
          {ticker && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* <Select value={instrumentType} onValueChange={setInstrumentType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INSTRUMENT_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                <div className="flex items-center gap-2">
                  {type.icon}
                  {type.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select> */}
      </div>
      
      {showHistory && (
        <TickerHistory
          history={history}
          onSelect={handleHistorySelect}
          onRemove={handleHistoryRemove}
        />
      )}
    </div>
  );
}

export default NewTikerFinder;
