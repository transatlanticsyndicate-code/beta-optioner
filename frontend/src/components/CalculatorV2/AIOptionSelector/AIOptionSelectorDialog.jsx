/**
 * Диалог ИИ подбора опциона
 * ЗАЧЕМ: Предоставляет интерфейс для интеллектуального подбора опционов
 * Затрагивает: калькулятор опционов, API ИИ-анализа
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Loader2, Sparkles, Shield, TrendingUp, TrendingDown } from 'lucide-react';
import { 
  getAllPutOptionsForAnalysis, 
  filterAndRankPutOptions,
  filterAndRankPutOptionsWithBestDay,
  getAllCallOptionsForAnalysis,
  filterAndRankCallOptions,
  filterAndRankCallOptionsWithBestDay,
  filterAndRankSellPutOptions,
  filterAndRankSellPutOptionsWithBestDay
} from './aiOptionSelectorUtils';

/**
 * Компонент диалога ИИ подбора опциона
 * ЗАЧЕМ: Позволяет пользователю получить рекомендации по выбору опционов
 * @param {boolean} isOpen - Состояние открытия диалога
 * @param {function} onClose - Функция закрытия диалога
 * @param {string} selectedTicker - Выбранный тикер
 * @param {number} currentPrice - Текущая цена актива
 * @param {array} positions - Позиции базового актива
 * @param {function} onAddOption - Функция добавления опциона в калькулятор
 */
function AIOptionSelectorDialog({ 
  isOpen, 
  onClose, 
  selectedTicker,
  currentPrice,
  positions = [],
  options = [], // Опционы из калькулятора для проверки наличия BuyPUT
  onAddOption 
}) {
  // Вычисляем цену входа из первой позиции базового актива
  // ЗАЧЕМ: Используется как база для расчёта целей вверх/вниз
  const entryPrice = useMemo(() => {
    if (positions && positions.length > 0) {
      return positions[0].price || currentPrice || 0;
    }
    return currentPrice || 0;
  }, [positions, currentPrice]);

  // Находим BuyPUT опцион в калькуляторе
  // ЗАЧЕМ: Для подбора BuyCALL нужен уже выбранный BuyPUT
  const existingBuyPut = useMemo(() => {
    if (!options || options.length === 0) return null;
    return options.find(opt => 
      opt.type?.toUpperCase() === 'PUT' && 
      opt.action?.toLowerCase() === 'buy' &&
      opt.visible !== false
    );
  }, [options]);

  // Параметры подбора BuyPUT
  const [riskPercent, setRiskPercent] = useState(5); // Общий риск, % (для расчётов по низу)
  const [optionRiskPercent, setOptionRiskPercent] = useState(5); // Риск опциона, % (для расчётов по верху)
  const [targetUpPercent, setTargetUpPercent] = useState(5); // Цель вверх, %
  const [targetUpPrice, setTargetUpPrice] = useState(0); // Цель вверх, цена
  const [targetDownPercent, setTargetDownPercent] = useState(5); // Цель вниз, %
  const [targetDownPrice, setTargetDownPrice] = useState(0); // Цель вниз, цена
  const [daysAfterEntry, setDaysAfterEntry] = useState(5); // Дней после входа (общий для обоих табов)
  const [findBestDay, setFindBestDay] = useState(true); // Подобрать лучший день для BuyPUT (по умолчанию включен)
  const [filterByLiquidity, setFilterByLiquidity] = useState(true); // Учитывать ликвидность (OI)
  const [minOpenInterest, setMinOpenInterest] = useState(100); // Минимальный OI
  const [showTotalPL, setShowTotalPL] = useState(false); // Показывать Общий P&L
  const [onlyBalanced, setOnlyBalanced] = useState(false); // Только балансные опционы
  const [balanceTolerance, setBalanceTolerance] = useState(10); // Погрешность балансировки, %
  
  // Параметры подбора BuyCALL (изолированные от BuyPUT)
  const [callTargetUpPercent, setCallTargetUpPercent] = useState(2.44); // Цель вверх, %
  const [callTargetUpPrice, setCallTargetUpPrice] = useState(0); // Цель вверх, цена
  const [callTargetDownPercent, setCallTargetDownPercent] = useState(2.44); // Цель вниз, %
  const [callTargetDownPrice, setCallTargetDownPrice] = useState(0); // Цель вниз, цена
  const [callBreakevenAtDown, setCallBreakevenAtDown] = useState(false); // Безубыток опциона по низу
  const [callDaysAfterEntry, setCallDaysAfterEntry] = useState(5); // Дней после входа для BuyCALL
  const [callFindBestDay, setCallFindBestDay] = useState(true); // Подобрать лучший день для BuyCALL (по умолчанию включен)
  const [callFilterByLiquidity, setCallFilterByLiquidity] = useState(true); // Ликвидность для BuyCALL
  const [callMinOpenInterest, setCallMinOpenInterest] = useState(100); // Минимальный OI для BuyCALL
  
  // Параметры подбора SellPUT (изолированные от BuyCALL)
  const [sellPutTargetUpPercent, setSellPutTargetUpPercent] = useState(2.44); // Цель вверх, %
  const [sellPutTargetUpPrice, setSellPutTargetUpPrice] = useState(0); // Цель вверх, цена
  const [sellPutTargetDownPercent, setSellPutTargetDownPercent] = useState(2.44); // Цель вниз, %
  const [sellPutTargetDownPrice, setSellPutTargetDownPrice] = useState(0); // Цель вниз, цена
  const [sellPutBreakevenAtDown, setSellPutBreakevenAtDown] = useState(false); // Безубыток опциона по низу
  const [sellPutDaysAfterEntry, setSellPutDaysAfterEntry] = useState(5); // Дней после входа для SellPUT
  const [sellPutFindBestDay, setSellPutFindBestDay] = useState(true); // Подобрать лучший день для SellPUT (по умолчанию включен)
  const [sellPutFilterByLiquidity, setSellPutFilterByLiquidity] = useState(true); // Ликвидность для SellPUT
  const [sellPutMinOpenInterest, setSellPutMinOpenInterest] = useState(100); // Минимальный OI для SellPUT
  
  // Общие настройки для всех видов подбора
  const [maxDaysAhead, setMaxDaysAhead] = useState(60); // Дистанция просмотра в днях
  
  // Состояние загрузки
  const [isLoading, setIsLoading] = useState(false);
  
  // Результаты анализа (раздельные для PUT, CALL и SellPUT)
  const [putAnalysisResult, setPutAnalysisResult] = useState(null);
  const [callAnalysisResult, setCallAnalysisResult] = useState(null);
  const [sellPutAnalysisResult, setSellPutAnalysisResult] = useState(null);

  // Инициализация цен при открытии диалога или изменении текущей рыночной цены
  // ВАЖНО: Расчёт вверх/вниз от текущей цены, а не от цены входа
  useEffect(() => {
    if (isOpen && currentPrice > 0) {
      // Вычисляем цены на основе процентов для BuyPUT (от текущей цены)
      setTargetUpPrice(Number((currentPrice * (1 + targetUpPercent / 100)).toFixed(2)));
      setTargetDownPrice(Number((currentPrice * (1 - targetDownPercent / 100)).toFixed(2)));
      // Вычисляем цены на основе процентов для BuyCALL (от текущей цены)
      setCallTargetUpPrice(Number((currentPrice * (1 + callTargetUpPercent / 100)).toFixed(2)));
      setCallTargetDownPrice(Number((currentPrice * (1 - callTargetDownPercent / 100)).toFixed(2)));
      // Вычисляем цены на основе процентов для SellPUT (от текущей цены)
      setSellPutTargetUpPrice(Number((currentPrice * (1 + sellPutTargetUpPercent / 100)).toFixed(2)));
      setSellPutTargetDownPrice(Number((currentPrice * (1 - sellPutTargetDownPercent / 100)).toFixed(2)));
    }
  }, [isOpen, currentPrice]);

  // Обработчик изменения процента цели вверх (от текущей цены)
  const handleTargetUpPercentChange = (value) => {
    if (value === '') {
      setTargetUpPercent('');
      return;
    }
    const percent = parseFloat(value);
    setTargetUpPercent(percent);
    if (currentPrice > 0 && !isNaN(percent)) {
      setTargetUpPrice(Number((currentPrice * (1 + percent / 100)).toFixed(2)));
    }
  };

  // Обработчик изменения цены цели вверх (пересчёт процента от текущей цены)
  const handleTargetUpPriceChange = (value) => {
    if (value === '') {
      setTargetUpPrice('');
      return;
    }
    const price = parseFloat(value);
    setTargetUpPrice(price);
    if (currentPrice > 0 && !isNaN(price)) {
      setTargetUpPercent(Number((((price - currentPrice) / currentPrice) * 100).toFixed(2)));
    }
  };

  // Обработчик изменения процента цели вниз (от текущей цены)
  const handleTargetDownPercentChange = (value) => {
    if (value === '') {
      setTargetDownPercent('');
      return;
    }
    const percent = parseFloat(value);
    setTargetDownPercent(percent);
    if (currentPrice > 0 && !isNaN(percent)) {
      setTargetDownPrice(Number((currentPrice * (1 - percent / 100)).toFixed(2)));
    }
  };

  // Обработчик изменения цены цели вниз (пересчёт процента от текущей цены)
  const handleTargetDownPriceChange = (value) => {
    if (value === '') {
      setTargetDownPrice('');
      return;
    }
    const price = parseFloat(value);
    setTargetDownPrice(price);
    if (currentPrice > 0 && !isNaN(price)) {
      setTargetDownPercent(Number((((currentPrice - price) / currentPrice) * 100).toFixed(2)));
    }
  };

  // Обработчики для BuyCALL (от текущей цены)
  const handleCallTargetUpPercentChange = (value) => {
    if (value === '') {
      setCallTargetUpPercent('');
      return;
    }
    const percent = parseFloat(value);
    setCallTargetUpPercent(percent);
    if (currentPrice > 0 && !isNaN(percent)) {
      setCallTargetUpPrice(Number((currentPrice * (1 + percent / 100)).toFixed(2)));
    }
  };

  const handleCallTargetUpPriceChange = (value) => {
    if (value === '') {
      setCallTargetUpPrice('');
      return;
    }
    const price = parseFloat(value);
    setCallTargetUpPrice(price);
    if (currentPrice > 0 && !isNaN(price)) {
      setCallTargetUpPercent(Number((((price - currentPrice) / currentPrice) * 100).toFixed(2)));
    }
  };

  const handleCallTargetDownPercentChange = (value) => {
    if (value === '') {
      setCallTargetDownPercent('');
      return;
    }
    const percent = parseFloat(value);
    setCallTargetDownPercent(percent);
    if (currentPrice > 0 && !isNaN(percent)) {
      setCallTargetDownPrice(Number((currentPrice * (1 - percent / 100)).toFixed(2)));
    }
  };

  const handleCallTargetDownPriceChange = (value) => {
    if (value === '') {
      setCallTargetDownPrice('');
      return;
    }
    const price = parseFloat(value);
    setCallTargetDownPrice(price);
    if (currentPrice > 0 && !isNaN(price)) {
      setCallTargetDownPercent(Number((((currentPrice - price) / currentPrice) * 100).toFixed(2)));
    }
  };

  // Обработчики для SellPUT (изолированные от BuyCALL)
  const handleSellPutTargetUpPercentChange = (value) => {
    if (value === '') {
      setSellPutTargetUpPercent('');
      return;
    }
    const percent = parseFloat(value);
    setSellPutTargetUpPercent(percent);
    if (currentPrice > 0 && !isNaN(percent)) {
      setSellPutTargetUpPrice(Number((currentPrice * (1 + percent / 100)).toFixed(2)));
    }
  };

  const handleSellPutTargetUpPriceChange = (value) => {
    if (value === '') {
      setSellPutTargetUpPrice('');
      return;
    }
    const price = parseFloat(value);
    setSellPutTargetUpPrice(price);
    if (currentPrice > 0 && !isNaN(price)) {
      setSellPutTargetUpPercent(Number((((price - currentPrice) / currentPrice) * 100).toFixed(2)));
    }
  };

  const handleSellPutTargetDownPercentChange = (value) => {
    if (value === '') {
      setSellPutTargetDownPercent('');
      return;
    }
    const percent = parseFloat(value);
    setSellPutTargetDownPercent(percent);
    if (currentPrice > 0 && !isNaN(percent)) {
      setSellPutTargetDownPrice(Number((currentPrice * (1 - percent / 100)).toFixed(2)));
    }
  };

  const handleSellPutTargetDownPriceChange = (value) => {
    if (value === '') {
      setSellPutTargetDownPrice('');
      return;
    }
    const price = parseFloat(value);
    setSellPutTargetDownPrice(price);
    if (currentPrice > 0 && !isNaN(price)) {
      setSellPutTargetDownPercent(Number((((currentPrice - price) / currentPrice) * 100).toFixed(2)));
    }
  };

  // Обработчик запуска анализа BuyPUT
  const handleAnalyze = async () => {
    setIsLoading(true);
    setPutAnalysisResult(null);
    
    try {
      // Получаем количество из первой позиции
      const positionQuantity = positions[0]?.quantity || 100;
      
      // ШАГ 1-2: Получаем ВСЕ даты экспирации и PUT опционы для каждой даты
      // ЗАЧЕМ: Анализируем все доступные опционы в заданном диапазоне дней
      console.log('[AISelector] Начинаем подбор для', selectedTicker, 'дистанция:', maxDaysAhead, 'дней', 'findBestDay:', findBestDay);
      
      // При поиске лучшего дня — минимальная дата экспирации = 1 день
      const minDaysForExpiration = findBestDay ? 1 : daysAfterEntry;
      const optionsData = await getAllPutOptionsForAnalysis(selectedTicker, currentPrice, minDaysForExpiration, maxDaysAhead);
      
      if (optionsData.length === 0) {
        setPutAnalysisResult({
          status: 'error',
          message: 'Не найдены подходящие даты экспирации'
        });
        return;
      }
      
      // Подсчитываем общее количество опционов
      const totalPuts = optionsData.reduce((sum, d) => sum + d.puts.length, 0);
      
      console.log(`[AISelector] Найдено ${totalPuts} PUT опционов, фильтруем по критериям риска...`);
      console.log(`[AISelector] Параметры: daysAfterEntry=${daysAfterEntry}, findBestDay=${findBestDay}, общий риск=${riskPercent}%, риск опциона=${optionRiskPercent}%`);
      
      let recommendations;
      
      if (findBestDay) {
        // РЕЖИМ: Подбор лучшего дня выхода
        // ЗАЧЕМ: Перебираем все дни и находим оптимальный для каждого опциона
        recommendations = filterAndRankPutOptionsWithBestDay({
          optionsData,
          entryPrice,
          positionQuantity,
          targetUpPrice,
          targetDownPrice,
          maxRiskPercent: riskPercent,
          optionRiskPercent,
          filterByLiquidity,
          minOpenInterest,
          onlyBalanced,
          balanceTolerance,
          maxDaysToCheck: maxDaysAhead
        });
      } else {
        // РЕЖИМ: Фиксированный день выхода
        // ШАГ 3-5: Фильтрация по критериям риска на дату выхода
        // ЗАЧЕМ: Два критерия — общий риск по низу и риск опциона по верху
        recommendations = filterAndRankPutOptions({
          optionsData,
          entryPrice,
          positionQuantity,
          targetUpPrice,
          targetDownPrice,
          maxRiskPercent: riskPercent, // Общий риск по низу
          optionRiskPercent, // Риск опциона по верху
          daysAfterEntry,
          filterByLiquidity,
          minOpenInterest,
          onlyBalanced,
          balanceTolerance
        });
      }
      
      console.log(`[AISelector] После фильтрации: ${recommendations.length} подходящих опционов`);
      
      if (recommendations.length === 0) {
        const liquidityNote = filterByLiquidity ? ` и ликвидности (OI≥${minOpenInterest})` : '';
        const dayNote = findBestDay ? 'с автоподбором дня' : `на ${daysAfterEntry} день после входа`;
        setPutAnalysisResult({
          status: 'warning',
          message: `Найдено ${totalPuts} PUT опционов, но ни один не соответствует критериям: общий риск ≤${riskPercent}%, риск опциона ≤${optionRiskPercent}%${liquidityNote} ${dayNote}. Попробуйте увеличить допустимый риск или снизить требования к ликвидности.`,
          optionsData,
          recommendations: []
        });
        return;
      }
      
      // Берём топ-10 лучших рекомендаций
      const topRecommendations = recommendations.slice(0, 10);
      
      const liquidityNote = filterByLiquidity ? `, OI≥${minOpenInterest}` : '';
      const dayNote = findBestDay ? ', лучший день' : ` на ${daysAfterEntry} день`;
      setPutAnalysisResult({
        status: 'success',
        message: `Найдено ${recommendations.length} опционов (P&L${dayNote}, общий риск ≤${riskPercent}%, риск опциона ≤${optionRiskPercent}%${liquidityNote})`,
        optionsData,
        recommendations: topRecommendations,
        daysAfterEntry: findBestDay ? null : daysAfterEntry, // null означает что день подобран автоматически
        findBestDay // Передаём флаг для отображения в результатах
      });
      
    } catch (error) {
      console.error('Ошибка ИИ-анализа:', error);
      setPutAnalysisResult({
        status: 'error',
        message: `Ошибка: ${error.message}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Обработчик запуска анализа BuyCALL
  const handleAnalyzeCall = async () => {
    console.log('[AISelector] handleAnalyzeCall вызван', { existingBuyPut, isLoading, callDaysAfterEntry });
    
    if (!existingBuyPut) {
      setCallAnalysisResult({
        status: 'error',
        message: 'Сначала выберите BuyPUT опцион в калькуляторе'
      });
      return;
    }
    
    setIsLoading(true);
    setCallAnalysisResult(null);
    
    try {
      const positionQuantity = positions[0]?.quantity || 100;
      
      // Рассчитываем P&L существующего BuyPUT при целевых ценах
      // ЗАЧЕМ: Для подбора CALL нужно знать P&L PUT при росте и падении
      const putContracts = Math.abs(positionQuantity) / 100;
      const putOption = {
        type: 'PUT',
        action: 'Buy',
        strike: existingBuyPut.strike,
        premium: existingBuyPut.premium,
        quantity: putContracts,
        impliedVolatility: existingBuyPut.iv || 0.3
      };
      
      // Импортируем функцию расчёта P&L
      const { calculateOptionPLValue } = await import('../../../utils/optionPricing');
      
      // Дней до экспирации PUT на момент выхода
      const putDaysUntil = existingBuyPut.date ? 
        Math.ceil((new Date(existingBuyPut.date) - new Date()) / (1000 * 60 * 60 * 24)) : 30;
      const putDaysRemaining = Math.max(0, putDaysUntil - callDaysAfterEntry);
      
      // P&L PUT при росте (обычно отрицательный — убыток)
      const putPLAtUp = calculateOptionPLValue(putOption, callTargetUpPrice, callTargetUpPrice, putDaysRemaining);
      // P&L PUT при падении (обычно положительный — прибыль)
      const putPLAtDown = calculateOptionPLValue(putOption, callTargetDownPrice, callTargetDownPrice, putDaysRemaining);
      
      console.log('[AISelector] BuyCALL подбор:', {
        existingBuyPut,
        putPLAtUp,
        putPLAtDown,
        callTargetUpPrice,
        callTargetDownPrice,
        callDaysAfterEntry,
        maxDaysAhead
      });
      
      // Получаем CALL опционы
      const optionsData = await getAllCallOptionsForAnalysis(selectedTicker, currentPrice, callDaysAfterEntry, maxDaysAhead);
      
      if (optionsData.length === 0) {
        setCallAnalysisResult({
          status: 'error',
          message: 'Не найдены подходящие даты экспирации для CALL опционов'
        });
        return;
      }
      
      const totalCalls = optionsData.reduce((sum, d) => sum + d.calls.length, 0);
      console.log(`[AISelector] Найдено ${totalCalls} CALL опционов, фильтруем по критериям компенсации...`);
      
      // Фильтруем CALL опционы по критериям компенсации
      let recommendations;
      if (callFindBestDay) {
        // Режим автоподбора лучшего дня
        recommendations = filterAndRankCallOptionsWithBestDay({
          optionsData,
          putPLAtUp,
          putPLAtDown,
          targetUpPrice: callTargetUpPrice,
          targetDownPrice: callTargetDownPrice,
          positionQuantity,
          filterByLiquidity: callFilterByLiquidity,
          minOpenInterest: callMinOpenInterest,
          requireBreakevenAtDown: callBreakevenAtDown,
          maxDaysToCheck: maxDaysAhead
        });
      } else {
        // Обычный режим с фиксированным днём
        recommendations = filterAndRankCallOptions({
          optionsData,
          putPLAtUp,
          putPLAtDown,
          targetUpPrice: callTargetUpPrice,
          targetDownPrice: callTargetDownPrice,
          daysAfterEntry: callDaysAfterEntry,
          positionQuantity,
          filterByLiquidity: callFilterByLiquidity,
          minOpenInterest: callMinOpenInterest,
          requireBreakevenAtDown: callBreakevenAtDown
        });
      }
      
      console.log(`[AISelector] После фильтрации: ${recommendations.length} подходящих CALL опционов`);
      
      if (recommendations.length === 0) {
        const liquidityNote = callFilterByLiquidity ? `, ликвидность OI≥${callMinOpenInterest}` : '';
        const breakevenNote = callBreakevenAtDown ? ', безубыток по низу' : '';
        setCallAnalysisResult({
          status: 'warning',
          message: `Найдено ${totalCalls} CALL опционов, но ни один не соответствует критериям${liquidityNote}${breakevenNote}. Критерии: при росте прибыль CALL ≥ убыток PUT ($${Math.abs(putPLAtUp || 0).toFixed(0)}), при падении убыток CALL ≤ прибыль PUT ($${(putPLAtDown || 0).toFixed(0)})${callBreakevenAtDown ? ', P&L CALL по низу ≥ 0' : ''}.`,
          optionsData,
          recommendations: []
        });
        return;
      }
      
      const topRecommendations = recommendations.slice(0, 10);
      const liquidityNote = callFilterByLiquidity ? `, OI≥${callMinOpenInterest}` : '';
      const breakevenNote = callBreakevenAtDown ? ', безубыток' : '';
      
      setCallAnalysisResult({
        status: 'success',
        message: `Найдено ${recommendations.length} CALL опционов, компенсирующих BuyPUT${liquidityNote}${breakevenNote}`,
        optionsData,
        recommendations: topRecommendations,
        daysAfterEntry,
        putPLAtUp,
        putPLAtDown
      });
      
    } catch (error) {
      console.error('Ошибка анализа BuyCALL:', error);
      setCallAnalysisResult({
        status: 'error',
        message: `Ошибка: ${error.message}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Обработчик запуска анализа SellPUT (аналог BuyCALL, но с продажей PUT)
  const handleAnalyzeSellPut = async () => {
    console.log('[AISelector] handleAnalyzeSellPut вызван', { existingBuyPut, isLoading, sellPutDaysAfterEntry });
    
    if (!existingBuyPut) {
      setSellPutAnalysisResult({
        status: 'error',
        message: 'Сначала выберите BuyPUT опцион в калькуляторе'
      });
      return;
    }
    
    setIsLoading(true);
    setSellPutAnalysisResult(null);
    
    try {
      const positionQuantity = positions[0]?.quantity || 100;
      
      // Рассчитываем P&L существующего BuyPUT при целевых ценах
      // ЗАЧЕМ: Для подбора SellPUT нужно знать P&L BuyPUT при росте и падении
      const putContracts = Math.abs(positionQuantity) / 100;
      const buyPutOption = {
        type: 'PUT',
        action: 'Buy',
        strike: existingBuyPut.strike,
        premium: existingBuyPut.premium,
        quantity: putContracts,
        impliedVolatility: existingBuyPut.iv || 0.3
      };
      
      // Импортируем функцию расчёта P&L
      const { calculateOptionPLValue } = await import('../../../utils/optionPricing');
      
      // Дней до экспирации BuyPUT на момент выхода
      const putDaysUntil = existingBuyPut.date ? 
        Math.ceil((new Date(existingBuyPut.date) - new Date()) / (1000 * 60 * 60 * 24)) : 30;
      const putDaysRemaining = Math.max(0, putDaysUntil - sellPutDaysAfterEntry);
      
      // P&L BuyPUT при росте (обычно отрицательный — убыток)
      const buyPutPLAtUp = calculateOptionPLValue(buyPutOption, sellPutTargetUpPrice, sellPutTargetUpPrice, putDaysRemaining);
      // P&L BuyPUT при падении (обычно положительный — прибыль)
      const buyPutPLAtDown = calculateOptionPLValue(buyPutOption, sellPutTargetDownPrice, sellPutTargetDownPrice, putDaysRemaining);
      
      console.log('[AISelector] SellPUT подбор:', {
        existingBuyPut,
        buyPutPLAtUp,
        buyPutPLAtDown,
        sellPutTargetUpPrice,
        sellPutTargetDownPrice,
        sellPutDaysAfterEntry,
        maxDaysAhead
      });
      
      // Получаем PUT опционы (используем ту же функцию что для BuyPUT)
      const optionsData = await getAllPutOptionsForAnalysis(selectedTicker, currentPrice, sellPutDaysAfterEntry, maxDaysAhead);
      
      if (optionsData.length === 0) {
        setSellPutAnalysisResult({
          status: 'error',
          message: 'Не найдены подходящие даты экспирации для PUT опционов'
        });
        return;
      }
      
      const totalPuts = optionsData.reduce((sum, d) => sum + d.puts.length, 0);
      console.log(`[AISelector] Найдено ${totalPuts} PUT опционов для SellPUT, фильтруем по критериям компенсации...`);
      
      // Фильтруем PUT опционы по критериям компенсации для продажи
      let recommendations;
      if (sellPutFindBestDay) {
        // Режим автоподбора лучшего дня
        recommendations = filterAndRankSellPutOptionsWithBestDay({
          optionsData,
          buyPutPLAtUp,
          buyPutPLAtDown,
          targetUpPrice: sellPutTargetUpPrice,
          targetDownPrice: sellPutTargetDownPrice,
          positionQuantity,
          filterByLiquidity: sellPutFilterByLiquidity,
          minOpenInterest: sellPutMinOpenInterest,
          requireBreakevenAtDown: sellPutBreakevenAtDown,
          maxDaysToCheck: maxDaysAhead
        });
      } else {
        // Обычный режим с фиксированным днём
        recommendations = filterAndRankSellPutOptions({
          optionsData,
          buyPutPLAtUp,
          buyPutPLAtDown,
          targetUpPrice: sellPutTargetUpPrice,
          targetDownPrice: sellPutTargetDownPrice,
          daysAfterEntry: sellPutDaysAfterEntry,
          positionQuantity,
          filterByLiquidity: sellPutFilterByLiquidity,
          minOpenInterest: sellPutMinOpenInterest,
          requireBreakevenAtDown: sellPutBreakevenAtDown
        });
      }
      
      console.log(`[AISelector] После фильтрации: ${recommendations.length} подходящих SellPUT опционов`);
      
      if (recommendations.length === 0) {
        const liquidityNote = sellPutFilterByLiquidity ? `, ликвидность OI≥${sellPutMinOpenInterest}` : '';
        const breakevenNote = sellPutBreakevenAtDown ? ', безубыток по низу' : '';
        setSellPutAnalysisResult({
          status: 'warning',
          message: `Найдено ${totalPuts} PUT опционов, но ни один не соответствует критериям${liquidityNote}${breakevenNote}. Критерии: при росте прибыль SellPUT ≥ убыток BuyPUT ($${Math.abs(buyPutPLAtUp || 0).toFixed(0)}), при падении убыток SellPUT ≤ прибыль BuyPUT ($${(buyPutPLAtDown || 0).toFixed(0)})${sellPutBreakevenAtDown ? ', P&L SellPUT по низу ≥ 0' : ''}.`,
          optionsData,
          recommendations: []
        });
        return;
      }
      
      const topRecommendations = recommendations.slice(0, 10);
      const liquidityNote = sellPutFilterByLiquidity ? `, OI≥${sellPutMinOpenInterest}` : '';
      const breakevenNote = sellPutBreakevenAtDown ? ', безубыток' : '';
      
      setSellPutAnalysisResult({
        status: 'success',
        message: `Найдено ${recommendations.length} SellPUT опционов, компенсирующих BuyPUT${liquidityNote}${breakevenNote}`,
        optionsData,
        recommendations: topRecommendations,
        daysAfterEntry: sellPutDaysAfterEntry,
        buyPutPLAtUp,
        buyPutPLAtDown
      });
      
    } catch (error) {
      console.error('Ошибка анализа SellPUT:', error);
      setSellPutAnalysisResult({
        status: 'error',
        message: `Ошибка: ${error.message}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Сброс состояния при закрытии
  const handleClose = () => {
    setPutAnalysisResult(null);
    setCallAnalysisResult(null);
    setSellPutAnalysisResult(null);
    setIsLoading(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      {/* Ширина в 2 раза больше чем SaveConfigurationDialog (500px -> 1000px) */}
      <DialogContent className="sm:max-w-[1000px] z-[9999]" style={{ marginTop: '100px' }} onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Подбор опциона
          </DialogTitle>
          {/* Подзаголовок и дистанция просмотра в одну строку */}
          <div className="flex items-center justify-between">
            <DialogDescription className="m-0">
              Интеллектуальный помощник для подбора оптимальной опционной стратегии
            </DialogDescription>
            {/* Дистанция просмотра - общая настройка для всех видов подбора */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                Дистанция просмотра в днях
              </span>
              <Input
                type="number"
                min="7"
                max="365"
                step="1"
                value={maxDaysAhead}
                onChange={(e) => setMaxDaysAhead(parseInt(e.target.value) || 60)}
                className="w-16 h-7 text-center text-sm"
              />
            </div>
          </div>
        </DialogHeader>

        {/* Табы для разных стратегий подбора */}
        <Tabs defaultValue="buyput" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="buyput" className="flex items-center gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white">
              <Shield className="h-4 w-4" />
              BuyPUT (защита)
            </TabsTrigger>
            <TabsTrigger value="buycall" className="flex items-center gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-teal-500 data-[state=active]:text-white">
              <TrendingUp className="h-4 w-4" />
              BuyCALL (компенсация)
            </TabsTrigger>
            <TabsTrigger value="sellput" className="flex items-center gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-red-500 data-[state=active]:text-white">
              <TrendingDown className="h-4 w-4" />
              SellPUT (компенсация)
            </TabsTrigger>
          </TabsList>

          {/* Таб 1: BuyPUT (защита) — текущий функционал */}
          <TabsContent value="buyput">
        <div className="py-2">
          {/* Двухколоночный layout: левая колонка уже, правая шире */}
          <div className="grid grid-cols-[280px_1fr] gap-4">
            {/* Левая колонка - Параметры подбора */}
            <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'rgb(184, 184, 184)' }}>
              <h3 className="text-base font-semibold">Параметры подбора</h3>
              
              {/* Дней после входа */}
              <div className="flex items-center gap-2">
                <Label className={`text-xs whitespace-nowrap ${findBestDay ? 'text-gray-400' : 'text-muted-foreground'}`}>
                  Дней после входа
                </Label>
                <Input
                  type="number"
                  min="1"
                  max="365"
                  step="1"
                  value={daysAfterEntry}
                  onChange={(e) => setDaysAfterEntry(parseInt(e.target.value) || 1)}
                  className={`w-14 h-7 text-center text-sm ${findBestDay ? 'bg-gray-100 text-gray-400' : ''}`}
                  disabled={findBestDay}
                />
              </div>

              {/* Чекбокс "Подобрать лучший день" */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="findBestDay"
                  checked={findBestDay}
                  onChange={(e) => setFindBestDay(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="findBestDay" className="text-xs text-muted-foreground cursor-pointer">
                  Подобрать лучший день
                </Label>
              </div>

              {/* Бирюзовая линия-разделитель после "Дней после входа" */}
              <div className="border-t" style={{ borderColor: '#14b8a6' }}></div>

              {/* Цель вверх */}
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="text-xs whitespace-nowrap px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                  Вверх %
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={targetUpPercent}
                  onChange={(e) => handleTargetUpPercentChange(e.target.value)}
                  className="w-12 h-7 text-center text-sm"
                />
                <div className="relative">
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={targetUpPrice}
                    onChange={(e) => handleTargetUpPriceChange(e.target.value)}
                    className="w-20 h-7 text-center text-sm pl-4"
                  />
                </div>
              </div>

              {/* Риск опциона (для расчётов по верху) */}
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">
                  Риск опциона, %
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={optionRiskPercent}
                  onChange={(e) => setOptionRiskPercent(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-14 h-7 text-center text-sm"
                />
                <span className="text-xs text-muted-foreground">
                  ${((entryPrice * (positions[0]?.quantity || 100)) * optionRiskPercent / 100).toFixed(0)}
                </span>
              </div>

              {/* Бирюзовая линия-разделитель */}
              <div className="border-t" style={{ borderColor: '#14b8a6' }}></div>

              {/* Цель вниз */}
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="text-xs whitespace-nowrap px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                  Вниз %
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={targetDownPercent}
                  onChange={(e) => handleTargetDownPercentChange(e.target.value)}
                  className="w-12 h-7 text-center text-sm"
                />
                <div className="relative">
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={targetDownPrice}
                    onChange={(e) => handleTargetDownPriceChange(e.target.value)}
                    className="w-20 h-7 text-center text-sm pl-4"
                  />
                </div>
              </div>

              {/* Общий риск (для расчётов по низу) */}
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">
                  Общий риск, %
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-14 h-7 text-center text-sm"
                />
                <span className="text-xs text-muted-foreground">
                  ${((entryPrice * (positions[0]?.quantity || 100)) * riskPercent / 100).toFixed(0)}
                </span>
              </div>

              {/* Бирюзовая линия-разделитель после "Общий риск" */}
              <div className="border-t" style={{ borderColor: '#14b8a6' }}></div>

              {/* Фильтр по ликвидности */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="filterByLiquidity"
                  checked={filterByLiquidity}
                  onChange={(e) => setFilterByLiquidity(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="filterByLiquidity" className="text-xs text-muted-foreground cursor-pointer">
                  Ликвидность
                </Label>
                {filterByLiquidity && (
                  <>
                    <Label className="text-xs text-muted-foreground">OI≥</Label>
                    <Input
                      type="number"
                      min="0"
                      step="10"
                      value={minOpenInterest}
                      onChange={(e) => setMinOpenInterest(parseInt(e.target.value) || 0)}
                      className="w-16 h-7 text-center text-sm"
                    />
                  </>
                )}
              </div>

              {/* Показывать Общий P&L */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showTotalPL"
                  checked={showTotalPL}
                  onChange={(e) => setShowTotalPL(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="showTotalPL" className="text-xs text-muted-foreground cursor-pointer">
                  Показывать Общий P&L
                </Label>
              </div>

              {/* Только балансные опционы */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="onlyBalanced"
                  checked={onlyBalanced}
                  onChange={(e) => setOnlyBalanced(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="onlyBalanced" className="text-xs text-muted-foreground cursor-pointer">
                  Только балансные
                </Label>
                {onlyBalanced && (
                  <>
                    <Label className="text-xs text-muted-foreground">±</Label>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      value={balanceTolerance}
                      onChange={(e) => setBalanceTolerance(e.target.value === '' ? '' : parseInt(e.target.value))}
                      onBlur={(e) => {
                        // При потере фокуса восстанавливаем значение по умолчанию если поле пустое
                        if (e.target.value === '' || isNaN(parseInt(e.target.value))) {
                          setBalanceTolerance(10);
                        }
                      }}
                      className="w-12 h-7 text-center text-sm"
                    />
                    <Label className="text-xs text-muted-foreground">%</Label>
                  </>
                )}
              </div>

              {/* Кнопка анализа */}
              <div className="pt-2">
                <Button
                  onClick={handleAnalyze}
                  disabled={isLoading}
                  className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Анализирую...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Подобрать опционы
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Правая колонка - Результаты */}
            <div className="rounded-lg border p-3 min-h-[280px] overflow-auto" style={{ borderColor: 'rgb(184, 184, 184)' }}>
              {putAnalysisResult ? (
                <div className="space-y-3">
                  {/* Статус сообщение */}
                  <div className={`rounded-lg p-3 text-sm ${
                    putAnalysisResult.status === 'success' 
                      ? 'bg-green-500/10 border border-green-500/30 text-green-700' 
                      : putAnalysisResult.status === 'warning'
                        ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-700'
                        : 'bg-red-500/10 border border-red-500/30 text-red-600'
                  }`}>
                    {putAnalysisResult.message}
                  </div>
                  
                  {/* Таблица рекомендаций */}
                  {putAnalysisResult.recommendations && putAnalysisResult.recommendations.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-sm font-semibold mb-2">
                        Рекомендуемые PUT опционы 
                        <span className="font-normal text-muted-foreground ml-1">
                          (клик для добавления)
                        </span>
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-300">
                              <th className="text-left py-1 px-1">Дата экспирации</th>
                              <th className="text-right py-1 px-1">Страйк</th>
                              <th className="text-right py-1 px-1">Премия</th>
                              {putAnalysisResult.findBestDay && (
                                <th className="text-right py-1 px-1" style={{ backgroundColor: '#fed7aa' }}>День</th>
                              )}
                              <th className="text-right py-1 px-1">Риск%</th>
                              {showTotalPL && (
                                <th className="text-right py-1 px-1" style={{ backgroundColor: '#cce2ff' }}>Общий P&L↓</th>
                              )}
                              {showTotalPL && (
                                <th className="text-right py-1 px-1" style={{ backgroundColor: '#cce2ff' }}>Общий P&L↑</th>
                              )}
                              <th className="text-right py-1 px-1">Опцион P&L↓</th>
                              <th className="text-right py-1 px-1">Опцион P&L↑</th>
                            </tr>
                          </thead>
                          <tbody>
                            {putAnalysisResult.recommendations.map((rec, idx) => {
                              // Форматируем дату из YYYY-MM-DD в DD.MM.YY
                              const formatDate = (dateStr) => {
                                if (!dateStr) return '';
                                const [year, month, day] = dateStr.split('-');
                                return `${day}.${month}.${year.slice(2)}`;
                              };
                              // Определяем день выхода: bestExitDay при автоподборе, иначе daysAfterEntry
                              const exitDay = putAnalysisResult.findBestDay ? rec.bestExitDay : (putAnalysisResult.daysAfterEntry || daysAfterEntry);
                              console.log(`🔍 BuyPUT rec[${idx}]: findBestDay=${putAnalysisResult.findBestDay}, rec.bestExitDay=${rec.bestExitDay}, exitDay=${exitDay}`);
                              return (
                                <tr 
                                  key={idx} 
                                  className="border-b border-gray-300 hover:bg-blue-100 cursor-pointer transition-colors"
                                  onClick={() => onAddOption({
                                    ...rec,
                                    // Добавляем параметры для симуляции в калькуляторе
                                    daysAfterEntry: exitDay,
                                    targetUpPrice,
                                    // Параметры для компонента OptionSelectionResult (BuyPUT)
                                    selectionParams: {
                                      optionType: 'PUT', // Тип опциона для отображения
                                      daysAfterEntry: exitDay,
                                      bestExitDay: putAnalysisResult.findBestDay ? rec.bestExitDay : null, // Передаём лучший день если был автоподбор
                                      targetUpPercent,
                                      targetUpPrice,
                                      targetDownPercent,
                                      targetDownPrice,
                                      optionRiskPercent,
                                      riskPercent,
                                      entryPrice,
                                      positionQuantity: positions[0]?.quantity || 100
                                    }
                                  })}
                                  title={`Добавить PUT ${rec.strike} exp ${formatDate(rec.expirationDate)}${putAnalysisResult.findBestDay ? ` (выход на ${rec.bestExitDay} день)` : ''}`}
                                >
                                  <td className="py-1 px-1">{formatDate(rec.expirationDate)}</td>
                                  <td className="text-right py-1 px-1 font-medium">${rec.strike}</td>
                                  <td className="text-right py-1 px-1">${rec.premium.toFixed(2)}</td>
                                  {putAnalysisResult.findBestDay && (
                                    <td className="text-right py-1 px-1 font-bold" style={{ backgroundColor: '#fed7aa' }}>{rec.bestExitDay}</td>
                                  )}
                                  <td className="text-right py-1 px-1">{rec.riskPercent.toFixed(1)}%</td>
                                  {showTotalPL && (
                                    <td className={`text-right py-1 px-1 ${rec.plAtTargetDown >= 0 ? 'text-green-600' : 'text-red-600'}`} style={{ backgroundColor: '#cce2ff' }}>
                                      {rec.plAtTargetDown >= 0 ? `$${rec.plAtTargetDown.toFixed(0)}` : `-$${Math.abs(rec.plAtTargetDown).toFixed(0)}`}
                                    </td>
                                  )}
                                  {showTotalPL && (
                                    <td className={`text-right py-1 px-1 ${rec.plAtTargetUp >= 0 ? 'text-green-600' : 'text-red-600'}`} style={{ backgroundColor: '#cce2ff' }}>
                                      {rec.plAtTargetUp >= 0 ? `$${rec.plAtTargetUp.toFixed(0)}` : `-$${Math.abs(rec.plAtTargetUp).toFixed(0)}`}
                                    </td>
                                  )}
                                  <td className={`text-right py-1 px-1 ${rec.optionOnlyPLDown >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {rec.optionOnlyPLDown >= 0 ? `$${rec.optionOnlyPLDown.toFixed(0)}` : `-$${Math.abs(rec.optionOnlyPLDown).toFixed(0)}`}
                                  </td>
                                  <td className={`text-right py-1 px-1 ${rec.optionOnlyPLUp >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {rec.optionOnlyPLUp >= 0 ? `$${rec.optionOnlyPLUp.toFixed(0)}` : `-$${Math.abs(rec.optionOnlyPLUp).toFixed(0)}`}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full">
                  <Sparkles className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground text-center">
                    Здесь будут отображаться рекомендации по выбору опционов
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
          </TabsContent>

          {/* Таб 2: BuyCALL (компенсация) */}
          <TabsContent value="buycall">
            {/* Проверка наличия BuyPUT опциона */}
            {!existingBuyPut ? (
              <div className="py-8">
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-6 text-center">
                  <Shield className="h-12 w-12 text-yellow-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-yellow-700 mb-2">
                    Сначала выберите BuyPUT опцион
                  </h3>
                  <p className="text-sm text-yellow-600 mb-4">
                    Для подбора BuyCALL (компенсация) необходимо сначала добавить BuyPUT опцион в калькулятор.
                    <br />
                    BuyCALL подбирается относительно параметров выбранного BuyPUT.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Перейдите на вкладку "BuyPUT (защита)" и подберите опцион защиты.
                  </p>
                </div>
              </div>
            ) : (
            <div className="py-2">
              {/* Двухколоночный layout: левая колонка уже, правая шире */}
              <div className="grid grid-cols-[280px_1fr] gap-4">
                {/* Левая колонка - Параметры подбора */}
                <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'rgb(184, 184, 184)' }}>
                  <h3 className="text-base font-semibold">Параметры подбора</h3>
                  
                  {/* Дней после входа (изолированный для BuyCALL) */}
                  <div className="flex items-center gap-2">
                    <Label className={`text-xs whitespace-nowrap ${callFindBestDay ? 'text-gray-400' : 'text-muted-foreground'}`}>
                      Дней после входа
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      step="1"
                      value={callDaysAfterEntry}
                      onChange={(e) => setCallDaysAfterEntry(parseInt(e.target.value) || 1)}
                      className={`w-14 h-7 text-center text-sm ${callFindBestDay ? 'bg-gray-100 text-gray-400' : ''}`}
                      disabled={callFindBestDay}
                    />
                  </div>

                  {/* Чекбокс "Подобрать лучший день" для BuyCALL */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="callFindBestDay"
                      checked={callFindBestDay}
                      onChange={(e) => setCallFindBestDay(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="callFindBestDay" className="text-xs text-muted-foreground cursor-pointer">
                      Подобрать лучший день
                    </Label>
                  </div>

                  {/* Бирюзовая линия-разделитель после "Дней после входа" */}
                  <div className="border-t" style={{ borderColor: '#14b8a6' }}></div>

                  {/* Цель вверх (изолированные параметры для BuyCALL) */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="text-xs whitespace-nowrap px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                      Вверх %
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={callTargetUpPercent}
                      onChange={(e) => handleCallTargetUpPercentChange(e.target.value)}
                      className="w-14 h-7 text-center text-sm"
                    />
                    <div className="relative">
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={callTargetUpPrice}
                        onChange={(e) => handleCallTargetUpPriceChange(e.target.value)}
                        className="w-20 h-7 text-center text-sm pl-4"
                      />
                    </div>
                  </div>

                  {/* Бирюзовая линия-разделитель */}
                  <div className="border-t" style={{ borderColor: '#14b8a6' }}></div>

                  {/* Цель вниз (изолированные параметры для BuyCALL) */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="text-xs whitespace-nowrap px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                      Вниз %
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={callTargetDownPercent}
                      onChange={(e) => handleCallTargetDownPercentChange(e.target.value)}
                      className="w-14 h-7 text-center text-sm"
                    />
                    <div className="relative">
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={callTargetDownPrice}
                        onChange={(e) => handleCallTargetDownPriceChange(e.target.value)}
                        className="w-20 h-7 text-center text-sm pl-4"
                      />
                    </div>
                  </div>

                  {/* Бирюзовая линия-разделитель */}
                  <div className="border-t" style={{ borderColor: '#14b8a6' }}></div>

                  {/* Фильтр по ликвидности (изолированный для BuyCALL) */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="filterByLiquidityCall"
                      checked={callFilterByLiquidity}
                      onChange={(e) => setCallFilterByLiquidity(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="filterByLiquidityCall" className="text-xs text-muted-foreground cursor-pointer">
                      Ликвидность
                    </Label>
                    {callFilterByLiquidity && (
                      <>
                        <Label className="text-xs text-muted-foreground">OI≥</Label>
                        <Input
                          type="number"
                          min="0"
                          step="10"
                          value={callMinOpenInterest}
                          onChange={(e) => setCallMinOpenInterest(parseInt(e.target.value) || 0)}
                          className="w-16 h-7 text-center text-sm"
                        />
                      </>
                    )}
                  </div>

                  {/* Безубыток опциона по низу */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="callBreakevenAtDown"
                      checked={callBreakevenAtDown}
                      onChange={(e) => setCallBreakevenAtDown(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="callBreakevenAtDown" className="text-xs text-muted-foreground cursor-pointer">
                      Безубыток опциона по низу
                    </Label>
                  </div>

                  {/* Кнопка анализа BuyCALL */}
                  <div className="pt-2">
                    <Button
                      onClick={handleAnalyzeCall}
                      disabled={isLoading}
                      className="bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Анализирую...
                        </>
                      ) : (
                        <>
                          <TrendingUp className="mr-2 h-4 w-4" />
                          Подобрать CALL
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Правая колонка - Результаты BuyCALL */}
                <div className="rounded-lg border p-3 min-h-[280px] overflow-auto" style={{ borderColor: 'rgb(184, 184, 184)' }}>
                  {callAnalysisResult ? (
                    <div className="space-y-3">
                      {/* Статус сообщение */}
                      <div className={`rounded-lg p-3 text-sm ${
                        callAnalysisResult.status === 'success' 
                          ? 'bg-green-500/10 border border-green-500/30 text-green-700' 
                          : callAnalysisResult.status === 'warning'
                            ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-700'
                            : 'bg-red-500/10 border border-red-500/30 text-red-600'
                      }`}>
                        {callAnalysisResult.message}
                      </div>
                      
                      {/* Таблица рекомендаций CALL */}
                      {callAnalysisResult.recommendations && callAnalysisResult.recommendations.length > 0 && (
                        <div className="mt-3">
                          <h4 className="text-sm font-semibold mb-2">
                            Рекомендуемые CALL опционы 
                            <span className="font-normal text-muted-foreground ml-1">
                              (клик для добавления)
                            </span>
                          </h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-300">
                                  <th className="text-left py-1 px-1">Дата</th>
                                  <th className="text-right py-1 px-1">Страйк</th>
                                  <th className="text-right py-1 px-1">Премия</th>
                                  {callFindBestDay && <th className="text-right py-1 px-1">День</th>}
                                  <th className="text-right py-1 px-1">BuyCALL P&L↓</th>
                                  <th className="text-right py-1 px-1">BuyCALL P&L↑</th>
                                  <th className="text-right py-1 px-1">OI</th>
                                </tr>
                              </thead>
                              <tbody>
                                {callAnalysisResult.recommendations.map((rec, idx) => {
                                  const formatDate = (dateStr) => {
                                    if (!dateStr) return '';
                                    const [year, month, day] = dateStr.split('-');
                                    return `${day}.${month}.${year.slice(2)}`;
                                  };
                                  return (
                                    <tr 
                                      key={idx} 
                                      className="border-b border-gray-300 hover:bg-green-100 cursor-pointer transition-colors"
                                      onClick={() => onAddOption({
                                        ...rec,
                                        type: 'CALL',
                                        action: 'Buy',
                                        daysAfterEntry: rec.bestExitDay || callAnalysisResult.daysAfterEntry || daysAfterEntry,
                                        // Параметры для компонента OptionSelectionResult (BuyCALL)
                                        selectionParams: {
                                          optionType: 'CALL',
                                          daysAfterEntry: rec.bestExitDay || callAnalysisResult.daysAfterEntry || daysAfterEntry,
                                          bestExitDay: callFindBestDay ? rec.bestExitDay : null,
                                          targetUpPercent: callTargetUpPercent,
                                          targetUpPrice: callTargetUpPrice,
                                          targetDownPercent: callTargetDownPercent,
                                          targetDownPrice: callTargetDownPrice,
                                          entryPrice,
                                          positionQuantity: positions[0]?.quantity || 100,
                                          callPLAtUp: rec.callPLAtUp,
                                          callPLAtDown: rec.callPLAtDown,
                                          putPLAtUp: callAnalysisResult.putPLAtUp,
                                          putPLAtDown: callAnalysisResult.putPLAtDown
                                        }
                                      })}
                                      title={`Добавить CALL ${rec.strike} exp ${formatDate(rec.expirationDate)}`}
                                    >
                                      <td className="py-1 px-1">{formatDate(rec.expirationDate)}</td>
                                      <td className="text-right py-1 px-1 font-medium">${rec.strike}</td>
                                      <td className="text-right py-1 px-1">${(rec.premium || 0).toFixed(2)}</td>
                                      {callFindBestDay && <td className="text-right py-1 px-1 font-medium text-orange-600">{rec.bestExitDay || '-'}</td>}
                                      <td className={`text-right py-1 px-1 ${(rec.callPLAtDown || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {(rec.callPLAtDown || 0) >= 0 ? `$${(rec.callPLAtDown || 0).toFixed(0)}` : `-$${Math.abs(rec.callPLAtDown || 0).toFixed(0)}`}
                                      </td>
                                      <td className={`text-right py-1 px-1 ${(rec.callPLAtUp || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {(rec.callPLAtUp || 0) >= 0 ? `$${(rec.callPLAtUp || 0).toFixed(0)}` : `-$${Math.abs(rec.callPLAtUp || 0).toFixed(0)}`}
                                      </td>
                                      <td className="text-right py-1 px-1 text-muted-foreground">{rec.openInterest || 0}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full">
                      <TrendingUp className="h-12 w-12 text-muted-foreground/30 mb-4" />
                      <p className="text-muted-foreground text-center">
                        Нажмите "Подобрать CALL" для поиска опционов компенсации
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}
          </TabsContent>

          {/* Таб 3: SellPUT (компенсация) — аналог BuyCALL, но с продажей PUT */}
          <TabsContent value="sellput">
            {/* Проверка наличия BuyPUT опциона */}
            {!existingBuyPut ? (
              <div className="py-8">
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-6 text-center">
                  <Shield className="h-12 w-12 text-yellow-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-yellow-700 mb-2">
                    Сначала выберите BuyPUT опцион
                  </h3>
                  <p className="text-sm text-yellow-600 mb-4">
                    Для подбора SellPUT (компенсация) необходимо сначала добавить BuyPUT опцион в калькулятор.
                    <br />
                    SellPUT подбирается относительно параметров выбранного BuyPUT.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Перейдите на вкладку "BuyPUT (защита)" и подберите опцион защиты.
                  </p>
                </div>
              </div>
            ) : (
            <div className="py-2">
              {/* Двухколоночный layout: левая колонка уже, правая шире */}
              <div className="grid grid-cols-[280px_1fr] gap-4">
                {/* Левая колонка - Параметры подбора */}
                <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'rgb(184, 184, 184)' }}>
                  <h3 className="text-base font-semibold">Параметры подбора</h3>
                  
                  {/* Дней после входа (изолированный для SellPUT) */}
                  <div className="flex items-center gap-2">
                    <Label className={`text-xs whitespace-nowrap ${sellPutFindBestDay ? 'text-gray-400' : 'text-muted-foreground'}`}>
                      Дней после входа
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      step="1"
                      value={sellPutDaysAfterEntry}
                      onChange={(e) => setSellPutDaysAfterEntry(parseInt(e.target.value) || 1)}
                      className={`w-14 h-7 text-center text-sm ${sellPutFindBestDay ? 'bg-gray-100 text-gray-400' : ''}`}
                      disabled={sellPutFindBestDay}
                    />
                  </div>

                  {/* Чекбокс "Подобрать лучший день" для SellPUT */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="sellPutFindBestDay"
                      checked={sellPutFindBestDay}
                      onChange={(e) => setSellPutFindBestDay(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="sellPutFindBestDay" className="text-xs text-muted-foreground cursor-pointer">
                      Подобрать лучший день
                    </Label>
                  </div>

                  {/* Бирюзовая линия-разделитель после "Дней после входа" */}
                  <div className="border-t" style={{ borderColor: '#14b8a6' }}></div>

                  {/* Цель вверх (изолированные параметры для SellPUT) */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="text-xs whitespace-nowrap px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                      Вверх %
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={sellPutTargetUpPercent}
                      onChange={(e) => handleSellPutTargetUpPercentChange(e.target.value)}
                      className="w-14 h-7 text-center text-sm"
                    />
                    <div className="relative">
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={sellPutTargetUpPrice}
                        onChange={(e) => handleSellPutTargetUpPriceChange(e.target.value)}
                        className="w-20 h-7 text-center text-sm pl-4"
                      />
                    </div>
                  </div>

                  {/* Бирюзовая линия-разделитель */}
                  <div className="border-t" style={{ borderColor: '#14b8a6' }}></div>

                  {/* Цель вниз (изолированные параметры для SellPUT) */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="text-xs whitespace-nowrap px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                      Вниз %
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={sellPutTargetDownPercent}
                      onChange={(e) => handleSellPutTargetDownPercentChange(e.target.value)}
                      className="w-14 h-7 text-center text-sm"
                    />
                    <div className="relative">
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={sellPutTargetDownPrice}
                        onChange={(e) => handleSellPutTargetDownPriceChange(e.target.value)}
                        className="w-20 h-7 text-center text-sm pl-4"
                      />
                    </div>
                  </div>

                  {/* Бирюзовая линия-разделитель */}
                  <div className="border-t" style={{ borderColor: '#14b8a6' }}></div>

                  {/* Фильтр по ликвидности (изолированный для SellPUT) */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="filterByLiquiditySellPut"
                      checked={sellPutFilterByLiquidity}
                      onChange={(e) => setSellPutFilterByLiquidity(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="filterByLiquiditySellPut" className="text-xs text-muted-foreground cursor-pointer">
                      Ликвидность
                    </Label>
                    {sellPutFilterByLiquidity && (
                      <>
                        <Label className="text-xs text-muted-foreground">OI≥</Label>
                        <Input
                          type="number"
                          min="0"
                          step="10"
                          value={sellPutMinOpenInterest}
                          onChange={(e) => setSellPutMinOpenInterest(parseInt(e.target.value) || 0)}
                          className="w-16 h-7 text-center text-sm"
                        />
                      </>
                    )}
                  </div>

                  {/* Безубыток опциона по низу */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="sellPutBreakevenAtDown"
                      checked={sellPutBreakevenAtDown}
                      onChange={(e) => setSellPutBreakevenAtDown(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="sellPutBreakevenAtDown" className="text-xs text-muted-foreground cursor-pointer">
                      Безубыток опциона по низу
                    </Label>
                  </div>

                  {/* Кнопка анализа SellPUT */}
                  <div className="pt-2">
                    <Button
                      onClick={handleAnalyzeSellPut}
                      disabled={isLoading}
                      className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Анализирую...
                        </>
                      ) : (
                        <>
                          <TrendingDown className="mr-2 h-4 w-4" />
                          Подобрать SellPUT
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Правая колонка - Результаты SellPUT */}
                <div className="rounded-lg border p-3 min-h-[280px] overflow-auto" style={{ borderColor: 'rgb(184, 184, 184)' }}>
                  {sellPutAnalysisResult ? (
                    <div className="space-y-3">
                      {/* Статус сообщение */}
                      <div className={`rounded-lg p-3 text-sm ${
                        sellPutAnalysisResult.status === 'success' 
                          ? 'bg-green-500/10 border border-green-500/30 text-green-700' 
                          : sellPutAnalysisResult.status === 'warning'
                            ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-700'
                            : 'bg-red-500/10 border border-red-500/30 text-red-600'
                      }`}>
                        {sellPutAnalysisResult.message}
                      </div>
                      
                      {/* Таблица рекомендаций SellPUT */}
                      {sellPutAnalysisResult.recommendations && sellPutAnalysisResult.recommendations.length > 0 && (
                        <div className="mt-3">
                          <h4 className="text-sm font-semibold mb-2">
                            Рекомендуемые SellPUT опционы 
                            <span className="font-normal text-muted-foreground ml-1">
                              (клик для добавления)
                            </span>
                          </h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-300">
                                  <th className="text-left py-1 px-1">Дата</th>
                                  <th className="text-right py-1 px-1">Страйк</th>
                                  <th className="text-right py-1 px-1">Премия</th>
                                  {sellPutFindBestDay && <th className="text-right py-1 px-1">День</th>}
                                  <th className="text-right py-1 px-1">SellPUT P&L↓</th>
                                  <th className="text-right py-1 px-1">SellPUT P&L↑</th>
                                  <th className="text-right py-1 px-1">OI</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sellPutAnalysisResult.recommendations.map((rec, idx) => {
                                  const formatDate = (dateStr) => {
                                    if (!dateStr) return '';
                                    const [year, month, day] = dateStr.split('-');
                                    return `${day}.${month}.${year.slice(2)}`;
                                  };
                                  return (
                                    <tr 
                                      key={idx} 
                                      className="border-b border-gray-300 hover:bg-orange-100 cursor-pointer transition-colors"
                                      onClick={() => onAddOption({
                                        ...rec,
                                        type: 'PUT',
                                        action: 'Sell',
                                        daysAfterEntry: rec.bestExitDay || sellPutAnalysisResult.daysAfterEntry || sellPutDaysAfterEntry,
                                        selectionParams: {
                                          optionType: 'PUT',
                                          optionAction: 'Sell',
                                          daysAfterEntry: rec.bestExitDay || sellPutAnalysisResult.daysAfterEntry || sellPutDaysAfterEntry,
                                          bestExitDay: sellPutFindBestDay ? rec.bestExitDay : null,
                                          targetUpPercent: sellPutTargetUpPercent,
                                          targetUpPrice: sellPutTargetUpPrice,
                                          targetDownPercent: sellPutTargetDownPercent,
                                          targetDownPrice: sellPutTargetDownPrice,
                                          entryPrice,
                                          positionQuantity: positions[0]?.quantity || 100,
                                          sellPutPLAtUp: rec.sellPutPLAtUp,
                                          sellPutPLAtDown: rec.sellPutPLAtDown,
                                          buyPutPLAtUp: sellPutAnalysisResult.buyPutPLAtUp,
                                          buyPutPLAtDown: sellPutAnalysisResult.buyPutPLAtDown
                                        }
                                      })}
                                      title={`Добавить SellPUT ${rec.strike} exp ${formatDate(rec.expirationDate)}`}
                                    >
                                      <td className="py-1 px-1">{formatDate(rec.expirationDate)}</td>
                                      <td className="text-right py-1 px-1 font-medium">${rec.strike}</td>
                                      <td className="text-right py-1 px-1">${(rec.premium || 0).toFixed(2)}</td>
                                      {sellPutFindBestDay && <td className="text-right py-1 px-1 font-medium text-orange-600">{rec.bestExitDay || '-'}</td>}
                                      <td className={`text-right py-1 px-1 ${(rec.sellPutPLAtDown || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {(rec.sellPutPLAtDown || 0) >= 0 ? `$${(rec.sellPutPLAtDown || 0).toFixed(0)}` : `-$${Math.abs(rec.sellPutPLAtDown || 0).toFixed(0)}`}
                                      </td>
                                      <td className={`text-right py-1 px-1 ${(rec.sellPutPLAtUp || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {(rec.sellPutPLAtUp || 0) >= 0 ? `$${(rec.sellPutPLAtUp || 0).toFixed(0)}` : `-$${Math.abs(rec.sellPutPLAtUp || 0).toFixed(0)}`}
                                      </td>
                                      <td className="text-right py-1 px-1 text-muted-foreground">{rec.openInterest || 0}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full">
                      <TrendingDown className="h-12 w-12 text-muted-foreground/30 mb-4" />
                      <p className="text-muted-foreground text-center">
                        Нажмите "Подобрать SellPUT" для поиска опционов компенсации
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default AIOptionSelectorDialog;
