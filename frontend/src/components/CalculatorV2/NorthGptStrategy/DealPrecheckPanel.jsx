/**
 * Риск-памятка «Проверка сделки» на карточке результата «Север GPT».
 *
 * ЗАЧЕМ: внешний сервис (news.optioner.online) оценивает уже собранную конструкцию
 * и присылает готовый текст на русском + предупреждения + новостной контекст. Это
 * ИНФОРМАЦИОННЫЙ блок, не ворота — кнопка «Применить» на карточке всегда активна
 * независимо от вердикта (REJECT только красит, никогда не блокирует).
 *
 * Вызов запускается автоматически на фоне (см. schedulePrechecks в
 * NorthGptStrategyDialog) сразу после подбора, поэтому статус может быть:
 *  - undefined      — проверка ещё не запускалась (блок не отрисовывается);
 *  - 'loading'      — ждём ответ (до ~25с по ТЗ);
 *  - 'error'        — сервис не ответил/недоступен — тихая приглушённая строка;
 *  - 'done'         — есть ответ, показываем разбор.
 */

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2, ChevronDown, ChevronRight, Info } from 'lucide-react';

const STATUS_STYLE = {
  GOOD: { bg: '#f0fdf4', border: '#86efac', text: '#166534', label: 'Проверка сделки: всё сходится' },
  OK: { bg: '#f0fdf4', border: '#86efac', text: '#166534', label: 'Проверка сделки: сходится, есть замечания' },
  HIGH_RISK: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', label: 'Проверка сделки: риск повышен' },
  REJECT: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', label: 'Проверка сделки: сделка не сходится' },
};

function WarningsList({ items, tone }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const color = tone === 'critical' ? '#991b1b' : '#78350f';
  return (
    <ul className="mt-1 space-y-0.5 pl-4 list-disc text-xs" style={{ color }}>
      {items.map((w, i) => (
        <li key={i}>{w.reason || w.code || String(w)}</li>
      ))}
    </ul>
  );
}

function NewsSection({ newsContext }) {
  const [open, setOpen] = useState(false);
  const report = newsContext?.report;
  if (!report) return null;
  return (
    <div className="mt-2 border-t pt-2" style={{ borderColor: 'inherit' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium opacity-80 hover:opacity-100"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Новостной контекст
      </button>
      {open && (
        <div className="mt-1 text-xs prose prose-xs max-w-none dark:prose-invert">
          <ReactMarkdown>{report}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function DealPrecheckPanel({ precheck, status }) {
  if (!status) return null;

  if (status === 'loading') {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground py-1.5 px-2 rounded-md bg-gray-50 dark:bg-gray-800/50">
        <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
        Проверяем сделку…
      </div>
    );
  }

  if (status === 'error' || precheck?.status !== 'ok') {
    return (
      <div
        className="mt-2 flex items-center gap-2 text-xs text-muted-foreground py-1.5 px-2 rounded-md bg-gray-50 dark:bg-gray-800/50"
        title={precheck?.message || ''}
      >
        <Info className="h-3.5 w-3.5 flex-shrink-0" />
        Проверка сделки недоступна{precheck?.message ? `: ${precheck.message}` : ''}
      </div>
    );
  }

  const finalStatus = precheck.final_status || 'OK';
  const style = STATUS_STYLE[finalStatus] || STATUS_STYLE.OK;
  const score = precheck.score;

  return (
    <div
      className="mt-2 rounded-md px-3 py-2 text-xs"
      style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.text }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{style.label}</span>
        {score && Number.isFinite(score.performed) && (
          <span className="opacity-70 whitespace-nowrap">
            проверок: {score.earned}/{score.performed}
          </span>
        )}
      </div>
      {precheck.summary_text && (
        <div className="mt-1 whitespace-pre-wrap">{precheck.summary_text}</div>
      )}
      <WarningsList items={precheck.critical_errors} tone="critical" />
      <WarningsList items={precheck.warnings} tone="warning" />
      <NewsSection newsContext={precheck.news_context} />
    </div>
  );
}

export default DealPrecheckPanel;
