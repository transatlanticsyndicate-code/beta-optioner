/**
 * Компонент "Результат подбора опционов"
 * ЗАЧЕМ: Отображает результаты подбора опционов с расчётом P&L для двух сценариев
 * Затрагивает: калькулятор опционов, AI калькулятор, блок выхода из позиции
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronUp, ChevronDown, Target } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { usePositionExitCalculator } from '../../hooks/usePositionExitCalculator';

/**
 * Компонент результата подбора опционов
 * ЗАЧЕМ: Показывает P&L при закрытии по целевым ценам ВВЕРХ и ВНИЗ
 * 
 * @param {Object} props
 * @param {Object} props.selectionParams - Параметры подбора из AIOptionSelectorDialog
 * @param {Array} props.options - Массив опционов (включая выбранный)
 * @param {Array} props.positions - Массив позиций базового актива
 * @param {number} props.currentPrice - Текущая цена актива
 */
function OptionSelectionResult({
  selectionParams = null,
  options = [],
  positions = [],
  currentPrice = 0
}) {
  // State для сворачивания блока
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
    optionType = 'PUT', // Тип опциона: 'PUT' или 'CALL'
    daysAfterEntry = 5,
    bestExitDay = null, // Лучший день выхода (если был автоподбор)
    targetUpPercent = 5,
    targetUpPrice = 0,
    targetDownPercent = 5,
    targetDownPrice = 0,
    optionRiskPercent = 2,
    riskPercent = 5,
    entryPrice = 0,
    positionQuantity = 100,
    // Дополнительные параметры для CALL
    callPLAtUp = 0,
    callPLAtDown = 0,
    putPLAtUp = 0,
    putPLAtDown = 0
  } = selectionParams || {};
  
  // Определяем, это CALL или PUT подбор
  const isCallSelection = optionType === 'CALL';

  // Функция для извлечения P&L только CALL опциона из details
  // ЗАЧЕМ: Для отображения актуального P&L CALL опциона в левой колонке
  const getCallPLFromDetails = (details) => {
    if (!details || !Array.isArray(details)) return 0;
    const callDetail = details.find(d => d.type === 'option' && d.label?.includes('CALL'));
    return callDetail?.value || 0;
  };

  // Расчёт P&L для сценария ВНИЗ (targetDownPrice)
  // ВАЖНО: Хуки вызываются безусловно для соблюдения правил React
  const plDown = usePositionExitCalculator({
    underlyingPrice: targetDownPrice,
    daysPassed: daysAfterEntry,
    options,
    positions,
    currentPrice
  });

  // Расчёт P&L для сценария ВВЕРХ (targetUpPrice)
  const plUp = usePositionExitCalculator({
    underlyingPrice: targetUpPrice,
    daysPassed: daysAfterEntry,
    options,
    positions,
    currentPrice
  });

  // Если нет параметров подбора — не отображаем компонент
  // ЗАЧЕМ: Компонент появляется только после выбора опциона в диалоге подбора
  if (!selectionParams) {
    return null;
  }

  // Актуальные P&L CALL опциона из калькулятора (вместо сохранённых при подборе)
  // ЗАЧЕМ: Синхронизация с актуальными данными калькулятора
  const actualCallPLAtUp = isCallSelection ? getCallPLFromDetails(plUp.details?.closeAll) : callPLAtUp;
  const actualCallPLAtDown = isCallSelection ? getCallPLFromDetails(plDown.details?.closeAll) : callPLAtDown;

  // Скорректированный P&L для колонки "Закрытие по НИЗУ" (без байкол опционов)
  // ЗАЧЕМ: Байкол опционы не должны влиять на итоговый P&L этой колонки
  const filteredPLDown = plDown.plCloseAll - actualCallPLAtDown;

  // Рассчитываем суммы риска
  const optionRiskAmount = ((entryPrice * positionQuantity) * optionRiskPercent / 100).toFixed(0);
  const totalRiskAmount = ((entryPrice * positionQuantity) * riskPercent / 100).toFixed(0);

  // Форматирование валюты
  const formatCurrency = (value) => {
    const absValue = Math.abs(value);
    const sign = value >= 0 ? '+' : '-';
    
    if (absValue >= 1000000) {
      return `${sign}$${(absValue / 1000000).toFixed(2)}M`;
    } else if (absValue >= 1000) {
      return `${sign}$${(absValue / 1000).toFixed(2)}K`;
    } else {
      return `${sign}$${absValue.toFixed(2)}`;
    }
  };

  // Цвет для P&L
  const getPLColor = (value) => {
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-gray-600';
  };

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
          {isCollapsed ? (
            <ChevronDown size={20} />
          ) : (
            <ChevronUp size={20} />
          )}
        </button>
      </div>

      {!isCollapsed && (
        <CardContent className="p-6 space-y-6">
          {/* Layout: параметры слева, блоки справа (как в ExitCalculator) */}
          <div className="flex gap-6">
            {/* Левая колонка: параметры подбора (нередактируемый текст) */}
            <div className="flex-shrink-0 w-64 space-y-2 text-sm">
              <div className="text-xs text-gray-400 mb-2">
                Для изменения - сделайте новый подбор.
              </div>
              {/* Показываем "X дней после входа" только если НЕ был автоподбор лучшего дня */}
              {!bestExitDay && (
                <div className="font-medium text-gray-700">
                  {daysAfterEntry} дней после входа
                </div>
              )}
            </div>

            {/* Правая часть: два блока сценариев (как в ExitCalculator) */}
            <div className="flex-1">
              <div className="grid grid-cols-2 gap-4">
                {/* Закрытие по НИЗУ */}
                <ScenarioCard
                  title={`Закрытие по НИЗУ $${targetDownPrice.toFixed(2)}`}
                  pl={filteredPLDown}
                  details={plDown.details.closeAll?.filter(detail => 
                    !(detail.type === 'option' && detail.label?.includes('CALL'))
                  ) || []}
                  formatCurrency={formatCurrency}
                  getPLColor={getPLColor}
                  headerBgColor="#fb8997"
                />

                {/* Закрытие по ВЕРХУ */}
                <ScenarioCard
                  title={`Закрытие по ВЕРХУ $${targetUpPrice.toFixed(2)}`}
                  pl={plUp.plCloseAll}
                  details={plUp.details.closeAll}
                  formatCurrency={formatCurrency}
                  getPLColor={getPLColor}
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

/**
 * Компонент карточки сценария (аналог из ExitCalculator)
 * ЗАЧЕМ: Отображает P&L и детали расчёта для конкретного сценария
 */
function ScenarioCard({ title, pl, details, formatCurrency, getPLColor, headerBgColor }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="border rounded-lg overflow-hidden bg-white dark:bg-gray-900"
    >
      {/* Заголовок */}
      <div style={{ backgroundColor: headerBgColor }} className="px-4 py-3">
        <h4 className="text-sm font-semibold text-white">{title}</h4>
      </div>

      {/* Итоговый P&L */}
      <div className="bg-gray-50 dark:bg-gray-800 px-4 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Итоговый P&L
          </span>
          <span className={`text-2xl font-bold ${getPLColor(pl)}`}>
            {formatCurrency(pl)}
          </span>
        </div>
      </div>

      {/* Детали расчета */}
      <div className="px-4 py-3 space-y-1.5 max-h-[300px] overflow-y-auto">
        {details && details.length > 0 ? (() => {
          // Находим максимальное значение К среди всех опционов
          const kCoeffs = details.filter(d => d.kCoeff !== undefined).map(d => d.kCoeff);
          const maxKCoeff = kCoeffs.length > 0 ? Math.max(...kCoeffs) : null;
          
          return details.map((detail, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03 }}
              className={`flex justify-between items-start text-xs p-2 rounded ${
                detail.highlight 
                  ? 'bg-blue-50 dark:bg-blue-950/30' 
                  : 'bg-gray-50 dark:bg-gray-800/50'
              }`}
            >
              <div className="flex-1 pr-2">
                <div className={`font-medium ${
                  detail.highlight 
                    ? 'text-blue-700 dark:text-blue-400' 
                    : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {detail.label}
                </div>
                {detail.description && (
                  <div className="text-muted-foreground text-xs mt-0.5">
                    {detail.description}
                    {/* Добавляем "Выход на X ДЕНЬ" для опционов при автоподборе - с новой строки */}
                    {/* ВАЖНО: Используем индивидуальный bestExitDay из detail, а не общий */}
                    {detail.bestExitDay && detail.type === 'option' && (
                      <div className="mt-1">
                        Выход на <span className="px-1.5 py-0.5 rounded text-white font-bold" style={{ backgroundColor: '#f97316' }}>{detail.bestExitDay} ДЕНЬ</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Колонка К (коэффициент P&L / Премия) - только для опционов */}
              {detail.kCoeff !== undefined && (
                <span className={`whitespace-nowrap mr-3 ${
                  detail.kCoeff === maxKCoeff && kCoeffs.length > 1
                    ? 'font-bold text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {detail.kCoeff >= 0 ? '+' : ''}{detail.kCoeff.toFixed(2)}
                </span>
              )}
              <span className={`font-semibold whitespace-nowrap ${getPLColor(detail.value)}`}>
                {formatCurrency(detail.value)}
              </span>
            </motion.div>
          ));
        })() : (
          <div className="text-center text-muted-foreground text-xs py-4">
            Нет данных для расчета
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default OptionSelectionResult;
