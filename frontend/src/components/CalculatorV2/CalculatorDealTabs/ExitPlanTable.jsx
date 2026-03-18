import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent } from '../../ui/card';
import { calculateOptionPLValue, adjustPLByStockGroup } from '../../../utils/optionPricing';
import { calculateFuturesOptionPLValue } from '../../../utils/futuresPricing';
import { CALCULATOR_MODES } from '../../../utils/universalPricing';
import { getOptionVolatility } from '../../../utils/volatilitySurface';

/**
 * Таблица Плана выхода для сделки
 * ЗАЧЕМ: Позволяет гибко настраивать цели по цене и количеству для каждого шага выхода
 */
function ExitPlanTable({ currentPrice, dealInfo, options, calculatorMode = CALCULATOR_MODES.STOCKS, contractMultiplier = 100, dividendYield = 0, stockClassification = null, ivSurface = null }) {
  // Дефолтные проценты для 4 шагов
  const defaultPercents = [15, 30, 45, 60];
  
  // Состояние шагов: [{ id, percent, dollars, quantity }]
  const [steps, setSteps] = useState([]);

  // Refs для отслеживания изменений и предотвращения перезаписи ручного ввода
  const lastSeenTotalQuantityRef = useRef(null);
  const lastSeenDealIdRef = useRef(null);

  // Функция расчёта даты выхода по умолчанию
  // ЗАЧЕМ: Каждый шаг получает дату +N месяцев от сегодня (шаг 1 = +1 месяц, шаг 2 = +2 месяца и т.д.)
  const calculateDefaultExitDate = (stepIndex) => {
    const today = new Date();
    const exitDate = new Date(today);
    exitDate.setMonth(exitDate.getMonth() + (stepIndex + 1));
    return exitDate.toISOString().split('T')[0]; // Формат YYYY-MM-DD
  };

  // Функция валидации даты выхода
  // ЗАЧЕМ: Дата выхода не должна быть больше даты экспирации опциона
  const validateExitDate = (exitDate, optionExpirationDate) => {
    if (!optionExpirationDate) return exitDate;
    
    const exit = new Date(exitDate);
    const expiration = new Date(optionExpirationDate);
    
    // Если дата выхода больше даты экспирации, возвращаем дату экспирации
    if (exit > expiration) {
      return optionExpirationDate;
    }
    
    return exitDate;
  };

  // Инициализация шагов при первом рендере или изменении dealInfo/options
  useEffect(() => {
    if (!dealInfo) return;

    // Берём все видимые опционы из текущей таблицы (options prop)
    // ЗАЧЕМ: Это позволяет автоматически добавлять/удалять опционы в плане выхода
    const visibleOptions = (options || []).filter(opt => opt.visible !== false);
    
    // Если нет видимых опционов, очищаем таблицу
    if (visibleOptions.length === 0) {
      setSteps([]);
      return;
    }

    // Используем текущие опционы из таблицы как liveOptions
    const liveOptions = visibleOptions;

    // Проверяем, новая ли это сделка
    const dealId = dealInfo.createdAt;
    if (lastSeenDealIdRef.current !== dealId) {
      lastSeenDealIdRef.current = dealId;
      lastSeenTotalQuantityRef.current = null; // Принудительный сброс количеств
    }

    setSteps(prevSteps => {
      let newSteps = [];
      let forceRedistribute = false;

      if (!dealInfo.isMultiDeal) {
        // ЛОГИКА ДЛЯ ОБЫЧНОЙ СДЕЛКИ (1 опцион)
        const option = liveOptions[0];
        const totalQuantity = Math.abs(Number(option.quantity) || 1);
        
        // Если общее количество изменилось извне — перераспределяем шаги
        if (lastSeenTotalQuantityRef.current !== totalQuantity) {
          forceRedistribute = true;
          lastSeenTotalQuantityRef.current = totalQuantity;
        }
        
        // Определяем количество шагов: не более 4, не более количества контрактов
        const stepsCount = Math.min(4, totalQuantity);
        
        // Распределяем количество контрактов по шагам
        const baseQuantity = Math.floor(totalQuantity / stepsCount);
        const remainder = totalQuantity % stepsCount;
        
        newSteps = Array.from({ length: stepsCount }, (_, index) => {
          const autoQuantity = index < remainder ? baseQuantity + 1 : baseQuantity;
          const existingStep = prevSteps[index];
          
          const percent = existingStep ? existingStep.percent : (defaultPercents[index] || (index + 1) * 15);
          const dollars = currentPrice ? (currentPrice * (1 + percent / 100)) : 0;
          
          // Используем ручное количество если нет forceRedistribute
          const quantity = (existingStep && !forceRedistribute) ? existingStep.quantity : autoQuantity;
          
          // Рассчитываем дату выхода по умолчанию (+N месяцев от сегодня)
          const defaultExitDate = calculateDefaultExitDate(index);
          const exitDate = existingStep?.exitDate || validateExitDate(defaultExitDate, option.date);
          
          return {
            id: index + 1,
            percent,
            dollars: Math.round(dollars * 100) / 100,
            quantity,
            exitDate, // Дата выхода для этого шага
            optionRef: option, // Сохраняем ссылку на опцион для отображения названия
            profit: existingStep ? existingStep.profit : 0 // Временно заглушка
          };
        });
      } else {
        // ЛОГИКА ДЛЯ МУЛЬТИСДЕЛКИ (>1 опциона)
        // Сортируем опционы по дате экспирации (от ближайшей к дальней)
        const sortedOptions = [...liveOptions].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Формируем строку количеств для отслеживания изменений
        const totalQuantityStr = sortedOptions.map(o => Math.abs(o.quantity || 1)).join(',');
        
        if (lastSeenTotalQuantityRef.current !== totalQuantityStr) {
          forceRedistribute = true;
          lastSeenTotalQuantityRef.current = totalQuantityStr;
        }
        
        // Количество шагов = количеству разных опционов (уже ограничено до 4 при создании)
        newSteps = sortedOptions.map((option, index) => {
          const autoQuantity = Math.abs(option.quantity || 1);
          const existingStep = prevSteps[index];
          
          const percent = existingStep ? existingStep.percent : (defaultPercents[index] || (index + 1) * 15);
          const dollars = currentPrice ? (currentPrice * (1 + percent / 100)) : 0;
          
          const quantity = (existingStep && !forceRedistribute) ? existingStep.quantity : autoQuantity;
          
          // Рассчитываем дату выхода по умолчанию (+N месяцев от сегодня)
          const defaultExitDate = calculateDefaultExitDate(index);
          const exitDate = existingStep?.exitDate || validateExitDate(defaultExitDate, option.date);
          
          return {
            id: index + 1,
            percent,
            dollars: Math.round(dollars * 100) / 100,
            quantity,
            exitDate, // Дата выхода для этого шага
            optionRef: option, // Сохраняем ссылку на опцион для расчёта P&L в будущем
            profit: existingStep ? existingStep.profit : 0
          };
        });
      }

      // Проверяем, были ли реальные изменения, чтобы избежать бесконечного ререндера
      let hasChanges = false;
      if (prevSteps.length !== newSteps.length) {
        hasChanges = true;
      } else {
        for (let i = 0; i < prevSteps.length; i++) {
          if (prevSteps[i].quantity !== newSteps[i].quantity || 
              prevSteps[i].percent !== newSteps[i].percent || 
              prevSteps[i].dollars !== newSteps[i].dollars) {
            hasChanges = true;
            break;
          }
        }
      }

      return hasChanges ? newSteps : prevSteps;
    });
  }, [currentPrice, dealInfo, options]);

  // Обработчик изменения процентов
  const handlePercentChange = (index, value) => {
    const newPercent = parseFloat(value) || 0;
    const newSteps = [...steps];
    newSteps[index].percent = newPercent;
    
    // Пересчитываем доллары
    if (currentPrice > 0) {
      const newDollars = currentPrice * (1 + newPercent / 100);
      newSteps[index].dollars = Math.round(newDollars * 100) / 100;
    }
    
    setSteps(newSteps);
  };

  // Обработчик изменения долларов
  const handleDollarsChange = (index, value) => {
    const newDollars = parseFloat(value) || 0;
    const newSteps = [...steps];
    newSteps[index].dollars = newDollars;
    
    // Пересчитываем проценты
    if (currentPrice > 0) {
      const newPercent = (newDollars / currentPrice - 1) * 100;
      newSteps[index].percent = Math.round(newPercent * 100) / 100;
    }
    
    setSteps(newSteps);
  };

  // Обработчик изменения количества
  const handleQuantityChange = (index, value) => {
    const newQuantity = parseInt(value, 10) || 0;
    const newSteps = [...steps];
    newSteps[index].quantity = newQuantity;
    setSteps(newSteps);
  };

  // Обработчик изменения даты выхода
  const handleExitDateChange = (index, value) => {
    const newSteps = [...steps];
    const step = newSteps[index];
    
    // Валидируем дату относительно даты экспирации опциона
    const validatedDate = validateExitDate(value, step.optionRef?.date);
    newSteps[index].exitDate = validatedDate;
    
    setSteps(newSteps);
  };

  // Форматирование названия опциона: "Buy CALL 80 (18.06.26)"
  const formatOptionName = (option) => {
    if (!option) return '';
    
    const action = option.action || 'Buy';
    const type = option.type || 'CALL';
    const strike = option.strike || 0;
    
    // Форматируем дату из ISO формата (YYYY-MM-DD) в DD.MM.YY
    let formattedDate = '';
    if (option.date) {
      const dateParts = option.date.split('-');
      if (dateParts.length === 3) {
        const year = dateParts[0].slice(-2); // Последние 2 цифры года
        const month = dateParts[1];
        const day = dateParts[2];
        formattedDate = `${day}.${month}.${year}`;
      }
    }
    
    return `${action} ${type} ${strike}${formattedDate ? ` (${formattedDate})` : ''}`;
  };

  // Расчёт P&L для конкретного шага на дату выхода
  // ЗАЧЕМ: Использует ТЕ ЖЕ функции calculateOptionPLValue / calculateFuturesOptionPLValue,
  // что и таблица опционов, для идентичного результата при одинаковых параметрах
  const calculateStepPL = (step) => {
    if (!step.optionRef || !step.dollars || step.quantity === 0 || !step.exitDate) return 0;

    const option = step.optionRef;
    const targetAssetPrice = step.dollars;

    // daysRemaining = дни от ДАТЫ ВЫХОДА до ЭКСПИРАЦИИ опциона
    // ЗАЧЕМ: Именно так считает таблица опционов — сколько дней осталось до экспирации на целевую дату
    const exitDt = new Date(step.exitDate + 'T00:00:00');
    const expDt = new Date(option.date + 'T00:00:00');
    const daysRemaining = Math.max(0, Math.ceil((expDt - exitDt) / (1000 * 60 * 60 * 24)));

    // currentDaysToExpiration = дни от ДАТЫ ВХОДА до ЭКСПИРАЦИИ (начальное значение для IV Surface)
    // ЗАЧЕМ: getOptionVolatility использует начальные дни как базу для интерполяции IV
    const entryDateStr = option.entryDate || new Date().toISOString().split('T')[0];
    const entryDt = new Date(entryDateStr + 'T00:00:00');
    const currentDaysToExpiration = Math.max(0, Math.ceil((expDt - entryDt) / (1000 * 60 * 60 * 24)));

    // Получаем IV через ту же функцию getOptionVolatility с IV Surface
    const optionVolatility = getOptionVolatility(
      option,
      currentDaysToExpiration,
      daysRemaining,
      ivSurface
    );

    // Подготовка объекта опциона — та же логика, что в таблице опционов
    // ЗАЧЕМ: При ручной премии обнуляем ask/bid, чтобы getEntryPrice() внутри calculateOptionPLValue использовал premium
    const effectivePremium = option.isPremiumModified ? option.customPremium : option.premium;
    const tempOpt = {
      ...option,
      premium: effectivePremium,
      ask: option.isPremiumModified ? 0 : option.ask,
      bid: option.isPremiumModified ? 0 : option.bid,
      quantity: step.quantity // Количество из шага плана выхода
    };

    // ЛОГИРОВАНИЕ: Диагностика — те же параметры, что логирует таблица опционов
    console.log(`[План выхода] 💰 P/L расчёт ${option.type} Strike $${option.strike}:`, {
      targetPrice: targetAssetPrice,
      currentDaysToExpiration,
      daysRemaining,
      IV: (optionVolatility * 100).toFixed(1) + '%',
      quantity: step.quantity,
      contractMultiplier
    });

    // Вызываем ТУ ЖЕ функцию расчёта P&L, что и таблица опционов
    let pl = 0;
    if (calculatorMode === CALCULATOR_MODES.FUTURES) {
      pl = calculateFuturesOptionPLValue(
        tempOpt,
        targetAssetPrice,
        daysRemaining,
        contractMultiplier,
        optionVolatility
      );
    } else {
      pl = calculateOptionPLValue(
        tempOpt,
        targetAssetPrice,
        currentPrice,
        daysRemaining,
        optionVolatility,
        dividendYield
      );
    }

    // Применяем корректировку P&L по группе акции (как в таблице опционов)
    if (calculatorMode === CALCULATOR_MODES.STOCKS && stockClassification) {
      pl = adjustPLByStockGroup(pl, stockClassification);
    }

    return Math.round(pl);
  };

  return (
    <Card className="w-full relative" style={{ borderColor: '#22c55e' }}>
      <CardContent className="pt-6 pb-6 px-6">
        <h3 className="text-lg font-bold text-green-700 dark:text-green-300 mb-4">
          План выхода
        </h3>
        
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="px-3 py-3 text-left font-medium w-16">Шаг</th>
                <th className="px-3 py-3 text-left font-medium w-48">Опцион</th>
                <th className="px-3 py-3 text-left font-medium w-32">Целевая цена +%</th>
                <th className="px-3 py-3 text-left font-medium w-32">Целевая цена $</th>
                <th className="px-3 py-3 text-left font-medium w-24">Количество</th>
                <th className="px-3 py-3 text-left font-medium w-32">Дата выхода</th>
                <th className="px-3 py-3 text-right font-medium w-32">P&L</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step, index) => (
                <tr key={step.id} className="border-t">
                  <td className="px-3 py-3 font-medium">Шаг {step.id}</td>
                  <td className="px-3 py-3 text-sm text-muted-foreground">
                    {formatOptionName(step.optionRef)}
                  </td>
                  
                  <td className="px-3 py-2">
                    <div className="relative">
                      <input
                        type="number"
                        value={step.percent}
                        onChange={(e) => handlePercentChange(index, e.target.value)}
                        className="w-full h-8 px-2 pr-6 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-transparent"
                        step="0.1"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                  </td>
                  
                  <td className="px-3 py-2">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                      <input
                        type="number"
                        value={step.dollars}
                        onChange={(e) => handleDollarsChange(index, e.target.value)}
                        className="w-full h-8 pl-5 pr-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-transparent"
                        step="0.01"
                      />
                    </div>
                  </td>
                  
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={step.quantity}
                      onChange={(e) => handleQuantityChange(index, e.target.value)}
                      className="w-full h-8 px-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-center bg-transparent"
                      min="0"
                    />
                  </td>
                  
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={step.exitDate || ''}
                      onChange={(e) => handleExitDateChange(index, e.target.value)}
                      max={step.optionRef?.date || ''}
                      className="w-full h-8 px-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-transparent"
                    />
                  </td>
                  
                  <td className="px-3 py-3 text-right font-medium">
                    {(() => {
                      const pl = calculateStepPL(step);
                      const isPositive = pl >= 0;
                      const colorClass = isPositive ? 'text-green-600' : 'text-red-600';
                      const sign = isPositive ? '+' : '';
                      return (
                        <span className={colorClass}>
                          {sign}${pl.toLocaleString()}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
              
              {/* Итоговая строка с общей суммой P&L */}
              {steps.length > 0 && (
                <tr className="border-t-2 border-gray-300 bg-gray-50 dark:bg-gray-800 font-bold">
                  <td className="px-3 py-3" colSpan="6">Итого:</td>
                  <td className="px-3 py-3 text-right">
                    {(() => {
                      const totalPL = steps.reduce((sum, step) => sum + calculateStepPL(step), 0);
                      const isPositive = totalPL >= 0;
                      const colorClass = isPositive ? 'text-green-600' : 'text-red-600';
                      const sign = isPositive ? '+' : '';
                      return (
                        <span className={colorClass}>
                          {sign}${totalPL.toLocaleString()}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default ExitPlanTable;
