/**
 * Hook для расчёта данных шкалы страйков
 * ЗАЧЕМ: Централизация всех useMemo расчётов
 */

import { useMemo, useCallback, useState, useEffect } from 'react';
import { getOptionsChain } from '../../../services/apiClient';
import {
  calculateStrikeRange,
  calculateFlagColor,
  isTopFlag,
  calculateYLevels,
  groupOptionsByStrike,
  findHotStrikes,
  findHighVolumeStrikes,
  findPinRiskStrikes,
} from './helpers';

/**
 * Hook для расчёта данных шкалы страйков
 */
export function useStrikeData({
  options,
  currentPrice,
  ticker,
  dateColorMap,
  selectedDateFilter,
  selectedExpirationDate,
}) {
  // State для полной карты OI рынка
  const [marketOI, setMarketOI] = useState({ calls: {}, puts: {} });
  const [isLoadingMarketOI, setIsLoadingMarketOI] = useState(false);
  const [marketOICache, setMarketOICache] = useState({});

  // Диапазон страйков
  const strikeRange = useMemo(() => calculateStrikeRange(currentPrice), [currentPrice]);

  // Уникальные даты из опционов
  const uniqueDates = useMemo(() => {
    const dates = new Set();
    options.forEach(opt => { if (opt.date) dates.add(opt.date); });
    return Array.from(dates).sort();
  }, [options]);

  // Цвет даты
  const calculateDateColor = useCallback((date) => {
    if (!date) return null;
    if (dateColorMap && dateColorMap[date]) return dateColorMap[date];
    
    try {
      const expirationDate = new Date(date);
      const today = new Date();
      const daysUntilExpiration = Math.floor((expirationDate - today) / (1000 * 60 * 60 * 24));
      
      if (daysUntilExpiration < 7) return 'rgb(99, 102, 241)';
      if (daysUntilExpiration < 30) return 'rgb(139, 92, 246)';
      return 'rgb(59, 130, 246)';
    } catch (error) {
      return 'rgb(139, 92, 246)';
    }
  }, [dateColorMap]);

  // Флаги (верхние и нижние)
  const { topFlags, bottomFlags, topYLevels, bottomYLevels } = useMemo(() => {
    if (!strikeRange) return { topFlags: [], bottomFlags: [], topYLevels: {}, bottomYLevels: {} };
    
    const validOptions = options.filter(opt => {
      const hasStrike = opt.strike != null && Number(opt.strike) > 0;
      const hasType = opt.type === 'CALL' || opt.type === 'PUT';
      const isVisible = opt.visible !== false;
      const matchesDateFilter = selectedDateFilter === 'all' || opt.date === selectedDateFilter;
      return hasStrike && hasType && isVisible && matchesDateFilter;
    });
    
    const groupedOptions = groupOptionsByStrike(validOptions);
    const top = [];
    const bottom = [];
    
    groupedOptions.forEach(opt => {
      const flag = {
        id: opt.ids.length === 1 ? opt.ids[0] : opt.ids.join('-'),
        optionIds: opt.ids,
        price: Number(opt.strike),
        color: calculateFlagColor(opt),
        count: Math.abs(opt.quantity) > 1 ? Math.abs(opt.quantity) : null,
        type: 'option',
        date: opt.date,
        dateColor: calculateDateColor(opt.date),
      };
      
      if (isTopFlag(opt)) {
        top.push(flag);
      } else {
        bottom.push(flag);
      }
    });
    
    // Флаг тикера
    if (currentPrice > 0 && strikeRange) {
      const centerStrike = Math.round(currentPrice / strikeRange.step) * strikeRange.step;
      top.push({
        id: 'ticker',
        price: centerStrike,
        color: 'rgb(75, 85, 99)',
        label: ticker,
        type: 'ticker',
      });
    }
    
    return {
      topFlags: top,
      bottomFlags: bottom,
      topYLevels: calculateYLevels(top),
      bottomYLevels: calculateYLevels(bottom),
    };
  }, [options, currentPrice, ticker, strikeRange, selectedDateFilter, calculateDateColor]);

  // Hot/Volume/Pin strikes
  const hotStrikes = useMemo(() => findHotStrikes(options), [options]);
  const highVolumeStrikes = useMemo(() => findHighVolumeStrikes(options), [options]);
  const pinRiskStrikes = useMemo(() => findPinRiskStrikes(options, currentPrice), [options, currentPrice]);

  // Высоты столбиков OI
  const { greenBarHeights, redBarHeights } = useMemo(() => {
    if (!strikeRange) return { greenBarHeights: [], redBarHeights: [] };
    
    const callOI = Array(strikeRange.count).fill(0);
    const putOI = Array(strikeRange.count).fill(0);
    
    const isSingleDate = uniqueDates.length === 1;
    const hasMarketData = (selectedDateFilter !== 'all' || isSingleDate) && 
      marketOI?.calls && Object.keys(marketOI.calls).length > 0;
    
    if (hasMarketData) {
      for (let i = 0; i < strikeRange.count; i++) {
        const strike = strikeRange.min + i * strikeRange.step;
        callOI[i] = marketOI.calls[strike] || 0;
        putOI[i] = marketOI.puts[strike] || 0;
      }
    }
    
    const maxCallOI = Math.max(...callOI, 1);
    const maxPutOI = Math.max(...putOI, 1);
    
    return {
      greenBarHeights: callOI.map(oi => Math.floor((oi / maxCallOI) * 30)),
      redBarHeights: putOI.map(oi => Math.floor((oi / maxPutOI) * 30)),
    };
  }, [strikeRange, marketOI, selectedDateFilter, uniqueDates]);

  // Загрузка OI данных
  useEffect(() => {
    if (!ticker) {
      setMarketOI({ calls: {}, puts: {} });
      return;
    }
    
    let dateToLoad = null;
    if (selectedDateFilter !== 'all') dateToLoad = selectedDateFilter;
    else if (selectedExpirationDate) dateToLoad = selectedExpirationDate;
    else if (uniqueDates.length > 0) dateToLoad = uniqueDates[0];
    
    if (!dateToLoad) {
      setMarketOI({ calls: {}, puts: {} });
      return;
    }
    
    if (marketOICache[dateToLoad]) {
      setMarketOI(marketOICache[dateToLoad]);
      return;
    }
    
    setIsLoadingMarketOI(true);
    
    const apiDate = dateToLoad.includes('-') ? dateToLoad : 
      (() => {
        const [day, month, year] = dateToLoad.split('.');
        return `20${year}-${month}-${day}`;
      })();
    
    getOptionsChain(ticker, apiDate)
      .then(data => {
        if (data.status === 'success' && data.options) {
          const calls = {};
          const puts = {};
          data.options.forEach(opt => {
            const strike = Number(opt.strike);
            const oi = opt.open_interest || 0;
            if (opt.type === 'call') calls[strike] = (calls[strike] || 0) + oi;
            else puts[strike] = (puts[strike] || 0) + oi;
          });
          const result = { calls, puts };
          setMarketOI(result);
          setMarketOICache(prev => ({ ...prev, [dateToLoad]: result }));
        }
      })
      .catch(err => console.error('❌ Ошибка загрузки OI:', err))
      .finally(() => setIsLoadingMarketOI(false));
  // ВАЖНО: marketOICache убран из зависимостей чтобы избежать бесконечного цикла!
  }, [ticker, selectedDateFilter, selectedExpirationDate, uniqueDates]);

  return {
    strikeRange,
    uniqueDates,
    topFlags,
    bottomFlags,
    topYLevels,
    bottomYLevels,
    hotStrikes,
    highVolumeStrikes,
    pinRiskStrikes,
    greenBarHeights,
    redBarHeights,
    calculateDateColor,
    isLoadingMarketOI,
  };
}
