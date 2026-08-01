/**
 * Компонент настроек цены и времени
 * ЗАЧЕМ: Обеспечивает синхронизированное управление ценой базового актива, прошедшими днями и волатильностью
 * 
 * ВАЖНО: Используем daysPassed (прошедшие дни) вместо daysRemaining
 * Это позволяет корректно обрабатывать опционы с разными сроками экспирации:
 * - Слайдер показывает сколько дней "прошло" от сегодня
 * - Каждый опцион имеет свой initialDaysToExpiration
 * - actualDaysRemaining = max(0, initialDaysToExpiration - daysPassed)
 * 
 * Затрагивает: расчеты P/L, графики, калькулятор выхода
 */

import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { isNonTradingDay } from '../../utils/marketHolidays';
import { parseDateAtStartOfDay, getTodayDateStringET } from '../../utils/dateUtils';

function PriceAndTimeSettings({
  currentPrice = 0,
  targetPrice = 0,
  setTargetPrice,
  daysPassed = 0,         // Прошедшие дни (новая логика)
  setDaysPassed,          // Функция для изменения прошедших дней
  userAdjustedDays = false,
  setUserAdjustedDays,
  userAdjustedTargetPrice = false,
  setUserAdjustedTargetPrice,
  options = [],
  minPrice = 0,
  maxPrice = 0,
  compact = false, // Компактный режим для левой колонки
  savedConfigDate = null,  // Дата сохранения конфигурации (для зафиксированных позиций)
  livePrice = null  // Текущая рыночная цена (для кнопки сброса в зафиксированных позициях)
}) {
  const [priceInput, setPriceInput] = React.useState(targetPrice.toFixed(2));
  const priceInputFocusedRef = React.useRef(false);

  // Синхронизация input с targetPrice
  // ЗАЧЕМ: Авто-синхронизация цены БА с currentPrice живёт в родителе (UniversalOptionsCalculator),
  // здесь поле просто отражает то, что лежит в targetPrice, пока пользователь не активен в инпуте.
  React.useEffect(() => {
    if (!priceInputFocusedRef.current) {
      setPriceInput(targetPrice.toFixed(2));
    }
  }, [targetPrice]);

  // Вычисляем самую старую дату входа (entryDate) среди всех опционов
  // ЗАЧЕМ: Ползунок должен начинать отсчет от даты входа в самую старую позицию
  const oldestEntryDate = React.useMemo(() => {
    if (!options || options.length === 0) return null;
    
    let oldest = null;
    options.forEach(option => {
      // Используем entryDate если есть, иначе текущую дату
      // ЗАЧЕМ (аудит A5 п.7): единая база «сегодня» — America/New_York, а не browser-UTC.
      const entryDateStr = option.entryDate || getTodayDateStringET();
      const entryDate = parseDateAtStartOfDay(entryDateStr);
      if (!entryDate) {
        return;
      }
      
      if (!oldest || entryDate < oldest) {
        oldest = entryDate;
      }
    });
    
    return oldest;
  }, [options]);

  // Вычисляем максимальное количество дней до экспирации
  // ВАЖНО: Считаем от самой старой даты входа (entryDate), а не от сегодня
  // Это позволяет ползунку показывать полный диапазон от входа до экспирации
  const maxDaysToExpiration = React.useMemo(() => {
    if (!options || options.length === 0) return 30;
    
    // Базовая дата: самая старая дата входа или дата сохранения (для зафиксированных)
    let baseDate = savedConfigDate ? parseDateAtStartOfDay(savedConfigDate) : oldestEntryDate;
    if (!baseDate) {
      // ЗАЧЕМ (аудит A5 п.7): единая база «сегодня» — America/New_York, а не локальное
      // время машины пользователя.
      baseDate = parseDateAtStartOfDay(getTodayDateStringET());
    }
    baseDate.setHours(0, 0, 0, 0);
    
    let maxDays = 0;
    options.forEach(option => {
      if (option.date) {
        // Вычисляем дни от базовой даты до экспирации
        const expirationDate = parseDateAtStartOfDay(option.date);
        if (!expirationDate) {
          return;
        }
        const diffTime = expirationDate.getTime() - baseDate.getTime();
        const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (daysUntil > maxDays) {
          maxDays = daysUntil;
        }
      }
    });
    
    return maxDays > 0 ? maxDays : 30;
  }, [options, savedConfigDate, oldestEntryDate]);

  // Вычисляем диапазон цен
  const calculatedMinPrice = minPrice || (currentPrice > 0 ? currentPrice * 0 : 0);
  const calculatedMaxPrice = maxPrice || (currentPrice > 0 ? currentPrice * 2 : 1000);

  const handlePriceInputChange = (e) => {
    const value = e.target.value;
    setPriceInput(value);

    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= calculatedMinPrice && numValue <= calculatedMaxPrice) {
      setTargetPrice(numValue);
      // ЗАЧЕМ: Любой ручной ввод цены отключает авто-синхронизацию с currentPrice до перезагрузки страницы.
      if (setUserAdjustedTargetPrice) setUserAdjustedTargetPrice(true);
    }
  };

  const handlePriceSliderChange = (value) => {
    const newPrice = value[0];
    setTargetPrice(newPrice);
    if (!priceInputFocusedRef.current) {
      setPriceInput(newPrice.toFixed(2));
    }
    // ЗАЧЕМ: Любое движение ползунка цены — это ручное изменение, отключающее авто-синхронизацию.
    if (setUserAdjustedTargetPrice) setUserAdjustedTargetPrice(true);
  };

  // Вычисляем количество дней от базовой даты до сегодня
  // ЗАЧЕМ: Кнопка "С" должна устанавливать ползунок на сегодняшнюю дату,
  // а не на daysPassed=0, так как для сохраненных позиций нулевой день может быть в прошлом
  const getDaysPassedToToday = React.useCallback(() => {
    // ЗАЧЕМ (аудит A5 п.7): «сегодня» для слайдера дней — единая база America/New_York,
    // а не локальное время машины пользователя (new Date()). Иначе для заказчика в Панаме
    // (UTC-5) кнопка «С» могла бы указывать на другой день, чем реально идёт на бирже.
    const today = parseDateAtStartOfDay(getTodayDateStringET());
    today.setHours(0, 0, 0, 0);

    // Базовая дата: дата сохранения (для зафиксированных) или самая старая дата входа.
    // ЗАЧЕМ клонируем today через new Date(today) для фолбэка: baseDate и today не должны
    // быть одним и тем же объектом — ниже baseDate.setHours(...) не должен задевать today.
    const baseDate = savedConfigDate ? (parseDateAtStartOfDay(savedConfigDate) || new Date(today)) : (oldestEntryDate || new Date(today));
    baseDate.setHours(0, 0, 0, 0);

    const diffTime = today.getTime() - baseDate.getTime();
    const daysToToday = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // Ограничиваем диапазоном [0, maxDaysToExpiration]
    return Math.max(0, Math.min(daysToToday, maxDaysToExpiration));
  }, [savedConfigDate, oldestEntryDate, maxDaysToExpiration]);

  // Авто-привязка ползунка дней к «сегодня».
  // ЗАЧЕМ: При открытии страницы (новый калькулятор / редактирование / просмотр сохранённой позиции)
  // ползунок дней до экспирации всегда должен стоять на «сегодня». Эффект также реагирует на изменение
  // базовой даты или максимума (например, при загрузке опционов из сохранённого конфига).
  // Срабатывает, пока пользователь не сдвинул ползунок вручную.
  React.useEffect(() => {
    if (!userAdjustedDays && options.length > 0) {
      const todayDays = getDaysPassedToToday();
      if (todayDays !== daysPassed) {
        setDaysPassed(todayDays);
      }
    }
    // daysPassed намеренно не входит в зависимости — иначе любая ручная установка тут же откатывалась бы.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAdjustedDays, options.length, savedConfigDate, oldestEntryDate, maxDaysToExpiration, getDaysPassedToToday, setDaysPassed]);

  return (
    <div className={`space-y-${compact ? '4' : '6'}`}>
      {/* Цена базового актива */}
      <div className="space-y-3">
        <div className="flex flex-col gap-1">
          <Label className={`${compact ? 'text-xs' : 'text-sm'} font-medium`}>Цена базового актива</Label>
          {!compact && (
            <span className="text-xs text-muted-foreground">
              допустимый диапазон: ${calculatedMinPrice.toFixed(2)} – ${calculatedMaxPrice.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground min-w-[20px]">$</span>
          <Input
            type="number"
            value={priceInput}
            onChange={handlePriceInputChange}
            onFocus={() => { priceInputFocusedRef.current = true; }}
            onBlur={() => { 
              priceInputFocusedRef.current = false;
              setPriceInput(targetPrice.toFixed(2));
            }}
            className={`${compact ? 'h-8 text-sm' : 'h-9'} flex-1`}
            step="0.01"
            min={calculatedMinPrice}
            max={calculatedMaxPrice}
          />
          <Button
            onClick={() => {
              // ЗАЧЕМ: Сброс возвращает ползунок к текущей цене из шапки и снова включает авто-синхронизацию.
              const resetPrice = livePrice !== null ? livePrice : currentPrice;
              setTargetPrice(resetPrice);
              setPriceInput(resetPrice.toFixed(2));
              if (setUserAdjustedTargetPrice) setUserAdjustedTargetPrice(false);
            }}
            className={`${compact ? 'h-8 w-8' : 'h-9 w-9'} p-0 bg-gray-500 hover:bg-gray-600`}
            title="Сбросить на текущую цену"
          >
            <RotateCcw className="h-4 w-4 text-white" />
          </Button>
        </div>
        <Slider
          value={[targetPrice]}
          onValueChange={handlePriceSliderChange}
          min={calculatedMinPrice}
          max={calculatedMaxPrice}
          step={0.01}
          className="[&_[role=slider]]:bg-cyan-500 [&_[role=slider]]:border-cyan-500"
        />
        {!compact && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>${calculatedMinPrice.toFixed(2)}</span>
            <span>${calculatedMaxPrice.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Симуляция времени - прошедшие дни */}
      <div className="space-y-2">
        {/* Заголовок с прошедшими днями слева, названием по центру и оставшимися днями справа */}
        <div className="flex items-center text-sm mb-1">
          {/* Кнопка "С" для установки даты на сегодня */}
          <Button
            onClick={() => {
              // ЗАЧЕМ: Возврат к «сегодня» снова включает авто-привязку дней — авто-эффект сам поддержит позицию.
              setDaysPassed(getDaysPassedToToday());
              if (setUserAdjustedDays) setUserAdjustedDays(false);
            }}
            disabled={options.length === 0}
            className="h-6 w-6 p-0 mr-1 bg-gray-500 hover:bg-gray-600 text-white text-xs font-semibold"
            title="Установить на сегодня"
          >
            С
          </Button>
          {/* Прошедшие дни (слева) - ширина по содержимому */}
          <span className={`${compact ? 'text-base' : 'text-lg'} font-semibold ${compact ? 'text-cyan-600' : ''} text-left mr-2`}>
            {options.length === 0 ? '—' : `${daysPassed} д.`}
          </span>
          {/* Дата на которую попадает этот день */}
          {/* ВАЖНО: Считаем от самой старой даты входа (entryDate) */}
          {options.length > 0 && (() => {
            // Базовая дата: дата сохранения (для зафиксированных) или самая старая дата входа
            const baseDate = savedConfigDate ? (parseDateAtStartOfDay(savedConfigDate) || new Date()) : (oldestEntryDate || new Date());
            baseDate.setHours(0, 0, 0, 0);
            const targetDate = new Date(baseDate);
            targetDate.setDate(targetDate.getDate() + daysPassed);
            const { isNonTrading, reason } = isNonTradingDay(targetDate);
            const formattedDate = targetDate.toLocaleDateString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric'
            });
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span 
                      className={`${compact ? 'text-xs' : 'text-sm'} ${isNonTrading ? 'text-red-500 font-medium' : 'text-muted-foreground'} cursor-help`}
                    >
                      {formattedDate}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>{isNonTrading ? `Биржа закрыта: ${reason}` : 'Торговый день'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })()}
          {/* Название прижато вправо к цифрам оставшихся дней */}
          <span className={`${compact ? 'text-xs' : 'text-sm'} text-muted-foreground flex-1 text-right mr-1`}>Дней до экспирации</span>
          {/* Оставшиеся дни до самого длинного опциона (справа) - ширина по содержимому */}
          <span className={`${compact ? 'text-base' : 'text-lg'} font-semibold ${compact ? 'text-cyan-600' : ''}`}>
            {options.length === 0 ? '—' : `${Math.max(0, maxDaysToExpiration - daysPassed)} д.`}
          </span>
        </div>
        {/* Слайдер: от 0 (сегодня) до maxDaysToExpiration (день экспирации самого длинного опциона) */}
        <Slider
          value={[daysPassed]}
          onValueChange={(value) => {
            setDaysPassed(value[0]);
            // ЗАЧЕМ: Любое движение ползунка дней — это ручное изменение, выключающее авто-привязку к «сегодня».
            if (setUserAdjustedDays) setUserAdjustedDays(true);
          }}
          min={0}
          max={maxDaysToExpiration}
          step={1}
          disabled={options.length === 0}
          className="[&_[role=slider]]:bg-cyan-500 [&_[role=slider]]:border-cyan-500"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {savedConfigDate ? (() => {
              const date = parseDateAtStartOfDay(savedConfigDate) || new Date();
              return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
            })() : (oldestEntryDate ? (() => {
              return oldestEntryDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
            })() : '0 д.')}
          </span>
          <span>{options.length === 0 ? '—' : `${maxDaysToExpiration} д.`}</span>
        </div>
      </div>

    </div>
  );
}

export default PriceAndTimeSettings;
