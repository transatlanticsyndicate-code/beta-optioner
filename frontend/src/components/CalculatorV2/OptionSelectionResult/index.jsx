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
  dividendYield = 0
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
    targetUpPrice = 0,
    targetDownPercent = 5,
    targetDownPrice = 0,
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

  // Расчёт P&L для сценария ВНИЗ (targetDownPrice)
  // ВАЖНО: Хуки вызываются безусловно для соблюдения правил React
  const plDown = usePositionExitCalculator({
    underlyingPrice: targetDownPrice,
    daysPassed: daysAfterEntry,
    options,
    positions,
    currentPrice,
    ivSurface,
    dividendYield
  });

  // Расчёт P&L для сценария ВВЕРХ (targetUpPrice)
  const plUp = usePositionExitCalculator({
    underlyingPrice: targetUpPrice,
    daysPassed: daysAfterEntry,
    options,
    positions,
    currentPrice,
    ivSurface,
    dividendYield
  });

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
            {/* Левая колонка: параметры подбора */}
            <ParametersPanel
              isCallSelection={isCallSelection}
              bestExitDay={bestExitDay}
              daysAfterEntry={daysAfterEntry}
              targetUpPercent={targetUpPercent}
              targetUpPrice={targetUpPrice}
              targetDownPercent={targetDownPercent}
              targetDownPrice={targetDownPrice}
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
                  title={`Закрытие по НИЗУ $${targetDownPrice.toFixed(2)}`}
                  pl={plDown.plCloseAll}
                  details={plDown.details.closeAll}
                  headerBgColor="#fb8997"
                />
                <ScenarioCard
                  title={`Закрытие по ВЕРХУ $${targetUpPrice.toFixed(2)}`}
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
