/**
 * Форма параметров стратегии «Север GPT».
 *
 * Каркас полей — как у «Севера» (цели, экспирация, диапазоны страйков, маржин),
 * плюс блок управления промптами: выбор из общей библиотеки на сервере,
 * редактирование, сохранение/переименование/удаление. По умолчанию активен
 * последний использованный промпт (сервер отдаёт его первым в списке).
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Save, RefreshCw, Pencil, Trash2 } from 'lucide-react';
import { DEFAULT_NORTH_GPT_PROMPT } from './northGptConstants';
import { getPrompts, createPrompt, updatePrompt, deletePrompt } from '../../../services/northGptApi';
import { getNorthGptDefaults } from '../../../utils/strategyDefaults';

const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const isoFromOffsetDays = (offsetDays) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

// Округление денежных полей до 2 знаков (центы). Нефинитное значение
// (пустая строка / частичный ввод) возвращаем как есть, чтобы не затирать ввод.
const round2 = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : v;
};

// Сколько целых дней от сегодняшней даты (UTC) до выбранной ISO-даты.
// Обратная операция к isoFromOffsetDays — для двусторонней связи «дней» ⇄ «дата расчёта».
const daysFromIsoDate = (iso) => {
  if (!iso) return null;
  const target = new Date(`${iso}T00:00:00Z`).getTime();
  if (!Number.isFinite(target)) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - todayUtc) / 86400000);
};

// Следующая экспирация после current в отсортированном списке ('' если нет).
const getNextExpiration = (current, availableExpirations) => {
  const all = Array.isArray(availableExpirations) ? availableExpirations.slice().sort() : [];
  const idx = all.indexOf(current);
  if (idx === -1 || idx >= all.length - 1) return '';
  return all[idx + 1];
};

function NorthGptParamsForm({
  currentPrice,
  entryPrice,
  leverage,
  calculatorMode,
  availableExpirations,
  initialValues,
  onAnalyze,
  onCancel,
}) {
  const basePrice = entryPrice || currentPrice || 0;

  const defaults = useMemo(() => {
    // Значения по умолчанию из настроек сайта (/settings?section=defaults) —
    // отдельный набор для акций и для крипты, выбирается по режиму калькулятора.
    // Применяются при «чистом» открытии; если форма восстанавливается из
    // initialValues (прошлый запуск) — приоритет у них.
    const ud = getNorthGptDefaults(calculatorMode);
    const top = round2(initialValues?.topPrice ?? basePrice * 1.30);
    const bottom = round2(initialValues?.bottomPrice ?? basePrice * 0.85);
    const calcDate = initialValues?.calcDate ?? isoFromOffsetDays(ud.calcDays);
    return {
      // Точка входа: по умолчанию — обнаруженная по позиции (или текущая цена),
      // но пользователь может переписать (вход может отличаться от текущей цены).
      entry: initialValues?.entryPrice ?? basePrice,
      topPrice: top,
      bottomPrice: bottom,
      expirationDate: initialValues?.expirationDate ?? '',
      calcDate,
      // Кол-во дней до даты расчёта (дефолт из настроек); связано с calcDate в обе стороны.
      calcDays: daysFromIsoDate(calcDate) ?? ud.calcDays,
      callStrikeMin: round2(initialValues?.callStrikeMin ?? basePrice),
      callStrikeMax: round2(initialValues?.callStrikeMax ?? top),
      // В режиме «без Put» прошлый запуск сохранил здесь null — возвращаем
      // обычные значения, чтобы поля были заполнены, если галочку снимут.
      putStrikeMin: round2(initialValues?.putStrikeMin ?? bottom),
      putStrikeMax: round2(initialValues?.putStrikeMax ?? basePrice),
      plTolerance: initialValues?.plTolerance ?? ud.plTolerance,
      margin: initialValues?.margin ?? ud.margin,
      marginTolerance: initialValues?.marginTolerance ?? ud.marginTolerance,
      minStockMarginPct: initialValues?.minStockMarginPct ?? ud.minStockMarginPct,
    };
  }, [basePrice, initialValues, calculatorMode]);

  const [entry, setEntry] = useState(defaults.entry);
  const [top, setTop] = useState(defaults.topPrice);
  const [bottom, setBottom] = useState(defaults.bottomPrice);
  const [expirationDate, setExpirationDate] = useState(defaults.expirationDate);
  // Двойная экспирация: чекбокс + альтернативная дата. По умолчанию выключено.
  // altTouched — пользователь выбрал альтернативную вручную (тогда не
  // подстраиваем её автоматически под основную).
  const [useDoubleExpiration, setUseDoubleExpiration] = useState(initialValues?.useDoubleExpiration ?? false);
  const [altExpirationDate, setAltExpirationDate] = useState(initialValues?.alternativeExpirationDate ?? '');
  const [altTouched, setAltTouched] = useState(!!initialValues?.alternativeExpirationDate);
  const [calcDate, setCalcDate] = useState(defaults.calcDate);
  const [calcDays, setCalcDays] = useState(defaults.calcDays);
  const [callStrikeMin, setCallStrikeMin] = useState(defaults.callStrikeMin);
  const [callStrikeMax, setCallStrikeMax] = useState(defaults.callStrikeMax);
  const [putStrikeMin, setPutStrikeMin] = useState(defaults.putStrikeMin);
  const [putStrikeMax, setPutStrikeMax] = useState(defaults.putStrikeMax);
  const [plTolerance, setPlTolerance] = useState(defaults.plTolerance);
  const [margin, setMargin] = useState(defaults.margin);
  const [marginTolerance, setMarginTolerance] = useState(defaults.marginTolerance);
  const [minStockMarginPct, setMinStockMarginPct] = useState(defaults.minStockMarginPct);
  // Вариант «актив + опционы»: по умолчанию ВЫКЛЮЧЕН (считаем только «только опционы»).
  const [withAssetEnabled, setWithAssetEnabled] = useState(initialValues?.withAssetEnabled ?? false);
  // Режим «без Put»: сделка только из купленных Call. Диапазон страйков Put и
  // допуск P&L по низу в этом режиме не нужны — для чистого Call убыток на нижней
  // цене ограничен уплаченной премией, и требовать «около нуля» бессмысленно.
  const [withoutPut, setWithoutPut] = useState(initialValues?.withoutPut ?? false);

  // ===== Промпты =====
  const [prompts, setPrompts] = useState([]);
  const [selectedPromptId, setSelectedPromptId] = useState(initialValues?.promptId || '');
  const [promptText, setPromptText] = useState(initialValues?.prompt || '');
  const [nameDraft, setNameDraft] = useState('');
  const [promptBusy, setPromptBusy] = useState(false);
  const [promptError, setPromptError] = useState('');

  // Загрузка библиотеки промптов на маунте. Активным становится первый
  // (сервер сортирует «последний использованный» первым). Если у нас уже есть
  // восстановленный текст из initialValues — не перетираем его.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getPrompts();
        if (cancelled) return;
        setPrompts(list);
        if (!initialValues?.prompt) {
          if (list.length > 0) {
            setSelectedPromptId(list[0].id);
            setPromptText(list[0].text);
          } else {
            setSelectedPromptId('');
            setPromptText(DEFAULT_NORTH_GPT_PROMPT);
          }
        }
      } catch (e) {
        if (cancelled) return;
        if (!initialValues?.prompt) setPromptText(DEFAULT_NORTH_GPT_PROMPT);
        setPromptError('Не удалось загрузить библиотеку промптов');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPrompt = useMemo(
    () => prompts.find((p) => p.id === selectedPromptId) || null,
    [prompts, selectedPromptId],
  );
  const promptDirty = !!selectedPrompt && selectedPrompt.text !== promptText;

  const reloadPrompts = async (selectId) => {
    const list = await getPrompts();
    setPrompts(list);
    if (selectId) {
      const found = list.find((p) => p.id === selectId);
      if (found) {
        setSelectedPromptId(found.id);
        setPromptText(found.text);
      }
    }
  };

  const handleSelectPrompt = (id) => {
    setSelectedPromptId(id);
    setPromptError('');
    if (!id) return; // «свой промпт» — оставляем текущий текст
    const found = prompts.find((p) => p.id === id);
    if (found) setPromptText(found.text);
  };

  const handleSaveAsNew = async () => {
    const name = nameDraft.trim();
    if (!name) { setPromptError('Введите название для нового промпта'); return; }
    if (!promptText.trim()) { setPromptError('Текст промпта не может быть пустым'); return; }
    setPromptBusy(true); setPromptError('');
    try {
      const created = await createPrompt({ name, text: promptText });
      setNameDraft('');
      await reloadPrompts(created.id);
    } catch (e) {
      setPromptError('Не удалось сохранить промпт');
    } finally { setPromptBusy(false); }
  };

  const handleUpdateSelected = async () => {
    if (!selectedPromptId) { setPromptError('Сначала выберите промпт из списка'); return; }
    setPromptBusy(true); setPromptError('');
    try {
      await updatePrompt(selectedPromptId, { text: promptText });
      await reloadPrompts(selectedPromptId);
    } catch (e) {
      setPromptError('Не удалось обновить промпт');
    } finally { setPromptBusy(false); }
  };

  const handleRename = async () => {
    if (!selectedPromptId) { setPromptError('Сначала выберите промпт из списка'); return; }
    const name = nameDraft.trim();
    if (!name) { setPromptError('Введите новое название в поле имени'); return; }
    setPromptBusy(true); setPromptError('');
    try {
      await updatePrompt(selectedPromptId, { name });
      setNameDraft('');
      await reloadPrompts(selectedPromptId);
    } catch (e) {
      setPromptError('Не удалось переименовать промпт');
    } finally { setPromptBusy(false); }
  };

  const handleDelete = async () => {
    if (!selectedPromptId) { setPromptError('Сначала выберите промпт из списка'); return; }
    // eslint-disable-next-line no-alert
    if (!window.confirm('Удалить выбранный промпт?')) return;
    setPromptBusy(true); setPromptError('');
    try {
      await deletePrompt(selectedPromptId);
      const list = await getPrompts();
      setPrompts(list);
      if (list.length > 0) {
        setSelectedPromptId(list[0].id);
        setPromptText(list[0].text);
      } else {
        setSelectedPromptId('');
        setPromptText(DEFAULT_NORTH_GPT_PROMPT);
      }
    } catch (e) {
      setPromptError('Не удалось удалить промпт');
    } finally { setPromptBusy(false); }
  };

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

  // Полный список доступных экспираций (по возрастанию) — показываем все даты,
  // и в основном, и в альтернативном поле, без «окна» ближайших.
  const allExpirations = useMemo(
    () => (Array.isArray(availableExpirations) ? [...new Set(availableExpirations)].sort() : []),
    [availableExpirations],
  );

  // Альтернативная дата по умолчанию = следующая после основной. Подстраивается
  // при смене основной, пока пользователь не выбрал альтернативную вручную.
  useEffect(() => {
    if (!useDoubleExpiration || altTouched) return;
    setAltExpirationDate(getNextExpiration(expirationDate, availableExpirations));
  }, [useDoubleExpiration, altTouched, expirationDate, availableExpirations]);

  const handleAltChange = (v) => {
    setAltExpirationDate(v);
    setAltTouched(true);
  };

  // Удобство: «верх» подтягивает верхнюю границу Call-страйков, «низ» — нижнюю Put.
  // Заодно на blur округляем денежное поле до 2 знаков.
  const handleTopBlur = () => {
    const r = round2(top);
    setTop(r);
    setCallStrikeMax(r);
  };
  const handleBottomBlur = () => {
    const r = round2(bottom);
    setBottom(r);
    // В режиме «без Put» нижняя граница Put-страйков не используется — не трогаем её.
    if (!withoutPut) setPutStrikeMin(r);
  };

  // Двусторонняя связь «дней» ⇄ «дата расчёта».
  const handleCalcDaysChange = (v) => {
    setCalcDays(v);
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) setCalcDate(isoFromOffsetDays(n));
  };
  const handleCalcDateChange = (v) => {
    setCalcDate(v);
    const d = daysFromIsoDate(v);
    if (d !== null) setCalcDays(d);
  };

  const errors = [];
  if (toNum(entry) <= 0) errors.push('Укажите точку входа');
  if (toNum(top) <= toNum(entry)) errors.push('Верх должен быть выше точки входа');
  if (toNum(bottom) >= toNum(entry)) errors.push('Низ должен быть ниже точки входа');
  if (!expirationDate) errors.push('Выберите дату экспирации');
  if (useDoubleExpiration) {
    if (!altExpirationDate) errors.push('Выберите альтернативную дату экспирации');
    else if (altExpirationDate === expirationDate) errors.push('Альтернативная дата должна отличаться от основной');
    else if (Array.isArray(availableExpirations) && availableExpirations.length > 0
      && !availableExpirations.includes(altExpirationDate)) {
      errors.push('Альтернативная дата отсутствует в списке экспираций');
    }
  }
  if (!calcDate) errors.push('Выберите дату расчёта');
  if (toNum(callStrikeMin) >= toNum(callStrikeMax)) errors.push('Диапазон страйков Call задан некорректно');
  // Без Put диапазон его страйков и допуск P&L по низу не заполняются и не проверяются.
  if (!withoutPut && toNum(putStrikeMin) >= toNum(putStrikeMax)) errors.push('Диапазон страйков Put задан некорректно');
  if (!withoutPut && toNum(plTolerance) <= 0) errors.push('Допустимый диапазон P&L должен быть положительным');
  if (toNum(margin) <= 0) errors.push('Маржин должен быть положительным');
  if (toNum(marginTolerance) < 0) errors.push('Допуск маржина не может быть отрицательным');
  if (toNum(minStockMarginPct) < 0 || toNum(minStockMarginPct) > 100) errors.push('Доля акции должна быть от 0 до 100%');
  if (!promptText.trim()) errors.push('Введите промпт для ChatGPT');

  const handleSubmit = () => {
    if (errors.length > 0) return;
    onAnalyze({
      entryPrice: toNum(entry),
      topPrice: round2(toNum(top)),
      bottomPrice: round2(toNum(bottom)),
      expirationDate,
      useDoubleExpiration,
      alternativeExpirationDate: useDoubleExpiration ? altExpirationDate : null,
      calcDate,
      callStrikeMin: round2(toNum(callStrikeMin)),
      callStrikeMax: round2(toNum(callStrikeMax)),
      // Без Put диапазон и допуск по низу уходят пустыми: по ним не фильтруем
      // и не ограничиваем модель (см. withoutPut).
      withoutPut,
      putStrikeMin: withoutPut ? null : round2(toNum(putStrikeMin)),
      putStrikeMax: withoutPut ? null : round2(toNum(putStrikeMax)),
      plTolerance: withoutPut ? null : toNum(plTolerance),
      margin: toNum(margin),
      marginTolerance: toNum(marginTolerance),
      minStockMarginPct: toNum(minStockMarginPct),
      withAssetEnabled,
      prompt: promptText,
      promptId: selectedPromptId || null,
    });
  };

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto p-1.5">
      <div className="flex items-end gap-3">
        <div className="w-40">
          <Label className="text-xs">Точка входа в БА ($)</Label>
          <Input
            type="number"
            step="0.01"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
          />
        </div>
        <div className="text-[11px] text-muted-foreground pb-2">
          Текущая цена: ${(currentPrice || 0).toFixed(2)}. Точка входа может отличаться — поправьте при необходимости.
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          checked={withAssetEnabled}
          onChange={(e) => setWithAssetEnabled(e.target.checked)}
        />
        <span className="text-xs">Считать вариант «актив + опционы»</span>
        <span className="text-[11px] text-muted-foreground">— по умолчанию считается только «только опционы»</span>
      </label>

      <div className="grid grid-cols-[1fr_1px_1fr] gap-4">
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Цель по верху ($)</Label>
            <Input type="number" step="0.01" value={top}
              onChange={(e) => setTop(e.target.value)} onBlur={handleTopBlur} />
          </div>
          <div>
            <Label className="text-xs">Закрытие по низу ($)</Label>
            <Input type="number" step="0.01" value={bottom}
              onChange={(e) => setBottom(e.target.value)} onBlur={handleBottomBlur} />
          </div>
          {/* Только для сделок с Put: у чистого Call убыток по низу ограничен
              уплаченной премией, требовать «около нуля» бессмысленно. */}
          {!withoutPut && (
            <div>
              <Label className="text-xs">Допустимый диапазон P&L по низу ± ($)</Label>
              <Input type="number" step="1" min="1" value={plTolerance}
                onChange={(e) => setPlTolerance(e.target.value)} />
            </div>
          )}
        </div>

        <div className="bg-border w-px h-full" aria-hidden="true" />

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Дата экспирации</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
            >
              <option value="">— выбрать —</option>
              {allExpirations.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <label className="mt-2 flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={useDoubleExpiration}
                onChange={(e) => setUseDoubleExpiration(e.target.checked)}
              />
              <span className="text-xs">Посчитать двойную экспирацию</span>
            </label>
            {useDoubleExpiration && (
              <div className="mt-2">
                <Label className="text-xs">Альтернативная дата экспирации</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={altExpirationDate}
                  onChange={(e) => handleAltChange(e.target.value)}
                >
                  <option value="">— выбрать —</option>
                  {allExpirations.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs">Дата расчёта</Label>
            <div className="flex items-end gap-2">
              <div className="w-20">
                <Label className="text-[10px] text-muted-foreground">Дней</Label>
                <Input type="number" step="1" min="0" value={calcDays}
                  onChange={(e) => handleCalcDaysChange(e.target.value)} />
              </div>
              <div className="flex-1">
                <Input type="date" value={calcDate}
                  onChange={(e) => handleCalcDateChange(e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium">Диапазоны страйков</div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={withoutPut}
              onChange={(e) => setWithoutPut(e.target.checked)}
            />
            <span className="text-xs">Без Put — только опционы Call</span>
          </label>
        </div>
        <div className="grid grid-cols-[80px_1fr_1fr] items-end gap-2">
          <div className="text-xs text-muted-foreground pb-2">Call</div>
          <div>
            <Label className="text-[10px]">от ($)</Label>
            <Input type="number" step="0.01" value={callStrikeMin}
              onChange={(e) => setCallStrikeMin(e.target.value)}
              onBlur={() => setCallStrikeMin(round2(callStrikeMin))} />
          </div>
          <div>
            <Label className="text-[10px]">до ($)</Label>
            <Input type="number" step="0.01" value={callStrikeMax}
              onChange={(e) => setCallStrikeMax(e.target.value)}
              onBlur={() => setCallStrikeMax(round2(callStrikeMax))} />
          </div>
        </div>
        {!withoutPut && (
          <div className="grid grid-cols-[80px_1fr_1fr] items-end gap-2">
            <div className="text-xs text-muted-foreground pb-2">Put</div>
            <div>
              <Label className="text-[10px]">от ($)</Label>
              <Input type="number" step="0.01" value={putStrikeMin}
                onChange={(e) => setPutStrikeMin(e.target.value)}
                onBlur={() => setPutStrikeMin(round2(putStrikeMin))} />
            </div>
            <div>
              <Label className="text-[10px]">до ($)</Label>
              <Input type="number" step="0.01" value={putStrikeMax}
                onChange={(e) => setPutStrikeMax(e.target.value)}
                onBlur={() => setPutStrikeMax(round2(putStrikeMax))} />
            </div>
          </div>
        )}
        {withoutPut && (
          <div className="text-[11px] text-muted-foreground">
            Опционы Put не используются: сделка собирается только из купленных Call,
            максимальный убыток равен уплаченной премии.
          </div>
        )}
      </div>

      <div className="border rounded-md p-3 space-y-3 bg-muted/30">
        <div className="text-xs font-medium">Маржин сделки</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Маржин ($)</Label>
            <Input type="number" step="100" min="100" value={margin}
              onChange={(e) => setMargin(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Допуск ± ($)</Label>
            <Input type="number" step="50" min="0" value={marginTolerance}
              onChange={(e) => setMarginTolerance(e.target.value)} />
          </div>
        </div>
        {withAssetEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Мин. доля акции (%)</Label>
              <Input type="number" step="5" min="0" max="100" value={minStockMarginPct}
                onChange={(e) => setMinStockMarginPct(e.target.value)} />
            </div>
            <div className="flex items-end text-[11px] text-muted-foreground pb-2">
              Только для вида «актив + опционы».
            </div>
          </div>
        )}
        <div className="text-[11px] text-muted-foreground">
          Плечо БА: <strong>×{Number(leverage) > 0 ? Number(leverage) : 1}</strong>
          <span className="ml-1">— меняется в блоке настроек калькулятора.</span>
        </div>
      </div>

      {/* Блок промптов для ChatGPT */}
      <div className="border rounded-md p-3 space-y-2" style={{ borderColor: '#d8b4fe' }}>
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium" style={{ color: '#7c3aed' }}>Промпт для ChatGPT</div>
          {promptDirty && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">изменён</span>
          )}
        </div>
        <select
          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={selectedPromptId}
          onChange={(e) => handleSelectPrompt(e.target.value)}
        >
          <option value="">— свой промпт —</option>
          {prompts.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <textarea
          className="w-full min-h-[110px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder="Опишите, как ChatGPT должен подобрать комбинацию…"
        />
        <div className="text-[10px] text-muted-foreground leading-relaxed">
          {'Подстановки (заменяются числами при подборе): {вход} {текущая} {цель_верх} {цель_низ} {маржин} {допуск_маржин} {допуск_низ} {плечо} {доля_акции} {страйки_колл} {страйки_пут} {дата} {экспирация} {дней}'}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 flex-1 min-w-[140px]"
            placeholder="Название промпта"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
          />
          <Button type="button" size="sm" variant="outline" disabled={promptBusy}
            onClick={handleSaveAsNew} title="Сохранить как новый">
            <Save className="h-3.5 w-3.5 mr-1" /> Сохранить как новый
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={promptBusy || !selectedPromptId}
            onClick={handleUpdateSelected} title="Обновить выбранный">
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Обновить
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={promptBusy || !selectedPromptId}
            onClick={handleRename} title="Переименовать выбранный">
            <Pencil className="h-3.5 w-3.5 mr-1" /> Переименовать
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={promptBusy || !selectedPromptId}
            onClick={handleDelete} title="Удалить выбранный">
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Удалить
          </Button>
        </div>
        {promptError && <div className="text-[11px] text-red-600">{promptError}</div>}
      </div>

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
          style={{ background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #7c3aed 100%)' }}
        >
          Подобрать через ChatGPT
        </Button>
      </div>
    </div>
  );
}

export default NorthGptParamsForm;
