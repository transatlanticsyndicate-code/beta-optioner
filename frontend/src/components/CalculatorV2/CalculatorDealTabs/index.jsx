/**
 * Компонент табов "Калькулятор" / "Сделка"
 * ЗАЧЕМ: Разделяет функционал калькулятора опционов и управления сделками
 * Затрагивает: UniversalOptionsCalculator, OptionsMetrics, PLChart, OptionSelectionResult, ExitCalculator
 */

import React, { useState, useMemo } from 'react';
import { Calculator, FileText } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import { Card, CardContent } from '../../ui/card';

// Импорт компонентов калькулятора
import OptionsMetrics from '../OptionsMetrics';
import PLChart from '../PLChart';
import OptionSelectionResult from '../OptionSelectionResult';
import ExitCalculator from '../ExitCalculator';

// Импорт функций для взаимодействия с расширением Chrome
import { sendSlicesToTradingViewCommand, sendClearSlicesCommand } from '../../../hooks/useExtensionData';

// Импорт компонентов и утилит таба Сделка
import ScenarioBlock from './ScenarioBlock';
import { calculateExitPlan } from './calculateExitPlan';

/**
 * CalculatorDealTabs — контейнер с двумя табами под таблицей опционов
 * @param {Object} props — все пропсы для дочерних компонентов
 */
function CalculatorDealTabs({
  // Общие пропсы
  options,
  positions,
  currentPrice,
  selectedTicker,
  daysPassed,
  setDaysPassed,
  targetPrice,
  setTargetPrice,
  ivSurface,
  dividendYield,
  calculatorMode,
  contractMultiplier,
  stockClassification,
  
  // Пропсы для OptionsMetrics
  shouldShowBlock,
  isFuturesMissingSettings,
  isAIEnabled,
  aiVolatilityMap,
  fetchAIVolatility,
  
  // Пропсы для PLChart
  showOptionLines,
  showProbabilityZones,
  
  // Пропсы для OptionSelectionResult
  optionSelectionParams,
  
  // Пропсы для ExitCalculator
  selectedExpirationDate,
  savedConfigDate,
  setUserAdjustedDays,
  
  // Пропсы для управления табами извне
  activeTab: externalActiveTab,
  onTabChange,
  
  // Информация о сделке
  dealInfo,
  dealSettings,
  setDealSettings,
}) {
  // Активный таб: 'calculator' или 'deal'
  // ЗАЧЕМ: Поддержка управления табом как изнутри, так и извне (при создании сделки)
  const [internalActiveTab, setInternalActiveTab] = useState('calculator');
  
  // State для целевой цены актива в %
  // ЗАЧЕМ: Позволяет задать целевую цену актива относительно текущей цены
  const [targetAssetPricePercent, setTargetAssetPricePercent] = useState(60);
  
  // State для количества шагов выхода
  // ЗАЧЕМ: Позволяет настроить количество шагов в плане выхода
  const [exitStepsCount, setExitStepsCount] = useState(4);
  
  // State для инпута долларов (локальный, чтобы избежать прыгающих значений при вводе)
  // ЗАЧЕМ: При вводе в инпут значение не должно пересчитываться до потери фокуса
  const [dollarsInputValue, setDollarsInputValue] = useState('');
  const [isDollarsInputFocused, setIsDollarsInputFocused] = useState(false);
  
  // Отдельные state для негативного сценария (Buy PUT) — вход
  // ЗАЧЕМ: Настройки % и $ для входа в PUT независимы от CALL
  const [targetAssetPricePercentPut, setTargetAssetPricePercentPut] = useState(-10);
  const [dollarsInputValuePut, setDollarsInputValuePut] = useState('');
  const [isDollarsInputFocusedPut, setIsDollarsInputFocusedPut] = useState(false);
  
  // State для целевой цены выхода из PUT
  // ЗАЧЕМ: Отдельная целевая цена для выхода из PUT опциона
  const [targetAssetPricePercentPutExit, setTargetAssetPricePercentPutExit] = useState(-20);
  const [dollarsInputValuePutExit, setDollarsInputValuePutExit] = useState('');
  const [isDollarsInputFocusedPutExit, setIsDollarsInputFocusedPutExit] = useState(false);
  
  // State для отслеживания отправки срезок
  // ЗАЧЕМ: После отправки показываем кнопку перехода на TradingView вместо кнопки отправки
  const [slicesSent, setSlicesSent] = useState(false);
  
  // State для сохранения замороженного плана выхода
  // ЗАЧЕМ: После отправки срезок план выхода не должен пересчитываться
  const [frozenExitPlan, setFrozenExitPlan] = useState(null);
  
  // State для сохранения ссылки на график TradingView
  // ЗАЧЕМ: Используется в кнопке "Перейти на график TradingView"
  const [tradingViewUrl, setTradingViewUrl] = useState(null);
  
  // State для негативного сценария (Buy PUT) — аналогичные состояния
  // ЗАЧЕМ: Негативный сценарий имеет свои собственные срезки и ссылку на график
  const [slicesSentPut, setSlicesSentPut] = useState(false);
  const [frozenExitPlanPut, setFrozenExitPlanPut] = useState(null);
  const [tradingViewUrlPut, setTradingViewUrlPut] = useState(null);
  
  // Ref для хранения последнего обработанного dealSettings
  // ЗАЧЕМ: Избежать повторной обработки того же объекта dealSettings
  const lastProcessedSettingsRef = React.useRef(null);
  
  // Ref для отслеживания процесса восстановления
  // ЗАЧЕМ: Предотвратить сохранение dealSettings во время восстановления
  const isRestoringState = React.useRef(false);
  
  // Восстанавливаем состояние отправки срезок из dealSettings при загрузке позиции
  // ЗАЧЕМ: При открытии сохраненной позиции нужно показать правильные кнопки
  React.useEffect(() => {
    // Восстанавливаем только если dealSettings изменился (новый объект)
    if (dealSettings && dealSettings !== lastProcessedSettingsRef.current) {
      isRestoringState.current = true;
      
      if (dealSettings.slicesSent !== undefined) {
        setSlicesSent(dealSettings.slicesSent);
      }
      if (dealSettings.tradingViewUrl !== undefined) {
        setTradingViewUrl(dealSettings.tradingViewUrl);
      }
      if (dealSettings.frozenExitPlan !== undefined) {
        setFrozenExitPlan(dealSettings.frozenExitPlan);
      }
      
      // Восстанавливаем состояние негативного сценария (PUT)
      if (dealSettings.slicesSentPut !== undefined) {
        setSlicesSentPut(dealSettings.slicesSentPut);
      }
      if (dealSettings.tradingViewUrlPut !== undefined) {
        setTradingViewUrlPut(dealSettings.tradingViewUrlPut);
      }
      if (dealSettings.frozenExitPlanPut !== undefined) {
        setFrozenExitPlanPut(dealSettings.frozenExitPlanPut);
      }
      
      // Восстанавливаем настройки целевых цен PUT
      if (dealSettings.targetAssetPricePercentPut !== undefined) {
        setTargetAssetPricePercentPut(dealSettings.targetAssetPricePercentPut);
      }
      if (dealSettings.targetAssetPricePercentPutExit !== undefined) {
        setTargetAssetPricePercentPutExit(dealSettings.targetAssetPricePercentPutExit);
      }
      
      console.log('📊 Состояние срезок восстановлено из dealSettings:', {
        slicesSent: dealSettings.slicesSent,
        tradingViewUrl: dealSettings.tradingViewUrl,
        slicesSentPut: dealSettings.slicesSentPut,
        tradingViewUrlPut: dealSettings.tradingViewUrlPut,
      });
      
      lastProcessedSettingsRef.current = dealSettings;
      
      // Сбрасываем флаг восстановления после завершения
      setTimeout(() => {
        isRestoringState.current = false;
      }, 50);
    }
  }, [dealSettings]);
  
  // Фильтрация опционов по типу для разных сценариев
  // ЗАЧЕМ: Позитивный сценарий работает с Buy CALL, негативный — с Buy PUT
  const buyCallOptions = useMemo(() => {
    return options.filter(opt => opt.visible !== false && opt.action === 'Buy' && opt.type === 'CALL');
  }, [options]);
  
  const buyPutOptions = useMemo(() => {
    return options.filter(opt => opt.visible !== false && opt.action === 'Buy' && opt.type === 'PUT');
  }, [options]);
  
  // Флаг наличия негативного сценария
  const hasNegativeScenario = buyPutOptions.length > 0;
  
  // Динамический расчёт количества опционов Buy CALL (позитивный сценарий)
  // ЗАЧЕМ: При изменении quantity в таблице опционов — сделка автоматически обновляется
  const currentOptionsCount = useMemo(() => {
    return buyCallOptions.reduce((sum, opt) => sum + Math.abs(opt.quantity || 1), 0);
  }, [buyCallOptions]);
  
  // Количество опционов Buy PUT (негативный сценарий)
  const putOptionsCount = useMemo(() => {
    return buyPutOptions.reduce((sum, opt) => sum + Math.abs(opt.quantity || 1), 0);
  }, [buyPutOptions]);
  
  // Эффективное количество шагов (не больше количества опционов)
  // ЗАЧЕМ: Если опционов меньше чем шагов — уменьшаем шаги до количества опционов
  const effectiveStepsCount = useMemo(() => {
    if (currentOptionsCount <= 0) return exitStepsCount;
    return Math.min(exitStepsCount, currentOptionsCount);
  }, [exitStepsCount, currentOptionsCount]);
  
  // Количество шагов для негативного сценария фиксировано: 2 (вход и выход)
  const effectivePutStepsCount = 2;
  
  // Целевая цена актива в долларах (рассчитывается из текущей цены + проценты)
  // ЗАЧЕМ: currentPrice + (currentPrice * targetAssetPricePercent / 100)
  const targetAssetPriceDollars = useMemo(() => {
    if (currentPrice === 0) return 0;
    return Math.round(currentPrice * (1 + targetAssetPricePercent / 100) * 100) / 100;
  }, [currentPrice, targetAssetPricePercent]);
  
  // Целевая цена актива в $ для негативного сценария (PUT) — вход
  const targetAssetPriceDollarsPut = useMemo(() => {
    if (currentPrice === 0) return 0;
    return Math.round(currentPrice * (1 + targetAssetPricePercentPut / 100) * 100) / 100;
  }, [currentPrice, targetAssetPricePercentPut]);
  
  // Целевая цена актива в $ для негативного сценария (PUT) — выход
  const targetAssetPriceDollarsPutExit = useMemo(() => {
    if (currentPrice === 0) return 0;
    return Math.round(currentPrice * (1 + targetAssetPricePercentPutExit / 100) * 100) / 100;
  }, [currentPrice, targetAssetPricePercentPutExit]);
  
  // Общие параметры для расчёта планов выхода
  const exitPlanParams = { daysPassed, ivSurface, dividendYield, contractMultiplier, calculatorMode, dealInfo };
  
  // Расчёт плана выхода для позитивного сценария (Buy CALL)
  // ЗАЧЕМ: Равномерно распределяем количество опционов на N шагов выхода
  const exitPlan = useMemo(() => {
    return calculateExitPlan({
      ...exitPlanParams,
      filteredOptions: buyCallOptions,
      totalOptionsCount: currentOptionsCount,
      stepsCount: effectiveStepsCount,
      targetAssetPriceDollars,
    });
  }, [dealInfo, effectiveStepsCount, currentOptionsCount, buyCallOptions, targetAssetPriceDollars, daysPassed, ivSurface, dividendYield, contractMultiplier]);
  
  // Расчёт плана выхода для негативного сценария (Buy PUT)
  // ЗАЧЕМ: Отдельный план выхода для опционов Buy PUT
  const exitPlanPut = useMemo(() => {
    if (!hasNegativeScenario) return [];
    return calculateExitPlan({
      ...exitPlanParams,
      filteredOptions: buyPutOptions,
      totalOptionsCount: putOptionsCount,
      stepsCount: effectivePutStepsCount,
      targetAssetPriceDollars: targetAssetPriceDollarsPut,
      targetAssetPriceDollarsExit: targetAssetPriceDollarsPutExit,
      fullQuantityPerStep: true,
    });
  }, [dealInfo, effectivePutStepsCount, putOptionsCount, buyPutOptions, targetAssetPriceDollarsPut, targetAssetPriceDollarsPutExit, daysPassed, ivSurface, dividendYield, contractMultiplier, hasNegativeScenario]);
  
  // Сохраняем настройки таба Сделка при изменении
  // ЗАЧЕМ: Передать настройки в диалог сохранения позиции
  React.useEffect(() => {
    // Не сохраняем во время восстановления состояния
    if (isRestoringState.current) return;
    
    if (dealInfo && setDealSettings) {
      setDealSettings({
        targetAssetPricePercent,
        exitStepsCount,
        exitPlan,
        slicesSent,
        tradingViewUrl,
        frozenExitPlan,
        // Негативный сценарий (PUT)
        slicesSentPut,
        tradingViewUrlPut,
        frozenExitPlanPut,
        targetAssetPricePercentPut,
        targetAssetPricePercentPutExit,
      });
    }
  }, [dealInfo, targetAssetPricePercent, exitStepsCount, exitPlan, slicesSent, tradingViewUrl, frozenExitPlan, slicesSentPut, tradingViewUrlPut, frozenExitPlanPut, targetAssetPricePercentPut, targetAssetPricePercentPutExit, setDealSettings]);

  // Обработчик изменения процентов (позитивный сценарий)
  // ЗАЧЕМ: При изменении % — обновляем targetPrice в блоке симуляции
  const handlePercentChange = (value) => {
    const percent = Number(value) || 0;
    setTargetAssetPricePercent(percent);
    
    if (setTargetPrice && currentPrice > 0) {
      const newTargetPrice = Math.round(currentPrice * (1 + percent / 100) * 100) / 100;
      setTargetPrice(newTargetPrice);
    }
  };
  
  // Обработчик изменения долларов (позитивный сценарий)
  const handleDollarsInputChange = (value) => {
    setDollarsInputValue(value);
  };
  
  const handleDollarsFocus = () => {
    setIsDollarsInputFocused(true);
    setDollarsInputValue(targetAssetPriceDollars.toString());
  };
  
  const handleDollarsBlur = () => {
    setIsDollarsInputFocused(false);
    const dollars = Number(dollarsInputValue) || 0;
    if (currentPrice > 0 && dollars > 0) {
      const percent = Math.round(((dollars - currentPrice) / currentPrice) * 10000) / 100;
      setTargetAssetPricePercent(percent);
      if (setTargetPrice) setTargetPrice(dollars);
    }
  };
  
  const handleDollarsKeyDown = (e) => {
    if (e.key === 'Enter') e.target.blur();
  };
  
  // Обработчики для негативного сценария (PUT)
  const handlePercentChangePut = (value) => {
    setTargetAssetPricePercentPut(Number(value) || 0);
  };
  
  const handleDollarsInputChangePut = (value) => {
    setDollarsInputValuePut(value);
  };
  
  const handleDollarsFocusPut = () => {
    setIsDollarsInputFocusedPut(true);
    setDollarsInputValuePut(targetAssetPriceDollarsPut.toString());
  };
  
  const handleDollarsBlurPut = () => {
    setIsDollarsInputFocusedPut(false);
    const dollars = Number(dollarsInputValuePut) || 0;
    if (currentPrice > 0 && dollars > 0) {
      const percent = Math.round(((dollars - currentPrice) / currentPrice) * 10000) / 100;
      setTargetAssetPricePercentPut(percent);
    }
  };
  
  const handleDollarsKeyDownPut = (e) => {
    if (e.key === 'Enter') e.target.blur();
  };
  
  // Обработчики для выхода из PUT
  const handlePercentChangePutExit = (value) => {
    setTargetAssetPricePercentPutExit(Number(value) || 0);
  };
  
  const handleDollarsInputChangePutExit = (value) => {
    setDollarsInputValuePutExit(value);
  };
  
  const handleDollarsFocusPutExit = () => {
    setIsDollarsInputFocusedPutExit(true);
    setDollarsInputValuePutExit(targetAssetPriceDollarsPutExit.toString());
  };
  
  const handleDollarsBlurPutExit = () => {
    setIsDollarsInputFocusedPutExit(false);
    const dollars = Number(dollarsInputValuePutExit) || 0;
    if (currentPrice > 0 && dollars > 0) {
      const percent = Math.round(((dollars - currentPrice) / currentPrice) * 10000) / 100;
      setTargetAssetPricePercentPutExit(percent);
    }
  };
  
  const handleDollarsKeyDownPutExit = (e) => {
    if (e.key === 'Enter') e.target.blur();
  };
  
  // Генерация ссылки на график TradingView для опциона
  // ЗАЧЕМ: Формирует URL для просмотра графика опциона на TradingView
  // Формат: https://www.tradingview.com/chart/?symbol=OPRA:MSFT260220C430.0
  const generateTradingViewLink = () => {
    if (!dealInfo || buyCallOptions.length === 0) {
      return null;
    }
    
    // Используем первый Buy CALL опцион для формирования ссылки
    const firstOption = buyCallOptions[0];
    
    // Тикер базового актива
    const ticker = dealInfo.ticker || selectedTicker || '';
    
    // Дата экспирации в формате YYMMDD
    const expirationDate = new Date(firstOption.date);
    const year = String(expirationDate.getFullYear()).slice(-2);
    const month = String(expirationDate.getMonth() + 1).padStart(2, '0');
    const day = String(expirationDate.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    
    // Тип опциона (C или P)
    const optionType = firstOption.type === 'CALL' ? 'C' : 'P';
    
    // Страйк (если не дробный, добавляем .0)
    const strike = firstOption.strike;
    const strikeStr = Number.isInteger(strike) ? `${strike}.0` : String(strike);
    
    // Формируем ссылку
    const symbol = `${ticker}${dateStr}${optionType}${strikeStr}`;
    return `https://www.tradingview.com/chart/?symbol=OPRA:${symbol}`;
  };
  
  // Обработчик отправки срезок на график TradingView
  // ЗАЧЕМ: Формирует данные срезок и отправляет команду в расширение Chrome
  const handleSendSlicesToTradingView = () => {
    if (!dealInfo || exitPlan.length === 0) {
      console.warn('⚠️ Нет данных для отправки срезок');
      return;
    }

    // Генерируем ссылку на график TradingView
    const chartUrl = generateTradingViewLink();
    if (!chartUrl) {
      console.warn('⚠️ Не удалось сгенерировать ссылку на график TradingView');
      return;
    }

    // Получаем первый Buy CALL опцион для ASK цены
    const firstOption = buyCallOptions[0];
    
    // Получаем ASK цену опциона из таблицы
    let askPrice = 0;
    if (firstOption) {
      if (firstOption.isPremiumModified && firstOption.customPremium !== undefined) {
        askPrice = parseFloat(firstOption.customPremium) || 0;
      } else {
        askPrice = parseFloat(firstOption.ask) || parseFloat(firstOption.premium) || 0;
      }
    }

    // Получаем дату входа из dealInfo
    const entryDate = dealInfo.createdAt ? new Date(dealInfo.createdAt) : new Date();
    const formattedDate = `${String(entryDate.getDate()).padStart(2, '0')}.${String(entryDate.getMonth() + 1).padStart(2, '0')}.${String(entryDate.getFullYear()).slice(-2)}`;

    // Формируем массив срезок для отправки
    const slices = exitPlan.map(row => {
      // Цена базового актива одинакова для всех шагов - это текущая цена актива
      const assetPrice = currentPrice;

      // Формируем текст по шаблону с ASK ценой из таблицы опционов
      const text = `Срезка ${row.step} - цена Акции ${assetPrice.toFixed(2)} - цена покупки Опциона ${askPrice.toFixed(2)} * ${row.quantity} - дата входа ${formattedDate}`;

      return {
        price: row.optionPrice,
        text: text
      };
    });

    // Отправляем команду в расширение с ссылкой на график
    sendSlicesToTradingViewCommand(slices, chartUrl);
    console.log('📊 Срезки отправлены на график TradingView:', slices);
    console.log('🔗 Ссылка на график:', chartUrl);
    
    // Сохраняем ссылку для кнопки перехода
    setTradingViewUrl(chartUrl);
    
    // Замораживаем текущий план выхода
    setFrozenExitPlan(exitPlan);
    
    // Устанавливаем флаг отправки
    setSlicesSent(true);
  };

  // Обработчик сброса плана выхода (позитивный сценарий)
  // ЗАЧЕМ: Удаляет срезки из расширения и разблокирует таб "Сделка"
  const handleResetExitPlan = () => {
    sendClearSlicesCommand(tradingViewUrl);
    console.log('🗑️ Команда на удаление срезок отправлена в расширение');
    setFrozenExitPlan(null);
    setTradingViewUrl(null);
    setSlicesSent(false);
  };
  
  // Генерация ссылки на график TradingView для Buy PUT опциона
  // ЗАЧЕМ: Формирует URL для просмотра графика PUT опциона на TradingView
  const generateTradingViewLinkPut = () => {
    if (!dealInfo || buyPutOptions.length === 0) return null;
    
    const firstOption = buyPutOptions[0];
    const ticker = dealInfo.ticker || selectedTicker || '';
    
    const expirationDate = new Date(firstOption.date);
    const year = String(expirationDate.getFullYear()).slice(-2);
    const month = String(expirationDate.getMonth() + 1).padStart(2, '0');
    const day = String(expirationDate.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    
    const optionType = 'P';
    const strike = firstOption.strike;
    const strikeStr = Number.isInteger(strike) ? `${strike}.0` : String(strike);
    
    const symbol = `${ticker}${dateStr}${optionType}${strikeStr}`;
    return `https://www.tradingview.com/chart/?symbol=OPRA:${symbol}`;
  };
  
  // Обработчик отправки срезок для негативного сценария (Buy PUT)
  // ЗАЧЕМ: Формирует данные срезок PUT и отправляет команду в расширение Chrome
  const handleSendSlicesToTradingViewPut = () => {
    if (!dealInfo || exitPlanPut.length === 0) {
      console.warn('⚠️ Нет данных для отправки срезок (негативный сценарий)');
      return;
    }

    const chartUrl = generateTradingViewLinkPut();
    if (!chartUrl) {
      console.warn('⚠️ Не удалось сгенерировать ссылку на график TradingView (PUT)');
      return;
    }

    // Получаем первый Buy PUT опцион для ASK цены
    const firstOption = buyPutOptions[0];
    let askPrice = 0;
    if (firstOption) {
      if (firstOption.isPremiumModified && firstOption.customPremium !== undefined) {
        askPrice = parseFloat(firstOption.customPremium) || 0;
      } else {
        askPrice = parseFloat(firstOption.ask) || parseFloat(firstOption.premium) || 0;
      }
    }

    const entryDate = dealInfo.createdAt ? new Date(dealInfo.createdAt) : new Date();
    const formattedDate = `${String(entryDate.getDate()).padStart(2, '0')}.${String(entryDate.getMonth() + 1).padStart(2, '0')}.${String(entryDate.getFullYear()).slice(-2)}`;

    // Формируем срезки с надписями "Вход" и "Выход" и соответствующими целевыми ценами актива
    const stepLabels = ['Вход', 'Выход'];
    const stepAssetPrices = [targetAssetPriceDollarsPut, targetAssetPriceDollarsPutExit];
    const slices = exitPlanPut.map((row, index) => {
      const label = stepLabels[index] || `Шаг ${row.step}`;
      const assetPrice = stepAssetPrices[index] || currentPrice;
      const text = `${label} PUT - цена Акции ${assetPrice.toFixed(2)} - цена Опциона ${row.optionPrice.toFixed(2)} * ${row.quantity} - дата ${formattedDate}`;
      return { price: row.optionPrice, text };
    });

    console.log('📊 [PUT] chartUrl:', chartUrl);
    console.log('📊 [PUT] slices:', JSON.stringify(slices, null, 2));
    sendSlicesToTradingViewCommand(slices, chartUrl);
    console.log('📊 [PUT] Срезки PUT отправлены на график TradingView');
    
    setTradingViewUrlPut(chartUrl);
    setFrozenExitPlanPut(exitPlanPut);
    setSlicesSentPut(true);
  };
  
  // Обработчик сброса плана выхода (негативный сценарий)
  const handleResetExitPlanPut = () => {
    sendClearSlicesCommand(tradingViewUrlPut);
    console.log('🗑️ Команда на удаление срезок PUT отправлена в расширение');
    setFrozenExitPlanPut(null);
    setTradingViewUrlPut(null);
    setSlicesSentPut(false);
  };

  // Используем внешний таб если передан, иначе внутренний
  const activeTab = externalActiveTab !== undefined ? externalActiveTab : internalActiveTab;
  
  const handleTabChange = (value) => {
    // При переходе на таб "Сделка" устанавливаем targetPrice = targetAssetPriceDollars
    // ЗАЧЕМ: Синхронизация целевой цены актива с блоком "симуляция изменения рынка"
    if (value === 'deal' && setTargetPrice && targetAssetPriceDollars > 0) {
      setTargetPrice(targetAssetPriceDollars);
    }
    
    if (onTabChange) {
      onTabChange(value);
    } else {
      setInternalActiveTab(value);
    }
  };

  return (
    <div className="w-full space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* Заголовок с табами */}
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="calculator" className="flex items-center gap-2">
            <Calculator size={16} />
            Калькулятор
          </TabsTrigger>
          <TabsTrigger value="deal" className="flex items-center gap-2">
            <FileText size={16} />
            Сделка
          </TabsTrigger>
        </TabsList>

        {/* Таб "Калькулятор" — содержит все компоненты анализа */}
        <TabsContent value="calculator" className="space-y-6 mt-4">
          {/* Метрики опционов */}
          {shouldShowBlock('metrics-block') && !isFuturesMissingSettings && (
            <Card className="w-full relative" style={{ borderColor: '#b8b8b8' }}>
              <OptionsMetrics
                options={options}
                currentPrice={currentPrice}
                positions={positions}
                daysPassed={daysPassed}
                ivSurface={ivSurface}
                dividendYield={dividendYield}
                isAIEnabled={isAIEnabled}
                aiVolatilityMap={aiVolatilityMap}
                fetchAIVolatility={fetchAIVolatility}
                targetPrice={targetPrice}
                selectedTicker={selectedTicker}
                calculatorMode={calculatorMode}
                contractMultiplier={contractMultiplier}
              />
            </Card>
          )}

          {/* График P&L */}
          <Card className="w-full relative" style={{ borderColor: '#b8b8b8' }}>
            <CardContent className="pt-4 pb-4 px-6">
              <PLChart
                options={options}
                currentPrice={currentPrice}
                positions={positions}
                showOptionLines={showOptionLines}
                daysPassed={daysPassed}
                showProbabilityZones={showProbabilityZones}
                targetPrice={targetPrice}
                ivSurface={ivSurface}
                dividendYield={dividendYield}
                isAIEnabled={isAIEnabled}
                aiVolatilityMap={aiVolatilityMap}
                fetchAIVolatility={fetchAIVolatility}
                selectedTicker={selectedTicker}
                calculatorMode={calculatorMode}
                contractMultiplier={contractMultiplier}
                stockClassification={stockClassification}
              />
            </CardContent>
          </Card>

          {/* Результат подбора опционов */}
          <OptionSelectionResult
            selectionParams={optionSelectionParams}
            options={options}
            positions={positions}
            currentPrice={currentPrice}
            ivSurface={ivSurface}
            dividendYield={dividendYield}
            targetPrice={targetPrice}
            daysPassed={daysPassed}
            calculatorMode={calculatorMode}
            contractMultiplier={contractMultiplier}
          />

          {/* Калькулятор выхода из позиции */}
          <ExitCalculator
            options={options}
            positions={positions}
            currentPrice={currentPrice}
            daysPassed={daysPassed}
            setDaysPassed={(value) => {
              setDaysPassed(value);
              if (setUserAdjustedDays) setUserAdjustedDays(true);
            }}
            selectedExpirationDate={selectedExpirationDate}
            showOptionLines={showOptionLines}
            targetPrice={targetPrice}
            setTargetPrice={setTargetPrice}
            savedConfigDate={savedConfigDate}
            ivSurface={ivSurface}
            dividendYield={dividendYield}
            isAIEnabled={isAIEnabled}
            aiVolatilityMap={aiVolatilityMap}
            fetchAIVolatility={fetchAIVolatility}
            selectedTicker={selectedTicker}
            calculatorMode={calculatorMode}
            contractMultiplier={contractMultiplier}
            stockClassification={stockClassification}
          />
        </TabsContent>

        {/* Таб "Сделка" — данные о созданной сделке */}
        <TabsContent value="deal" className="mt-4 space-y-4">
          {dealInfo ? (
            <>
              {/* Позитивный сценарий (Buy CALL) — с кнопками срезок внутри */}
              <ScenarioBlock
                title="Позитивный сценарий"
                borderColor="#22c55e"
                bgColor="bg-green-100 dark:bg-green-900/30"
                textColor="text-green-700 dark:text-green-300"
                iconColor="text-green-600"
                focusRingColor="focus:ring-green-500"
                profitColor="text-green-600"
                exitStepsCount={exitStepsCount}
                setExitStepsCount={setExitStepsCount}
                targetAssetPricePercent={targetAssetPricePercent}
                inlineInputs
                inputsGroupLabel="Целевая цена актива:"
                handlePercentChange={handlePercentChange}
                targetAssetPriceDollars={targetAssetPriceDollars}
                dollarsInputValue={dollarsInputValue}
                isDollarsInputFocused={isDollarsInputFocused}
                handleDollarsInputChange={handleDollarsInputChange}
                handleDollarsFocus={handleDollarsFocus}
                handleDollarsBlur={handleDollarsBlur}
                handleDollarsKeyDown={handleDollarsKeyDown}
                exitPlan={exitPlan}
                frozenExitPlan={frozenExitPlan}
                slicesSent={slicesSent}
                onSendSlices={handleSendSlicesToTradingView}
                onResetSlices={handleResetExitPlan}
                tradingViewUrl={tradingViewUrl}
              />
              
              {/* Негативный сценарий (Buy PUT) — с кнопками срезок внутри */}
              {hasNegativeScenario && (
                <ScenarioBlock
                  title="Негативный сценарий"
                  borderColor="#ef4444"
                  bgColor="bg-red-100 dark:bg-red-900/30"
                  textColor="text-red-700 dark:text-red-300"
                  iconColor="text-red-600"
                  focusRingColor="focus:ring-red-500"
                  profitColor="text-green-600"
                  exitStepsCount={effectivePutStepsCount}
                  setExitStepsCount={() => {}}
                  targetAssetPricePercent={targetAssetPricePercentPut}
                  handlePercentChange={handlePercentChangePut}
                  targetAssetPriceDollars={targetAssetPriceDollarsPut}
                  dollarsInputValue={dollarsInputValuePut}
                  isDollarsInputFocused={isDollarsInputFocusedPut}
                  handleDollarsInputChange={handleDollarsInputChangePut}
                  handleDollarsFocus={handleDollarsFocusPut}
                  handleDollarsBlur={handleDollarsBlurPut}
                  handleDollarsKeyDown={handleDollarsKeyDownPut}
                  exitPlan={exitPlanPut}
                  frozenExitPlan={frozenExitPlanPut}
                  slicesSent={slicesSentPut}
                  onSendSlices={handleSendSlicesToTradingViewPut}
                  onResetSlices={handleResetExitPlanPut}
                  tradingViewUrl={tradingViewUrlPut}
                  planTitle="ПЛАН ВХОДА И ВЫХОДА для Опциона PUT"
                  hideStepsInput
                  stepLabels={['Вход', 'Выход']}
                  hideTotal
                  warningText="ВНИМАНИЕ! При выходе из Опциона PUT необходимо также выйти из всех Опционов CALL"
                  inlineInputs
                  inputsGroupLabel="Целевая цена актива для входа в PUT:"
                  secondGroupLabel="Целевая цена актива для выхода из PUT:"
                  secondGroupPercent={targetAssetPricePercentPutExit}
                  secondGroupHandlePercentChange={handlePercentChangePutExit}
                  secondGroupDollars={targetAssetPriceDollarsPutExit}
                  secondGroupDollarsInputValue={dollarsInputValuePutExit}
                  secondGroupIsDollarsInputFocused={isDollarsInputFocusedPutExit}
                  secondGroupHandleDollarsInputChange={handleDollarsInputChangePutExit}
                  secondGroupHandleDollarsFocus={handleDollarsFocusPutExit}
                  secondGroupHandleDollarsBlur={handleDollarsBlurPutExit}
                  secondGroupHandleDollarsKeyDown={handleDollarsKeyDownPutExit}
                />
              )}
            </>
          ) : (
            <Card className="w-full" style={{ borderColor: '#b8b8b8' }}>
              <CardContent className="pt-6 pb-6 px-6">
                <div className="flex flex-col items-center justify-center min-h-[200px] text-muted-foreground">
                  <FileText size={48} className="mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">Сделка не создана</h3>
                  <p className="text-sm text-center max-w-md">
                    Нажмите кнопку "+ СДЕЛКА" в верхней части страницы для создания новой сделки.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default CalculatorDealTabs;
