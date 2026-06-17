import React, { useState, useEffect } from 'react';
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

const STATUS_TEXT = {
  idle: '',
  syncing: 'Сохранение…',
  saved: 'Сохранено',
  error: 'Не сохранено — сервер недоступен',
};

function SettingsDefaultValues() {
  const [defaults, setDefaults] = useState(() => loadStrategyDefaults());
  const [serverStatus, setServerStatus] = useState('idle');

  // На входе подтягиваем свежие значения с сервера (могли поменять с другого устройства).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setServerStatus('syncing');
      const fresh = await syncStrategyDefaultsFromServer();
      if (cancelled) return;
      if (fresh) {
        setDefaults(fresh);
        setServerStatus('saved');
      } else {
        setServerStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Обновить одно поле одного блока (значение храним как введено — нормализуем при сохранении).
  const setField = (block, key, value) => {
    setDefaults((prev) => ({
      ...prev,
      [block]: { ...prev[block], [key]: value },
    }));
    if (serverStatus !== 'idle') setServerStatus('idle');
  };

  const handleSave = async () => {
    setServerStatus('syncing');
    const saved = await pushStrategyDefaultsToServer(defaults);
    if (saved) {
      setDefaults(saved);
      setServerStatus('saved');
    } else {
      setServerStatus('error');
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
        {serverStatus !== 'idle' && (
          <span
            className={`text-sm ${serverStatus === 'error' ? 'text-red-600' : 'text-muted-foreground'}`}
          >
            {STATUS_TEXT[serverStatus]}
          </span>
        )}
      </div>
    </div>
  );
}

export default SettingsDefaultValues;
