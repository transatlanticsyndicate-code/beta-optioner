/**
 * Экран результатов стратегии СЕВЕР v2-corrected.
 *
 * Две карточки рядом: «Актив + опционы» и «Только опционы». Каждая колонка
 * управляет своим набором бегунков (вес «верх», вес «низ», маржин) и своим
 * активным вариантом — пересортировка и фильтр не влияют на соседнюю колонку.
 *
 * Анализ запускается один раз; в `result` приходят обе выборки и общие уровни
 * A/B (информационные, не критерии).
 */

import React, { useMemo, useState } from 'react';
import { Button } from '../../ui/button';
import { Label } from '../../ui/label';
import { Slider } from '../../ui/slider';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  rankCombinations,
  filterByMargin,
} from '../../../utils/northStrategy/scoring';
import ResultCard from './ResultCard';
import { NORTH_KINDS } from '../../../utils/northStrategy/analyzer';

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

function MarginSlider({ value, onChange, rangeLo, rangeHi, tolerance }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline text-xs">
        <Label className="text-xs">Маржин сделки</Label>
        <span className="text-muted-foreground tabular-nums">
          ${value.toFixed(0)} <span className="opacity-60">± {tolerance}</span>
        </span>
      </div>
      <Slider
        min={Math.round(rangeLo)}
        max={Math.round(rangeHi)}
        step={100}
        value={[Math.round(value)]}
        onValueChange={(v) => onChange(v[0])}
      />
      <div className="text-[10px] text-muted-foreground">
        диапазон ${Math.round(rangeLo)}–${Math.round(rangeHi)}
      </div>
    </div>
  );
}

function BucketColumn({
  title,
  hintBottom,
  kind,
  combinations,
  bucketState,
  marginTolerance,
  marginRangeLo,
  marginRangeHi,
  params,
  onUpdate,
  onPick,
}) {
  const [activeId, setActiveId] = useState(null);
  const [altsOpen, setAltsOpen] = useState(false);

  const filtered = useMemo(
    () => filterByMargin(combinations, bucketState.marginCenter, marginTolerance),
    [combinations, bucketState.marginCenter, marginTolerance],
  );
  const ranked = useMemo(
    () => rankCombinations(filtered, bucketState.weights),
    [filtered, bucketState.weights],
  );

  const activeCombination = useMemo(() => {
    if (ranked.length === 0) return null;
    if (activeId) {
      const found = ranked.find((c) => c.id === activeId);
      if (found) return found;
    }
    return ranked[0];
  }, [ranked, activeId]);

  // Сброс activeId — синхронно в обработчиках бегунков, а не через useEffect.
  // ЗАЧЕМ: useEffect срабатывает ПОСЛЕ пересчёта `ranked`, и старый id всё ещё
  // находится в обновлённом списке — фокус не слетал на новый лучший вариант.
  const setWeight = (key, v) => {
    setActiveId(null);
    onUpdate({ weights: { ...bucketState.weights, [key]: v } });
  };
  const setMargin = (v) => {
    setActiveId(null);
    onUpdate({ marginCenter: v });
  };

  const alternatives = ranked.filter((c) => c.id !== activeCombination?.id);

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        <span className="font-semibold text-gray-700 dark:text-gray-300">{title}</span>
        <span className="ml-2">·</span>
        <span className="ml-2">прошли фильтры: <strong>{combinations.length}</strong></span>
        <span className="ml-2">· под текущий маржин: <strong>{filtered.length}</strong></span>
      </div>

      <div className="border rounded-md p-3 bg-muted/30 space-y-3">
        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          Веса критериев
        </div>
        <WeightSlider
          label="Цель по верху"
          hint="P&L опционов на верху → max"
          value={bucketState.weights.topMax}
          onChange={(v) => setWeight('topMax', v)}
        />
        <WeightSlider
          label="Закрытие по низу"
          hint={hintBottom}
          value={bucketState.weights.bottomZero}
          onChange={(v) => setWeight('bottomZero', v)}
        />
        <div className="border-t pt-3">
          <MarginSlider
            value={bucketState.marginCenter}
            onChange={setMargin}
            rangeLo={marginRangeLo}
            rangeHi={marginRangeHi}
            tolerance={marginTolerance}
          />
        </div>
      </div>

      {combinations.length === 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-xs p-3">
          Под эту позицию подходящих комбинаций не нашлось. Попробуйте расширить диапазон страйков, увеличить допуск P&L или изменить базовый маржин.
        </div>
      ) : activeCombination ? (
        <ResultCard
          variant="focused"
          combination={activeCombination}
          kind={kind}
          levels={params ? { top: params.topPrice, bottom: params.bottomPrice } : null}
          onPick={() => onPick(activeCombination, kind)}
        />
      ) : (
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-xs p-3">
          Под текущий маржин в этой выборке нет подходящих комбинаций. Сдвиньте бегунок маржина или вернитесь к параметрам.
        </div>
      )}

      {alternatives.length > 0 && (
        <div className="border rounded-md bg-white dark:bg-gray-900">
          <button
            type="button"
            onClick={() => setAltsOpen((v) => !v)}
            className="w-full px-3 py-2 flex items-center justify-between text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <span className="font-medium">Альтернативы ({alternatives.length})</span>
            {altsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {altsOpen && (
            <div className="px-2 pb-2 space-y-1">
              {alternatives.map((c) => (
                <ResultCard
                  key={c.id}
                  variant="compact"
                  combination={c}
                  kind={kind}
                  isActive={false}
                  onSelect={() => setActiveId(c.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultsView({
  result,
  params,
  withStockState,
  optionsOnlyState,
  marginTolerance,
  marginRangeLo,
  marginRangeHi,
  onPick,
  onBack,
  onCancel,
  onBucketUpdate,
}) {
  const withStockList = Array.isArray(result?.withStock) ? result.withStock : [];
  const optionsOnlyList = Array.isArray(result?.optionsOnly) ? result.optionsOnly : [];
  const bothEmpty = withStockList.length === 0 && optionsOnlyList.length === 0;

  if (bothEmpty) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-xs p-3">
          Не удалось найти комбинации ни для одного из видов сделки. Попробуйте расширить диапазон страйков, увеличить допустимый P&L по низу или изменить маржин.
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>← К параметрам</Button>
          <Button variant="outline" size="sm" onClick={onCancel}>Отмена</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-h-[78vh] overflow-y-auto p-1.5">
      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          Экспирация: <strong className="text-gray-700 dark:text-gray-300">{params?.expirationDate || '—'}</strong>
        </span>
        <span>
          Дата расчёта: <strong className="text-gray-700 dark:text-gray-300">{params?.calcDate || '—'}</strong>
        </span>
        {result?.levels?.a != null && result?.levels?.b != null && (
          <span>
            Уровни:
            <strong className="text-gray-700 dark:text-gray-300 ml-1">A ${result.levels.a.toFixed(2)}</strong>
            <span className="mx-1">·</span>
            <strong className="text-gray-700 dark:text-gray-300">B ${result.levels.b.toFixed(2)}</strong>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BucketColumn
          title="Актив + опционы"
          hintBottom="P&L всей позиции на низу ≈ 0"
          kind={NORTH_KINDS.WITH_STOCK}
          combinations={withStockList}
          bucketState={withStockState}
          marginTolerance={marginTolerance}
          marginRangeLo={marginRangeLo}
          marginRangeHi={marginRangeHi}
          params={params}
          onUpdate={(next) => onBucketUpdate(NORTH_KINDS.WITH_STOCK, next)}
          onPick={onPick}
        />
        <BucketColumn
          title="Только опционы"
          hintBottom="P&L опционов на низу ≈ 0"
          kind={NORTH_KINDS.OPTIONS_ONLY}
          combinations={optionsOnlyList}
          bucketState={optionsOnlyState}
          marginTolerance={marginTolerance}
          marginRangeLo={marginRangeLo}
          marginRangeHi={marginRangeHi}
          params={params}
          onUpdate={(next) => onBucketUpdate(NORTH_KINDS.OPTIONS_ONLY, next)}
          onPick={onPick}
        />
      </div>

      <div className="flex justify-between gap-2 pt-2 border-t">
        <Button variant="outline" size="sm" onClick={onBack}>← К параметрам</Button>
        <Button variant="outline" size="sm" onClick={onCancel}>Отмена</Button>
      </div>
    </div>
  );
}

export default ResultsView;
