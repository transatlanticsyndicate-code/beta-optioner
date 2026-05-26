/**
 * Экран результатов стратегии СЕВЕР v2.
 *
 * Состав:
 *   - 2 бегунка весов (низ → 0, верх → max) — мгновенная пересортировка.
 *   - 1 бегунок маржина — фильтр поверх кэша (без перерасчёта анализа).
 *   - Один фокусированный вариант (лучший по текущим весам и марже).
 *   - Выпадающий блок «Альтернативы» — компактный список всех валидных
 *     комбинаций под текущими фильтрами, клик переключает фокус.
 *
 * Если ничего нет — заглушка с подсказкой ослабить ограничения.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../../ui/button';
import { Label } from '../../ui/label';
import { Slider } from '../../ui/slider';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  rankCombinations,
  filterByMargin,
  DEFAULT_WEIGHTS,
} from '../../../utils/northStrategy/scoring';
import ResultCard from './ResultCard';
import { NORTH_MODES } from '../../../utils/northStrategy/analyzer';

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

function EmptyState({ message, onBack, onCancel }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-xs p-3">
        {message}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>← К параметрам</Button>
        <Button variant="outline" size="sm" onClick={onCancel}>Отмена</Button>
      </div>
    </div>
  );
}

function ResultsView({
  mode = NORTH_MODES.WITH_STOCK,
  combinations,
  initialWeights,
  params,
  marginCenter,
  marginTolerance,
  marginRangeLo,
  marginRangeHi,
  onPick,
  onBack,
  onCancel,
  onStateUpdate,
}) {
  const [weights, setWeights] = useState({
    bottomZero: initialWeights?.bottomZero ?? DEFAULT_WEIGHTS.bottomZero,
    topMax: initialWeights?.topMax ?? DEFAULT_WEIGHTS.topMax,
  });
  const [marginValue, setMarginValue] = useState(marginCenter);
  const [activeId, setActiveId] = useState(null);
  const [altsOpen, setAltsOpen] = useState(false);

  // Сначала фильтруем по маржину (бегунок), потом ранжируем по весам.
  const filtered = useMemo(
    () => filterByMargin(combinations, marginValue, marginTolerance),
    [combinations, marginValue, marginTolerance],
  );
  const ranked = useMemo(() => rankCombinations(filtered, weights), [filtered, weights]);

  // Выбранный (активный) вариант — лучший по текущим фильтрам, либо тот, что пользователь
  // явно ткнул в списке альтернатив (если он ещё в отфильтрованной выдаче).
  const activeCombination = useMemo(() => {
    if (ranked.length === 0) return null;
    if (activeId) {
      const found = ranked.find((c) => c.id === activeId);
      if (found) return found;
    }
    return ranked[0];
  }, [ranked, activeId]);

  // При изменениях весов или маржина — сбрасываем явный пик, чтобы фокус шёл на лучший по новым настройкам.
  useEffect(() => {
    setActiveId(null);
  }, [weights, marginValue]);

  // Пробрасываем изменения наверх для кэша между переключениями экранов.
  useEffect(() => {
    if (onStateUpdate) onStateUpdate({ weights });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weights]);
  useEffect(() => {
    if (onStateUpdate) onStateUpdate({ marginCenter: marginValue });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marginValue]);

  if (combinations.length === 0) {
    return (
      <EmptyState
        message="Не удалось найти комбинации, удовлетворяющие жёстким фильтрам (маржа в диапазоне, опционы на верху в плюсе, низ в допустимом диапазоне P&L). Попробуйте расширить диапазон страйков, увеличить допустимый P&L по низу или изменить маржин."
        onBack={onBack}
        onCancel={onCancel}
      />
    );
  }

  const alternatives = ranked.filter((c) => c.id !== activeCombination?.id);

  return (
    <div className="space-y-4 max-h-[75vh] overflow-y-auto p-1.5">
      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          Экспирация: <strong className="text-gray-700 dark:text-gray-300">{params?.expirationDate || '—'}</strong>
        </span>
        <span>
          Дата расчёта: <strong className="text-gray-700 dark:text-gray-300">{params?.calcDate || '—'}</strong>
        </span>
        <span>
          Прошли фильтры: <strong>{combinations.length}</strong>, под текущий маржин: <strong>{filtered.length}</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 items-start">
        <div className="border rounded-md p-3 bg-muted/30 space-y-3">
          <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            Веса критериев
          </div>
          <WeightSlider
            label="Цель по верху"
            hint="P&L опционов на верху → max"
            value={weights.topMax}
            onChange={(v) => setWeights((w) => ({ ...w, topMax: v }))}
          />
          <WeightSlider
            label="Закрытие по низу"
            hint={`P&L ${mode === NORTH_MODES.WITH_STOCK ? 'всей позиции' : 'опционов'} на низу ≈ 0`}
            value={weights.bottomZero}
            onChange={(v) => setWeights((w) => ({ ...w, bottomZero: v }))}
          />
          <div className="border-t pt-3">
            <MarginSlider
              value={marginValue}
              onChange={setMarginValue}
              rangeLo={marginRangeLo}
              rangeHi={marginRangeHi}
              tolerance={marginTolerance}
            />
          </div>
        </div>

        <div className="space-y-3">
          {activeCombination ? (
            <ResultCard
              variant="focused"
              combination={activeCombination}
              mode={mode}
              levels={params ? { top: params.topPrice, bottom: params.bottomPrice } : null}
              onPick={() => onPick(activeCombination)}
            />
          ) : (
            <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-xs p-3">
              Под текущий маржин нет подходящих комбинаций. Сдвиньте бегунок маржина ближе к исходному значению или вернитесь к параметрам.
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
                      mode={mode}
                      isActive={false}
                      onSelect={() => setActiveId(c.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onBack}>← К параметрам</Button>
        <Button variant="outline" size="sm" onClick={onCancel}>Отмена</Button>
      </div>
    </div>
  );
}

export default ResultsView;
