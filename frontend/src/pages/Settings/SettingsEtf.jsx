import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Edit2, Check, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';

// ЗАЧЕМ: список ETF — общий источник правды для всех пользователей, хранится на
// сервере. Сохранение ПО-СТРОЧНОЕ (ключ — ticker): каждая правка трогает одну
// строку, поэтому клиент со старым кэшем не затирает чужие правки и не воскрешает
// удалённые строки. localStorage — только кэш для синхронного isEtfTicker,
// обновляется внутри per-row функций после подтверждённого ответа сервера.
import {
  loadEtfSettings,
  syncEtfSettingsFromServer,
  createEtf,
  updateEtf,
  deleteEtf,
} from '../../utils/etfSettings';

function SettingsEtf() {
  const [etfs, setEtfs] = useState(() => loadEtfSettings());
  const [editingKey, setEditingKey] = useState(null);
  const [editData, setEditData] = useState({});
  const [serverStatus, setServerStatus] = useState('idle'); // idle|syncing|saved|error|conflict
  const [statusMsg, setStatusMsg] = useState('');
  const tmpCounter = useRef(0);

  const rowKey = (item) => item._tmpKey || item.ticker;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setServerStatus('syncing');
      const fresh = await syncEtfSettingsFromServer();
      if (cancelled) return;
      if (fresh) {
        setEtfs(fresh);
        setServerStatus('saved');
      } else {
        setServerStatus('error');
        setStatusMsg('сервер недоступен — показаны последние известные значения');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleEdit = (item) => {
    setEditingKey(rowKey(item));
    setEditData({ ...item, _originalTicker: item.ticker });
  };

  const handleCancel = () => {
    if (editData._isNew) {
      setEtfs((prev) => prev.filter((e) => rowKey(e) !== editingKey));
    }
    setEditingKey(null);
    setEditData({});
    if (serverStatus === 'error' || serverStatus === 'conflict') {
      setServerStatus('idle');
      setStatusMsg('');
    }
  };

  const handleInputChange = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddEtf = () => {
    const tmpKey = `tmp-${++tmpCounter.current}`;
    const draft = { _tmpKey: tmpKey, _isNew: true, ticker: '', name: '' };
    setEtfs((prev) => [...prev, draft]);
    setEditingKey(tmpKey);
    setEditData(draft);
  };

  const handleSave = async () => {
    const ticker = (editData.ticker || '').trim().toUpperCase();
    if (!ticker) {
      setServerStatus('error'); setStatusMsg('Укажите тикер'); return;
    }
    if (!(editData.name || '').trim()) {
      setServerStatus('error'); setStatusMsg('Укажите название'); return;
    }
    const dup = etfs.some(
      (e) => rowKey(e) !== editingKey && (e.ticker || '').toUpperCase() === ticker
    );
    if (dup) {
      setServerStatus('error'); setStatusMsg(`Тикер ${ticker} уже есть в списке`); return;
    }

    setServerStatus('syncing'); setStatusMsg('');
    const res = editData._isNew
      ? await createEtf(editData)
      : await updateEtf(editData._originalTicker, editData);

    if (res.ok) {
      setEtfs(res.list);
      setEditingKey(null);
      setEditData({});
      setServerStatus('saved');
      setStatusMsg('');
      return;
    }

    if (res.kind === 'conflict') {
      if (res.list && !editData._isNew) {
        setEtfs(res.list);
        const freshRow = res.list.find(
          (e) => (e.ticker || '').toUpperCase() === (editData._originalTicker || '').toUpperCase()
        );
        if (freshRow) {
          setEditData((prev) => ({ ...prev, updatedAt: freshRow.updatedAt }));
        }
      }
      setServerStatus('conflict');
      setStatusMsg(res.message || 'Запись изменена другим пользователем — проверьте и сохраните снова');
    } else if (res.kind === 'offline') {
      setServerStatus('error');
      setStatusMsg('Сервер недоступен — изменения не сохранены, повторите попытку');
    } else {
      setServerStatus('error');
      setStatusMsg(res.message || 'Не удалось сохранить');
    }
  };

  const handleDelete = async (ticker) => {
    setServerStatus('syncing'); setStatusMsg('');
    const res = await deleteEtf(ticker);
    if (res.ok) {
      setEtfs(res.list);
      setServerStatus('saved');
      setStatusMsg('');
    } else if (res.kind === 'offline') {
      setServerStatus('error');
      setStatusMsg('Сервер недоступен — удаление не выполнено, повторите попытку');
    } else {
      if (res.list) setEtfs(res.list);
      setServerStatus('error');
      setStatusMsg(res.message || 'Не удалось удалить');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">ETF</h2>
        <p className="text-muted-foreground mt-1">Список ETF для калькулятора</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Список ETF</CardTitle>
            <CardDescription>
              Общая таблица для всех пользователей. Тикеры из этого списка
              автоматически определяются как ETF (синий бейдж в калькуляторе
              и на странице сохранённых сделок). Каждая правка сохраняется на сервере по отдельности.
              {serverStatus === 'syncing' && (
                <span className="ml-2 text-xs text-muted-foreground">⟳ синхронизация…</span>
              )}
              {serverStatus === 'saved' && (
                <span className="ml-2 text-xs text-green-600">✓ сохранено</span>
              )}
              {serverStatus === 'conflict' && (
                <span className="ml-2 text-xs text-amber-600">⚠ {statusMsg}</span>
              )}
              {serverStatus === 'error' && (
                <span className="ml-2 text-xs text-red-600">⚠ {statusMsg}</span>
              )}
            </CardDescription>
          </div>
          <Button
            onClick={handleAddEtf}
            className="bg-blue-500 hover:bg-blue-600 text-white"
          >
            + ETF
          </Button>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-24">Тикер</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead className="w-24 text-center">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...etfs].sort((a, b) => (a.ticker || '').localeCompare(b.ticker || '')).map((item) => (
                  <TableRow key={rowKey(item)} className="hover:bg-muted/50">
                    {editingKey === rowKey(item) ? (
                      <>
                        <TableCell>
                          <Input
                            value={editData.ticker || ''}
                            onChange={(e) => handleInputChange('ticker', e.target.value.toUpperCase())}
                            className="h-8"
                            placeholder="SPY"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editData.name || ''}
                            onChange={(e) => handleInputChange('name', e.target.value)}
                            className="h-8"
                            placeholder="Название фонда"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex gap-2 justify-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleSave}
                              disabled={serverStatus === 'syncing'}
                              className="h-8 w-8 p-0"
                              title="Сохранить"
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleCancel}
                              className="h-8 w-8 p-0"
                              title="Отмена"
                            >
                              <X className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="font-medium">{item.ticker}</TableCell>
                        <TableCell>{item.name}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex gap-2 justify-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(item)}
                              className="h-8 w-8 p-0"
                              title="Редактировать"
                            >
                              <Edit2 className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(item.ticker)}
                              className="h-8 w-8 p-0"
                              title="Удалить"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {etfs.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                Нет добавленных ETF
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default SettingsEtf;
