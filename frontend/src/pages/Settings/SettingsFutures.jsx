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

// ЗАЧЕМ: Полный список фьючерсов и его загрузка из localStorage берутся из
// единого источника правды (frontend/src/utils/futuresSettings.js). loadFuturesSettings
// делает миграцию: для записей пользователя без новых полей (например, без
// marginPerContract в первой версии этой колонки) подмерживает значение из
// DEFAULT_FUTURES. Раньше эта страница читала localStorage напрямую и
// игнорировала миграцию — в браузерах со старыми записями колонка «Маржин
// на 1 контракт» показывала «не задан», хотя в коде значение уже было.
import { DEFAULT_FUTURES, loadFuturesSettings } from '../../utils/futuresSettings';

function SettingsFutures() {
  const [futures, setFutures] = useState(() => loadFuturesSettings());
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

  // Сохраняем в localStorage при изменении futures
  useEffect(() => {
    localStorage.setItem('futuresSettings', JSON.stringify(futures));
  }, [futures]);

  const handleEdit = (item) => {
    setEditingId(item.id);
    setEditData({ ...item });
  };

  const handleSave = () => {
    setFutures(futures.map(item => 
      item.id === editingId ? editData : item
    ));
    setEditingId(null);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditData({});
  };

  const handleDelete = (id) => {
    setFutures(futures.filter(item => item.id !== id));
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
    const newId = Math.max(...futures.map(f => f.id), 0) + 1;
    setFutures([...futures, {
      id: newId,
      ticker: '',
      name: '',
      pointValue: 0,
      marginPerContract: 0
    }]);
    setEditingId(newId);
    setEditData({
      id: newId,
      ticker: '',
      name: '',
      pointValue: 0,
      marginPerContract: 0
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Фьючерсы</h2>
        <p className="text-muted-foreground mt-1">Настройки и параметры фьючерсов</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Список фьючерсов</CardTitle>
            <CardDescription>
              Управляйте параметрами фьючерсов: редактируйте или удаляйте строки
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
                {[...futures].sort((a, b) => a.ticker.localeCompare(b.ticker)).map((item) => (
                  <TableRow key={item.id} className="hover:bg-muted/50">
                    {editingId === item.id ? (
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
                        <TableCell>{item.pointValue}</TableCell>
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
