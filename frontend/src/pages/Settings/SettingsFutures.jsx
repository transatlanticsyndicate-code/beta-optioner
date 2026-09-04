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

// ЗАЧЕМ: список фьючерсов — общий для всех пользователей, источник правды — сервер.
// Сохранение ПО-СТРОЧНОЕ: каждая правка/добавление/удаление трогает ровно одну
// строку (ключ — ticker). Раньше любая правка слала всю таблицу целиком и клиент
// со старым кэшем затирал чужие правки / воскрешал удалённые строки — теперь это
// исключено. localStorage остаётся только кэшем для синхронных getPointValue и
// обновляется ВНУТРИ per-row функций после подтверждённого ответа сервера.
import {
  loadFuturesSettings,
  syncFuturesSettingsFromServer,
  createFuture,
  updateFuture,
  deleteFuture,
} from '../../utils/futuresSettings';
// Эталонные множители контрактов: подсвечиваем расхождение (типовая ошибка —
// вместо цены пункта вводят стоимость тика, и все расчёты уезжают в разы).
import { checkPointValue } from '../../utils/futuresPointValueReference';

function SettingsFutures() {
  const [futures, setFutures] = useState(() => loadFuturesSettings());
  const [editingKey, setEditingKey] = useState(null); // _tmpKey (новая) или ticker (существующая)
  const [editData, setEditData] = useState({});
  const [serverStatus, setServerStatus] = useState('idle'); // idle|syncing|saved|error|conflict
  const [statusMsg, setStatusMsg] = useState('');
  const tmpCounter = useRef(0);

  // Стабильный ключ строки: для новой (несохранённой) — _tmpKey, для серверной — ticker.
  const rowKey = (item) => item._tmpKey || item.ticker;

  // На входе на страницу — синхронизируемся с сервером, чтобы увидеть свежие
  // значения от других пользователей.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setServerStatus('syncing');
      const fresh = await syncFuturesSettingsFromServer();
      if (cancelled) return;
      if (fresh) {
        setFutures(fresh);
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
    // _originalTicker нужен как путь для PUT (поддержка переименования);
    // updatedAt — токен версии для оптимистичной блокировки.
    setEditData({ ...item, _originalTicker: item.ticker });
  };

  const handleCancel = () => {
    // Отмена новой (несохранённой) строки — убрать черновик из таблицы.
    if (editData._isNew) {
      setFutures((prev) => prev.filter((f) => rowKey(f) !== editingKey));
    }
    setEditingKey(null);
    setEditData({});
    if (serverStatus === 'error' || serverStatus === 'conflict') {
      setServerStatus('idle');
      setStatusMsg('');
    }
  };

  const handleInputChange = (field, value) => {
    setEditData(prev => ({
      ...prev,
      [field]: (field === 'pointValue' || field === 'marginPerContract')
        ? (value === '' ? '' : parseFloat(value) || 0)
        : value
    }));
  };

  const handleAddFuture = () => {
    const tmpKey = `tmp-${++tmpCounter.current}`;
    const draft = {
      _tmpKey: tmpKey,
      _isNew: true,
      ticker: '',
      name: '',
      pointValue: 0,
      marginPerContract: 0,
    };
    setFutures((prev) => [...prev, draft]);
    setEditingKey(tmpKey);
    setEditData(draft);
  };

  const handleSave = async () => {
    const ticker = (editData.ticker || '').trim().toUpperCase();
    // Клиентская валидация — понятная ошибка вместо 422 с сервера, ввод сохраняется.
    if (!ticker) {
      setServerStatus('error'); setStatusMsg('Укажите тикер'); return;
    }
    if (!(Number(editData.pointValue) > 0)) {
      setServerStatus('error'); setStatusMsg('Цена пункта должна быть больше 0'); return;
    }
    const dup = futures.some(
      (f) => rowKey(f) !== editingKey && (f.ticker || '').toUpperCase() === ticker
    );
    if (dup) {
      setServerStatus('error'); setStatusMsg(`Тикер ${ticker} уже есть в списке`); return;
    }

    setServerStatus('syncing'); setStatusMsg('');
    const res = editData._isNew
      ? await createFuture(editData)
      : await updateFuture(editData._originalTicker, editData);

    if (res.ok) {
      setFutures(res.list);
      setEditingKey(null);
      setEditData({});
      setServerStatus('saved');
      setStatusMsg('');
      return;
    }

    // Ошибка — ВВОД НЕ ТЕРЯЕМ: строка остаётся в режиме правки с editData.
    if (res.kind === 'conflict') {
      // Обновим остальную таблицу до актуального состояния (если сервер прислал),
      // но строку оставим в правке. Для устаревшего токена — подставим свежий,
      // чтобы повторное сохранение могло перезаписать осознанно.
      if (res.list && !editData._isNew) {
        setFutures(res.list);
        const freshRow = res.list.find(
          (f) => (f.ticker || '').toUpperCase() === (editData._originalTicker || '').toUpperCase()
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
    const res = await deleteFuture(ticker);
    if (res.ok) {
      setFutures(res.list);
      setServerStatus('saved');
      setStatusMsg('');
    } else if (res.kind === 'offline') {
      setServerStatus('error');
      setStatusMsg('Сервер недоступен — удаление не выполнено, повторите попытку');
    } else {
      if (res.list) setFutures(res.list);
      setServerStatus('error');
      setStatusMsg(res.message || 'Не удалось удалить');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Фьючерсы</h2>
        <p className="text-muted-foreground mt-1">Настройки и параметры фьючерсов</p>
        {/* Пояснение к «цене пункта»: её легко перепутать со стоимостью тика,
            а расчёт опционов тогда уезжает в сотни и тысячи раз. */}
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>Цена пункта</b> — сколько долларов приносит движение цены на <b>1.00</b> (полный пункт),
          а не стоимость тика. Пример: природный газ NG торгуется по $3,63 за MMBtu, в контракте
          10 000 MMBtu → цена пункта <b>10 000</b> (шаг цены 0,001 стоит $10 — это стоимость тика,
          её сюда вводить нельзя). По этому числу считаются премия опциона, P&amp;L и подбор
          количества контрактов.
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Список фьючерсов</CardTitle>
            <CardDescription>
              Общая таблица для всех пользователей. Каждая правка сохраняется на сервере по отдельности.
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
            onClick={handleAddFuture}
            className="bg-cyan-500 hover:bg-cyan-600 text-white"
          >
            + ФЬЮЧЕРС
          </Button>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-24">Тикет</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead className="w-32">Цена пункта</TableHead>
                  <TableHead className="w-40">Маржин на 1 контракт</TableHead>
                  <TableHead className="w-24 text-center">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...futures].sort((a, b) => (a.ticker || '').localeCompare(b.ticker || '')).map((item) => (
                  <TableRow key={rowKey(item)} className="hover:bg-muted/50">
                    {editingKey === rowKey(item) ? (
                      <>
                        <TableCell>
                          <Input
                            value={editData.ticker}
                            onChange={(e) => handleInputChange('ticker', e.target.value)}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editData.name}
                            onChange={(e) => handleInputChange('name', e.target.value)}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={editData.pointValue}
                            onChange={(e) => handleInputChange('pointValue', e.target.value)}
                            className="h-8"
                          />
                          {/* Подсказка прямо при вводе — чтобы ошибку было видно
                              до сохранения, а не после расчёта сделки. */}
                          {(() => {
                            const check = checkPointValue(editData.ticker, editData.pointValue);
                            if (!check) return null;
                            return (
                              <div className="mt-1 text-xs text-amber-600">
                                {check.looksLikeTickValue
                                  ? `⚠ похоже на стоимость тика — по спецификации биржи ${check.reference}`
                                  : `⚠ по спецификации биржи ${check.reference}`}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={editData.marginPerContract ?? ''}
                            onChange={(e) => handleInputChange('marginPerContract', e.target.value)}
                            placeholder="0"
                            className="h-8"
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
                        <TableCell>
                          {item.pointValue}
                          {/* Расхождение с биржевой спецификацией — чаще всего сюда
                              по ошибке вписана стоимость тика. Не блокируем, но показываем. */}
                          {(() => {
                            const check = checkPointValue(item.ticker, item.pointValue);
                            if (!check) return null;
                            return (
                              <span
                                className="ml-2 text-amber-600 cursor-help"
                                title={check.looksLikeTickValue
                                  ? `Похоже на стоимость тика. По спецификации биржи цена пункта ${check.reference}`
                                  : `По спецификации биржи цена пункта ${check.reference}`}
                              >
                                ⚠
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          {item.marginPerContract != null && item.marginPerContract > 0
                            ? `$ ${Math.round(item.marginPerContract).toLocaleString('ru-RU').replace(/,/g, ' ')}`
                            : <span className="text-muted-foreground italic">не задан</span>}
                        </TableCell>
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

          {futures.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                Нет добавленных фьючерсов
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default SettingsFutures;
