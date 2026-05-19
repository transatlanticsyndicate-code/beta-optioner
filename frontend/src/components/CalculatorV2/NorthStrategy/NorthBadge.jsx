/**
 * Бейдж "Подобрано стратегией СЕВЕР" — показывается над таблицей опционов
 * когда комбинация выбрана. Позволяет вернуться к результатам или отменить подбор.
 */

import React from 'react';
import { Snowflake, RotateCcw, X } from 'lucide-react';

function NorthBadge({ onReopenResults, onCancel }) {
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-medium text-white"
      style={{
        background: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)',
      }}
    >
      <Snowflake className="h-3.5 w-3.5" />
      <span>Подбор СЕВЕР</span>
      <button
        type="button"
        onClick={onReopenResults}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 transition-colors"
        title="Вернуться к результатам"
      >
        <RotateCcw className="h-3 w-3" />
        К результатам
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 transition-colors"
        title="Отменить подбор"
      >
        <X className="h-3 w-3" />
        Отменить
      </button>
    </div>
  );
}

export default NorthBadge;
