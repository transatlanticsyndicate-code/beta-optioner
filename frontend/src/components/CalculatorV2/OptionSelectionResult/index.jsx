/**
 * Компонент "Результат подбора опционов"
 * ЗАЧЕМ: Отображает результаты подбора опционов с расчётом P&L для двух сценариев
 * Затрагивает: калькулятор опционов, AI калькулятор, блок выхода из позиции
 */

import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Target } from 'lucide-react';
import { Card, CardContent } from '../../ui/card';
import { usePositionExitCalculator } from '../../../hooks/usePositionExitCalculator';
import { getCallPLFromDetails } from './utils/formatters';
import { ScenarioCard, ParametersPanel } from './components';

export function OptionSelectionResult({
  selectionParams = null,
  options = [],
  positions = [],
  currentPrice = 0,
  ivSurface = null,
  dividendYield = 0,
  targetPrice = 0,
  daysPassed = 0
}) {
  // State для сворачивания блока
  // ЗАЧЕМ: Сохранение состояния сворачивания в localStorage
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('isOptionSelectionResultCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  // Сохранение состояния сворачивания
  useEffect(() => {
    localStorage.setItem('isOptionSelectionResultCollapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  // Извлекаем параметры подбора (с дефолтными значениями для хуков)
  // ЗАЧЕМ: Хуки должны вызываться безусловно, поэтому извлекаем параметры до проверки
  const {
    optionType = 'PUT',
    daysAfterEntry = 5,
    bestExitDay = null,
    targetUpPercent = 5,
    targetUpPrice: savedTargetUpPrice = 0,
    targetDownPercent = 5,
    targetDownPrice: savedTargetDownPrice = 0,
    optionRiskPercent = 2,
    riskPercent = 5,
    entryPrice = 0,
    positionQuantity = 100,
    callPLAtUp = 0,
    callPLAtDown = 0,
    putPLAtUp = 0,
    putPLAtDown = 0
  } = selectionParams || {};
  
  const isCallSelection = optionType === 'CALL';
  
  // Используем текущий targetPrice и daysPassed из калькулятора для синхронизации с ExitCalculator
  // ЗАЧЕМ: Расчёты должны совпадать с блоком "Закрыть всё в выбранную дату"
  // ВАЖНО: targetPrice > 0 проверяем явно, чтобы избежать fallback на savedTargetUpPrice
  const actualDaysPassed = daysPassed > 0 ? daysPassed : daysAfterEntry;
  const actualTargetPrice = targetPrice > 0 ? targetPrice : (savedTargetUpPrice || currentPrice);
  
  // Для сценария ВНИЗ используем сохранённую цену из selectionParams
  // ЗАЧЕМ: Цена ВНИЗ фиксируется в момент подбора и не меняется от слайдера
  const actualTargetDownPrice = savedTargetDownPrice > 0 ? savedTargetDownPrice : currentPrice * 0.95;

  // Пересчитываем проценты на основе актуальных цен относительно currentPrice
  // ЗАЧЕМ: Проценты должны отражать реальное отклонение от текущей цены базового актива
  const actualTargetUpPercent = currentPrice > 0 
    ? ((actualTargetPrice - currentPrice) / currentPrice * 100).toFixed(1)
    : targetUpPercent;
  const actualTargetDownPercent = currentPrice > 0 
    ? ((currentPrice - actualTargetDownPrice) / currentPrice * 100).toFixed(1)
    : targetDownPercent;

  // Расчёт P&L для сценария ВНИЗ
  // ВАЖНО: Хуки вызываются безусловно для соблюдения правил React
  // ФИЛЬТР: Исключаем Buy CALL опционы из сценария ВНИЗ
  // ЗАЧЕМ: Buy CALL работает только при росте цены (сценарий ВВЕРХ)
  const optionsForDown = options.filter(opt => {
    const isBuyCall = opt.action === 'Buy' && opt.type === 'CALL';
    if (isBuyCall) {
      console.log('🔴 Фильтруем Buy CALL из сценария ВНИЗ:', opt.action, opt.type, opt.strike);
    }
    return !isBuyCall; // Исключаем Buy CALL
  });
  
  console.log('📊 OptionSelectionResult ВНИЗ: всего опционов =', options.length, ', после фильтрации =', optionsForDown.length);
  
  const plDown = usePositionExitCalculator({
    underlyingPrice: actualTargetDownPrice,
    daysPassed: actualDaysPassed,
    options: optionsForDown,
    positions,
    currentPrice,
    ivSurface,
    dividendYield
  });

  // Расчёт P&L для сценария ВВЕРХ (используем текущий targetPrice из слайдера)
  // ВАЖНО: Должен совпадать с ExitCalculator при одинаковых параметрах
  const plUp = usePositionExitCalculator({
    underlyingPrice: actualTargetPrice,
    daysPassed: actualDaysPassed,
    options,
    positions,
    currentPrice,
    ivSurface,
    dividendYield
  });
  
  // Логирование для отладки синхронизации
  console.log('📊 OptionSelectionResult: targetPrice=', targetPrice, 'actualTargetPrice=', actualTargetPrice, 'daysPassed=', daysPassed, 'actualDaysPassed=', actualDaysPassed);

  // Если нет параметров подбора — не отображаем компонент
  // ЗАЧЕМ: Компонент появляется только после выбора опциона в диалоге подбора
  if (!selectionParams) {
    return null;
  }

  // Актуальные P&L CALL опциона из калькулятора
  // ЗАЧЕМ: Синхронизация с актуальными данными калькулятора
  const actualCallPLAtUp = isCallSelection ? getCallPLFromDetails(plUp.details?.closeAll) : callPLAtUp;
  const actualCallPLAtDown = isCallSelection ? getCallPLFromDetails(plDown.details?.closeAll) : callPLAtDown;

  // Рассчитываем суммы риска
  const optionRiskAmount = ((entryPrice * positionQuantity) * optionRiskPercent / 100).toFixed(0);
  const totalRiskAmount = ((entryPrice * positionQuantity) * riskPercent / 100).toFixed(0);

  return (
    <Card className="w-full relative border-0" style={{ borderColor: '#b8b8b8' }}>
      {/* Заголовок с кнопкой сворачивания */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Target size={16} className={isCallSelection ? "text-green-500" : "text-purple-500"} />
          <h3 className="text-sm font-medium">
            Результат подбора {isCallSelection ? 'BuyCALL' : 'BuyPUT'}
          </h3>
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 hover:bg-muted rounded transition-colors"
          title={isCollapsed ? 'Развернуть' : 'Свернуть'}
        >
          {isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
        </button>
      </div>

      {!isCollapsed && (
        <CardContent className="p-6 space-y-6">
          <div className="flex gap-6">
            {/* Левая колонка: только дни после входа */}
            <ParametersPanel
              isCallSelection={isCallSelection}
              bestExitDay={bestExitDay}
              daysAfterEntry={actualDaysPassed}
              targetUpPercent={actualTargetUpPercent}
              targetUpPrice={actualTargetPrice}
              targetDownPercent={actualTargetDownPercent}
              targetDownPrice={actualTargetDownPrice}
              optionRiskPercent={optionRiskPercent}
              optionRiskAmount={optionRiskAmount}
              riskPercent={riskPercent}
              totalRiskAmount={totalRiskAmount}
              actualCallPLAtUp={actualCallPLAtUp}
              actualCallPLAtDown={actualCallPLAtDown}
            />

            {/* Правая часть: два блока сценариев */}
            <div className="flex-1">
              <div className="grid grid-cols-2 gap-4">
                <ScenarioCard
                  title={`Закрытие по НИЗУ $${actualTargetDownPrice.toFixed(2)}`}
                  pl={plDown.plCloseAll}
                  details={plDown.details.closeAll}
                  headerBgColor="#fb8997"
                />
                <ScenarioCard
                  title={`Закрытие по ВЕРХУ $${actualTargetPrice.toFixed(2)}`}
                  pl={plUp.plCloseAll}
                  details={plUp.details.closeAll}
                  headerBgColor="#59c35d"
                />
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default OptionSelectionResult;
