/**
 * Хук управления состоянием графика
 * ЗАЧЕМ: Централизация всех состояний графика
 */

import { useState, useEffect } from 'react';
import { loadPageState, savePageState as saveState } from '../utils/stateStorage';
import { calculateAverageEntry } from '../utils/priceCalculations';
import { DEFAULT_TICKER } from '../config/chartConfig';

export const useChartState = () => {
  const [ticker, setTicker] = useState(DEFAULT_TICKER);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cachingEnabled, setCachingEnabled] = useState(true);
  
  const [showEntries, setShowEntries] = useState(true);
  const [showAverage, setShowAverage] = useState(true);
  const [showStopLoss, setShowStopLoss] = useState(true);
  const [showExits, setShowExits] = useState(true);
  const [showOptions, setShowOptions] = useState(true);
  
  const [entry1, setEntry1] = useState('');
  const [entry2, setEntry2] = useState('');
  const [averageEntry, setAverageEntry] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [exit1, setExit1] = useState('');
  const [exit2, setExit2] = useState('');

  useEffect(() => {
    const saved = loadPageState();
    if (saved) {
      setTicker(saved.ticker || DEFAULT_TICKER);
      setEntry1(saved.entry1 || '');
      setEntry2(saved.entry2 || '');
      setStopLoss(saved.stopLoss || '');
      setExit1(saved.exit1 || '');
      setExit2(saved.exit2 || '');
      setCachingEnabled(saved.cachingEnabled !== undefined ? saved.cachingEnabled : true);
      setShowEntries(saved.showEntries !== undefined ? saved.showEntries : true);
      setShowAverage(saved.showAverage !== undefined ? saved.showAverage : true);
      setShowStopLoss(saved.showStopLoss !== undefined ? saved.showStopLoss : true);
      setShowExits(saved.showExits !== undefined ? saved.showExits : true);
      setShowOptions(saved.showOptions !== undefined ? saved.showOptions : true);
    }
  }, []);

  const savePageState = () => {
    saveState({
      ticker,
      entry1,
      entry2,
      stopLoss,
      exit1,
      exit2,
      cachingEnabled,
      showEntries,
      showAverage,
      showStopLoss,
      showExits,
      showOptions
    });
  };

  const handleEntry1Change = (value) => {
    setEntry1(value);
    setAverageEntry(calculateAverageEntry(value, entry2));
    savePageState();
  };

  const handleEntry2Change = (value) => {
    setEntry2(value);
    setAverageEntry(calculateAverageEntry(entry1, value));
    savePageState();
  };

  return {
    ticker, setTicker,
    data, setData,
    loading, setLoading,
    error, setError,
    cachingEnabled, setCachingEnabled,
    showEntries, setShowEntries,
    showAverage, setShowAverage,
    showStopLoss, setShowStopLoss,
    showExits, setShowExits,
    showOptions, setShowOptions,
    entry1, handleEntry1Change,
    entry2, handleEntry2Change,
    averageEntry,
    stopLoss, setStopLoss,
    exit1, setExit1,
    exit2, setExit2,
    savePageState
  };
};
