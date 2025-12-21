/**
 * Хук для управления состоянием калькулятора
 * ЗАЧЕМ: Централизованное управление всеми state переменными калькулятора
 * Затрагивает: тикер, цены, позиции, настройки
 */

import { useState, useEffect } from 'react';
import { DEFAULT_SETTINGS } from '../constants';

export function useCalculatorState() {
  // State для тикера и цен
  const [selectedTicker, setSelectedTicker] = useState("");
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState({ value: 0, percent: 0 });
  
  // State для позиций
  const [positions, setPositions] = useState([]);
  const [options, setOptions] = useState([]);
  
  // State для настроек
  const [daysPassed, setDaysPassed] = useState(DEFAULT_SETTINGS.daysPassed);
  const [chartDisplayMode, setChartDisplayMode] = useState(DEFAULT_SETTINGS.chartDisplayMode);
  const [showOptionLines, setShowOptionLines] = useState(DEFAULT_SETTINGS.showOptionLines);
  const [showProbabilityZones, setShowProbabilityZones] = useState(DEFAULT_SETTINGS.showProbabilityZones);
  
  // State для зафиксированных позиций
  const [isLocked, setIsLocked] = useState(false);
  const [savedConfigDate, setSavedConfigDate] = useState(null);
  
  return {
    // Тикер и цены
    selectedTicker,
    setSelectedTicker,
    currentPrice,
    setCurrentPrice,
    priceChange,
    setPriceChange,
    
    // Позиции
    positions,
    setPositions,
    options,
    setOptions,
    
    // Настройки
    daysPassed,
    setDaysPassed,
    chartDisplayMode,
    setChartDisplayMode,
    showOptionLines,
    setShowOptionLines,
    showProbabilityZones,
    setShowProbabilityZones,
    
    // Зафиксированные позиции
    isLocked,
    setIsLocked,
    savedConfigDate,
    setSavedConfigDate,
  };
}
