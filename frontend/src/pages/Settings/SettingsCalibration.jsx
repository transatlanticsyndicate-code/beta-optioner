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
  TrendingDown, TrendingUp, Database, Terminal
} from 'lucide-react';
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

/** Строка тикера в таблице */
function TickerRow({ item, onRecalibrate, onDelete, isRunning }) {
  return (
    <tr className="border-b border-border hover:bg-muted/30 transition-colors">
      {/* Тикер */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold">{item.ticker}</span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-600">
            <FlaskConical className="h-3 w-3" />
            Калибровано
          </span>
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
            className="h-7 text-xs"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Обновить
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(item.ticker)}
            disabled={isRunning}
            className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
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
              className="text-muted-foreground hover:text-foreground"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {(isDone || isError) && (
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">
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
                <div key={r.ticker} className="flex items-center gap-2 text-xs">
                  {r.status === 'success' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                  )}
                  <span className="font-mono font-semibold">{r.ticker}</span>
                  {r.status === 'success' ? (
                    <span className="text-muted-foreground">
                      down×{r.down_mult?.toFixed(3)} / up×{r.up_mult?.toFixed(3)} — {r.total_trades?.toLocaleString()} сделок
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

  // Поле ввода новых тикеров
  const [tickerInput, setTickerInput] = useState('');
  const [months, setMonths] = useState(6);
  const [holdDays, setHoldDays] = useState(14);

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
      }
    } catch (e) {
      console.error('[SettingsCalibration] Ошибка загрузки статуса:', e);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

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
        }
      } catch (e) {
        console.error('[SettingsCalibration] Ошибка polling:', e);
      }
    }, POLL_INTERVAL);
  }, [loadStatus]);

  // Очищаем polling при размонтировании
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ============================================================================
  // ЗАПУСК КАЛИБРОВКИ
  // ============================================================================

  const runCalibration = useCallback(async (tickers) => {
    if (!tickers || tickers.length === 0) return;

    try {
      const res = await fetch(`${API_BASE}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers, months, hold_days: holdDays })
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
  }, [months, holdDays, startPolling]);

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
                jarExists={true}
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
              className="font-mono"
            />
            <Button
              onClick={handleRunNew}
              disabled={isRunning || !tickerInput.trim()}
              className="shrink-0"
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
          <div className="flex items-center gap-6 text-sm pb-4">
            <label className="flex items-center gap-2 text-muted-foreground">
              Период данных:
              <select
                value={months}
                onChange={e => setMonths(Number(e.target.value))}
                disabled={isRunning}
                className="bg-muted border border-border rounded px-2 py-1 text-foreground text-sm"
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
                className="bg-muted border border-border rounded px-2 py-1 text-foreground text-sm"
              >
                <option value={7}>7 дней</option>
                <option value={14}>14 дней</option>
                <option value={21}>21 день</option>
                <option value={30}>30 дней</option>
              </select>
            </label>
          </div>
        </CardContent>
      </Card>

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
                  className="text-yellow-600 border-yellow-500/30 hover:bg-yellow-500/10"
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
        <CardContent className="py-4 px-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong>Как работает калибровка:</strong> скрипт загружает EOD цены опционов за выбранный период
            через ThetaData API, симулирует тысячи сделок с горизонтом удержания N дней,
            сравнивает прогноз Black-Scholes с реальными ценами и вычисляет коэффициенты
            <strong> down_mult</strong> (для убыточных сделок) и <strong>up_mult</strong> (для прибыльных).
            Эти коэффициенты автоматически применяются в калькуляторе при выборе тикера.
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
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>
                Отмена
              </Button>
              <Button
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
