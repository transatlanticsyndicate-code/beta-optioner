/**
 * Карточка одной комбинации стратегии СЕВЕР v2-corrected.
 *
 * Две вариации через проп `variant`:
 *   - 'focused' — крупная карточка фокусированного варианта (в колонке выборки);
 *   - 'compact' — строка в выпадающем списке альтернатив (кликабельная).
 *
 * `kind` определяет семантику отображения (актив+опционы / только опционы):
 *   - 'withStock'   : метка «низ» = P&L всей позиции; в стоимости отдельно
 *                      показывается стоковая часть; уровни A/B показывают P&L total.
 *   - 'optionsOnly' : метка «низ» = P&L опционов; стоковой части нет;
 *                      уровни A/B показывают P&L только опционов.
 */

import React from 'react';
import { Button } from '../../ui/button';
import { formatCurrency, getPLColor } from '../ExitCalculator/utils/formatters';
import { NORTH_KINDS } from '../../../utils/northStrategy/analyzer';

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

function InfoLevelRow({ label, price, value, note }) {
  return (
    <div className="flex justify-between items-baseline text-xs py-1">
      <div className="flex-1 pr-2">
        <div className="font-medium text-gray-700 dark:text-gray-300">
          {label} <span className="text-muted-foreground">(${price.toFixed(2)})</span>
        </div>
        {note && (
          <div className="text-muted-foreground text-[10px]">информационно — {note}</div>
        )}
      </div>
      <span className="font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap tabular-nums">
        {formatCurrency(value)}
      </span>
    </div>
  );
}

// Цветовая палитра по виду сделки.
// withStock   — sky/cyan (как в общем брендинге СЕВЕР);
// optionsOnly — emerald (изумрудный) для визуального отличия.
const PALETTE = {
  withStock: {
    border: 'border-sky-400',
    headerGradient: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 50%, #0369a1 100%)',
    applyGradient: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 50%, #0369a1 100%)',
    activeBg: 'bg-sky-50 dark:bg-sky-950/30',
    activeBorder: 'border-sky-400',
    title: 'Актив + опционы',
  },
  optionsOnly: {
    border: 'border-emerald-400',
    headerGradient: 'linear-gradient(135deg, #34d399 0%, #10b981 50%, #047857 100%)',
    applyGradient: 'linear-gradient(135deg, #34d399 0%, #10b981 50%, #047857 100%)',
    activeBg: 'bg-emerald-50 dark:bg-emerald-950/30',
    activeBorder: 'border-emerald-400',
    title: 'Только опционы',
  },
};

function FocusedCard({ combination, levels, kind, onPick }) {
  const { call, put, qtyCall, qtyPut, criteria, cost, meta, score } = combination;
  const fmtLevel = (v) => (Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : null);
  const withStock = kind === NORTH_KINDS.WITH_STOCK;
  const palette = PALETTE[kind] || PALETTE.withStock;

  return (
    <div className={`border-2 ${palette.border} rounded-lg overflow-hidden bg-white dark:bg-gray-900 shadow-md`}>
      <div
        style={{ background: palette.headerGradient }}
        className="px-4 py-2 flex items-center justify-between text-white"
      >
        <div className="font-semibold text-sm">{palette.title}</div>
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

      {/* Порядок строк: Верх → A → B → Низ. A и B — информационные. */}
      <div className="px-4 py-2 divide-y divide-gray-100 dark:divide-gray-800">
        <CriterionRow
          label={`Цель по верху${fmtLevel(levels?.top) ? ` (${fmtLevel(levels?.top)})` : ''} — P&L опционов`}
          hint="чем больше, тем лучше"
          value={criteria.topOptions}
        />
        {meta && Number.isFinite(meta.levelA) && (
          <InfoLevelRow
            label="Уровень A"
            price={meta.levelA}
            value={meta.plAtLevelA}
            note={withStock ? 'P&L всей позиции' : 'P&L опционов'}
          />
        )}
        {meta && Number.isFinite(meta.levelB) && (
          <InfoLevelRow
            label="Уровень B"
            price={meta.levelB}
            value={meta.plAtLevelB}
            note={withStock ? 'P&L всей позиции' : 'P&L опционов'}
          />
        )}
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
          style={{ background: palette.applyGradient }}
          onClick={onPick}
        >
          Применить
        </Button>
      </div>
    </div>
  );
}

function CompactCard({ combination, kind, isActive, onSelect }) {
  const { call, put, qtyCall, qtyPut, criteria, cost, score } = combination;
  const withStock = kind === NORTH_KINDS.WITH_STOCK;
  const palette = PALETTE[kind] || PALETTE.withStock;
  const baseClass = isActive
    ? `${palette.activeBorder} ${palette.activeBg}`
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

function ResultCard({ variant = 'focused', combination, levels, kind, isActive, onPick, onSelect }) {
  if (variant === 'compact') {
    return (
      <CompactCard
        combination={combination}
        kind={kind}
        isActive={isActive}
        onSelect={onSelect}
      />
    );
  }
  return (
    <FocusedCard
      combination={combination}
      levels={levels}
      kind={kind}
      onPick={onPick}
    />
  );
}

export default ResultCard;
