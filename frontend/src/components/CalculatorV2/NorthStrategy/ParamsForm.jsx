/**
 * Форма параметров стратегии СЕВЕР.
 * Пользователь задаёт диапазон цен, уровни, даты, ограничения количеств.
 * При нажатии "Подобрать" — вызывается onAnalyze со всеми параметрами.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { ChevronDown, ChevronUp } from 'lucide-react';

const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const isoFromOffsetDays = (offsetDays) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

function ParamsForm({
  currentPrice,
  entryPrice,
  availableExpirations,
  initialValues,
  onAnalyze,
  onCancel,
}) {
  const defaults = useMemo(() => {
    const top = initialValues?.topPrice ?? Number((currentPrice * 1.15).toFixed(2));
    const bottom = initialValues?.bottomPrice ?? Number((currentPrice * 0.85).toFixed(2));
    const entry = entryPrice || currentPrice;
    return {
      topPrice: top,
      bottomPrice: bottom,
      midAPrice: initialValues?.midAPrice ?? Number(((top + entry) / 2).toFixed(2)),
      midBPrice: initialValues?.midBPrice ?? Number(((bottom + entry) / 2).toFixed(2)),
      expirationDate: initialValues?.expirationDate ?? '',
      calcDate: initialValues?.calcDate ?? isoFromOffsetDays(30),
      strikeRangeMin: initialValues?.strikeRangeMin ?? bottom,
      strikeRangeMax: initialValues?.strikeRangeMax ?? top,
      callMin: initialValues?.qty?.callMin ?? 1,
      callMax: initialValues?.qty?.callMax ?? 3,
      putMin: initialValues?.qty?.putMin ?? 2,
      putMax: initialValues?.qty?.putMax ?? 8,
      requirePutGreater: initialValues?.qty?.requirePutGreater ?? true,
    };
  }, [currentPrice, entryPrice, initialValues]);

  const [top, setTop] = useState(defaults.topPrice);
  const [bottom, setBottom] = useState(defaults.bottomPrice);
  const [midA, setMidA] = useState(defaults.midAPrice);
  const [midB, setMidB] = useState(defaults.midBPrice);
  const [midAManual, setMidAManual] = useState(initialValues?.midAManual ?? false);
  const [midBManual, setMidBManual] = useState(initialValues?.midBManual ?? false);
  const [expirationDate, setExpirationDate] = useState(defaults.expirationDate);
  const [calcDate, setCalcDate] = useState(defaults.calcDate);
  const [strikeMin, setStrikeMin] = useState(defaults.strikeRangeMin);
  const [strikeMax, setStrikeMax] = useState(defaults.strikeRangeMax);
  const [callMin, setCallMin] = useState(defaults.callMin);
  const [callMax, setCallMax] = useState(defaults.callMax);
  const [putMin, setPutMin] = useState(defaults.putMin);
  const [putMax, setPutMax] = useState(defaults.putMax);
  const [requirePutGreater, setRequirePutGreater] = useState(defaults.requirePutGreater);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Автоподбор экспирации ~+60 дней
  useEffect(() => {
    if (expirationDate || !Array.isArray(availableExpirations) || availableExpirations.length === 0) return;
    const target = new Date(isoFromOffsetDays(60)).getTime();
    let best = availableExpirations[0];
    let bestDiff = Math.abs(new Date(`${best}T00:00:00Z`).getTime() - target);
    for (const d of availableExpirations) {
      const diff = Math.abs(new Date(`${d}T00:00:00Z`).getTime() - target);
      if (diff < bestDiff) {
        best = d;
        bestDiff = diff;
      }
    }
    setExpirationDate(best);
  }, [availableExpirations, expirationDate]);

  // Дропдаун показываем сфокусированно: 3 даты до выбранной + сама + 3 после.
  // Если границ списка не хватает с одной стороны — добираем с другой.
  const dropdownExpirations = useMemo(() => {
    const all = Array.isArray(availableExpirations) ? availableExpirations.slice().sort() : [];
    if (all.length === 0) return [];
    const NEIGHBORS = 3;
    const idx = all.indexOf(expirationDate);
    if (idx === -1) {
      // Если экспирация ещё не выбрана — отдадим весь список (autoselect его подхватит)
      return all;
    }
    let start = Math.max(0, idx - NEIGHBORS);
    let end = Math.min(all.length, idx + NEIGHBORS + 1);
    // Добираем с противоположной стороны, если упёрлись в границу
    if (idx - start < NEIGHBORS) end = Math.min(all.length, end + (NEIGHBORS - (idx - start)));
    if (end - 1 - idx < NEIGHBORS) start = Math.max(0, start - (NEIGHBORS - (end - 1 - idx)));
    return all.slice(start, end);
  }, [availableExpirations, expirationDate]);

  // Авто-обновление промежуточных уровней при изменении верха/низа, если их не правил вручную
  useEffect(() => {
    if (!midAManual) {
      const e = entryPrice || currentPrice;
      setMidA(Number(((toNum(top) + e) / 2).toFixed(2)));
    }
  }, [top, entryPrice, currentPrice, midAManual]);
  useEffect(() => {
    if (!midBManual) {
      const e = entryPrice || currentPrice;
      setMidB(Number(((toNum(bottom) + e) / 2).toFixed(2)));
    }
  }, [bottom, entryPrice, currentPrice, midBManual]);

  // Авто-обновление диапазона страйков при изменении верха/низа
  useEffect(() => {
    setStrikeMin(toNum(bottom));
    setStrikeMax(toNum(top));
  }, [top, bottom]);

  const errors = [];
  if (toNum(top) <= toNum(entryPrice || currentPrice)) errors.push('Верх должен быть выше точки входа');
  if (toNum(bottom) >= toNum(entryPrice || currentPrice)) errors.push('Низ должен быть ниже точки входа');
  if (!expirationDate) errors.push('Выберите дату экспирации');
  if (!calcDate) errors.push('Выберите дату расчёта');
  if (toNum(strikeMin) >= toNum(strikeMax)) errors.push('Диапазон страйков задан некорректно');
  if (callMin < 1 || callMax < callMin) errors.push('Диапазон количества коллов задан некорректно');
  if (putMin < 1 || putMax < putMin) errors.push('Диапазон количества путов задан некорректно');

  const handleSubmit = () => {
    if (errors.length > 0) return;
    onAnalyze({
      topPrice: toNum(top),
      bottomPrice: toNum(bottom),
      midAPrice: toNum(midA),
      midBPrice: toNum(midB),
      midAManual,
      midBManual,
      expirationDate,
      calcDate,
      strikeRangeMin: toNum(strikeMin),
      strikeRangeMax: toNum(strikeMax),
      qty: {
        callMin: Math.max(1, parseInt(callMin, 10) || 1),
        callMax: Math.max(1, parseInt(callMax, 10) || 1),
        putMin: Math.max(1, parseInt(putMin, 10) || 1),
        putMax: Math.max(1, parseInt(putMax, 10) || 1),
        requirePutGreater,
      },
    });
  };

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto p-1.5">
      <div className="text-xs text-muted-foreground">
        Точка входа в БА: <strong>${(entryPrice || currentPrice || 0).toFixed(2)}</strong>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Цель по верху ($)</Label>
          <Input type="number" step="0.01" value={top} onChange={(e) => setTop(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Закрытие по низу ($)</Label>
          <Input type="number" step="0.01" value={bottom} onChange={(e) => setBottom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Промежуточный A ($)</Label>
          <Input
            type="number"
            step="0.01"
            value={midA}
            onChange={(e) => { setMidA(e.target.value); setMidAManual(true); }}
          />
        </div>
        <div>
          <Label className="text-xs">Промежуточный B ($)</Label>
          <Input
            type="number"
            step="0.01"
            value={midB}
            onChange={(e) => { setMidB(e.target.value); setMidBManual(true); }}
          />
        </div>
        <div>
          <Label className="text-xs">Дата экспирации</Label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={expirationDate}
            onChange={(e) => setExpirationDate(e.target.value)}
          >
            <option value="">— выбрать —</option>
            {dropdownExpirations.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Дата расчёта</Label>
          <Input type="date" value={calcDate} onChange={(e) => setCalcDate(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Страйк от ($)</Label>
          <Input type="number" step="0.01" value={strikeMin} onChange={(e) => setStrikeMin(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Страйк до ($)</Label>
          <Input type="number" step="0.01" value={strikeMax} onChange={(e) => setStrikeMax(e.target.value)} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {advancedOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Ограничения количества
      </button>

      {advancedOpen && (
        <div className="border rounded-md p-3 space-y-2 bg-muted/30">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Buy Call: мин</Label>
              <Input type="number" min={1} value={callMin} onChange={(e) => setCallMin(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Buy Call: макс</Label>
              <Input type="number" min={1} value={callMax} onChange={(e) => setCallMax(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Buy Put: мин</Label>
              <Input type="number" min={1} value={putMin} onChange={(e) => setPutMin(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Buy Put: макс</Label>
              <Input type="number" min={1} value={putMax} onChange={(e) => setPutMax(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={requirePutGreater}
              onChange={(e) => setRequirePutGreater(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Количество путов больше количества коллов
          </label>
        </div>
      )}

      {errors.length > 0 && (
        <div className="text-xs text-red-600 space-y-0.5">
          {errors.map((e) => (
            <div key={e}>• {e}</div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Отмена</Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={errors.length > 0}
          className="text-white border-0"
          style={{
            background: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 50%, #0369a1 100%)',
          }}
        >
          Подобрать наилучшие комбинации
        </Button>
      </div>
    </div>
  );
}

export default ParamsForm;
