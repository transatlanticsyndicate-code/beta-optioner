import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Save, Trash2, ExternalLink, Filter, Calendar } from 'lucide-react';
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

function SavedConfigurations() {
  const [configurations, setConfigurations] = useState([]);
  
  // Состояние фильтров
  const [filterDate, setFilterDate] = useState('');
  const [filterTicker, setFilterTicker] = useState('');
  const [filterAuthor, setFilterAuthor] = useState('');

  // Установка заголовка страницы
  useEffect(() => {
    document.title = 'Сохраненные конфигурации | SYNDICATE Platform';
    return () => {
      document.title = 'SYNDICATE Platform';
    };
  }, []);

  // Загрузка конфигураций из localStorage
  useEffect(() => {
    loadConfigurations();
  }, []);

  const loadConfigurations = () => {
    const saved = localStorage.getItem('savedCalculatorConfigurations');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConfigurations(parsed);
      } catch (error) {
        console.error('Ошибка загрузки конфигураций:', error);
      }
    }
  };

  // Удаление конфигурации
  const handleDelete = (id) => {
    if (window.confirm('Вы уверены, что хотите удалить эту конфигурацию?')) {
      const updated = configurations.filter(config => config.id !== id);
      setConfigurations(updated);
      localStorage.setItem('savedCalculatorConfigurations', JSON.stringify(updated));
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

  // Форматирование списка опционов
  const formatOptions = (options) => {
    if (!options || options.length === 0) return 'Нет опционов';
    
    return options
      .map(opt => {
        const action = opt.action === 'Buy' ? 'Buy' : 'Sell';
        return `${action}${opt.type} ${opt.strike}`;
      })
      .join(', ');
  };

  // Форматирование даты экспирации в формат DD.MM.YYYY
  const formatExpirationDate = (dateString) => {
    if (!dateString) return '—';
    const [year, month, day] = dateString.split('-');
    return `${day}.${month}.${year}`;
  };

  // Фильтрация конфигураций
  const filteredConfigurations = useMemo(() => {
    return configurations.filter(config => {
      // Фильтр по дате (сравнение дат)
      if (filterDate) {
        const configDate = new Date(config.createdAt);
        const filterDateObj = new Date(filterDate);
        // Сравниваем только даты, без времени
        const configDateStr = configDate.toISOString().split('T')[0];
        if (configDateStr !== filterDate) {
          return false;
        }
      }
      
      // Фильтр по тикеру
      if (filterTicker && !config.ticker?.toLowerCase().includes(filterTicker.toLowerCase())) {
        return false;
      }
      
      // Фильтр по автору
      if (filterAuthor && !config.author?.toLowerCase().includes(filterAuthor.toLowerCase())) {
        return false;
      }
      
      return true;
    });
  }, [configurations, filterDate, filterTicker, filterAuthor]);

  // Сброс всех фильтров
  const clearFilters = () => {
    setFilterDate('');
    setFilterTicker('');
    setFilterAuthor('');
  };

  return (
    <div className="w-full max-w-full py-6 px-4">
      {/* Фильтры */}
      <div className="mb-4 p-4 border border-cyan-500 rounded-lg bg-card">
        <div className="flex items-end gap-4">
          <div className="flex items-center gap-2 mb-[10px]">
            <Filter className="h-4 w-4" />
            <h2 className="text-sm font-semibold">Фильтры</h2>
          </div>
          <div className="flex-1 grid grid-cols-3 gap-4">
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
              <Input
                id="filter-author"
                placeholder="Поиск по автору..."
                value={filterAuthor}
                onChange={(e) => setFilterAuthor(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <Button
            size="sm"
            onClick={clearFilters}
            disabled={!filterDate && !filterTicker && !filterAuthor}
            className="text-xs bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Сбросить
          </Button>
        </div>
      </div>

      <div>
          {filteredConfigurations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Save className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">
                {configurations.length === 0 
                  ? 'Нет сохраненных конфигураций'
                  : 'Нет конфигураций, соответствующих фильтрам'
                }
              </p>
              <p className="text-sm mt-2">
                {configurations.length === 0
                  ? 'Сохраните конфигурацию калькулятора, чтобы она появилась здесь'
                  : 'Попробуйте изменить параметры фильтрации'
                }
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата/Время</TableHead>
                    <TableHead>Тикер</TableHead>
                    <TableHead>Опционы</TableHead>
                    <TableHead>Дата эксп.</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Автор</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredConfigurations.map((config) => (
                    <TableRow key={config.id} className="hover:bg-gray-50">
                      <TableCell className="font-mono text-sm">
                        {formatDate(config.createdAt)}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {config.ticker || '—'}
                      </TableCell>
                      <TableCell className="max-w-md truncate" title={formatOptions(config.state.options)}>
                        {formatOptions(config.state.options)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatExpirationDate(config.state.selectedExpirationDate)}
                      </TableCell>
                      <TableCell className="text-sm font-semibold">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link
                                to={`/tools/options-calculator?config=${config.id}`}
                                target="_blank"
                                className="flex items-center gap-1 text-primary hover:underline"
                              >
                                {config.name}
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </TooltipTrigger>
                            {config.description && (
                              <TooltipContent>
                                <p className="max-w-xs">{config.description}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>{config.author || '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(config.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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

export default SavedConfigurations;
