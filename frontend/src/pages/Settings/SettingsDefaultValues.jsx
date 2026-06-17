import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  loadStrategyDefaults,
  syncStrategyDefaultsFromServer,
  pushStrategyDefaultsToServer,
} from '../../utils/strategyDefaults';

// Пять полей экрана подбора «Север GPT». Те же подписи, что и на экране
// стратегии. Поле даты задаётся числом дней (на экране дата считается как
// «сегодня + N дней»).
const FIELDS = [
  { key: 'plTolerance', label: 'Допустимый диапазон P&L по низу ± ($)' },
  { key: 'margin', label: 'Маржин ($)' },
  { key: 'marginTolerance', label: 'Допуск ± ($)' },
  { key: 'minStockMarginPct', label: 'Мин. доля акции (%)' },
  { key: 'calcDays', label: 'Дата расчёта (дней)' },
];

function SettingsDefaultValues() {
  const [defaults, setDefaults] = useState(() => loadStrategyDefaults());
  const [serverStatus, setServerStatus] = useState('idle'); // idle|syncing|saved|error|conflict
  const [statusMsg, setStatusMsg] = useState('');
  // Токен версии документа (updated_at) — нужен для оптимистичной блокировки:
  // отправляем его при сохранении, сервер вернёт 409, если кто-то сохранил раньше.
  const [updatedAt, setUpdatedAt] = useState(null);
  // Пользователь начал править? Тогда фоновая синхронизация не должна затирать ввод.
  const dirtyRef = useRef(false);

  // На входе подтягиваем свежие значения с сервера (могли поменять с другого устройства).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setServerStatus('syncing');
      const fresh = await syncStrategyDefaultsFromServer();
      if (cancelled) return;
      if (fresh) {
        // Не перетираем форму, если пользователь уже начал вводить значения.
        if (!dirtyRef.current && fresh.data) setDefaults(fresh.data);
        setUpdatedAt(fresh.updatedAt ?? null);
        setServerStatus(dirtyRef.current ? 'idle' : 'saved');
      } else {
        setServerStatus('error');
        setStatusMsg('Сервер недоступен — показаны последние известные значения');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Обновить одно поле одного блока (значение храним как введено — нормализуем при сохранении).
  const setField = (block, key, value) => {
    dirtyRef.current = true;
    setDefaults((prev) => ({
      ...prev,
      [block]: { ...prev[block], [key]: value },
    }));
    if (serverStatus !== 'idle') { setServerStatus('idle'); setStatusMsg(''); }
  };

  const handleSave = async () => {
    setServerStatus('syncing'); setStatusMsg('');
    const res = await pushStrategyDefaultsToServer(defaults, updatedAt);
    if (res.ok) {
      setDefaults(res.data);
      setUpdatedAt(res.updatedAt ?? null);
      dirtyRef.current = false;
      setServerStatus('saved');
      setStatusMsg('');
    } else if (res.kind === 'conflict') {
      // Чужое сохранение опередило. Ввод НЕ теряем, но обновляем токен — повторное
      // сохранение осознанно перезапишет. Свежие серверные значения не подставляем
      // в форму, чтобы не стереть набранное; пользователь решает, что оставить.
      setUpdatedAt(res.updatedAt ?? null);
      setServerStatus('conflict');
      setStatusMsg('Значения изменены другим пользователем — повторное сохранение перезапишет их вашими');
    } else if (res.kind === 'offline') {
      setServerStatus('error');
      setStatusMsg('Сервер недоступен — не сохранено, повторите попытку');
    } else {
      setServerStatus('error');
      setStatusMsg(res.message || 'Не удалось сохранить');
    }
  };

  const renderBlock = (block, title, description) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pb-6">
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`${block}-${key}`}>{label}</Label>
            <Input
              id={`${block}-${key}`}
              type="number"
              value={defaults[block]?.[key] ?? ''}
              onChange={(e) => setField(block, key, e.target.value)}
              className="h-9"
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Значения по умолчанию</h2>
        <p className="text-muted-foreground mt-1">
          Эти значения подставляются в поля при открытии экрана подбора стратегии
          «Север GPT» — отдельно для акций, крипты и фьючерсов. Дата расчёта задаётся
          числом дней: на экране она считается как «сегодня + N дней».
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {renderBlock('stocks', 'Север GPT — Акции', 'Значения по умолчанию для подбора «Север GPT» по акциям.')}
        {renderBlock('crypto', 'Север GPT — Крипта', 'Значения по умолчанию для подбора «Север GPT» по крипте.')}
        {renderBlock('futures', 'Север GPT — Фьючерсы', 'Значения по умолчанию для подбора «Север GPT» по фьючерсам.')}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={serverStatus === 'syncing'}>
          Сохранить
        </Button>
        {serverStatus === 'syncing' && (
          <span className="text-sm text-muted-foreground">Сохранение…</span>
        )}
        {serverStatus === 'saved' && (
          <span className="text-sm text-green-600">Сохранено</span>
        )}
        {serverStatus === 'conflict' && (
          <span className="text-sm text-amber-600">{statusMsg}</span>
        )}
        {serverStatus === 'error' && (
          <span className="text-sm text-red-600">{statusMsg}</span>
        )}
      </div>
    </div>
  );
}

export default SettingsDefaultValues;
