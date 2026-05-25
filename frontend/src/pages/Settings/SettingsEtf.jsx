import React, { useState, useEffect } from 'react';
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

// ЗАЧЕМ: Список ETF — общий источник правды для всех пользователей.
// По наличию тикера в этом списке калькулятор отличает ETF от обычной акции
// и применяет синий бейдж в шапке и в карточках сохранённых сделок.
// Математика P&L у ETF идентична акциям — отличается только UI-маркер.
import {
  loadEtfSettings,
  syncEtfSettingsFromServer,
  pushEtfSettingsToServer,
} from '../../utils/etfSettings';

function SettingsEtf() {
  const [etfs, setEtfs] = useState(() => loadEtfSettings());
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [serverStatus, setServerStatus] = useState('idle'); // 'idle' | 'syncing' | 'saved' | 'error'

  // На входе на страницу — синхронизируемся с сервером, чтобы увидеть свежие
  // значения от других пользователей. App.js делает это же при загрузке
  // приложения, но повторный вызов недорогой и страхует от долгого ожидания
  // между переходами.
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
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Любое изменение etfs → синхронизируем оба хранилища:
  //   1. localStorage — для синхронного isEtfTicker
  //   2. сервер — чтобы остальные пользователи увидели правку
  // Push на сервер делается ЯВНО в handleSave / handleDelete / handleAddEtf —
  // только при пользовательских действиях, не при первоначальной подгрузке.
  useEffect(() => {
    localStorage.setItem('etfSettings', JSON.stringify(etfs));
  }, [etfs]);

  // Хелпер: применить новый массив etfs и тут же запушить его на сервер.
  const applyAndPush = async (newEtfs) => {
    setEtfs(newEtfs);
    setServerStatus('syncing');
    const pushed = await pushEtfSettingsToServer(newEtfs);
    setServerStatus(pushed ? 'saved' : 'error');
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setEditData({ ...item });
  };

  const handleSave = () => {
    const newEtfs = etfs.map(item =>
      item.id === editingId ? editData : item
    );
    setEditingId(null);
    applyAndPush(newEtfs);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditData({});
  };

  const handleDelete = (id) => {
    const newEtfs = etfs.filter(item => item.id !== id);
    applyAndPush(newEtfs);
  };

  const handleInputChange = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddEtf = () => {
    const newId = Math.max(...etfs.map(f => f.id || 0), 0) + 1;
    setEtfs([...etfs, { id: newId, ticker: '', name: '' }]);
    setEditingId(newId);
    setEditData({ id: newId, ticker: '', name: '' });
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
              и на странице сохранённых сделок). Правки сохраняются на сервере.
              {serverStatus === 'syncing' && (
                <span className="ml-2 text-xs text-muted-foreground">⟳ синхронизация…</span>
              )}
              {serverStatus === 'saved' && (
                <span className="ml-2 text-xs text-green-600">✓ сохранено</span>
              )}
              {serverStatus === 'error' && (
                <span className="ml-2 text-xs text-red-600">⚠ сервер недоступен — правка пока только локально</span>
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
                  <TableRow key={item.id} className="hover:bg-muted/50">
                    {editingId === item.id ? (
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
                              onClick={() => handleDelete(item.id)}
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
