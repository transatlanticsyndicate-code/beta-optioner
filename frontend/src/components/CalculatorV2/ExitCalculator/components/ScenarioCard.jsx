/**
 * Компонент карточки сценария выхода из позиции
 * ЗАЧЕМ: Отображение P&L и деталей для каждого сценария (исполнение, закрытие опционов, закрытие всего)
 * Затрагивает: визуализация расчетов выхода
 */

import React from 'react';
import { motion } from 'framer-motion';
import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../ui/tooltip';
import { formatCurrency, getPLColor } from '../utils/formatters';

export function ScenarioCard({ title, pl, details, headerBgColor = '#06b6d4', tooltip }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="border rounded-lg overflow-hidden bg-white dark:bg-gray-900"
    >
      {/* Заголовок */}
      <div style={{ backgroundColor: headerBgColor }} className="px-4 py-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">{title}</h4>
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle size={16} className="text-white cursor-help hover:opacity-80" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="whitespace-pre-wrap">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
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
      <div className="px-4 py-3 space-y-1.5 max-h-[400px] overflow-y-auto">
        {details && details.length > 0 ? (() => {
          // Находим максимальное значение К среди всех опционов
          // ЗАЧЕМ: Выделить опцион с лучшим соотношением P&L к премии
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
                  <div className="text-muted-foreground text-xs mt-0.5 whitespace-pre-line">
                    {detail.description}
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
