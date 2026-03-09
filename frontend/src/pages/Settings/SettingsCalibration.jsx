/**
 * SettingsCalibration — Страница управления калибровкой коэффициентов P&L
 * ЗАЧЕМ: Позволяет запускать загрузку исторических данных опционов и бэктестинг
 *        для конкретных тикеров, отслеживать прогресс и управлять результатами
 * Затрагивает: /api/calibration/*, ticker_overrides.json, StockGroupSelector (бейдж)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FlaskConical, Play, Trash2, RefreshCw, Plus, CheckCircle2,
  AlertCircle, Clock, Wifi, WifiOff, ChevronDown, ChevronUp,
  TrendingDown, TrendingUp, Database, Terminal, Activity
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';

// ============================================================================
// КОНСТАНТЫ
// ============================================================================

const API_BASE = '/api/calibration';
// Интервал polling прогресса (мс)
const POLL_INTERVAL = 2000;

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ
// ============================================================================

/** Индикатор статуса Theta Terminal */
function TerminalStatus({ running, jarExists }) {
  if (!jarExists) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-red-500">
        <WifiOff className="h-3.5 w-3.5" />
        Theta Terminal не найден (~Downloads/ThetaTerminalv3.jar)
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${running ? 'text-emerald-500' : 'text-yellow-500'}`}>
      {running ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      Theta Terminal: {running ? 'подключён' : 'не запущен (запустится автоматически)'}
    </span>
  );
}

function CleanupCard({ cleanupConfig, cleanupPreview, onChange, onSave, onRun, isRunning }) {
  const summary = cleanupPreview?.summary || {};

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trash2 className="h-4 w-4" />
          Очистка старых данных
        </CardTitle>
        <CardDescription>
          Единая policy для локальной и серверной очистки устаревших данных калибровки и опционов
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={Boolean(cleanupConfig.enabled)}
              onChange={e => onChange('enabled', e.target.checked)}
              className="cursor-pointer"
            />
            Cleanup включён
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={Boolean(cleanupConfig.auto_cleanup_after_run)}
              onChange={e => onChange('auto_cleanup_after_run', e.target.checked)}
              className="cursor-pointer"
            />
            Автоочистка после калибровки
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={Boolean(cleanupConfig.delete_orphan_options)}
              onChange={e => onChange('delete_orphan_options', e.target.checked)}
              className="cursor-pointer"
            />
            Удалять orphan options_data
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={Boolean(cleanupConfig.delete_orphan_results)}
              onChange={e => onChange('delete_orphan_results', e.target.checked)}
              className="cursor-pointer"
            />
            Удалять orphan calibration_results
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm text-muted-foreground space-y-1">
            <div>options_max_age_days</div>
            <Input className="cursor-pointer" value={cleanupConfig.options_max_age_days ?? 45} onChange={e => onChange('options_max_age_days', Number(e.target.value) || 0)} />
          </label>
          <label className="text-sm text-muted-foreground space-y-1">
            <div>results_max_age_days</div>
            <Input className="cursor-pointer" value={cleanupConfig.results_max_age_days ?? 90} onChange={e => onChange('results_max_age_days', Number(e.target.value) || 0)} />
          </label>
          <label className="text-sm text-muted-foreground space-y-1">
            <div>history_max_entries</div>
            <Input className="cursor-pointer" value={cleanupConfig.history_max_entries ?? 200} onChange={e => onChange('history_max_entries', Number(e.target.value) || 0)} />
          </label>
        </div>

        <div className="rounded-lg border border-border p-3 bg-muted/20 space-y-2">
          <div className="text-sm font-medium">Кандидаты на удаление</div>
          <div className="text-xs text-muted-foreground">
            Папки options: {summary.options_dirs || 0} · Файлы результатов: {summary.result_files || 0}
          </div>
          {!!cleanupPreview?.options?.length && (
            <div className="text-xs text-muted-foreground space-y-1">
              {cleanupPreview.options.slice(0, 5).map(item => (
                <div key={item.path}>{item.ticker}: {item.reason} · {item.files_count} CSV</div>
              ))}
            </div>
          )}
          {!!cleanupPreview?.results?.length && (
            <div className="text-xs text-muted-foreground space-y-1">
              {cleanupPreview.results.slice(0, 5).map(item => (
                <div key={item.path}>{item.ticker}: {item.reason}</div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs text-muted-foreground">
            Cleanup работает одинаково для локального запуска и для серверного online scheduler.
          </div>
          <div className="flex items-center gap-2">
            <Button className="cursor-pointer" variant="outline" onClick={onSave} disabled={isRunning}>Сохранить policy</Button>
            <Button className="cursor-pointer text-white" variant="destructive" onClick={onRun} disabled={isRunning}>Запустить cleanup</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryStatusBadge({ status, successCount, skippedCount, errorCount }) {
  if (status === 'done') {
    return (
      <Badge variant="outline" className="text-xs bg-emerald-500/10 border-emerald-500/30 text-emerald-600">
        {successCount} ok / {skippedCount} skip / {errorCount} err
      </Badge>
    );
  }
  if (status === 'error') {
    return (
      <Badge variant="outline" className="text-xs bg-red-500/10 border-red-500/30 text-red-600">
        ошибка
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

function CalibrationHistoryCard({ historyItems, onRefresh }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              История операций калибровки
            </CardTitle>
            <CardDescription className="mt-1">
              Постоянный журнал ручных и автоматических запусков на сервере
            </CardDescription>
          </div>
          <Button className="cursor-pointer" size="sm" variant="ghost" onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!historyItems?.length ? (
          <div className="text-sm text-muted-foreground">История пока пуста</div>
        ) : historyItems.map(item => (
          <div key={item.job_id} className="rounded-lg border border-border p-3 space-y-2 bg-muted/20">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">
                    {item.source === 'scheduler' || item.source === 'manual_scheduler' ? 'Онлайн-калибровка' : 'Ручная калибровка'}
                  </span>
                  <Badge variant="outline" className="text-xs">{item.calibration_mode}</Badge>
                  <HistoryStatusBadge
                    status={item.status}
                    successCount={item.success_count || 0}
                    skippedCount={item.skipped_count || 0}
                    errorCount={item.error_count || 0}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {item.started_at ? new Date(item.started_at).toLocaleString('ru-RU') : '—'}
                  {item.finished_at ? ` → ${new Date(item.finished_at).toLocaleString('ru-RU')}` : ''}
                </div>
              </div>
              <div className="text-xs text-muted-foreground text-right">
                <div>{item.tickers?.length || 0} тикеров</div>
                <div>hold: {item.hold_days ?? '—'}д</div>
                {item.calibration_mode === 'recent' && <div>recent: {item.recent_days ?? '—'}д</div>}
              </div>
            </div>

            <div className="text-xs text-muted-foreground break-words">
              {(item.tickers || []).join(', ')}
            </div>

            {!!item.results?.length && (
              <div className="space-y-1">
                {item.results.slice(0, 6).map(result => (
                  <div key={`${item.job_id}_${result.ticker}`} className="text-xs flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold">{result.ticker}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {result.status}
                    </Badge>
                    {result.status === 'success' ? (
                      <span className="text-muted-foreground">
                        down×{result.down_mult?.toFixed?.(3)} / up×{result.up_mult?.toFixed?.(3)}
                      </span>
                    ) : (
                      <span className="text-red-500">{result.error}</span>
                    )}
                  </div>
                ))}
                {item.results.length > 6 && (
                  <div className="text-xs text-muted-foreground">+ ещё {item.results.length - 6} результатов</div>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Бейдж свежести калибровки */
function FreshnessBadge({ daysAgo, isStale }) {
  if (daysAgo === null || daysAgo === undefined) {
    return <Badge variant="outline" className="text-muted-foreground text-xs">—</Badge>;
  }
  if (isStale) {
    return (
      <Badge variant="outline" className="text-xs bg-yellow-500/10 border-yellow-500/30 text-yellow-600">
        <Clock className="h-3 w-3 mr-1" />
        {daysAgo}д назад
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs bg-emerald-500/10 border-emerald-500/30 text-emerald-600">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      {daysAgo === 0 ? 'сегодня' : `${daysAgo}д назад`}
    </Badge>
  );
}

/** Бейдж IV модели Ornstein-Uhlenbeck */
function IVModelBadge({ ivMean, ivKappa, halfLifeDays }) {
  if (ivMean == null || ivKappa == null) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-muted border border-border text-muted-foreground">
        <Activity className="h-3 w-3" />
        IV: нет данных
      </span>
    );
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-500/10 border border-blue-500/30 text-blue-500 cursor-help">
            <Activity className="h-3 w-3" />
            IV модель
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[240px]">
          <p className="font-medium mb-1">Ornstein-Uhlenbeck IV модель</p>
          <p className="text-xs text-muted-foreground mb-2">
            Калькулятор предсказывает изменение IV по формуле mean reversion,
            а не замораживает её на уровне входа
          </p>
          <div className="text-xs space-y-1">
            <p>• Среднее IV: <strong>{(ivMean * 100).toFixed(1)}%</strong></p>
            <p>• Скорость возврата: <strong>κ = {ivKappa.toFixed(1)}/год</strong></p>
            <p>• Half-life: <strong>{halfLifeDays} дн.</strong></p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Строка тикера в таблице */
function TickerRow({ item, onRecalibrate, onDelete, isRunning }) {
  return (
    <tr className="border-b border-border hover:bg-muted/30 transition-colors">
      {/* Тикер */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-semibold">{item.ticker}</span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-600">
            <FlaskConical className="h-3 w-3" />
            Калибровано
          </span>
          <IVModelBadge
            ivMean={item.iv_mean}
            ivKappa={item.iv_kappa}
            halfLifeDays={item.half_life_days}
          />
        </div>
      </td>

      {/* Коэффициенты */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1 text-red-500">
            <TrendingDown className="h-3.5 w-3.5" />
            ×{item.down_mult?.toFixed(3)}
          </span>
          <span className="flex items-center gap-1 text-emerald-500">
            <TrendingUp className="h-3.5 w-3.5" />
            ×{item.up_mult?.toFixed(3)}
          </span>
        </div>
      </td>

      {/* Сделок / контрактов */}
      <td className="py-3 px-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Database className="h-3.5 w-3.5" />
          {item.total_trades?.toLocaleString()} сделок
        </div>
        <div className="text-xs text-muted-foreground/60">{item.contracts_count} контрактов</div>
      </td>

      {/* Дата */}
      <td className="py-3 px-4">
        <FreshnessBadge daysAgo={item.days_ago} isStale={item.is_stale} />
        {item.calibrated_at && (
          <div className="text-xs text-muted-foreground mt-1">
            {new Date(item.calibrated_at).toLocaleDateString('ru-RU')}
          </div>
        )}
      </td>

      {/* Действия */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRecalibrate(item.ticker)}
            disabled={isRunning}
            className="h-7 text-xs cursor-pointer"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Обновить
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(item.ticker)}
            disabled={isRunning}
            className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 cursor-pointer"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

/** Блок прогресса активного задания */
function JobProgress({ job, onClose }) {
  const [expanded, setExpanded] = useState(true);
  const logRef = useRef(null);

  // Автоскролл лога вниз
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [job?.log]);

  if (!job) return null;

  const isDone = job.status === 'done';
  const isError = job.status === 'error';
  const successCount = job.results?.filter(r => r.status === 'success').length || 0;
  const totalCount = job.tickers?.length || 0;

  return (
    <Card className={`border ${isDone ? 'border-emerald-500/30' : isError ? 'border-red-500/30' : 'border-blue-500/30'}`}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isDone ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : isError ? (
              <AlertCircle className="h-4 w-4 text-red-500" />
            ) : (
              <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
            )}
            <span className="font-medium text-sm">
              {isDone
                ? `Калибровка завершена (${successCount}/${totalCount} успешно)`
                : isError
                ? `Ошибка: ${job.error}`
                : `Калибровка: ${job.current_step}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {(isDone || isError) && (
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs cursor-pointer">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Прогресс-бар */}
        {!isDone && !isError && (
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${job.progress || 0}%` }}
            />
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="px-4 pb-4">
          {/* Лог */}
          <div
            ref={logRef}
            className="bg-muted/50 rounded-md p-3 h-48 overflow-y-auto font-mono text-xs space-y-0.5"
          >
            {job.log?.length > 0 ? (
              job.log.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.includes('❌') ? 'text-red-500' :
                    line.includes('✅') ? 'text-emerald-500' :
                    line.includes('⚠️') ? 'text-yellow-500' :
                    line.includes('---') ? 'text-blue-400 font-semibold mt-1' :
                    'text-muted-foreground'
                  }
                >
                  {line}
                </div>
              ))
            ) : (
              <div className="text-muted-foreground">Ожидание запуска...</div>
            )}
          </div>

          {/* Результаты после завершения */}
          {isDone && job.results?.length > 0 && (
            <div className="mt-3 space-y-1">
              {job.results.map(r => (
                <div key={r.ticker} className="flex items-center gap-2 text-xs flex-wrap">
                  {r.status === 'success' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                  )}
                  <span className="font-mono font-semibold">{r.ticker}</span>
                  {r.status === 'success' ? (
                    <span className="text-muted-foreground">
                      down×{r.down_mult?.toFixed(3)} / up×{r.up_mult?.toFixed(3)} — {r.total_trades?.toLocaleString()} сделок
                      {r.iv_mean != null && (
                        <span className="ml-2 text-blue-400">
                          · IV̄ {(r.iv_mean * 100).toFixed(1)}% · HL {r.half_life_days}д
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-red-500">{r.error}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ============================================================================
// ГЛАВНЫЙ КОМПОНЕНТ
// ============================================================================

function SettingsCalibration() {
  // Данные о тикерах и статус терминала
  const [statusData, setStatusData] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [historyItems, setHistoryItems] = useState([]);

  // Поле ввода новых тикеров
  const [tickerInput, setTickerInput] = useState('');
  const [months, setMonths] = useState(6);
  const [holdDays, setHoldDays] = useState(14);
  const [calibrationMode, setCalibrationMode] = useState('standard');
  const [recentDays, setRecentDays] = useState(14);
  const [onlineEnabled, setOnlineEnabled] = useState(false);
  const [watchlistInput, setWatchlistInput] = useState('');
  const [thetaJarPath, setThetaJarPath] = useState('');
  const [thetaCredsFile, setThetaCredsFile] = useState('');
  const [cleanupConfig, setCleanupConfig] = useState({
    enabled: true,
    auto_cleanup_after_run: true,
    options_max_age_days: 45,
    results_max_age_days: 90,
    history_max_entries: 200,
    delete_orphan_options: true,
    delete_orphan_results: false,
  });
  const [scheduleConfig, setScheduleConfig] = useState({
    standard: { enabled: true, months: 6, hold_days: 14, cron: ['0 16 1 1-3,11-12 *', '0 15 1 4-10 *'] },
    recent: { enabled: true, recent_days: 14, hold_days: 7, cron: ['0 16 * 1-3,11-12 *', '0 15 * 4-10 *'] },
    weighted: { enabled: true, months: 6, hold_days: 14, cron: ['0 16 * 1-3,11-12 0', '0 15 * 4-10 0'] },
  });

  // Активное задание
  const [activeJob, setActiveJob] = useState(null);
  const [activeJobId, setActiveJobId] = useState(null);
  const pollRef = useRef(null);

  // Диалог подтверждения удаления
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // ============================================================================
  // ЗАГРУЗКА СТАТУСА
  // ============================================================================

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      if (res.ok) {
        const data = await res.json();
        setStatusData(data);
        const watchlist = data.watchlist || {};
        setOnlineEnabled(Boolean(watchlist.enabled));
        setWatchlistInput((watchlist.tickers || []).join(', '));
        setThetaJarPath(watchlist.theta?.jar_path || '');
        setThetaCredsFile(watchlist.theta?.creds_file || '');
        if (watchlist.cleanup) {
          setCleanupConfig(prev => ({ ...prev, ...watchlist.cleanup }));
        }
        if (watchlist.modes) {
          setScheduleConfig(prev => ({ ...prev, ...watchlist.modes }));
        }
      }
    } catch (e) {
      console.error('[SettingsCalibration] Ошибка загрузки статуса:', e);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/history?limit=20`);
      if (res.ok) {
        const data = await res.json();
        setHistoryItems(data.items || []);
      }
    } catch (e) {
      console.error('[SettingsCalibration] Ошибка загрузки истории:', e);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadHistory();
  }, [loadStatus, loadHistory]);

  // ============================================================================
  // POLLING ПРОГРЕССА ЗАДАНИЯ
  // ============================================================================

  const startPolling = useCallback((jobId) => {
    // Останавливаем предыдущий polling
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/progress/${jobId}`);
        if (!res.ok) return;
        const job = await res.json();
        setActiveJob(job);

        // Останавливаем polling когда задание завершено
        if (job.status === 'done' || job.status === 'error') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          // Обновляем таблицу тикеров
          loadStatus();
          loadHistory();
        }
      } catch (e) {
        console.error('[SettingsCalibration] Ошибка polling:', e);
      }
    }, POLL_INTERVAL);
  }, [loadStatus, loadHistory]);

  // Очищаем polling при размонтировании
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const saveOnlineSettings = useCallback(async () => {
    const tickers = watchlistInput
      .split(/[\s,]+/)
      .map(t => t.trim().toUpperCase())
      .filter(Boolean);

    try {
      const res = await fetch(`${API_BASE}/watchlist`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: onlineEnabled,
          tickers,
          theta: {
            jar_path: thetaJarPath,
            creds_file: thetaCredsFile,
          },
          cleanup: cleanupConfig,
          modes: scheduleConfig,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Ошибка сохранения online-настроек: ${err.detail || 'unknown error'}`);
        return;
      }
      loadStatus();
    } catch (e) {
      alert(`Ошибка сохранения: ${e.message}`);
    }
  }, [watchlistInput, onlineEnabled, thetaJarPath, thetaCredsFile, cleanupConfig, scheduleConfig, loadStatus]);

  const runCleanupNow = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/cleanup/run`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        alert(`Ошибка cleanup: ${err.detail || 'unknown error'}`);
        return;
      }
      loadStatus();
      loadHistory();
    } catch (e) {
      alert(`Ошибка cleanup: ${e.message}`);
    }
  }, [loadStatus, loadHistory]);

  const runScheduledModeNow = useCallback(async (mode) => {
    try {
      const res = await fetch(`${API_BASE}/run-scheduled/${mode}`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        alert(`Ошибка запуска режима ${mode}: ${err.detail || 'unknown error'}`);
        return;
      }
      const data = await res.json();
      setActiveJobId(data.job_id);
      setActiveJob({ job_id: data.job_id, status: 'pending', log: [], progress: 0, tickers: data.tickers, current_step: `Запуск ${mode}...` });
      startPolling(data.job_id);
    } catch (e) {
      alert(`Ошибка запуска: ${e.message}`);
    }
  }, [startPolling]);

  // ============================================================================
  // ЗАПУСК КАЛИБРОВКИ
  // ============================================================================

  const runCalibration = useCallback(async (tickers) => {
    if (!tickers || tickers.length === 0) return;

    try {
      const res = await fetch(`${API_BASE}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers, months, hold_days: holdDays, calibration_mode: calibrationMode, recent_days: recentDays })
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Ошибка запуска: ${err.detail}`);
        return;
      }

      const data = await res.json();
      setActiveJobId(data.job_id);
      setActiveJob({ job_id: data.job_id, status: 'pending', log: [], progress: 0, tickers, current_step: 'Запуск...' });
      startPolling(data.job_id);
      setTickerInput('');
    } catch (e) {
      alert(`Ошибка: ${e.message}`);
    }
  }, [months, holdDays, calibrationMode, recentDays, startPolling]);

  /** Запуск из поля ввода */
  const handleRunNew = () => {
    const tickers = tickerInput
      .split(/[,\s]+/)
      .map(t => t.trim().toUpperCase())
      .filter(t => t && /^[A-Z]{1,6}$/.test(t));

    if (tickers.length === 0) {
      alert('Введите корректные тикеры (например: NVDA, MSFT, SPOT)');
      return;
    }
    runCalibration(tickers);
  };

  /** Обновить все устаревшие */
  const handleUpdateStale = () => {
    const staleTickers = statusData?.tickers
      ?.filter(t => t.is_stale)
      ?.map(t => t.ticker) || [];
    if (staleTickers.length === 0) return;
    runCalibration(staleTickers);
  };

  // ============================================================================
  // УДАЛЕНИЕ
  // ============================================================================

  const handleDelete = async (ticker) => {
    try {
      const res = await fetch(`${API_BASE}/${ticker}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteConfirm(null);
        loadStatus();
      }
    } catch (e) {
      alert(`Ошибка удаления: ${e.message}`);
    }
  };

  // ============================================================================
  // РЕНДЕР
  // ============================================================================

  const isRunning = activeJob && (activeJob.status === 'running' || activeJob.status === 'pending');
  const staleTickers = statusData?.tickers?.filter(t => t.is_stale) || [];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Заголовок */}
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-emerald-500" />
          Калибровка коэффициентов P&L
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Загружает реальные исторические данные опционов через ThetaData и вычисляет
          точные коэффициенты корректировки P&L для каждой акции
        </p>
      </div>

      {/* Статус Theta Terminal */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            {statusData ? (
              <TerminalStatus
                running={statusData.terminal_running}
                jarExists={statusData.jar_exists !== false}
              />
            ) : (
              <span className="text-xs text-muted-foreground">Проверка...</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Активное задание */}
      {activeJob && (
        <JobProgress
          job={activeJob}
          onClose={() => { setActiveJob(null); setActiveJobId(null); }}
        />
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Онлайн-калибровка по расписанию
          </CardTitle>
          <CardDescription>
            Технические server-настройки online-калибровки: пути к Theta Terminal, cleanup и cron-расписание
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-6">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={onlineEnabled}
              onChange={e => setOnlineEnabled(e.target.checked)}
              className="rounded border-border cursor-pointer"
            />
            Включить онлайн-автокалибровку на сервере
          </label>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Список тикеров для online-калибровки</div>
            <Input
              className="font-mono cursor-pointer"
              value={watchlistInput}
              onChange={e => setWatchlistInput(e.target.value.toUpperCase())}
              placeholder="AAPL, NVDA, ZS, TEAM..."
            />
            <div className="text-xs text-muted-foreground">
              Эти тикеры сохраняются отдельно в server-файл `calibration_tickers.json`. Технические настройки scheduler хранятся отдельно.
            </div>
            <div className="text-xs text-yellow-700 rounded-lg border border-yellow-500/20 p-3 bg-yellow-500/10 dark:text-yellow-200">
              Онлайн-калибровка берёт тикеры из server-файла `backend/app/config/calibration_tickers.json`.
              Если вы укажете тикеры в поле выше и нажмёте `Сохранить server-настройки и тикеры`, страница сохранит этот список в тот же файл.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Путь к ThetaTerminal jar на сервере</div>
              <Input className="cursor-pointer" value={thetaJarPath} onChange={e => setThetaJarPath(e.target.value)} placeholder="/opt/theta/ThetaTerminalv3.jar" />
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Путь к creds.txt на сервере</div>
              <Input className="cursor-pointer" value={thetaCredsFile} onChange={e => setThetaCredsFile(e.target.value)} placeholder="/etc/optioner/creds.txt" />
            </div>
          </div>

          {['standard', 'recent', 'weighted'].map(mode => (
            <div key={mode} className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{mode}</Badge>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={Boolean(scheduleConfig[mode]?.enabled)}
                      onChange={e => setScheduleConfig(prev => ({
                        ...prev,
                        [mode]: { ...prev[mode], enabled: e.target.checked },
                      }))}
                      className="cursor-pointer"
                    />
                    включён
                  </label>
                </div>
                <Button className="cursor-pointer" size="sm" variant="outline" onClick={() => runScheduledModeNow(mode)} disabled={isRunning}>
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  Запустить сейчас
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {mode !== 'recent' && (
                  <label className="text-sm text-muted-foreground space-y-1">
                    <div>Месяцы</div>
                    <Input
                      className="cursor-pointer"
                      value={scheduleConfig[mode]?.months ?? 6}
                      onChange={e => setScheduleConfig(prev => ({
                        ...prev,
                        [mode]: { ...prev[mode], months: Number(e.target.value) || 0 },
                      }))}
                    />
                  </label>
                )}
                {mode === 'recent' && (
                  <label className="text-sm text-muted-foreground space-y-1">
                    <div>recent_days</div>
                    <Input
                      className="cursor-pointer"
                      value={scheduleConfig[mode]?.recent_days ?? 14}
                      onChange={e => setScheduleConfig(prev => ({
                        ...prev,
                        [mode]: { ...prev[mode], recent_days: Number(e.target.value) || 0 },
                      }))}
                    />
                  </label>
                )}
                <label className="text-sm text-muted-foreground space-y-1">
                  <div>hold_days</div>
                  <Input
                    className="cursor-pointer"
                    value={scheduleConfig[mode]?.hold_days ?? 14}
                    onChange={e => setScheduleConfig(prev => ({
                      ...prev,
                      [mode]: { ...prev[mode], hold_days: Number(e.target.value) || 0 },
                    }))}
                  />
                </label>
                <label className={`text-sm text-muted-foreground space-y-1 ${mode !== 'recent' ? 'md:col-span-3' : 'md:col-span-3'}`}>
                  <div>Cron</div>
                  <Input
                    value={Array.isArray(scheduleConfig[mode]?.cron) ? scheduleConfig[mode].cron.join(' | ') : (scheduleConfig[mode]?.cron ?? '')}
                    onChange={e => setScheduleConfig(prev => ({
                      ...prev,
                      [mode]: {
                        ...prev[mode],
                        cron: e.target.value
                          .split('|')
                          .map(item => item.trim())
                          .filter(Boolean),
                      },
                    }))}
                    placeholder="0 16 * 1-3,11-12 * | 0 15 * 4-10 *"
                    className="font-mono cursor-pointer"
                  />
                </label>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs text-muted-foreground">
              Следующие запуски: {(statusData?.scheduler?.jobs || []).map(j => `${j.id.replace('calibration_', '')}: ${j.next_run_at ? new Date(j.next_run_at).toLocaleString('ru-RU') : '—'}`).join(' · ') || 'не настроены'}
            </div>
            <Button className="cursor-pointer" onClick={saveOnlineSettings} disabled={isRunning}>Сохранить server-настройки и тикеры</Button>
          </div>
        </CardContent>
      </Card>

      <CleanupCard
        cleanupConfig={cleanupConfig}
        cleanupPreview={statusData?.cleanup_preview}
        onChange={(key, value) => setCleanupConfig(prev => ({ ...prev, [key]: value }))}
        onSave={saveOnlineSettings}
        onRun={runCleanupNow}
        isRunning={isRunning}
      />

      {/* Добавление тикеров */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Запустить калибровку
          </CardTitle>
          <CardDescription>
            Введите тикеры через запятую или пробел. Процесс: загрузка данных → бэктест → сохранение коэффициентов
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Поле ввода тикеров */}
          <div className="flex gap-2">
            <Input
              placeholder="NVDA, MSFT, SPOT, TSLA..."
              value={tickerInput}
              onChange={e => setTickerInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleRunNew()}
              disabled={isRunning}
              className="font-mono cursor-pointer"
            />
            <Button
              onClick={handleRunNew}
              disabled={isRunning || !tickerInput.trim()}
              className="shrink-0 cursor-pointer"
            >
              {isRunning ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Запустить
            </Button>
          </div>

          {/* Параметры */}
          <div className="flex flex-wrap items-center gap-6 text-sm pb-2">
            <label className="flex items-center gap-2 text-muted-foreground">
              Период данных:
              <select
                value={months}
                onChange={e => setMonths(Number(e.target.value))}
                disabled={isRunning}
                className="bg-muted border border-border rounded px-2 py-1 text-foreground text-sm cursor-pointer"
              >
                <option value={3}>3 месяца</option>
                <option value={6}>6 месяцев</option>
                <option value={12}>12 месяцев</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-muted-foreground">
              Горизонт удержания:
              <select
                value={holdDays}
                onChange={e => setHoldDays(Number(e.target.value))}
                disabled={isRunning}
                className="bg-muted border border-border rounded px-2 py-1 text-foreground text-sm cursor-pointer"
              >
                <option value={7}>7 дней</option>
                <option value={14}>14 дней</option>
                <option value={21}>21 день</option>
                <option value={30}>30 дней</option>
              </select>
            </label>
          </div>

          {/* Режим калибровки */}
          <div className="flex flex-wrap items-center gap-3 text-sm pb-2">
            <span className="text-muted-foreground">Режим:</span>
            {[
              { id: 'standard', label: 'Стабильный', desc: 'Все данные за период — стабильные коэффициенты' },
              { id: 'weighted', label: 'Взвешенный', desc: 'Свежие сделки важнее — эксп. веса по возрасту (half-life 30 дней)' },
              { id: 'recent',   label: 'Свежий', desc: `Только последние ${recentDays} дней — максимально актуально` },
            ].map(({ id, label, desc }) => (
              <TooltipProvider key={id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setCalibrationMode(id)}
                      disabled={isRunning}
                      className={[
                        'px-3 py-1 rounded-full border text-xs font-medium transition-all cursor-pointer',
                        calibrationMode === id
                          ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-600'
                          : 'bg-muted border-border text-muted-foreground hover:text-foreground',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                    {desc}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
            {/* Выбор количества дней для режима recent */}
            {calibrationMode === 'recent' && (
              <label className="flex items-center gap-2 text-muted-foreground ml-2">
                Период:
                <select
                  value={recentDays}
                  onChange={e => setRecentDays(Number(e.target.value))}
                  disabled={isRunning}
                  className="bg-muted border border-border rounded px-2 py-1 text-foreground text-sm cursor-pointer"
                >
                  <option value={14}>14 дней</option>
                  <option value={30}>30 дней</option>
                  <option value={60}>60 дней</option>
                  <option value={90}>90 дней</option>
                </select>
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      <CalibrationHistoryCard historyItems={historyItems} onRefresh={loadHistory} />

      {/* Таблица откалиброванных тикеров */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4" />
                Откалиброванные тикеры
                {statusData && (
                  <Badge variant="outline" className="ml-1 text-xs">
                    {statusData.total_calibrated}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                Коэффициенты применяются автоматически в калькуляторе. Рекомендуется обновлять раз в месяц.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {staleTickers.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleUpdateStale}
                  disabled={isRunning}
                  className="text-yellow-600 border-yellow-500/30 hover:bg-yellow-500/10 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Обновить устаревшие ({staleTickers.length})
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={loadStatus}
                disabled={loadingStatus}
                className="cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingStatus ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Загрузка...
            </div>
          ) : !statusData?.tickers?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <FlaskConical className="h-8 w-8 opacity-30" />
              <p className="text-sm">Нет откалиброванных тикеров</p>
              <p className="text-xs">Введите тикер выше и нажмите «Запустить»</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">Тикер</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">Коэффициенты</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">Данные</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">Дата</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {statusData.tickers.map(item => (
                    <TickerRow
                      key={item.ticker}
                      item={item}
                      onRecalibrate={(ticker) => runCalibration([ticker])}
                      onDelete={(ticker) => setDeleteConfirm(ticker)}
                      isRunning={isRunning}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Пояснение */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-4 px-4 space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong>Как работает калибровка:</strong> скрипт загружает EOD цены опционов за выбранный период
            через ThetaData API, симулирует тысячи сделок с горизонтом удержания N дней,
            сравнивает прогноз Black-Scholes с реальными ценами и вычисляет коэффициенты
            <strong> down_mult</strong> (для убыточных сделок) и <strong>up_mult</strong> (для прибыльных).
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="inline-flex items-center gap-1 text-blue-500 font-medium">
              <Activity className="h-3 w-3" />
              IV модель (Ornstein-Uhlenbeck):
            </span>{' '}
            дополнительно вычисляется <strong>iv_mean</strong> (историческое среднее IV) и <strong>iv_kappa</strong> (скорость возврата).
            Калькулятор использует эти параметры для прогноза изменения IV на период удержания —
            если IV выше среднего, модель предсказывает её падение, и наоборот.
            <strong> Half-life</strong> показывает за сколько дней IV возвращается к среднему вдвое.
          </p>
        </CardContent>
      </Card>

      {/* Диалог подтверждения удаления */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-80">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-red-500">
                <Trash2 className="h-4 w-4" />
                Удалить калибровку {deleteConfirm}?
              </CardTitle>
              <CardDescription>
                Будут удалены результаты калибровки и коэффициенты override.
                Данные опционов останутся на диске.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2 justify-end">
              <Button className="cursor-pointer" variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>
                Отмена
              </Button>
              <Button
                className="cursor-pointer"
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(deleteConfirm)}
              >
                Удалить
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default SettingsCalibration;
