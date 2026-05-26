/**
 * Карточка одной комбинации стратегии СЕВЕР v2.
 *
 * Две вариации через проп `variant`:
 *   - 'focused' — крупная карточка фокусированного варианта (в центре экрана результатов);
 *   - 'compact' — строка в выпадающем списке альтернатив (кликабельная).
 *
 * Критерии: «низ» (метрика близости к 0) и «верх» (P&L опционов).
 */

import React from 'react';
import { Button } from '../../ui/button';
import { formatCurrency, getPLColor } from '../ExitCalculator/utils/formatters';
import { NORTH_MODES } from '../../../utils/northStrategy/analyzer';

function CriterionRow({ label, hint, value, idealZero }) {
  const colorClass = idealZero ? 'text-gray-700 dark:text-gray-300' : getPLColor(value);
  return (
    <div className="flex justify-between items-baseline text-xs py-1">
      <div className="flex-1 pr-2">
        <div className="font-medium text-gray-700 dark:text-gray-300">{label}</div>
        {hint && <div className="text-muted-foreground text-[10px]">{hint}</div>}
      </div>
      <span className={`font-semibold whitespace-nowrap ${colorClass}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function FocusedCard({ combination, levels, mode, onPick }) {
  const { call, put, qtyCall, qtyPut, criteria, cost, score } = combination;
  const fmtLevel = (v) => (Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : null);
  const withStock = mode === NORTH_MODES.WITH_STOCK;

  return (
    <div className="border-2 border-sky-400 rounded-lg overflow-hidden bg-white dark:bg-gray-900 shadow-md">
      <div
        style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 50%, #0369a1 100%)' }}
        className="px-4 py-2 flex items-center justify-between text-white"
      >
        <div className="font-semibold text-sm">Сбалансированный вариант</div>
        <div className="text-white/80 text-[11px]">
          score: {Number.isFinite(score) ? score.toFixed(3) : '—'}
        </div>
      </div>

      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Buy Call</span>
          <span className="font-medium">
            {qtyCall} × ${call.strike} <span className="text-muted-foreground">@ ${call.ask.toFixed(2)}</span>
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Buy Put</span>
          <span className="font-medium">
            {qtyPut} × ${put.strike} <span className="text-muted-foreground">@ ${put.ask.toFixed(2)}</span>
          </span>
        </div>
        <div className="flex justify-between pt-1 border-t border-gray-200 dark:border-gray-700">
          <span className="text-gray-600 dark:text-gray-400">Маржа сделки</span>
          <span className="font-semibold tabular-nums">
            ${cost.marginUsed.toFixed(0)}
            {withStock && (
              <span className="text-muted-foreground text-[11px] ml-1">
                (актив ${cost.stockMargin.toFixed(0)} + опционы ${cost.optionsCost.toFixed(0)})
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="px-4 py-2 divide-y divide-gray-100 dark:divide-gray-800">
        <CriterionRow
          label={`Цель по верху${fmtLevel(levels?.top) ? ` (${fmtLevel(levels?.top)})` : ''} — P&L опционов`}
          hint="чем больше, тем лучше"
          value={criteria.topOptions}
        />
        <CriterionRow
          label={
            `Закрытие по низу${fmtLevel(levels?.bottom) ? ` (${fmtLevel(levels?.bottom)})` : ''} — `
            + (withStock ? 'P&L всей позиции' : 'P&L опционов')
          }
          hint="идеал ≈ 0"
          value={criteria.bottomMetric}
          idealZero
        />
      </div>

      <div className="px-4 py-3 border-t bg-white dark:bg-gray-900">
        <Button
          size="sm"
          className="w-full text-white border-0"
          style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 50%, #0369a1 100%)' }}
          onClick={onPick}
        >
          Применить
        </Button>
      </div>
    </div>
  );
}

function CompactCard({ combination, mode, isActive, onSelect }) {
  const { call, put, qtyCall, qtyPut, criteria, cost, score } = combination;
  const withStock = mode === NORTH_MODES.WITH_STOCK;
  const baseClass = isActive
    ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/30'
    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left border rounded-md p-2 transition-colors ${baseClass}`}
    >
      <div className="flex items-center justify-between text-xs gap-3">
        <div className="flex-1 min-w-0 truncate">
          <span className="font-medium">
            {qtyCall}×C${call.strike} + {qtyPut}×P${put.strike}
          </span>
          <span className="text-muted-foreground ml-2">
            маржа ${cost.marginUsed.toFixed(0)}
          </span>
        </div>
        <div className="flex items-center gap-3 tabular-nums">
          <span className={`whitespace-nowrap ${getPLColor(criteria.topOptions)}`}>
            верх {formatCurrency(criteria.topOptions)}
          </span>
          <span className="whitespace-nowrap text-gray-700 dark:text-gray-300">
            низ {withStock ? '(total)' : '(opt)'} {formatCurrency(criteria.bottomMetric)}
          </span>
          <span className="text-muted-foreground whitespace-nowrap">
            score {Number.isFinite(score) ? score.toFixed(3) : '—'}
          </span>
        </div>
      </div>
    </button>
  );
}

function ResultCard({ variant = 'focused', combination, levels, mode, isActive, onPick, onSelect }) {
  if (variant === 'compact') {
    return (
      <CompactCard
        combination={combination}
        mode={mode}
        isActive={isActive}
        onSelect={onSelect}
      />
    );
  }
  return (
    <FocusedCard
      combination={combination}
      levels={levels}
      mode={mode}
      onPick={onPick}
    />
  );
}

export default ResultCard;
