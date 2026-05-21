/**
 * Карточка одной комбинации стратегии СЕВЕР.
 * Показывает страйки/количества и P&L по 4 критериям + композитный score.
 */

import React from 'react';
import { Button } from '../../ui/button';
import { formatCurrency, getPLColor } from '../ExitCalculator/utils/formatters';

function CriterionRow({ label, hint, value, idealZero }) {
  // Для критериев "идеал ≈ 0" сам знак значения не несёт смысла — что +295,
  // что −295 одинаково плохие. Поэтому показываем нейтральным цветом.
  // Для бонусных критериев A/B знак важен: плюс — зелёным, минус — красным.
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

function ResultCard({ rank, combination, levels, onPick, headerBg = '#0ea5e9' }) {
  const { call, put, qtyCall, qtyPut, criteria, score } = combination;
  const fmtLevel = (v) => (Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : null);
  return (
    <div className="border rounded-lg overflow-hidden bg-white dark:bg-gray-900 shadow-sm">
      <div style={{ background: headerBg }} className="px-3 py-2 flex items-center justify-between">
        <div className="text-white font-semibold text-sm">№{rank}</div>
        <div className="text-white/80 text-[11px]">
          score: {Number.isFinite(score) ? score.toFixed(3) : '—'}
        </div>
      </div>

      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-xs space-y-0.5">
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
      </div>

      <div className="px-3 py-2 divide-y divide-gray-100 dark:divide-gray-800">
        <CriterionRow
          label={`Цель по верху${fmtLevel(levels?.top) ? ` (${fmtLevel(levels?.top)})` : ''} — только опционы`}
          hint="идеал ≈ 0"
          value={criteria.topOptions}
          idealZero
        />
        <CriterionRow
          label={`Уровень A${fmtLevel(levels?.midA) ? ` (${fmtLevel(levels?.midA)})` : ''} — вся позиция`}
          hint="чем больше, тем лучше"
          value={criteria.midATotal}
        />
        <CriterionRow
          label={`Уровень B${fmtLevel(levels?.midB) ? ` (${fmtLevel(levels?.midB)})` : ''} — вся позиция`}
          hint="чем больше, тем лучше"
          value={criteria.midBTotal}
        />
        <CriterionRow
          label={`Закрытие по низу${fmtLevel(levels?.bottom) ? ` (${fmtLevel(levels?.bottom)})` : ''} — вся позиция`}
          hint="идеал ≈ 0"
          value={criteria.bottomTotal}
          idealZero
        />
      </div>

      <div className="px-3 py-2 border-t bg-white dark:bg-gray-900">
        <Button size="sm" className="w-full text-white border-0"
          style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 50%, #0369a1 100%)' }}
          onClick={onPick}
        >
          Выбрать этот вариант
        </Button>
      </div>
    </div>
  );
}

export default ResultCard;
