import React, { useState, useEffect, useMemo } from 'react';
import { Archive, Trash2, Filter, Calendar, TrendingUp, BarChart3, Activity, Target, Bitcoin, Edit, Plus } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

function DealsArchive() {
  const [deals, setDeals] = useState([]);

  // Состояние фильтров
  const [filterDate, setFilterDate] = useState('');
  const [filterTicker, setFilterTicker] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Установка заголовка страницы
  useEffect(() => {
    document.title = 'Архив сделок | SYNDICATE Platform';
    return () => {
      document.title = 'SYNDICATE Platform';
    };
  }, []);

  // Загрузка сделок из localStorage (пока демо-данные)
  useEffect(() => {
    loadDeals();
  }, []);

  const loadDeals = () => {
    try {
      // Загружаем сохраненные сделки из localStorage
      const savedDeals = JSON.parse(localStorage.getItem('savedDeals') || '[]');
      setDeals(savedDeals);
      console.log('✅ Загружено сделок из localStorage:', savedDeals.length);
    } catch (error) {
      console.error('Ошибка загрузки сделок из localStorage:', error);
      // В случае ошибки показываем пустой массив
      setDeals([]);
    }
  };

  // Редактирование сделки
  const handleEdit = (deal) => {
    // Открываем в новой вкладке
    window.open(`/tools/new-deal?edit=${deal.id}`, '_blank');
  };

  // Удаление сделки
  const handleDelete = (id) => {
    if (window.confirm('Вы уверены, что хотите удалить эту сделку?')) {
      try {
        const updated = deals.filter(deal => deal.id !== id);
        setDeals(updated);
        // Сохраняем обновленный список в localStorage
        localStorage.setItem('savedDeals', JSON.stringify(updated));
        console.log('✅ Сделка удалена из localStorage');
      } catch (error) {
        console.error('Ошибка удаления сделки:', error);
        alert('Ошибка удаления сделки!');
      }
    }
  };

  // Форматирование даты
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Форматирование типа сделки
  const formatDealType = (type) => {
    const types = {
      stocks: { label: 'Акции', icon: TrendingUp, color: 'text-green-500' },
      futures: { label: 'Фьючерсы', icon: Activity, color: 'text-blue-500' },
      indices: { label: 'Индексы', icon: BarChart3, color: 'text-purple-500' },
      options: { label: 'Опционы', icon: Target, color: 'text-orange-500' },
      crypto: { label: 'Критовалюта', icon: Bitcoin, color: 'text-yellow-500' }
    };
    const typeInfo = types[type];
    if (!typeInfo) return type;
    
    const IconComponent = typeInfo.icon;
    return (
      <div className="flex items-center gap-2">
        <IconComponent className={`h-4 w-4 ${typeInfo.color}`} />
        {typeInfo.label}
      </div>
    );
  };

  // Форматирование статуса
  const formatStatus = (status) => {
    const statuses = {
      'ПРОЕКТ': { label: 'ПРОЕКТ', color: 'text-black' },
      'В РАБОТЕ': { label: 'В РАБОТЕ', color: 'text-orange-600' },
      'ЗАКРЫТА': { label: 'ЗАКРЫТА', color: 'text-gray-500' }
    };
    const statusInfo = statuses[status] || { label: status, color: 'text-gray-500' };
    return <span className={`font-medium ${statusInfo.color}`}>{statusInfo.label}</span>;
  };

  // Фильтрация сделок
  const filteredDeals = useMemo(() => {
    return deals.filter(deal => {
      // Фильтр по дате
      if (filterDate) {
        const dealDate = new Date(deal.createdAt);
        const filterDateObj = new Date(filterDate);
        const dealDateStr = dealDate.toISOString().split('T')[0];
        if (dealDateStr !== filterDate) {
          return false;
        }
      }

      // Фильтр по тикеру
      if (filterTicker && !deal.ticker?.toLowerCase().includes(filterTicker.toLowerCase())) {
        return false;
      }

      // Фильтр по типу
      if (filterType && filterType !== 'all' && deal.type !== filterType) {
        return false;
      }

      // Фильтр по статусу
      if (filterStatus && filterStatus !== 'all' && deal.status !== filterStatus) {
        return false;
      }

      return true;
    });
  }, [deals, filterDate, filterTicker, filterType, filterStatus]);

  // Сброс всех фильтров
  const clearFilters = () => {
    setFilterDate('');
    setFilterTicker('');
    setFilterType('all');
    setFilterStatus('all');
  };

  return (
    <div className="w-full max-w-full py-6 px-4">
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
          </div>
          <Button
            onClick={() => window.open('/tools/new-deal?new=true', '_blank')}
            className="bg-cyan-500 hover:bg-cyan-600 text-white h-10 whitespace-nowrap"
          >
            <Plus className="h-4 w-4 mr-2" />
            СДЕЛКА
          </Button>
        </div>
      </div>

      {/* Фильтры */}
      <div className="mb-4 p-4 border border-cyan-500 rounded-lg bg-card">
        <div className="flex items-end gap-4">
          <div className="flex items-center gap-2 mb-[10px]">
            <Filter className="h-4 w-4" />
            <h2 className="text-sm font-semibold">Фильтры</h2>
          </div>
          <div className="flex-1 grid grid-cols-4 gap-4">
            <div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-9 w-full justify-start text-left font-normal"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {filterDate ? filterDate : "Выберите дату..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-3">
                    <input
                      type="date"
                      value={filterDate}
                      onChange={(e) => setFilterDate(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md"
                    />
                    {filterDate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFilterDate('')}
                        className="w-full mt-2"
                      >
                        Очистить
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Input
                id="filter-ticker"
                placeholder="Поиск по тикеру..."
                value={filterTicker}
                onChange={(e) => setFilterTicker(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Все типы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      Все типы
                    </div>
                  </SelectItem>
                  <SelectItem value="stocks">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      Акции
                    </div>
                  </SelectItem>
                  <SelectItem value="futures">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-blue-500" />
                      Фьючерсы
                    </div>
                  </SelectItem>
                  <SelectItem value="indices">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-purple-500" />
                      Индексы
                    </div>
                  </SelectItem>
                  <SelectItem value="options">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-orange-500" />
                      Опционы
                    </div>
                  </SelectItem>
                  <SelectItem value="crypto">
                    <div className="flex items-center gap-2">
                      <Bitcoin className="h-4 w-4 text-yellow-500" />
                      Критовалюта
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Все статусы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      Все статусы
                    </div>
                  </SelectItem>
                  <SelectItem value="ПРОЕКТ">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-black"></div>
                      ПРОЕКТ
                    </div>
                  </SelectItem>
                  <SelectItem value="В РАБОТЕ">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-orange-600"></div>
                      В РАБОТЕ
                    </div>
                  </SelectItem>
                  <SelectItem value="ЗАКРЫТА">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                      ЗАКРЫТА
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            size="sm"
            onClick={clearFilters}
            disabled={!filterDate && !filterTicker && filterType === 'all' && filterStatus === 'all'}
            className="text-xs bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Сбросить
          </Button>
        </div>
      </div>

      <div>
        {filteredDeals.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Archive className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">
              {deals.length === 0
                ? 'Нет сделок в архиве'
                : 'Нет сделок, соответствующих фильтрам'
              }
            </p>
            <p className="text-sm mt-2">
              {deals.length === 0
                ? 'Создайте первую сделку, чтобы она появилась здесь'
                : 'Попробуйте изменить параметры фильтрации'
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Сохранено</TableHead>
                  <TableHead className="w-20">Тикер</TableHead>
                  <TableHead className="w-32">Тип</TableHead>
                  <TableHead className="flex-1">Название</TableHead>
                  <TableHead className="w-12">Статус</TableHead>
                  <TableHead className="text-right w-24">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeals.map((deal) => (
                  <TableRow key={deal.id} className="hover:bg-gray-50">
                    <TableCell className="font-mono text-sm text-gray-500">
                      {formatDate(deal.createdAt)}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {deal.ticker}
                    </TableCell>
                    <TableCell>
                      {formatDealType(deal.type)}
                    </TableCell>
                    <TableCell className="max-w-xs font-bold">
                      <Button
                        variant="link"
                        className="p-0 h-auto text-left justify-start hover:underline"
                        onClick={() => handleEdit(deal)}
                        title="Нажмите для редактирования сделки"
                      >
                        <span className="block font-bold" title={deal.name}>
                          {deal.name}
                        </span>
                      </Button>
                    </TableCell>
                    <TableCell>
                      {formatStatus(deal.status)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(deal)}
                                className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Редактировать сделку</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(deal.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Удалить сделку</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

export default DealsArchive;
