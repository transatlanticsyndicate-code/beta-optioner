import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

// Отчёт об актуализации волатильности.
//
// ЗАЧЕМ отдельным компонентом: экран импорта должен оставаться про «приложить файл
// и нажать кнопку», а отчёт разрастается списками (что обновлено, что разошлось,
// чего нет в файле) — вместе они превратились бы в один нечитаемый файл.

const formatMoney = (value) => {
  if (value === null || value === undefined) return '—';
  const sign = value < 0 ? '−' : '';
  return `${sign}$${Math.abs(value).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatIv = (value) => (value === null || value === undefined ? '—' : `${value}%`);

function Metric({ label, value, accent }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${accent || ''}`}>{value}</div>
    </div>
  );
}

function Collapsible({ title, count, children }) {
  if (!count) return null;
  return (
    <details className="rounded-md border border-border px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium">
        {title} — {count}
      </summary>
      <div className="mt-2 space-y-1 text-sm text-muted-foreground">{children}</div>
    </details>
  );
}

function VolatilityUpdateReport({ report }) {
  if (!report) return null;

  const updatedDeals = (report.deals || []).filter((deal) => deal.updated.length > 0);
  const mismatches = (report.deals || []).flatMap((deal) =>
    deal.qtyMismatches.map((item) => ({ ...item, dealName: deal.dealName }))
  );
  const notInFile = (report.deals || []).flatMap((deal) =>
    deal.notInFile.map((item) => ({ ...item, dealName: deal.dealName }))
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Отчёт об актуализации</CardTitle>
      </CardHeader>
      {/* pb-6 — см. пояснение в SettingsVolatilityUpdate.jsx: у CardContent нет нижнего отступа */}
      <CardContent className="space-y-4 pb-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Позиций в файле" value={report.positionsParsed} />
          <Metric label="Активных сделок проверено" value={report.dealsScanned} />
          <Metric label="Сделок обновлено" value={report.dealsUpdated} accent="text-green-600" />
          <Metric label="Ног обновлено" value={report.legsUpdated} accent="text-green-600" />
        </div>

        <p className="text-sm text-muted-foreground">
          Файл: <span className="text-foreground">{report.fileName}</span>. Значения помечены датой{' '}
          <span className="text-foreground">{report.anchorDate}</span>
          {report.anchorDateSource === 'today'
            ? ' — даты в имени файла не нашлось, поэтому взята сегодняшняя.'
            : ' (из имени файла).'}
        </p>

        <div className="space-y-2">
          <Collapsible title="Что обновлено" count={updatedDeals.length}>
            {updatedDeals.map((deal) => (
              <div key={deal.dealId} className="py-1">
                <div className="text-foreground font-medium">
                  {deal.dealName} <span className="text-muted-foreground">[{deal.ticker}]</span>
                </div>
                {deal.updated.map((item) => (
                  <div key={item.symbol} className="pl-3">
                    {item.leg}: P&L {formatMoney(item.previousPL)} → <span className="text-foreground">{formatMoney(item.newPL)}</span>
                    {', '}IV {formatIv(item.previousIv)} → <span className="text-foreground">{formatIv(item.newIv)}</span>
                  </div>
                ))}
              </div>
            ))}
          </Collapsible>

          <Collapsible title="Не обновлено: количество в сделке не совпало с файлом" count={mismatches.length}>
            {mismatches.map((item, index) => (
              <div key={`${item.dealName}-${item.symbol}-${index}`}>
                {item.dealName}: {item.leg} — в сделке {item.quantityInDeal}, в файле {item.quantityInFile}
              </div>
            ))}
          </Collapsible>

          <Collapsible title="Ноги сделок, которых нет в файле" count={notInFile.length}>
            {notInFile.map((item, index) => (
              <div key={`${item.dealName}-${item.leg}-${index}`}>
                {item.dealName}: {item.leg}
              </div>
            ))}
          </Collapsible>

          <Collapsible title="Позиции из файла, которым не нашлось сделки" count={(report.symbolsWithoutDeal || []).length}>
            <div className="break-words">{(report.symbolsWithoutDeal || []).join(', ')}</div>
          </Collapsible>

          <Collapsible title="Строки файла, которые не удалось прочитать" count={(report.unparsedRows || []).length}>
            {(report.unparsedRows || []).map((row, index) => (
              <div key={`${row.symbol}-${index}`}>
                {row.symbol} — {row.reason}
              </div>
            ))}
          </Collapsible>
        </div>
      </CardContent>
    </Card>
  );
}

export default VolatilityUpdateReport;
