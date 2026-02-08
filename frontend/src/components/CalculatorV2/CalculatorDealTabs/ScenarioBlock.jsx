/**
 * Компонент блока сценария (Позитивный / Негативный)
 * ЗАЧЕМ: Переиспользуемый блок с настройками и планом выхода для разных типов опционов
 * Затрагивает: CalculatorDealTabs — используется для Buy CALL (позитивный) и Buy PUT (негативный)
 */

import React from 'react';
import { FileText } from 'lucide-react';
import { Card, CardContent } from '../../ui/card';

/**
 * ScenarioBlock — блок сценария с настройками и таблицей плана выхода
 * @param {string} title — заголовок сценария ("Позитивный сценарий" / "Негативный сценарий")
 * @param {string} borderColor — цвет бордера карточки (hex)
 * @param {string} bgColor — CSS-класс фона иконки
 * @param {string} textColor — CSS-класс цвета текста заголовка
 * @param {string} iconColor — CSS-класс цвета иконки
 * @param {string} focusRingColor — CSS-класс цвета фокуса инпутов
 * @param {string} profitColor — CSS-класс цвета прибыли в таблице
 * @param {number} exitStepsCount — количество шагов выхода
 * @param {function} setExitStepsCount — сеттер количества шагов
 * @param {number} targetAssetPricePercent — целевая цена актива в %
 * @param {function} handlePercentChange — обработчик изменения %
 * @param {number} targetAssetPriceDollars — целевая цена актива в $
 * @param {string} dollarsInputValue — значение инпута долларов
 * @param {boolean} isDollarsInputFocused — фокус на инпуте долларов
 * @param {function} handleDollarsInputChange — обработчик изменения долларов
 * @param {function} handleDollarsFocus — обработчик фокуса
 * @param {function} handleDollarsBlur — обработчик потери фокуса
 * @param {function} handleDollarsKeyDown — обработчик нажатия клавиш
 * @param {Array} exitPlan — план выхода
 * @param {Array} frozenExitPlan — замороженный план выхода (после отправки срезок)
 * @param {boolean} slicesSent — флаг отправки срезок
 * @param {boolean} disabled — заблокировать все инпуты
 * @param {function} onSendSlices — обработчик отправки срезок на TradingView
 * @param {function} onResetSlices — обработчик сброса плана выхода
 * @param {string|null} tradingViewUrl — ссылка на график TradingView (после отправки)
 */
function ScenarioBlock({
  title,
  borderColor,
  bgColor,
  textColor,
  iconColor,
  focusRingColor,
  profitColor = 'text-green-600',
  exitStepsCount,
  setExitStepsCount,
  targetAssetPricePercent,
  handlePercentChange,
  targetAssetPriceDollars,
  dollarsInputValue,
  isDollarsInputFocused,
  handleDollarsInputChange,
  handleDollarsFocus,
  handleDollarsBlur,
  handleDollarsKeyDown,
  exitPlan,
  frozenExitPlan,
  slicesSent,
  disabled = false,
  onSendSlices,
  onResetSlices,
  tradingViewUrl,
  planTitle = 'ПЛАН ВЫХОДА для Опциона CALL',
  hideStepsInput = false,
  stepLabels = null,
  hideTotal = false,
  percentLabel = 'Целевая цена актива (%):',
  dollarsLabel = 'Целевая цена актива ($):',
  inlineInputs = false,
  inputsGroupLabel = '',
  warningText = '',
  secondGroupLabel = '',
  secondGroupPercent = null,
  secondGroupHandlePercentChange = null,
  secondGroupDollars = null,
  secondGroupDollarsInputValue = '',
  secondGroupIsDollarsInputFocused = false,
  secondGroupHandleDollarsInputChange = null,
  secondGroupHandleDollarsFocus = null,
  secondGroupHandleDollarsBlur = null,
  secondGroupHandleDollarsKeyDown = null,
}) {
  // Определяем, заблокированы ли инпуты
  const isDisabled = disabled || slicesSent;
  
  // Определяем, какой план выхода отображать
  const displayPlan = (slicesSent && frozenExitPlan) ? frozenExitPlan : exitPlan;

  return (
    <Card className="w-full relative" style={{ borderColor }}>
      {/* Кнопки управления срезками в правом верхнем углу */}
      {onSendSlices && (
        <div className="absolute right-4 flex items-center gap-2" style={{ top: '1.5rem' }}>
          {!slicesSent ? (
            <button
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
              onClick={onSendSlices}
            >
              Отправить срезки на график TradingView →
            </button>
          ) : (
            <>
              <a
                href={tradingViewUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-green-100 hover:bg-green-200 rounded-md transition-colors inline-block text-center no-underline"
                onClick={(e) => {
                  if (!tradingViewUrl) {
                    e.preventDefault();
                    console.warn('⚠️ Ссылка на график TradingView не найдена');
                  }
                }}
              >
                Перейти на график TradingView →
              </a>
              {onResetSlices && (
                <button
                  className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
                  onClick={onResetSlices}
                  title="Удалить срезки с графика"
                >
                  Удалить срезки с графика
                </button>
              )}
            </>
          )}
        </div>
      )}

      <CardContent className="pt-6 pb-6 px-6">
        <div className="space-y-4">
          {/* Заголовок сценария */}
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${bgColor} rounded-full flex items-center justify-center`}>
              <FileText size={20} className={iconColor} />
            </div>
            <div>
              <h3 className={`text-lg font-bold ${textColor}`}>
                {title}
              </h3>
            </div>
          </div>
          
          {/* Двухколоночный layout: настройки слева (1/3), таблица справа (2/3) */}
          <div className="border-t pt-4">
            <div className="flex gap-6">
              {/* Левая колонка: Настройки (1/3 ширины) */}
              <div className="w-1/3 space-y-4">
                <h4 className="text-sm font-semibold mb-4">НАСТРОЙКИ</h4>
                
                {/* Количество шагов выхода (скрывается для негативного сценария) */}
                {!hideStepsInput && (
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground block">
                      Количество шагов выхода:
                    </label>
                    <input
                      type="number"
                      value={exitStepsCount}
                      onChange={(e) => setExitStepsCount(Math.max(1, Number(e.target.value) || 1))}
                      className={`w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:border-transparent ${focusRingColor} ${isDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                      min="1"
                      max="20"
                      disabled={isDisabled}
                    />
                  </div>
                )}
                
                {/* Целевая цена актива: инлайн или столбцом */}
                {inlineInputs ? (
                  /* Инлайн-режим: общий лейбл и два инпута в одной строке */
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground block">
                      {inputsGroupLabel}
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          value={targetAssetPricePercent}
                          onChange={(e) => handlePercentChange(e.target.value)}
                          className={`w-full h-10 px-3 pr-8 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:border-transparent ${focusRingColor} ${isDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                          min="-100"
                          max="1000"
                          step="0.01"
                          disabled={isDisabled}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      </div>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          value={isDollarsInputFocused ? dollarsInputValue : targetAssetPriceDollars}
                          onChange={(e) => handleDollarsInputChange(e.target.value)}
                          onFocus={handleDollarsFocus}
                          onBlur={handleDollarsBlur}
                          onKeyDown={handleDollarsKeyDown}
                          className={`w-full h-10 px-3 pr-8 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:border-transparent ${focusRingColor} ${isDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                          min="0"
                          step="0.01"
                          disabled={isDisabled}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Стандартный режим: отдельные блоки для % и $ */

                  <>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground block">
                        {percentLabel}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={targetAssetPricePercent}
                          onChange={(e) => handlePercentChange(e.target.value)}
                          className={`w-full h-10 px-3 pr-8 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:border-transparent ${focusRingColor} ${isDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                          min="-100"
                          max="1000"
                          step="0.01"
                          disabled={isDisabled}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground block">
                        {dollarsLabel}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={isDollarsInputFocused ? dollarsInputValue : targetAssetPriceDollars}
                          onChange={(e) => handleDollarsInputChange(e.target.value)}
                          onFocus={handleDollarsFocus}
                          onBlur={handleDollarsBlur}
                          onKeyDown={handleDollarsKeyDown}
                          className={`w-full h-10 px-3 pr-8 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:border-transparent ${focusRingColor} ${isDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                          min="0"
                          step="0.01"
                          disabled={isDisabled}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                      </div>
                    </div>
                  </>
                )}
                
                {/* Вторая группа инпутов (для выхода из PUT) */}
                {secondGroupLabel && secondGroupHandlePercentChange && (
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground block">
                      {secondGroupLabel}
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          value={secondGroupPercent}
                          onChange={(e) => secondGroupHandlePercentChange(e.target.value)}
                          className={`w-full h-10 px-3 pr-8 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:border-transparent ${focusRingColor} ${isDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                          min="-100"
                          max="1000"
                          step="0.01"
                          disabled={isDisabled}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      </div>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          value={secondGroupIsDollarsInputFocused ? secondGroupDollarsInputValue : secondGroupDollars}
                          onChange={(e) => secondGroupHandleDollarsInputChange(e.target.value)}
                          onFocus={secondGroupHandleDollarsFocus}
                          onBlur={secondGroupHandleDollarsBlur}
                          onKeyDown={secondGroupHandleDollarsKeyDown}
                          className={`w-full h-10 px-3 pr-8 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:border-transparent ${focusRingColor} ${isDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                          min="0"
                          step="0.01"
                          disabled={isDisabled}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Правая колонка: Таблица План выхода (2/3 ширины) */}
              <div className="w-2/3">
                <h4 className="text-sm font-semibold mb-4">{planTitle}</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 dark:bg-gray-800">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Шаг</th>
                        <th className="px-3 py-2 text-right font-medium">Количество</th>
                        <th className="px-3 py-2 text-right font-medium">Цена опциона</th>
                        <th className="px-3 py-2 text-right font-medium">Прибыль</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayPlan.map((row, index) => (
                        <tr key={row.step} className={index > 0 ? 'border-t' : ''}>
                          <td className="px-3 py-2 font-medium">{stepLabels ? (stepLabels[index] || row.step) : row.step}</td>
                          <td className="px-3 py-2 text-right">{row.quantity}</td>
                          <td className="px-3 py-2 text-right">${row.optionPrice.toFixed(2)}</td>
                          <td className={`px-3 py-2 text-right ${profitColor}`}>+${row.profit.toLocaleString()}</td>
                        </tr>
                      ))}
                      {/* Строка ИТОГО (скрывается для негативного сценария) */}
                      {!hideTotal && (
                        <tr className="border-t-2 border-gray-300 bg-gray-50 dark:bg-gray-900 font-semibold">
                          <td className="px-3 py-2">ИТОГО</td>
                          <td className="px-3 py-2 text-right">
                            {displayPlan.reduce((sum, row) => sum + row.quantity, 0)}
                          </td>
                          <td className="px-3 py-2"></td>
                          <td className={`px-3 py-2 text-right ${profitColor}`}>
                            +${displayPlan.reduce((sum, row) => sum + row.profit, 0).toLocaleString()}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {/* Предупреждение под таблицей */}
                {warningText && (
                  <p className="mt-3 text-sm font-semibold text-red-600">{warningText}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ScenarioBlock;
