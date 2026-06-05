/**
 * Экран результатов стратегии «Север GPT».
 *
 * Два готовых блока БЕЗ ползунков и без списков альтернатив:
 *   - «Актив + опционы» (withAsset)
 *   - «Только опционы» (optionsOnly)
 * По одной комбинации в каждом + краткое пояснение ChatGPT + кнопка «Применить».
 * Снизу общие кнопки: «Подобрать заново», «Отклонить», «Вернуться к настройкам».
 */

import React from 'react';
import { Button } from '../../ui/button';
import { RotateCcw, X, ArrowLeft, AlertTriangle } from 'lucide-react';
import ResultCard from '../NorthStrategy/ResultCard';

function Rationale({ text }) {
  if (!text) return null;
  return (
    <div
      className="mt-2 rounded-md px-3 py-2 text-xs whitespace-pre-wrap"
      style={{ background: '#faf5ff', color: '#6b21a8', border: '1px solid #e9d5ff' }}
    >
      {text}
    </div>
  );
}

function Block({ title, block, levels, onApply }) {
  if (!block || (block.error && !block.positions)) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold" style={{ color: '#7c3aed' }}>{title}</div>
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>{block?.error || 'ChatGPT не вернул комбинацию для этого варианта.'}</div>
        </div>
        <Rationale text={block?.rationale} />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold" style={{ color: '#7c3aed' }}>{title}</div>
      <ResultCard
        variant="focused"
        combination={block}
        kind={block.kind}
        levels={levels}
        onPick={() => onApply(block, block.kind)}
      />
      <Rationale text={block.rationale} />
    </div>
  );
}

function NorthGptResultsView({ result, levels, onApply, onRequery, onCancel, onBack }) {
  // Полный провал запроса (обе комбинации не получены) — отдельный экран ошибки.
  if (result?.error && !result?.withAsset && !result?.optionsOnly) {
    return (
      <div className="space-y-4 py-2">
        <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>{result.error}</div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Вернуться к настройкам
          </Button>
          <Button
            size="sm"
            onClick={onRequery}
            className="text-white border-0"
            style={{ background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #7c3aed 100%)' }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Подобрать заново
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-h-[72vh] overflow-y-auto p-1">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Block title="Актив + опционы" block={result?.withAsset} levels={levels} onApply={onApply} />
        <Block title="Только опционы" block={result?.optionsOnly} levels={levels} onApply={onApply} />
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Вернуться к настройкам
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5 mr-1" /> Отклонить
        </Button>
        <Button
          size="sm"
          onClick={onRequery}
          className="text-white border-0"
          style={{ background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #7c3aed 100%)' }}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Подобрать заново
        </Button>
      </div>
    </div>
  );
}

export default NorthGptResultsView;
