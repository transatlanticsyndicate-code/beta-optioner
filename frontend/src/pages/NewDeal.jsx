import React, { useState, useEffect, useCallback } from 'react';
import { Save, X, RotateCcw, TrendingUp, Activity, BarChart3, Target, Bitcoin } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { TickerSearch } from '../components/CalculatorV2';
import FinancialControl from '../components/CalculatorV2/FinancialControl';
import OwnDataChart from '../components/GradualStrategyCalculator/OwnDataChart';
import {
  parseExitScheme,
  validateExitScheme,
} from '../utils/gradualStrategyCalculations';

// Функция форматирования денежных значений с разделением на тысячи (пробел)
const formatMoney = (value, isPrice = false) => {
  if (!value && value !== 0) return '$0';
  const num = parseFloat(value);
  // Для цен показываем 2 знака после запятой, для остального - целое число
  const decimals = isPrice ? 2 : 0;
  return '$' + num.toLocaleString('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).replace(/,/g, '.');
};

function NewDeal() {
  const [formData, setFormData] = useState({
    name: '',
    ticker: '',
    type: 'futures',
    status: 'ПРОЕКТ', // Статус сделки
  });

  console.log('🚀 NewDeal component render');

  const [isInitialized, setIsInitialized] = useState(false);
  const [isDataCleared, setIsDataCleared] = useState(false);
  const [isNameEdited, setIsNameEdited] = useState(false);

  // Отслеживание режима редактирования
  const [existingDealId, setExistingDealId] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // State для новых полей под тикером
  const [quantity, setQuantity] = useState(1);
  const [positionDirection, setPositionDirection] = useState('LONG');
  const [marginAmount, setMarginAmount] = useState(0);
  const [availableCapitalAmount, setAvailableCapitalAmount] = useState(0);

  // State для финансового контроля (синхронизация с FinancialControl через localStorage)
  const [financialControlEnabled, setFinancialControlEnabled] = useState(() => {
    const saved = localStorage.getItem('newDealFinancialControlEnabled');
    return saved ? JSON.parse(saved) : false;
  });

  // Общие параметры
  const [assetType, setAssetType] = useState('futures');
  const [ticker, setTicker] = useState('ES');
  const [pointValue, setPointValue] = useState(10);
  const [direction, setDirection] = useState('LONG');

  // Параметры ОТКРЫТИЯ
  const [entryNumContracts, setEntryNumContracts] = useState(8);
  const [currentPrice, setCurrentPrice] = useState(3500);
  const [targetEntryPrice, setTargetEntryPrice] = useState(0);
  const [availableCapital, setAvailableCapital] = useState(30000);
  
  // НОВОЕ: Логика усреднения с шириной канала
  const [entryLogic, setEntryLogic] = useState('uniform'); // 'uniform' или 'channel'
  const [channelWidth, setChannelWidth] = useState(0);
  
  // НОВОЕ: Stop-Loss для ВХОДА
  const [entryStopLossPoints, setEntryStopLossPoints] = useState(0);
  const [entryStopLossPrice, setEntryStopLossPrice] = useState(0);
  const [entryStopLossType, setEntryStopLossType] = useState('points'); // 'points' или 'price'
  const [showEntrySL, setShowEntrySL] = useState(false);

  // Вспомогательная переменная для получения текущего значения стоплосса
  const entryStopLoss = entryStopLossType === 'points' ? entryStopLossPoints : entryStopLossPrice;

  // Параметры ЗАКРЫТИЯ
  const [exitNumContracts, setExitNumContracts] = useState(8);
  const [entryPrice, setEntryPrice] = useState(3400);
  const [margin, setMargin] = useState(15440);
  const [targetProfitPercent, setTargetProfitPercent] = useState(100);
  
  // НОВОЕ: Схема выхода (групповая разгрузка)
  const [exitSchemeType, setExitSchemeType] = useState('uniform'); // 'uniform', 'by2', 'by4', 'custom'
  const [customExitScheme, setCustomExitScheme] = useState('');
  const [exitSchemeError, setExitSchemeError] = useState(null);
  
  // НОВОЕ: Stop-Loss для ВЫХОДА
  const [exitStopLoss, setExitStopLoss] = useState(0);
  const [showExitSL, setShowExitSL] = useState(false);

  // State для отслеживания оригинального количества (до корректировки)
  const [originalQuantity, setOriginalQuantity] = useState(1);

  // State для даты-времени начала работы
  const [startDateTime, setStartDateTime] = useState('');

  // State для даты-времени закрытия сделки
  const [closeDateTime, setCloseDateTime] = useState('');

  // State для TickerSearch
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [selectedTicker, setSelectedTicker] = useState("");
  const [tickerCurrentPrice, setTickerCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState({ value: 0, percent: 0 });
  const [isReferenceCollapsed, setIsReferenceCollapsed] = useState(() => {
    const saved = localStorage.getItem('isReferenceCollapsed');
    return saved ? JSON.parse(saved) : true; // По умолчанию свёрнут
  });

  // Установка заголовка страницы
  useEffect(() => {
    document.title = 'Сделка | SYNDICATE Platform';
    return () => {
      document.title = 'SYNDICATE Platform';
    };
  }, []);

  // Система предупреждений при уходе со страницы
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (existingDealId && hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'У вас есть несохраненные изменения. Вы уверены, что хотите уйти?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [existingDealId, hasUnsavedChanges]);

  // Автоматическая установка hasUnsavedChanges при изменении данных
  useEffect(() => {
    if (existingDealId) {
      setHasUnsavedChanges(true);
    }
  }, [
    formData, quantity, positionDirection, marginAmount, availableCapitalAmount,
    financialControlEnabled, assetType, ticker, pointValue, direction,
    entryNumContracts, currentPrice, targetEntryPrice, availableCapital,
    entryLogic, channelWidth, entryStopLossPoints, entryStopLossPrice,
    entryStopLossType, showEntrySL, exitNumContracts, entryPrice,
    targetProfitPercent, exitSchemeType, customExitScheme, exitStopLoss,
    showExitSL, startDateTime, closeDateTime
  ]);

  // Автоматическое формирование названия сделки
  useEffect(() => {
    if (!formData) return; // Проверяем, что formData инициализирован
    if (!isNameEdited && formData.ticker && quantity > 0) {
      const totalMargin = marginAmount * quantity;
      const quantityLabel = formData?.type === 'futures' ? `контрактов ${quantity}` : quantity;
      let name = `${formData.ticker} - ${positionDirection} - ${quantityLabel} - $${totalMargin.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
      
      // Добавляем даты-время в конец, если статус не ПРОЕКТ и даты введены
      if (formData.status !== 'ПРОЕКТ') {
        if (startDateTime) {
          name += ` - Open ${startDateTime}`;
        }
        if (closeDateTime) {
          name += ` - Close ${closeDateTime}`;
        }
      }
      
      setFormData(prev => ({
        ...prev,
        name: name
      }));
    }
  }, [formData, quantity, marginAmount, isNameEdited, positionDirection, startDateTime, closeDateTime]);

  // Сброс дат при возврате в статус ПРОЕКТ
  useEffect(() => {
    if (!formData) return; // Проверяем, что formData инициализирован
    if (formData.status === 'ПРОЕКТ') {
      setStartDateTime('');
      setCloseDateTime('');
    }
  }, [formData]);

  // Функция для сохранения рабочего состояния новой сделки
  const saveWorkingState = useCallback(() => {
    const workingState = {
      formData,
      quantity,
      positionDirection,
      marginAmount,
      availableCapitalAmount,
      financialControlEnabled,
      assetType,
      ticker: formData.ticker,
      pointValue,
      direction,
      entryNumContracts,
      currentPrice,
      targetEntryPrice,
      availableCapital,
      entryLogic,
      channelWidth,
      entryStopLossPoints,
      entryStopLossPrice,
      entryStopLossType,
      showEntrySL,
      exitNumContracts,
      entryPrice,
      margin: marginAmount,
      targetProfitPercent,
      exitSchemeType,
      customExitScheme,
      exitStopLoss,
      showExitSL,
      isReferenceCollapsed,
      exitSchemeError,
      isNameEdited,
      startDateTime,
      closeDateTime,
      originalQuantity, // Добавляем originalQuantity
    };
    localStorage.setItem('newDealWorkingState', JSON.stringify(workingState));
  }, [
    formData, quantity, positionDirection, marginAmount, availableCapitalAmount,
    financialControlEnabled, assetType, pointValue, direction, entryNumContracts,
    currentPrice, targetEntryPrice, availableCapital, entryLogic, channelWidth,
    entryStopLossPoints, entryStopLossPrice, entryStopLossType, showEntrySL,
    exitNumContracts, entryPrice, targetProfitPercent, exitSchemeType,
    customExitScheme, exitStopLoss, showExitSL, isReferenceCollapsed,
    exitSchemeError, isNameEdited, startDateTime, closeDateTime,
    originalQuantity // Добавляем в зависимости
  ]);

  // Автоматическое сохранение рабочего состояния при изменении ключевых полей
  useEffect(() => {
    // Не сохраняем если данные только что загружены или если идет редактирование
    if (!isInitialized) return;
    const hasEditState = localStorage.getItem('gradualCalculatorState');
    if (hasEditState) return; // Не перезаписываем состояние редактирования
    
    saveWorkingState();
  }, [saveWorkingState, isInitialized]);

  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const newFormData = { ...prev, [field]: value };
      return newFormData;
    });
    if (field === 'name') {
      setIsNameEdited(true);
    }
    // Отслеживаем изменения только для существующих сделок
    if (existingDealId && isInitialized) {
      setHasUnsavedChanges(true);
    }
  };

  // Функция для обработки выбора тикера
  const handleTickerSelect = async (ticker) => {
    if (ticker) {
      setSelectedTicker(ticker);
      setSearchValue("");
      setSearchOpen(false);
      
      // Загружаем цену тикера
      try {
        const response = await fetch(`/api/polygon/ticker/${ticker}`);
        if (response.ok) {
          const data = await response.json();
          if (data.price) {
            setTickerCurrentPrice(data.price);
            setPriceChange({
              value: data.change || 0,
              percent: data.changePercent || 0
            });
          }
        }
      } catch (error) {
        console.error('Ошибка загрузки цены тикера:', error);
      }
      
      // Обновляем formData.ticker для совместимости
      handleInputChange('ticker', ticker);
    } else {
      setSelectedTicker("");
      setTickerCurrentPrice(0);
      setPriceChange({ value: 0, percent: 0 });
      handleInputChange('ticker', '');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('🔥 handleSubmit called - saving deal');

    if (!formData) {
      alert('Ошибка: данные формы не инициализированы');
      return;
    }

    // Создаем объект сделки со всеми данными
    const deal = {
      id: existingDealId || Date.now().toString(), // Используем существующий ID или создаем новый
      ...formData,
      // Все параметры калькулятора
      quantity,
      positionDirection,
      marginAmount,
      availableCapitalAmount,
      financialControlEnabled,
      assetType,
      ticker: formData.ticker, // Используем тикер из формы
      pointValue,
      direction,
      entryNumContracts,
      currentPrice,
      targetEntryPrice,
      availableCapital,
      entryLogic,
      channelWidth,
      entryStopLossPoints,
      entryStopLossPrice,
      entryStopLossType,
      showEntrySL,
      exitNumContracts,
      entryPrice,
      margin,
      targetProfitPercent,
      exitSchemeType,
      customExitScheme,
      exitStopLoss,
      showExitSL,
      isReferenceCollapsed,
      exitSchemeError,
      isNameEdited,
      startDateTime,
      closeDateTime,
      createdAt: existingDealId ? undefined : new Date().toISOString(), // Сохраняем дату создания только для новых сделок
      updatedAt: new Date().toISOString() // Дата обновления
    };

    // Сохраняем в localStorage
    try {
      const existingDeals = JSON.parse(localStorage.getItem('savedDeals') || '[]');

      if (existingDealId) {
        // Обновляем существующую запись
        const index = existingDeals.findIndex(d => d.id === existingDealId);
        if (index !== -1) {
          existingDeals[index] = { ...existingDeals[index], ...deal };
          console.log('✅ Существующая сделка обновлена:', deal);
          alert('Сделка успешно обновлена!');
        } else {
          console.error('❌ Сделка с ID', existingDealId, 'не найдена');
          alert('Ошибка: сделка не найдена!');
          return;
        }
      } else {
        // Создаем новую запись
        existingDeals.push(deal);
        console.log('✅ Новая сделка создана:', deal);
        alert('Сделка сохранена успешно!');
      }

      localStorage.setItem('savedDeals', JSON.stringify(existingDeals));

      // Сбрасываем флаги изменений и очищаем состояние редактирования
      setHasUnsavedChanges(false);
      setExistingDealId(null);

      // Очищаем сохраненные данные новой сделки после сохранения
      localStorage.removeItem('newDealWorkingState');
      localStorage.removeItem('gradualCalculatorState');

    } catch (error) {
      console.error('Ошибка сохранения сделки:', error);
      alert('Ошибка сохранения сделки!');
      return;
    }
  };

  const handleCancel = () => {
    const confirmMessage = existingDealId
      ? 'Вы уверены, что хотите отменить редактирование сделки? Все несохраненные изменения будут потеряны.'
      : 'Вы уверены, что хотите отменить создание сделки? Все настройки будут сброшены.';

    if (window.confirm(confirmMessage)) {
      // Явный сброс formData для надежности
      setFormData({
        name: '',
        ticker: '',
        type: 'futures',
        status: 'ПРОЕКТ',
      });

      // Сбрасываем состояния TickerSearch
      setSelectedTicker('');
      setSearchOpen(false);
      setSearchValue('');
      setTickerCurrentPrice(0);
      setPriceChange({ value: 0, percent: 0 });

      // Сбрасываем флаги режима редактирования
      setExistingDealId(null);
      setHasUnsavedChanges(false);
      resetCalculator();
    }
  };

  // Функция сохранения состояния
  const saveCalculatorState = useCallback(() => {
    if (!isInitialized) return;

    const state = {
      formData,
      quantity,
      positionDirection,
      marginAmount,
      availableCapitalAmount,
      financialControlEnabled,
      assetType,
      ticker,
      pointValue,
      direction,
      entryNumContracts,
      currentPrice,
      targetEntryPrice,
      availableCapital,
      entryLogic,
      channelWidth,
      entryStopLossPoints,
      entryStopLossPrice,
      entryStopLossType,
      showEntrySL,
      exitNumContracts,
      entryPrice,
      margin,
      targetProfitPercent,
      exitSchemeType,
      customExitScheme,
      exitStopLoss,
      showExitSL,
      isReferenceCollapsed,
      exitSchemeError,
      isNameEdited,
      startDateTime,
      closeDateTime
    };

    localStorage.setItem('gradualCalculatorState', JSON.stringify(state));
    console.log('💾 Состояние градуального калькулятора сохранено');
  }, [
    isInitialized,
    formData,
    quantity,
    positionDirection,
    marginAmount,
    availableCapitalAmount,
    financialControlEnabled,
    assetType,
    ticker,
    pointValue,
    direction,
    entryNumContracts,
    currentPrice,
    targetEntryPrice,
    availableCapital,
    entryLogic,
    channelWidth,
    entryStopLossPoints,
    entryStopLossPrice,
    entryStopLossType,
    showEntrySL,
    exitNumContracts,
    entryPrice,
    margin,
    targetProfitPercent,
    exitSchemeType,
    customExitScheme,
    exitStopLoss,
    showExitSL,
    exitSchemeError,
    isNameEdited,
    startDateTime,
    closeDateTime
  ]);

  // Функция сброса калькулятора
  const resetCalculator = useCallback(() => {
    setSelectedTicker('');
    setSearchOpen(false);
    setSearchValue('');
    setTickerCurrentPrice(0);
    setPriceChange({ value: 0, percent: 0 });
    setQuantity(1);
    setPositionDirection('LONG');
    setMarginAmount(0);
    setAvailableCapitalAmount(0);
    setFinancialControlEnabled(false);
    setAssetType('futures');
    setTicker('ES');
    setPointValue(10);
    setDirection('LONG');
    setEntryNumContracts(8);
    setCurrentPrice(3500);
    setTargetEntryPrice(0);
    setAvailableCapital(30000);
    setEntryLogic('uniform');
    setChannelWidth(0);
    setEntryStopLossPoints(0);
    setEntryStopLossPrice(0);
    setEntryStopLossType('points');
    setShowEntrySL(false);
    setExitNumContracts(8);
    setEntryPrice(3400);
    setMargin(15440);
    setTargetProfitPercent(100);
    setExitSchemeType('uniform');
    setCustomExitScheme('');
    setExitStopLoss(0);
    setShowExitSL(false);
    setIsReferenceCollapsed(false);
    setIsDataCleared(false);
    setExitSchemeError(null);
    setIsNameEdited(false);
    setOriginalQuantity(1); // Сброс originalQuantity
    setStartDateTime(''); // Сброс даты-времени начала работы
    setCloseDateTime(''); // Сброс даты-времени закрытия сделки
    localStorage.removeItem('gradualCalculatorState');
    localStorage.removeItem('newDealWorkingState'); // Очищаем сохраненные данные новой сделки
  }, []);

  // Загружаем состояние при первой загрузке страницы
  useEffect(() => {
    console.log('🔄 Загрузка состояния из localStorage...');

    // Проверяем URL параметры для режима редактирования
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    const isNew = urlParams.get('new');

    // Если параметр ?new=true, очищаем все сохраненные состояния
    if (isNew === 'true') {
      console.log('🆕 Создание новой пустой сделки - очищаем все состояния');
      localStorage.removeItem('gradualCalculatorState');
      localStorage.removeItem('newDealWorkingState');
      setIsInitialized(true);
      return;
    }

    if (editId) {
      console.log('📝 Режим редактирования, ID:', editId);
      try {
        const existingDeals = JSON.parse(localStorage.getItem('savedDeals') || '[]');
        const dealToEdit = existingDeals.find(d => d.id === editId);

        if (dealToEdit) {
          console.log('📝 Загружаем данные для редактирования:', dealToEdit);

          setExistingDealId(editId);
          setFormData({
            name: dealToEdit.name || '',
            ticker: dealToEdit.ticker || '',
            type: dealToEdit.type || 'futures',
            status: dealToEdit.status || 'ПРОЕКТ'
          });

          // Загружаем все параметры калькулятора
          setQuantity(dealToEdit.quantity || 1);
          setPositionDirection(dealToEdit.positionDirection || 'LONG');
          setMarginAmount(dealToEdit.marginAmount || 0);
          setAvailableCapitalAmount(dealToEdit.availableCapitalAmount || 0);
          setFinancialControlEnabled(dealToEdit.financialControlEnabled || false);
          setAssetType(dealToEdit.assetType || 'futures');
          setTicker(dealToEdit.ticker || 'ES');
          setPointValue(dealToEdit.pointValue || 10);
          setDirection(dealToEdit.direction || 'LONG');
          setEntryNumContracts(dealToEdit.entryNumContracts || 8);
          setCurrentPrice(dealToEdit.currentPrice || 3500);
          setTargetEntryPrice(dealToEdit.targetEntryPrice || 0);
          setAvailableCapital(dealToEdit.availableCapital || 30000);
          setEntryLogic(dealToEdit.entryLogic || 'uniform');
          setChannelWidth(dealToEdit.channelWidth || 0);
          setEntryStopLossPoints(dealToEdit.entryStopLossPoints || 0);
          setEntryStopLossPrice(dealToEdit.entryStopLossPrice || 0);
          setEntryStopLossType(dealToEdit.entryStopLossType || 'points');
          setShowEntrySL(dealToEdit.showEntrySL || false);
          setExitNumContracts(dealToEdit.exitNumContracts || 8);
          setEntryPrice(dealToEdit.entryPrice || 3400);
          setTargetProfitPercent(dealToEdit.targetProfitPercent || 100);
          setExitSchemeType(dealToEdit.exitSchemeType || 'uniform');
          setCustomExitScheme(dealToEdit.customExitScheme || '');
          setExitStopLoss(dealToEdit.exitStopLoss || 0);
          setShowExitSL(dealToEdit.showExitSL || false);
          setIsReferenceCollapsed(dealToEdit.isReferenceCollapsed || false);
          setExitSchemeError(dealToEdit.exitSchemeError || null);
          setIsNameEdited(dealToEdit.isNameEdited || false);
          setStartDateTime(dealToEdit.startDateTime || '');
          setCloseDateTime(dealToEdit.closeDateTime || '');
          setOriginalQuantity(dealToEdit.originalQuantity || 1);

          console.log('✅ Данные для редактирования загружены успешно');
        } else {
          console.error('❌ Сделка с ID', editId, 'не найдена в архиве');
          alert('Сделка не найдена!');
          window.location.href = '/archive'; // Перенаправляем на архив
          return;
        }
      } catch (error) {
        console.error('❌ Ошибка загрузки данных для редактирования:', error);
        alert('Ошибка загрузки данных для редактирования!');
        return;
      }
    } else {
      // Обычная загрузка состояния новой сделки
      const savedState = localStorage.getItem('gradualCalculatorState');
      const savedWorkingState = localStorage.getItem('newDealWorkingState');

      console.log('📦 gradualCalculatorState:', savedState ? 'найдено' : 'не найдено');
      console.log('📦 newDealWorkingState:', savedWorkingState ? 'найдено' : 'не найдено');

      if (savedState) {
        try {
          console.log('📝 Загружаем состояние редактирования');
          const state = JSON.parse(savedState);
          setFormData(prev => ({ ...prev, ...state.formData }));
          setQuantity(state.quantity || 1);
          setPositionDirection(state.positionDirection || 'long');
          setMarginAmount(state.marginAmount || 0);
          setAvailableCapitalAmount(state.availableCapitalAmount || 0);
          setFinancialControlEnabled(state.financialControlEnabled || false);
          setAssetType(state.assetType || 'stock');
          setPointValue(state.pointValue || 100);
          setDirection(state.direction || 'long');
          setEntryNumContracts(state.entryNumContracts || 1);
          setCurrentPrice(state.currentPrice || 0);
          setTargetEntryPrice(state.targetEntryPrice || 0);
          setAvailableCapital(state.availableCapital || 0);
          setEntryLogic(state.entryLogic || 'uniform');
          setChannelWidth(state.channelWidth || 0);
          setEntryStopLossPoints(state.entryStopLossPoints || 0);
          setEntryStopLossPrice(state.entryStopLossPrice || 0);
          setEntryStopLossType(state.entryStopLossType || 'points');
          setShowEntrySL(state.showEntrySL || false);
          setExitNumContracts(state.exitNumContracts || 1);
          setEntryPrice(state.entryPrice || 0);
          setTargetProfitPercent(state.targetProfitPercent || 100);
          setExitSchemeType(state.exitSchemeType || 'uniform');
          setCustomExitScheme(state.customExitScheme || '');
          setExitStopLoss(state.exitStopLoss || 0);
          setShowExitSL(state.showExitSL || false);
          setIsReferenceCollapsed(state.isReferenceCollapsed || false);
          setExitSchemeError(state.exitSchemeError || null);
          setIsNameEdited(state.isNameEdited || false);
          setStartDateTime(state.startDateTime || '');
          setCloseDateTime(state.closeDateTime || '');
          setOriginalQuantity(state.originalQuantity || 1);
          localStorage.removeItem('newDealWorkingState'); // Очищаем рабочее состояние
          console.log('✅ Состояние редактирования загружено успешно');
        } catch (error) {
          console.error('❌ Ошибка загрузки состояния редактирования:', error);
        }
      } else if (savedWorkingState) {
        try {
          console.log('📝 Загружаем рабочее состояние новой сделки');
          const workingState = JSON.parse(savedWorkingState);
          console.log('📊 Содержимое рабочего состояния:', workingState);

          setFormData(prev => ({ ...prev, ...workingState.formData }));
          setQuantity(workingState.quantity || 1);
          setPositionDirection(workingState.positionDirection || 'long');
          setMarginAmount(workingState.marginAmount || 0);
          setAvailableCapitalAmount(workingState.availableCapitalAmount || 0);
          setFinancialControlEnabled(workingState.financialControlEnabled || false);
          setAssetType(workingState.assetType || 'stock');
          setPointValue(workingState.pointValue || 100);
          setDirection(workingState.direction || 'long');
          setEntryNumContracts(workingState.entryNumContracts || 1);
          setCurrentPrice(workingState.currentPrice || 0);
          setTargetEntryPrice(workingState.targetEntryPrice || 0);
          setAvailableCapital(workingState.availableCapital || 0);
          setEntryLogic(workingState.entryLogic || 'uniform');
          setChannelWidth(workingState.channelWidth || 0);
          setEntryStopLossPoints(workingState.entryStopLossPoints || 0);
          setEntryStopLossPrice(workingState.entryStopLossPrice || 0);
          setEntryStopLossType(workingState.entryStopLossType || 'points');
          setShowEntrySL(workingState.showEntrySL || false);
          setExitNumContracts(workingState.exitNumContracts || 1);
          setEntryPrice(workingState.entryPrice || 0);
          setTargetProfitPercent(workingState.targetProfitPercent || 100);
          setExitSchemeType(workingState.exitSchemeType || 'uniform');
          setCustomExitScheme(workingState.customExitScheme || '');
          setExitStopLoss(workingState.exitStopLoss || 0);
          setShowExitSL(workingState.showExitSL || false);
          setIsReferenceCollapsed(workingState.isReferenceCollapsed || false);
          setExitSchemeError(workingState.exitSchemeError || null);
          setIsNameEdited(workingState.isNameEdited || false);
          setStartDateTime(workingState.startDateTime || '');
          setCloseDateTime(workingState.closeDateTime || '');
          setOriginalQuantity(workingState.originalQuantity || 1);
          console.log('✅ Данные новой сделки загружены успешно');
        } catch (error) {
          console.error('❌ Ошибка загрузки данных новой сделки:', error);
        }
      } else {
        console.log('ℹ️ Сохраненное состояние не найдено');
      }
    }

    setIsInitialized(true); // Устанавливаем флаг инициализации
    console.log('🚀 Инициализация завершена, isInitialized = true');
  }, []); // Загружаем сразу при монтировании

  // Инициализация selectedTicker из formData.ticker
  useEffect(() => {
    if (formData?.ticker && !selectedTicker) {
      setSelectedTicker(formData.ticker);
    }
  }, [formData?.ticker, selectedTicker]);

  // Сохранение financialControlEnabled в localStorage для синхронизации с FinancialControl
  useEffect(() => {
    localStorage.setItem('newDealFinancialControlEnabled', JSON.stringify(financialControlEnabled));
  }, [financialControlEnabled]);

  // Функция для получения цены пункта из настроек фьючерсов
  const getPointValueFromSettings = (ticker) => {
    try {
      const saved = localStorage.getItem('futuresSettings');
      if (saved) {
        const futuresSettings = JSON.parse(saved);
        const future = futuresSettings.find(f => f.ticker === ticker);
        return future ? future.pointValue : null;
      }
    } catch (error) {
      console.error('Ошибка загрузки настроек фьючерсов:', error);
    }
    
    // Fallback на дефолтные данные
    const DEFAULT_FUTURES = [
      { id: 1, ticker: 'ES', name: 'E-mini S&P 500', pointValue: 50 },
      { id: 2, ticker: 'NQ', name: 'E-mini Nasdaq-100', pointValue: 20 },
      { id: 3, ticker: 'YM', name: 'E-mini Dow Jones', pointValue: 5 },
      { id: 4, ticker: 'GC', name: 'Gold Futures', pointValue: 100 },
      { id: 5, ticker: 'CL', name: 'Crude Oil Futures', pointValue: 1000 },
      { id: 6, ticker: 'ZC', name: 'Corn Futures', pointValue: 50 },
      { id: 7, ticker: 'ZS', name: 'Soybean Futures', pointValue: 50 },
      { id: 8, ticker: 'ZW', name: 'Wheat Futures', pointValue: 50 },
      { id: 9, ticker: 'ZO', name: 'Oat Futures', pointValue: 50 },
      { id: 10, ticker: 'ZR', name: 'Rough Rice Futures', pointValue: 100 },
      { id: 11, ticker: 'ZL', name: 'Soybean Oil Futures', pointValue: 100 },
      { id: 12, ticker: 'ZM', name: 'Soybean Meal Futures', pointValue: 100 },
      { id: 13, ticker: 'LE', name: 'Live Cattle Futures', pointValue: 400 },
      { id: 14, ticker: 'GF', name: 'Feeder Cattle Futures', pointValue: 500 },
      { id: 15, ticker: 'LH', name: 'Lean Hog Futures', pointValue: 400 },
    ];

    const future = DEFAULT_FUTURES.find(f => f.ticker === ticker);
    return future ? future.pointValue : null;
  };

  // Получаем цену пункта для проверки
  const pointValueForButton = selectedTicker ? getPointValueFromSettings(selectedTicker) : null;
  const totalMarginAmount = marginAmount * quantity;

  // Автоматический расчет доступного капитала из данных Финансового контроля
  useEffect(() => {
    const updateAvailableCapital = () => {
      const depositAmount = localStorage.getItem('newDealdepositAmount');
      const instrumentCount = localStorage.getItem('newDealinstrumentCount');
      
      if (depositAmount && instrumentCount) {
        const deposit = parseFloat(depositAmount);
        const instruments = parseInt(instrumentCount);
        
        if (deposit > 0 && instruments > 0) {
          const calculated = Math.round(deposit / instruments);
          setAvailableCapitalAmount(calculated);
        }
      } else {
        // Если данных нет в localStorage, сбрасываем availableCapitalAmount
        setAvailableCapitalAmount(0);
      }
    };

    // Обновляем при монтировании
    updateAvailableCapital();

    // Слушаем изменения в localStorage (для синхронизации с FinancialControl)
    const interval = setInterval(updateAvailableCapital, 100);

    return () => clearInterval(interval);
  }, []); // Убираем зависимость от financialControlEnabled

  // Автоматическая синхронизация financialControlEnabled из localStorage
  useEffect(() => {
    const updateFinancialControlEnabled = () => {
      const saved = localStorage.getItem('newDealFinancialControlEnabled');
      setFinancialControlEnabled(saved ? JSON.parse(saved) : false);
    };

    // Обновляем при монтировании
    updateFinancialControlEnabled();

    // Слушаем custom event от FinancialControl
    const handleFinancialControlChange = (e) => {
      if (e.detail.prefix === 'newDeal') {
        setFinancialControlEnabled(e.detail.enabled);
      }
    };

    window.addEventListener('financialControlChanged', handleFinancialControlChange);

    // Также слушаем изменения в localStorage на всякий случай
    const interval = setInterval(updateFinancialControlEnabled, 1000); // Уменьшаем частоту

    return () => {
      window.removeEventListener('financialControlChanged', handleFinancialControlChange);
      clearInterval(interval);
    };
  }, []);

  // Автоматический расчет количества при изменении маржина
  useEffect(() => {
    if (marginAmount > 0 && availableCapitalAmount > 0) {
      const calculatedQuantity = Math.floor(availableCapitalAmount / marginAmount);
      setQuantity(calculatedQuantity);
    }
  }, [marginAmount, availableCapitalAmount]);

  // Валидация custom схемы выхода в реальном времени
  useEffect(() => {
    if (exitSchemeType === 'custom' && customExitScheme !== '') {
      const parsedScheme = parseExitScheme(customExitScheme);
      const validation = validateExitScheme(parsedScheme, quantity);
      
      if (!validation.isValid) {
        setExitSchemeError(validation.error);
      } else {
        setExitSchemeError(null);
      }
    } else if (exitSchemeType === 'custom' && customExitScheme === '') {
      setExitSchemeError(null);
    }
  }, [customExitScheme, exitSchemeType, quantity]);

  // Функция для расчета скорректированного количества контрактов
  const calculateAdjustedQuantity = (originalQuantity, targetPrice, channelWidth, positionDirection) => {
    let adjustedQuantity = originalQuantity;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      let remainingContracts = adjustedQuantity;
      let stepNumber = 0;
      let currentPrice = targetPrice;
      const priceDirection = positionDirection === 'SHORT' ? 1 : -1;
      let canceled = false;

      while (remainingContracts > 0) {
        let contractsInStep;

        if (stepNumber === 0) {
          contractsInStep = 1;
          currentPrice = targetPrice;
        } else if (stepNumber === 1) {
          contractsInStep = 1;
          currentPrice = targetPrice + (priceDirection * channelWidth);
        } else if (stepNumber === 2) {
          contractsInStep = Math.min(2, remainingContracts);
          currentPrice = currentPrice + (priceDirection * channelWidth * 0.5);
        } else {
          const previousContracts = stepNumber === 3 ? 2 : stepNumber === 4 ? 4 : stepNumber === 5 ? 8 : stepNumber === 6 ? 16 : 32; // упрощение
          contractsInStep = Math.min(previousContracts * 2, remainingContracts);
          currentPrice = currentPrice + (priceDirection * channelWidth * 0.5);
        }

        if (stepNumber >= 3) {
          const previousContracts = stepNumber === 3 ? 2 : stepNumber === 4 ? 4 : stepNumber === 5 ? 8 : stepNumber === 6 ? 16 : 32;
          const desiredContracts = previousContracts * 2;
          if (contractsInStep < desiredContracts) {
            adjustedQuantity -= remainingContracts;
            canceled = true;
            break;
          }
        }

        remainingContracts -= contractsInStep;
        stepNumber++;
      }

      if (!canceled) break;
      attempts++;
    }

    return adjustedQuantity;
  };

  // Автоматическая корректировка количества при выборе "Набор позиции"
  useEffect(() => {
    if (entryLogic === 'channel' && targetEntryPrice > 0 && channelWidth > 0 && quantity > 0) {
      const adjusted = calculateAdjustedQuantity(quantity, targetEntryPrice, channelWidth, positionDirection);
      if (adjusted !== quantity) {
        // Сохраняем оригинальное количество перед корректировкой
        setOriginalQuantity(quantity);
        setQuantity(adjusted);
      }
    } else if (entryLogic !== 'channel') {
      // Сбрасываем originalQuantity если логика изменилась
      setOriginalQuantity(1);
    }
  }, [entryLogic, targetEntryPrice, channelWidth, positionDirection, quantity]);

  // Проверяем превышение маржина
  const totalMargin = marginAmount * quantity;
  const isMarginExceeded = totalMargin > availableCapitalAmount && availableCapitalAmount > 0;

  return (
    <form onSubmit={handleSubmit}>
      <div className="w-full py-6 px-4">
        <div className="mb-6">
          <div className="flex items-start justify-between w-full">
            <div className="flex items-start gap-2 flex-1">
              <h1 className="text-2xl font-bold mr-4">
                {existingDealId ? 'Редактирование сделки' : 'Сделка'}
              </h1>
              {existingDealId && (
                <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  ID: {existingDealId}
                </span>
              )}
              <div className="flex items-start">
                <TickerSearch
                  selectedTicker={selectedTicker}
                  onTickerSelect={handleTickerSelect}
                  searchOpen={searchOpen}
                  setSearchOpen={setSearchOpen}
                  searchValue={searchValue}
                  setSearchValue={setSearchValue}
                  currentPrice={tickerCurrentPrice}
                  priceChange={priceChange}
                />
              </div>
              <Select value={formData?.type || 'futures'} onValueChange={(value) => handleInputChange('type', value)}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Тип" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stocks">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      Акции
                    </div>
                  </SelectItem>
                  <SelectItem value="futures">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-blue-500" />
                      Фьючерсы
                    </div>
                  </SelectItem>
                  <SelectItem value="indices">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-purple-500" />
                      Индексы
                    </div>
                  </SelectItem>
                  <SelectItem value="options">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-orange-500" />
                      Опционы
                    </div>
                  </SelectItem>
                  <SelectItem value="crypto">
                    <div className="flex items-center gap-2">
                      <Bitcoin className="h-4 w-4 text-yellow-500" />
                      Критовалюта
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="name"
                placeholder="Название сделки"
                value={formData?.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="w-96"
                required
              />
              <Select value={formData?.status || 'ПРОЕКТ'} onValueChange={(value) => handleInputChange('status', value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ПРОЕКТ" className="text-black font-medium">ПРОЕКТ</SelectItem>
                  <SelectItem value="В РАБОТЕ" className="text-orange-600 font-medium">В РАБОТЕ</SelectItem>
                  <SelectItem value="ЗАКРЫТА" className="text-gray-500 font-medium">ЗАКРЫТА</SelectItem>
                </SelectContent>
              </Select>
              {formData?.status === 'В РАБОТЕ' && (
                <Input
                  type="datetime-local"
                  value={startDateTime}
                  onChange={(e) => setStartDateTime(e.target.value)}
                  className="w-48"
                  placeholder="Дата-время начала"
                />
              )}
              {formData?.status === 'ЗАКРЫТА' && (
                <Input
                  type="datetime-local"
                  value={closeDateTime}
                  onChange={(e) => setCloseDateTime(e.target.value)}
                  className="w-48"
                  placeholder="Дата-время закрытия"
                />
              )}
            </div>
            <div className="flex gap-2 ml-auto">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 w-8 p-0 bg-cyan-500 hover:bg-cyan-600 text-white"
                      onClick={handleSubmit}
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Сохранить сделку</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 w-8 p-0 bg-orange-500 hover:bg-orange-600 text-white"
                      onClick={handleCancel}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Полный сброс формы</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>

        <Tabs defaultValue="instrument" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="instrument">ИНСТРУМЕНТ</TabsTrigger>
            <TabsTrigger value="options">ОПЦИОНЫ</TabsTrigger>
            <TabsTrigger value="chart">ГРАФИК</TabsTrigger>
          </TabsList>

          <TabsContent value="instrument" className="mt-6">
          <div className="gradual-calculator">

            {/* Разметка: левая колонка 1/4, правая 3/4 */}
            <div className="flex gap-6">
              {/* Левая колонка (1/4) */}
              <div className="w-1/4 space-y-6">
                <Card 
                  className={`flex-[1] ${isMarginExceeded ? 'animate-border-blink' : ''}`}
                  style={{ borderColor: isMarginExceeded ? '#ef4444' : '#b8b8b8' }}
                >
                  <CardContent className="pt-[20px] pb-[20px] space-y-4">

                    {/* Строка 1: Маржин */}
                    <div className="flex items-center gap-3 justify-between">
                      <Label className="text-sm font-medium whitespace-nowrap">Маржин за единицу</Label>
                      <Input
                        type="number"
                        value={marginAmount === 0 ? '' : marginAmount}
                        onChange={(e) => setMarginAmount(parseFloat(e.target.value) || 0)}
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className={`w-[110px] h-8 text-right text-xs ${marginAmount === 0 ? 'animate-border-blink-cyan' : ''}`}
                      />
                    </div>

                    {/* Строка 2: Количество + LONG/SHORT */}
                    <div className="flex items-center gap-3">
                      <Label className="text-sm font-medium whitespace-nowrap">
                        {formData?.type === 'futures' ? 'Контрактов' : 'Количество'}
                      </Label>
                      <Input
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                        className={`flex-1 text-right ${entryLogic === 'channel' && originalQuantity > quantity ? 'border-yellow-500' : ''}`}
                        min="0"
                      />
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => setQuantity(prev => prev + 1)}
                          className="h-3 w-3 flex items-center justify-center hover:bg-muted rounded transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="18 15 12 9 6 15"></polyline>
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuantity(prev => Math.max(0, prev - 1))}
                          className="h-3 w-3 flex items-center justify-center hover:bg-muted rounded transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                        </button>
                      </div>
                      <Select value={positionDirection} onValueChange={setPositionDirection}>
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LONG" className="text-green-600 font-medium">LONG</SelectItem>
                          <SelectItem value="SHORT" className="text-red-600 font-medium">SHORT</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Инфоблок о корректировке количества */}
                    {entryLogic === 'channel' && originalQuantity > quantity && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                        <div className="text-sm text-yellow-800">
                          ⚠️ Алгоритм уменьшил количество с {originalQuantity} до {quantity} для ровного набора позиции
                        </div>
                      </div>
                    )}

                    {/* Строка 3: Цена пункта - значение */}
                    <div className="flex items-center gap-3 justify-between">
                      <Label className="text-sm text-gray-600 whitespace-nowrap">Цена пункта</Label>
                      <span className="text-sm text-gray-600">
                        {formData.ticker ? (
                          (() => {
                            const pointValue = getPointValueFromSettings(formData.ticker);
                            return pointValue ? `$${pointValue}` : <span className="text-red-600 font-bold animate-pulse">ОТСУТСТВУЕТ</span>;
                          })()
                        ) : (
                          '—'
                        )}
                      </span>
                    </div>

                    {/* Строка 4: Всего маржин - значение */}
                    <div className="flex items-center gap-3 justify-between">
                      <Label className="text-sm text-gray-600 whitespace-nowrap">Всего маржин</Label>
                      <span className="text-sm text-gray-600">
                        ${(marginAmount * quantity).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                      </span>
                    </div>

                    {/* Строка 5: Плашка лимита */}
                    {availableCapitalAmount > 0 && financialControlEnabled && (
                      <div className={`px-3 py-2 rounded text-center text-sm font-medium ${
                        isMarginExceeded 
                          ? 'bg-red-500 text-white' 
                          : 'bg-gray-200 text-gray-500'
                      }`}>
                        {isMarginExceeded ? (
                          <>Лимит $ {availableCapitalAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} - ПРЕВЫШЕНИЕ на $ {(totalMargin - availableCapitalAmount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}</>
                        ) : (
                          <>Лимит $ {availableCapitalAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} - В РАМКАХ ЛИМИТА</>
                        )}
                      </div>
                    )}

                    {/* Stop-Loss чекбокс в конце блока */}
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="entry-stop-loss"
                        checked={showEntrySL}
                        onChange={(e) => setShowEntrySL(e.target.checked)}
                        className="w-4 h-4 text-cyan-600"
                      />
                      <Label htmlFor="entry-stop-loss" className="text-sm font-medium cursor-pointer">
                        Рассчитать Stop-Loss
                      </Label>
                    </div>

                    {/* Stop-Loss радиобаттоны - отображаются если чекбокс отмечен */}
                    {showEntrySL && (
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center space-x-2">
                              <input
                                type="radio"
                                id="stop-loss-points"
                                name="stop-loss-type"
                                value="points"
                                checked={entryStopLossType === 'points'}
                                onChange={(e) => setEntryStopLossType(e.target.value)}
                                className="w-4 h-4 text-cyan-600"
                              />
                              <Label htmlFor="stop-loss-points" className="text-xs text-gray-500 font-normal cursor-pointer">
                                в пунктах от средней цены
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <input
                                type="radio"
                                id="stop-loss-price"
                                name="stop-loss-type"
                                value="price"
                                checked={entryStopLossType === 'price'}
                                onChange={(e) => setEntryStopLossType(e.target.value)}
                                className="w-4 h-4 text-cyan-600"
                              />
                              <Label htmlFor="stop-loss-price" className="text-xs text-gray-500 font-normal cursor-pointer">
                                ввод стопа
                              </Label>
                            </div>
                          </div>
                          
                          {/* Инпут справа от радиобаттонов - равняется к правому краю */}
                          <div className="flex flex-col gap-2">
                            {entryStopLossType === 'points' && (
                              <Input
                                type="number"
                                value={entryStopLossPoints === 0 ? '' : entryStopLossPoints}
                                onChange={(e) => setEntryStopLossPoints(parseFloat(e.target.value) || 0)}
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                className={`w-[100px] h-8 text-right text-xs ${entryStopLossPoints === 0 ? 'animate-border-blink-cyan' : ''}`}
                              />
                            )}
                            {entryStopLossType === 'price' && (
                              <Input
                                type="number"
                                value={entryStopLossPrice === 0 ? '' : entryStopLossPrice}
                                onChange={(e) => setEntryStopLossPrice(parseFloat(e.target.value) || 0)}
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                className={`w-[100px] h-8 text-right text-xs ${entryStopLossPrice === 0 ? 'animate-border-blink-cyan' : ''}`}
                              />
                            )}
                          </div>
                        </div>

                        {/* Проверка: стоплосс должен быть МЕНЬШЕ целевой/средней цены входа */}
                        {targetEntryPrice > 0 && entryStopLoss > 0 && (
                          <>
                            {entryStopLossType === 'points' ? (
                              (() => {
                                const referencePrice = (entryLogic === 'channel' && window.channelAveragePrice) 
                                  ? window.channelAveragePrice 
                                  : targetEntryPrice;
                                return referencePrice - entryStopLoss >= referencePrice && (
                                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                                    <div className="text-sm text-red-800">
                                      ⚠️ Stop-Loss должен быть ниже {entryLogic === 'channel' ? 'средней цены' : 'целевой цены'}
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              (() => {
                                const referencePrice = (entryLogic === 'channel' && window.channelAveragePrice) 
                                  ? window.channelAveragePrice 
                                  : targetEntryPrice;
                                return entryStopLoss >= referencePrice && (
                                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                                    <div className="text-sm text-red-800">
                                      ⚠️ Stop-Loss должен быть ниже {entryLogic === 'channel' ? 'средней цены' : 'целевой цены'}
                                    </div>
                                  </div>
                                );
                              })()
                            )}
                          </>
                        )}
                      </div>
                    )}

                  </CardContent>
                </Card>

                {/* Блок Финансовый контроль */}
                <FinancialControl selectedTicker={selectedTicker} storagePrefix="newDeal" />

                {/* Новый блок с желтым бордером */}
                <>
                  <Card className="border overflow-hidden bg-white" style={{ borderColor: '#fbbf24' }}>
                    <div className="flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: '#b8b8b8' }}>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium">Справка</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsReferenceCollapsed(!isReferenceCollapsed)}
                        className="p-1 hover:bg-muted rounded transition-colors"
                        title={isReferenceCollapsed ? 'Развернуть' : 'Свернуть'}
                      >
                        {isReferenceCollapsed ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="18 15 12 9 6 15"></polyline>
                          </svg>
                        )}
                      </button>
                    </div>
                    {!isReferenceCollapsed && (
                      <div className="space-y-4 p-6">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                          <div className="text-sm text-yellow-800 font-medium mb-2">
                            ⚠️ Принцип градуального открытия:
                          </div>
                          <div className="text-sm text-gray-700">
                            Каждый контракт открывается по мере снижения цены через равный интервал. Это позволяет усреднить цену входа и снизить риск входа на пике.
                          </div>
                        </div>

                        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                          <div className="text-sm text-yellow-800 font-medium mb-2">
                            ⚠️ Принцип градуального закрытия:
                          </div>
                          <div className="text-sm text-gray-700">
                            Каждый контракт закрывается через равный интервал роста цены. Первый приносит наименьшую прибыль, последний - наибольшую, обеспечивая оптимальное использование тренда.
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                </>
              </div>

              {/* Правая колонка (3/4) с двумя столбцами */}
              <div className="flex-1 flex gap-6">
                {/* Столбец 1 - Блок 2: ОТКРЫТИЕ / Усреднение входа */}
                <div className="flex-1 min-h-0 h-full">
                  <div className="border rounded-lg overflow-hidden bg-white h-full flex flex-col" style={{ borderColor: '#b8b8b8' }}>
                    {/* Бирюзовый заголовок */}
                    <div className="px-4 py-3" style={{ 
                      backgroundColor: (
                        targetEntryPrice === 0 || 
                        marginAmount === 0 ||
                        (entryLogic === 'channel' && channelWidth === 0) ||
                        (showEntrySL && entryStopLoss === 0) ||
                        (showEntrySL && entryStopLossType === 'price' && entryLogic === 'uniform' && entryStopLoss >= targetEntryPrice) ||
                        (showEntrySL && entryStopLossType === 'price' && entryLogic === 'channel' && window.channelAveragePrice && entryStopLoss >= window.channelAveragePrice)
                      ) ? '#9ca3af' : 'rgb(6, 182, 212)' 
                    }}>
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-white">ОТКРЫТИЕ / Усреднение входа</h4>
                      </div>
                    </div>

                    {/* Контент блока */}
                    <div className="px-4 py-4 space-y-4 flex-1 overflow-y-auto">
                      {/* Целевая цена входа */}
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Целевая цена входа</Label>
                        <Input
                          type="number"
                          value={targetEntryPrice === 0 ? '' : targetEntryPrice}
                          onChange={(e) => setTargetEntryPrice(parseFloat(e.target.value) || 0)}
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          className={`w-[100px] h-8 text-right text-xs ${targetEntryPrice === 0 ? 'animate-border-blink-cyan' : ''}`}
                        />
                      </div>

                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Логика усреднения / стратегия входа</Label>
                        <div className="flex items-center gap-3">
                          <Select value={entryLogic} onValueChange={setEntryLogic}>
                            <SelectTrigger className="w-[250px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="uniform">Полный вход</SelectItem>
                              <SelectItem value="channel">Набор позиции</SelectItem>
                            </SelectContent>
                          </Select>
                          
                          {entryLogic === 'channel' && (
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-gray-500 font-normal whitespace-nowrap">Ширина канала в пунктах</Label>
                              <Input
                                type="number"
                                value={channelWidth}
                                onChange={(e) => setChannelWidth(parseFloat(e.target.value) || 0)}
                                min="0.5"
                                step="0.01"
                                className={`w-[50px] h-8 text-right text-xs ${channelWidth === 0 ? 'animate-border-blink-cyan' : ''}`}
                                onFocus={(e) => {
                                  if (channelWidth === 0) {
                                    e.target.value = '';
                                  }
                                }}
                                onBlur={(e) => {
                                  const numValue = parseFloat(e.target.value) || 0;
                                  setChannelWidth(numValue);
                                  e.target.value = numValue === 0 ? '' : numValue.toString();
                                }}
                                placeholder="0"
                              />
                            </div>
                          )}
                        </div>

                        {/* Информационный блок */}
                        {entryLogic === 'channel' && channelWidth > 0 && (
                          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                            <div className="text-sm text-blue-800">
                              💡 1-я покупка сразу, 2-я через {channelWidth}п, остальные через {(channelWidth * 0.5).toFixed(1)}п
                            </div>
                          </div>
                        )}

                        {/* Таблица для "Полный вход" */}
                        {targetEntryPrice > 0 && entryLogic === 'uniform' && (
                          <div className="border rounded-md overflow-hidden">
                            <h4 className="text-sm font-semibold bg-gray-50 px-3 py-2 border-b">📋 План входа</h4>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-2 text-right font-medium text-gray-700">Количество</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-700">Цена входа</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-700">Маржин всего</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="border-t hover:bg-gray-50">
                                    <td className="px-3 py-2 text-right">{quantity}</td>
                                    <td className="px-3 py-2 text-right">{formatMoney(targetEntryPrice, true)}</td>
                                    <td className="px-3 py-2 text-right font-medium">{formatMoney(marginAmount * quantity)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Таблица для "Набор позиции" */}
                        {targetEntryPrice > 0 && entryLogic === 'channel' && channelWidth > 0 && (
                          <div className="border rounded-md overflow-hidden">
                            <h4 className="text-sm font-semibold bg-gray-50 px-3 py-2 border-b">📋 План входа</h4>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-2 text-center font-medium text-gray-700">Шаг</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-700">Количество</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-700">Цена входа</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-700">Маржин</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-700">Всего маржин</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(() => {
                                    const entries = [];
                                    let totalMargin = 0;
                                    
                                    // Корректируем количество контрактов, если необходимо
                                    let adjustedQuantity = quantity;
                                    let attempts = 0;
                                    const maxAttempts = 10; // защита от бесконечного цикла
                                    
                                    while (attempts < maxAttempts) {
                                      let remainingContracts = adjustedQuantity;
                                      let stepNumber = 0;
                                      let currentPrice = targetEntryPrice;
                                      const tempEntries = [];
                                      let canceled = false;
                                      
                                      // Логика входов с удвоением
                                      // Для SHORT цены растут вверх, для LONG - падают вниз
                                      const priceDirection = positionDirection === 'SHORT' ? 1 : -1;
                                      
                                      while (remainingContracts > 0) {
                                        let contractsInStep;
                                        
                                        if (stepNumber === 0) {
                                          // 1-й вход: 1 контракт по целевой цене
                                          contractsInStep = 1;
                                          currentPrice = targetEntryPrice;
                                        } else if (stepNumber === 1) {
                                          // 2-й вход: 1 контракт через channelWidth
                                          contractsInStep = 1;
                                          currentPrice = targetEntryPrice + (priceDirection * channelWidth);
                                        } else if (stepNumber === 2) {
                                          // 3-й вход: 2 контракта через половину ширины канала
                                          contractsInStep = Math.min(2, remainingContracts);
                                          currentPrice = currentPrice + (priceDirection * channelWidth * 0.5);
                                        } else {
                                          // 4-й и далее: удвоение количества контрактов
                                          const previousContracts = tempEntries[stepNumber - 1].contracts;
                                          contractsInStep = Math.min(previousContracts * 2, remainingContracts);
                                          currentPrice = currentPrice + (priceDirection * channelWidth * 0.5);
                                        }
                                        
                                        // Проверка на возможность удвоения для шагов 4+
                                        if (stepNumber >= 3) {
                                          const previousContracts = tempEntries[stepNumber - 1].contracts;
                                          const desiredContracts = previousContracts * 2;
                                          if (contractsInStep < desiredContracts) {
                                            // Отменяем шаг и уменьшаем общее количество на нераспределенный остаток
                                            adjustedQuantity -= remainingContracts;
                                            canceled = true;
                                            break;
                                          }
                                        }
                                        
                                        const margin = marginAmount * contractsInStep;
                                        totalMargin += margin;
                                        
                                        tempEntries.push({
                                          step: stepNumber + 1,
                                          contracts: contractsInStep,
                                          price: currentPrice,
                                          margin: margin,
                                          totalMargin: totalMargin
                                        });
                                        
                                        remainingContracts -= contractsInStep;
                                        stepNumber++;
                                      }
                                      
                                      if (!canceled) {
                                        // Успешно, копируем tempEntries в entries
                                        entries.length = 0; // очищаем
                                        entries.push(...tempEntries);
                                        break;
                                      }
                                      attempts++;
                                    }
                                    
                                    // Вычисляем среднюю цену позиции
                                    const totalCost = entries.reduce((sum, entry) => sum + (entry.price * entry.contracts), 0);
                                    const totalContracts = entries.reduce((sum, entry) => sum + entry.contracts, 0);
                                    const averagePrice = totalCost / totalContracts;
                                    
                                    // Сохраняем среднюю цену для использования в блоке стоплосса
                                    window.channelAveragePrice = averagePrice;
                                    window.channelStepsCount = entries.length;
                                    
                                    return entries.map((entry, index) => (
                                      <tr key={index} className="border-t hover:bg-gray-50">
                                        <td className="px-3 py-2 text-center">{entry.step}</td>
                                        <td className="px-3 py-2 text-right">{entry.contracts}</td>
                                        <td className="px-3 py-2 text-right">{formatMoney(entry.price, true)}</td>
                                        <td className="px-3 py-2 text-right">{formatMoney(entry.margin)}</td>
                                        <td className="px-3 py-2 text-right font-medium">{formatMoney(entry.totalMargin)}</td>
                                      </tr>
                                    ));
                                  })()}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Инфоблок со средней ценой для "Набор позиции" */}
                        {targetEntryPrice > 0 && entryLogic === 'channel' && channelWidth > 0 && window.channelStepsCount > 1 && (
                          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                            <div className="text-sm text-blue-800">
                              📊 Средняя цена позиции: {formatMoney(window.channelAveragePrice, true)}
                            </div>
                          </div>
                        )}

                        {/* Stop-Loss значение под таблицей для "Полный вход" */}
                        {targetEntryPrice > 0 && entryLogic === 'uniform' && entryStopLoss > 0 && showEntrySL && (
                          <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                            <div className="text-sm text-orange-800">
                              🛡️ Stop-Loss: {entryStopLossType === 'points' ? formatMoney(targetEntryPrice - entryStopLoss, true) : formatMoney(entryStopLoss, true)}
                            </div>
                          </div>
                        )}

                        {/* Stop-Loss значение под таблицей для "Набор позиции" */}
                        {targetEntryPrice > 0 && entryLogic === 'channel' && channelWidth > 0 && entryStopLoss > 0 && showEntrySL && (
                          <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                            <div className="text-sm text-orange-800">
                              🛡️ Stop-Loss: {entryStopLossType === 'points' 
                                ? formatMoney((window.channelAveragePrice || targetEntryPrice) - entryStopLoss, true) 
                                : formatMoney(entryStopLoss, true)}
                            </div>
                          </div>
                        )}

                      </div>

                    </div>
                  </div>
                </div>

                {/* Столбец 2 - ЗАКРЫТИЕ / Фиксация прибыли */}
                <div className="flex-1 min-h-0 h-full">
                  <div className="border rounded-lg overflow-hidden bg-white h-full flex flex-col" style={{ borderColor: '#b8b8b8' }}>
                    {/* Оранжевый заголовок */}
                    <div className="px-4 py-3" style={{ backgroundColor: '#f97316' }}>
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-white">ЗАКРЫТИЕ / Фиксация прибыли</h4>
                      </div>
                    </div>

                    {/* Контент блока */}
                    <div className="px-4 py-4 space-y-4 flex-1 overflow-y-auto">
                      {/* Целевая прибыль в % */}
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Целевая прибыль в %</Label>
                        <Input
                          type="number"
                          value={targetProfitPercent}
                          onChange={(e) => setTargetProfitPercent(parseFloat(e.target.value) || 0)}
                          min="0"
                          max="1000"
                          step="1"
                          className="w-[100px] text-right"
                        />
                      </div>

                      {/* Схема выхода / групповая разгрузка */}
                      <div className="space-y-3">
                        <div className="font-bold text-sm">Схема выхода / групповая разгрузка</div>
                        
                        <div className="flex items-center space-x-6">
                          <Select value={exitSchemeType} onValueChange={(value) => {
                            setExitSchemeType(value);
                            setExitSchemeError(null);
                          }}>
                            <SelectTrigger className="w-[250px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="uniform">Равномерно по 1 контракту</SelectItem>
                              <SelectItem value="by2">Группами по 2 контракта</SelectItem>
                              <SelectItem value="by4">Группами по 4 контракта</SelectItem>
                              <SelectItem value="custom">Свой вариант</SelectItem>
                            </SelectContent>
                          </Select>

                          {exitSchemeType === 'custom' && (
                            <>
                              <input
                                type="text"
                                value={customExitScheme}
                                onChange={(e) => {
                                  setCustomExitScheme(e.target.value);
                                  setExitSchemeError(null);
                                }}
                                placeholder="2, 3, 3 или 2+3+3"
                                className={`w-[150px] text-right px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${exitSchemeError ? 'error' : ''} ${customExitScheme === '' ? 'animate-border-blink-cyan' : ''}`}
                              />
                              <Label className="text-xs text-gray-500 font-normal ml-2">Распределение по группам (например: 2, 3, 3)</Label>
                            </>
                          )}
                        </div>

                        {/* Инфоблок для custom схемы выхода */}
                        {exitSchemeType === 'custom' && (
                          <>
                            {exitSchemeError && (
                              <div className="error-message">❌ {exitSchemeError}</div>
                            )}
                            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                              <div className="text-sm text-blue-800">
                                💡 Сумма должна быть равна {quantity}
                              </div>
                            </div>
                          </>
                        )}

                        {/* Таблица плана выхода */}
                        {(() => {
                          // Определяем цену входа (целевая или средняя)
                          const entryPrice = entryLogic === 'channel' && window.channelAveragePrice 
                            ? window.channelAveragePrice 
                            : targetEntryPrice;
                          
                          // Проверяем наличие всех необходимых данных
                          if (!entryPrice || entryPrice === 0 || !pointValueForButton || quantity === 0 || targetProfitPercent === 0) {
                            return null;
                          }

                          // Вычисляем целевую прибыль в долларах
                          const totalMargin = marginAmount * quantity;
                          const targetProfitDollars = totalMargin * (targetProfitPercent / 100);

                          // Определяем схему выхода (количество контрактов в каждой группе)
                          let exitGroups = [];
                          
                          if (exitSchemeType === 'uniform') {
                            // По 1 контракту
                            exitGroups = Array(quantity).fill(1);
                          } else if (exitSchemeType === 'by2') {
                            // По 2 контракта
                            const fullGroups = Math.floor(quantity / 2);
                            const remainder = quantity % 2;
                            exitGroups = Array(fullGroups).fill(2);
                            if (remainder > 0) exitGroups.push(remainder);
                          } else if (exitSchemeType === 'by4') {
                            // По 4 контракта
                            const fullGroups = Math.floor(quantity / 4);
                            const remainder = quantity % 4;
                            exitGroups = Array(fullGroups).fill(4);
                            if (remainder > 0) exitGroups.push(remainder);
                          } else if (exitSchemeType === 'custom' && customExitScheme !== '') {
                            // Пользовательская схема
                            const parsedScheme = parseExitScheme(customExitScheme);
                            const validation = validateExitScheme(parsedScheme, quantity);
                            if (validation.isValid) {
                              exitGroups = parsedScheme;
                            } else {
                              return null; // Не показываем таблицу если схема невалидна
                            }
                          } else {
                            return null;
                          }

                          // Вычисляем интервал между выходами (Δ)
                          // Формула: Δ = targetProfitDollars / (pointValue * sum(i * contracts[i]))
                          const weightedSum = exitGroups.reduce((sum, contracts, index) => {
                            return sum + (index + 1) * contracts;
                          }, 0);
                          
                          const delta = targetProfitDollars / (pointValueForButton * weightedSum);

                          // Формируем массив выходов
                          const exits = [];
                          let accumulatedProfit = 0;

                          exitGroups.forEach((contracts, index) => {
                            const stepNumber = index + 1;
                            
                            // Цена выхода (для LONG идем вверх, для SHORT - вниз)
                            const exitPrice = positionDirection === 'LONG' 
                              ? entryPrice + (stepNumber * delta)
                              : entryPrice - (stepNumber * delta);
                            
                            // Прибыль от этого шага
                            const priceDiff = positionDirection === 'LONG'
                              ? exitPrice - entryPrice
                              : entryPrice - exitPrice;
                            const stepProfit = priceDiff * pointValueForButton * contracts;
                            
                            accumulatedProfit += stepProfit;

                            exits.push({
                              step: stepNumber,
                              contracts: contracts,
                              exitPrice: exitPrice,
                              stepProfit: stepProfit,
                              accumulatedProfit: accumulatedProfit
                            });
                          });

                          // Вычисляем данные для инфоблока
                          const finalExit = exits[exits.length - 1];
                          const totalPoints = exitGroups.length * delta;
                          const finalPrice = finalExit.exitPrice;

                          return (
                            <>
                              <div className="border rounded-md overflow-hidden">
                                <h4 className="text-sm font-semibold bg-gray-50 px-3 py-2 border-b">📋 План выхода</h4>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        <th className="px-3 py-2 text-center font-medium text-gray-700">Шаг</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-700">Количество</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-700">Цена выхода</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-700">Прибыль</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-700">Накопленная</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {exits.map((exit, index) => (
                                        <tr key={index} className="border-t hover:bg-gray-50">
                                          <td className="px-3 py-2 text-center">{exit.step}</td>
                                          <td className="px-3 py-2 text-right">{exit.contracts}</td>
                                          <td className="px-3 py-2 text-right">{formatMoney(exit.exitPrice, true)}</td>
                                          <td className="px-3 py-2 text-right text-green-600 font-medium">{formatMoney(exit.stepProfit)}</td>
                                          <td className="px-3 py-2 text-right font-medium">{formatMoney(exit.accumulatedProfit)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {/* Инфоблок с итоговой информацией */}
                              <div className="bg-green-50 border border-green-200 rounded-md p-3">
                                <div className="text-sm text-green-800">
                                  ℹ️ Расчет выхода для получения <span className="font-bold">{targetProfitPercent}%</span> прибыли в сумме <span className="font-bold">{formatMoney(targetProfitDollars)}</span>.
                                  <br />
                                  Интервал: <span className="font-bold">{delta.toFixed(2)}</span> пунктов. Общий рост: <span className="font-bold">{totalPoints.toFixed(2)}</span> пунктов. Финальная цена: <span className="font-bold">{formatMoney(finalPrice, true)}</span>.
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* График пользовательских данных (входы/выходы/стоп-лосс) */}
            <div className="mt-6 w-full">
              <OwnDataChart
                averagePrice={(() => {
                  // Рассчитываем среднюю цену входа
                  if (entryLogic === 'channel' && window.channelAveragePrice) {
                    return window.channelAveragePrice;
                  }
                  return targetEntryPrice > 0 ? targetEntryPrice : null;
                })()}
                entryPrices={(() => {
                  // entryPrices: массив цен входа (по логике калькулятора)
                  const prices = [];
                  if (targetEntryPrice > 0 && entryLogic === 'uniform') {
                    // Для равномерного входа - все контракты по одной цене
                    for (let i = 0; i < quantity; i++) prices.push(targetEntryPrice);
                  } else if (targetEntryPrice > 0 && entryLogic === 'channel' && channelWidth > 0) {
                    // Для набора позиции - используем ту же логику, что и в таблице
                    // Для SHORT цены растут вверх, для LONG - падают вниз
                    const priceDirection = positionDirection === 'SHORT' ? 1 : -1;
                    
                    // Корректируем количество контрактов, если необходимо
                    let adjustedQuantity = quantity;
                    let attempts = 0;
                    const maxAttempts = 10; // защита от бесконечного цикла
                    
                    while (attempts < maxAttempts) {
                      let remainingContracts = adjustedQuantity;
                      let stepNumber = 0;
                      let currentPrice = targetEntryPrice;
                      const entries = [];
                      let canceled = false;
                      
                      while (remainingContracts > 0) {
                        let contractsInStep;
                        
                        if (stepNumber === 0) {
                          // 1-й вход: 1 контракт по целевой цене
                          contractsInStep = 1;
                          currentPrice = targetEntryPrice;
                        } else if (stepNumber === 1) {
                          // 2-й вход: 1 контракт через channelWidth
                          contractsInStep = 1;
                          currentPrice = targetEntryPrice + (priceDirection * channelWidth);
                        } else if (stepNumber === 2) {
                          // 3-й вход: 2 контракта через половину ширины канала
                          contractsInStep = Math.min(2, remainingContracts);
                          currentPrice = currentPrice + (priceDirection * channelWidth * 0.5);
                        } else {
                          // 4-й и далее: удвоение количества контрактов
                          const previousContracts = entries[stepNumber - 1].contracts;
                          contractsInStep = Math.min(previousContracts * 2, remainingContracts);
                          currentPrice = currentPrice + (priceDirection * channelWidth * 0.5);
                        }
                        
                        // Проверка на возможность удвоения для шагов 4+
                        if (stepNumber >= 3) {
                          const previousContracts = entries[stepNumber - 1].contracts;
                          const desiredContracts = previousContracts * 2;
                          if (contractsInStep < desiredContracts) {
                            // Отменяем шаг и уменьшаем общее количество на нераспределенный остаток
                            adjustedQuantity -= remainingContracts;
                            canceled = true;
                            break;
                          }
                        }
                        
                        entries.push({ contracts: contractsInStep, price: currentPrice });
                        
                        // Добавляем цены для каждого контракта в этом шаге
                        for (let j = 0; j < contractsInStep; j++) {
                          prices.push(currentPrice);
                        }
                        
                        remainingContracts -= contractsInStep;
                        stepNumber++;
                      }
                      
                      if (!canceled) break;
                      attempts++;
                    }
                    
                    // Вычисляем среднюю цену входа для использования в других расчетах
                    if (prices.length > 0) {
                      window.channelAveragePrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
                    }
                  }
                  return prices;
                })()}
                exitPrices={(() => {
                  // exitPrices: массив цен выхода (по логике калькулятора)
                  const prices = [];
                  if (!targetEntryPrice || !quantity || !targetProfitPercent) return prices;
                  // Определяем цену входа (целевая или средняя)
                  const entryPriceVal = entryLogic === 'channel' && window.channelAveragePrice ? window.channelAveragePrice : targetEntryPrice;
                  // Схема выхода
                  let exitGroups = [];
                  if (exitSchemeType === 'uniform') exitGroups = Array(quantity).fill(1);
                  else if (exitSchemeType === 'by2') {
                    const full = Math.floor(quantity / 2); const rem = quantity % 2;
                    exitGroups = Array(full).fill(2); if (rem > 0) exitGroups.push(rem);
                  } else if (exitSchemeType === 'by4') {
                    const full = Math.floor(quantity / 4); const rem = quantity % 4;
                    exitGroups = Array(full).fill(4); if (rem > 0) exitGroups.push(rem);
                  } else if (exitSchemeType === 'custom' && customExitScheme) {
                    try {
                      exitGroups = parseExitScheme(customExitScheme);
                    } catch { exitGroups = []; }
                  }
                  // Расчет цен выхода
                  const totalMargin = marginAmount * quantity;
                  const targetProfitDollars = totalMargin * (targetProfitPercent / 100);
                  const weightedSum = exitGroups.reduce((sum, contracts, idx) => sum + (idx + 1) * contracts, 0);
                  const delta = pointValueForButton && weightedSum ? targetProfitDollars / (pointValueForButton * weightedSum) : 0;
                  let step = 0;
                  while (step < exitGroups.length) {
                    const exitPrice = positionDirection === 'LONG'
                      ? entryPriceVal + ((step + 1) * delta)
                      : entryPriceVal - ((step + 1) * delta);
                    prices.push(exitPrice);
                    step++;
                  }
                  return prices;
                })()}
                stopLoss={(() => {
                  // Рассчитываем абсолютную цену стоп-лосса
                  if (!showEntrySL || entryStopLoss <= 0) return null;
                  
                  // Определяем среднюю цену входа
                  let avgEntryPrice = targetEntryPrice;
                  if (entryLogic === 'channel' && window.channelAveragePrice) {
                    avgEntryPrice = window.channelAveragePrice;
                  }
                  
                  // Конвертируем пункты в абсолютную цену
                  const stopLossPrice = positionDirection === 'LONG'
                    ? avgEntryPrice - entryStopLoss
                    : avgEntryPrice + entryStopLoss;
                  
                  return stopLossPrice;
                })()}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
    </form>
  );
}

export default NewDeal;
