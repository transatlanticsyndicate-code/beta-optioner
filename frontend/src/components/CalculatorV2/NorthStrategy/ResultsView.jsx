/**
 * Экран результатов стратегии СЕВЕР: 4 слайдера весов + топ-3 карточки.
 * Веса пересортировывают результаты на лету без повторного запуска анализатора.
 */

import React, { useMemo, useState } from 'react';
import { Button } from '../../ui/button';
import { Label } from '../../ui/label';
import { Slider } from '../../ui/slider';
import { rankCombinations, DEFAULT_WEIGHTS } from '../../../utils/northStrategy/scoring';
import ResultCard from './ResultCard';

function WeightSlider({ label, value, onChange, hint }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline text-xs">
        <Label className="text-xs">{label}</Label>
        <span className="text-muted-foreground tabular-nums">{value}%</span>
      </div>
      <Slider
        min={0}
        max={100}
        step={1}
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
      />
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ResultsView({ combinations, initialWeights, onPick, onBack, onCancel }) {
  const [weights, setWeights] = useState({
    bottomZero: initialWeights?.bottomZero ?? DEFAULT_WEIGHTS.bottomZero,
    topZero: initialWeights?.topZero ?? DEFAULT_WEIGHTS.topZero,
    midAMax: initialWeights?.midAMax ?? DEFAULT_WEIGHTS.midAMax,
    midBMax: initialWeights?.midBMax ?? DEFAULT_WEIGHTS.midBMax,
  });

  const ranked = useMemo(() => rankCombinations(combinations, weights), [combinations, weights]);
  const top3 = ranked.slice(0, 3);

  if (combinations.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-xs p-3">
          В выбранном диапазоне нет подходящих страйков с такой экспирацией.
          Возможные причины:
          <ul className="list-disc list-inside mt-1">
            <li>В TradingView сейчас открыта другая экспирация — переключите её и попробуйте снова.</li>
            <li>В диапазоне нет коллов выше точки входа или путов ниже точки входа.</li>
            <li>У части опционов отсутствуют ASK или IV.</li>
          </ul>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>← К параметрам</Button>
          <Button variant="outline" size="sm" onClick={onCancel}>Отмена</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
      <div className="border rounded-md p-3 bg-muted/30 space-y-3">
        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          Веса критериев (порядок карточек обновляется на лету)
        </div>
        <div className="grid grid-cols-2 gap-3">
          <WeightSlider
            label="Низ → 0"
            hint="P&L всей позиции на низу ≈ 0"
            value={weights.bottomZero}
            onChange={(v) => setWeights((w) => ({ ...w, bottomZero: v }))}
          />
          <WeightSlider
            label="Верх → 0"
            hint="P&L опционов на верху ≈ 0"
            value={weights.topZero}
            onChange={(v) => setWeights((w) => ({ ...w, topZero: v }))}
          />
          <WeightSlider
            label="Уровень A: максимум"
            hint="Максимум P&L всей позиции на A"
            value={weights.midAMax}
            onChange={(v) => setWeights((w) => ({ ...w, midAMax: v }))}
          />
          <WeightSlider
            label="Уровень B: максимум"
            hint="Максимум P&L всей позиции на B"
            value={weights.midBMax}
            onChange={(v) => setWeights((w) => ({ ...w, midBMax: v }))}
          />
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Всего проанализировано: <strong>{combinations.length}</strong> комбинаций. Показано топ-3.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {top3.map((c, i) => (
          <ResultCard
            key={c.id}
            rank={i + 1}
            combination={c}
            onPick={() => onPick(c)}
          />
        ))}
      </div>

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onBack}>← К параметрам</Button>
        <Button variant="outline" size="sm" onClick={onCancel}>Отмена</Button>
      </div>
    </div>
  );
}

export default ResultsView;
