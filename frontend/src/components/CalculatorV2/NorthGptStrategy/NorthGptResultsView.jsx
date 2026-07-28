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
import { RotateCcw, X, ArrowLeft, AlertTriangle, FileSearch } from 'lucide-react';
import ResultCard from '../NorthStrategy/ResultCard';
import DealPrecheckPanel from './DealPrecheckPanel';

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
      <DealPrecheckPanel precheck={block.precheck} status={block.precheckStatus} />
      <Rationale text={block.rationale} />
    </div>
  );
}

function NorthGptResultsView({ result, levels, onApply, onRequery, onCancel, onBack }) {
  // Служебный просмотр: открыть в новой вкладке полный текст запроса в GPT и сырой ответ.
  const openDebug = () => {
    const esc = (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const renderMessages = (dbg) => (Array.isArray(dbg?.messages)
      ? dbg.messages.map((m) => `=== ${String(m.role).toUpperCase()} ===\n${m.content}`).join('\n\n')
      : '— нет данных запроса —');

    let body;
    if (result?.dual) {
      // Двойной режим: по секции на каждую экспирацию (свой запрос/ответ/итог).
      const section = (title, group, dbg) => (
        '<h2>' + esc(title) + ' — модель: ' + esc(dbg?.model || '—') + '</h2>'
        + '<h3>Запрос в GPT</h3><pre>' + esc(renderMessages(dbg)) + '</pre>'
        + '<h3>Ответ GPT</h3><pre>' + esc(dbg?.rawResponse || '— нет ответа —') + '</pre>'
        + '<h3>Итог после проверки</h3><pre>'
        + esc(JSON.stringify({ withAsset: group?.withAsset, optionsOnly: group?.optionsOnly }, null, 2)) + '</pre>'
      );
      body = section(`Основная экспирация (${result?.primary?.expirationDate || '—'})`,
        result?.primary, result?.debug?.primary)
        + section(`Альтернативная экспирация (${result?.alternative?.expirationDate || '—'})`,
          result?.alternative, result?.debug?.alternative);
    } else {
      const dbg = result?.debug || {};
      body = '<p class="muted">Модель: ' + esc(dbg.model || '—') + '</p>'
        + '<h2>1. Запрос в GPT (полностью)</h2><pre>' + esc(renderMessages(dbg)) + '</pre>'
        + '<h2>2. Ответ GPT (как есть)</h2><pre>' + esc(dbg.rawResponse || '— нет ответа —') + '</pre>'
        + '<h2>3. Итог после проверки по реальной цепочке</h2><pre>'
        + esc(JSON.stringify({ withAsset: result?.withAsset, optionsOnly: result?.optionsOnly }, null, 2)) + '</pre>';
    }

    const html = '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
      + '<title>Север GPT — запрос и ответ</title>'
      + '<style>body{font-family:system-ui,Segoe UI,Roboto,sans-serif;margin:24px;background:#0b0b0f;color:#e5e7eb}'
      + 'h1{color:#c084fc;font-size:18px}h2{color:#a855f7;margin:20px 0 8px}'
      + 'h3{color:#9333ea;margin:14px 0 6px;font-size:14px}'
      + 'pre{white-space:pre-wrap;word-break:break-word;background:#15151c;padding:12px;border-radius:8px;border:1px solid #2a2a35;font-size:12px;line-height:1.5}'
      + '.muted{color:#9ca3af;font-size:12px}</style></head><body>'
      + '<h1>Север GPT — отладка</h1>'
      + body
      + '</body></html>';
    const w = window.open('', '_blank');
    if (w && w.document) {
      w.document.write(html);
      w.document.close();
    }
  };

  // Вариант «актив + опционы» скрывается, если он выключен в настройках
  // (result.withAssetEnabled === false). Для старых результатов без флага —
  // показываем как раньше (undefined !== false).
  const showWithAsset = result?.withAssetEnabled !== false;

  // Блоки для одной группы — в одиночном и в двойном режиме. Если «актив +
  // опционы» выключен, показываем только «только опционы» (в узкой колонке).
  const renderPair = (group) => (
    showWithAsset ? (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Block title="Актив + опционы" block={group?.withAsset} levels={levels} onApply={onApply} />
        <Block title="Только опционы" block={group?.optionsOnly} levels={levels} onApply={onApply} />
      </div>
    ) : (
      <div className="max-w-xl">
        <Block title="Только опционы" block={group?.optionsOnly} levels={levels} onApply={onApply} />
      </div>
    )
  );

  // Полный провал запроса (обе комбинации не получены) — отдельный экран ошибки.
  if (result?.error && !result?.withAsset && !result?.optionsOnly && !result?.dual) {
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
      {result?.dual ? (
        <div className="space-y-5">
          <section className="space-y-2">
            <div className="text-sm font-semibold border-b pb-1" style={{ color: '#7c3aed' }}>
              Экспирация {result?.primary?.expirationDate}
            </div>
            {renderPair(result?.primary)}
          </section>
          <section className="space-y-2">
            <div className="text-sm font-semibold border-b pb-1" style={{ color: '#7c3aed' }}>
              Экспирация {result?.alternative?.expirationDate}
              <span className="ml-1 font-normal text-muted-foreground">(альтернативная)</span>
            </div>
            {renderPair(result?.alternative)}
          </section>
        </div>
      ) : (
        <section className="space-y-2">
          {/* Дата экспирации подобранных опционов. У старых сохранённых
              результатов её нет — тогда заголовок не показываем. */}
          {result?.expirationDate && (
            <div className="text-sm font-semibold border-b pb-1" style={{ color: '#7c3aed' }}>
              Экспирация {result.expirationDate}
            </div>
          )}
          {renderPair(result)}
        </section>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
        {result?.debug && (
          <Button
            variant="ghost"
            size="sm"
            className="mr-auto text-muted-foreground"
            onClick={openDebug}
            title="Открыть в новой вкладке точный запрос в GPT и его ответ"
          >
            <FileSearch className="h-3.5 w-3.5 mr-1" /> Запрос/ответ
          </Button>
        )}
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
