/**
 * Страница сохраненных конфигураций из БД для универсального калькулятора опционов
 * ЗАЧЕМ: Управление конфигурациями из БД с доступом для всех пользователей
 * Затрагивает: API, навигация, фильтрация по типу инструмента
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Save, Trash2, ExternalLink, Filter, Calendar, Download, Upload, X, AlertCircle, CheckCircle, Edit2, TrendingUp, Bitcoin, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { getConfigurations, deleteConfiguration, createConfigurationsBatch, getAllConfigurations, deleteAllConfigurations } from '../services/configurationsApi';
import { supabase } from '../services/supabase';

function DatabaseSavedConfigurations() {
  const navigate = useNavigate();
  const [configurations, setConfigurations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Состояние фильтров
  const [filterDate, setFilterDate] = useState('');
  const [filterTicker, setFilterTicker] = useState('');
  const [filterAuthor, setFilterAuthor] = useState('');
  const [filterInstrumentType, setFilterInstrumentType] = useState('all');

  // Состояние сортировки
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');

  // Состояние пагинации
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50; // Показываем по 50 записей на странице

  // Состояние миграции
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [migrationResult, setMigrationResult] = useState(null);
  const [migrationError, setMigrationError] = useState(null);

  // Установка заголовка страницы
  useEffect(() => {
    document.title = 'Сохранения из БД | SYNDICATE Platform';
    return () => {
      document.title = 'SYNDICATE Platform';
    };
  }, []);

  // Загрузка конфигураций из API
  useEffect(() => {
    loadConfigurations();
  }, []);

  const loadConfigurations = async () => {
    try {
      setLoading(true);
      setError(null);
      // ЗАЧЕМ: Загружаем ВСЕ конфигурации с автопагинацией (обходим лимит API)
      const result = await getAllConfigurations();

      if (result.status === 'success') {
        setConfigurations(result.data);
        console.log(`✅ Загружено конфигураций: ${result.data.length} из ${result.total}`);
      } else {
        setError('Ошибка загрузки конфигураций');
      }
    } catch (err) {
      console.error('Ошибка загрузки конфигураций:', err);
      setError(err.message || 'Ошибка загрузки конфигураций');
    } finally {
      setLoading(false);
    }
  };

  // Удаление конфигурации
  const handleDelete = async (id, author) => {
    // Получаем текущего пользователя
    let currentUserId = null;
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        currentUserId = session.user.id;
        const currentUserName = session.user.user_metadata?.first_name || 
                                session.user.user_metadata?.name || 
                                session.user.email.split('@')[0];
        
        // Проверяем, является ли текущий пользователь автором
        if (author !== currentUserName) {
          alert('Вы можете удалять только свои конфигурации');
          return;
        }
      }
    }

    if (window.confirm('Вы уверены, что хотите удалить эту конфигурацию?')) {
      try {
        await deleteConfiguration(id, currentUserId);
        await loadConfigurations(); // Перезагружаем список
      } catch (err) {
        console.error('Ошибка удаления:', err);
        alert(`Ошибка удаления: ${err.message}`);
      }
    }
  };

  // Удаление всех конфигураций
  // ЗАЧЕМ: Используем серверный bulk-delete вместо цикла — удаляет ВСЕ записи, не только загруженные
  const handleDeleteAll = async () => {
    if (!window.confirm('⚠️ Вы уверены, что хотите удалить ВСЕ конфигурации?\n\nЭто действие необратимо!')) {
      return;
    }

    if (!window.confirm('Это действительно удалит все конфигурации. Вы уверены?')) {
      return;
    }

    try {
      setLoading(true);
      const result = await deleteAllConfigurations(null);
      setConfigurations([]);
      alert(`Удалено: ${result.deleted}`);
      await loadConfigurations();
    } catch (err) {
      console.error('Ошибка удаления всех конфигураций:', err);
      alert(`Ошибка: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Открытие конфигурации в режиме редактирования
  const handleEdit = (configId) => {
    navigate(`/tools/universal-calculator?dbConfig=${configId}&edit=true`);
  };

  // Экспорт всех конфигураций в JSON файл
  // ЗАЧЕМ: Резервное копирование данных перед миграцией на Supabase PostgreSQL
  const handleExport = () => {
    try {
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        exportedBy: 'Database Export',
        source: 'database',
        data: {
          configurations: configurations,
        },
        stats: {
          configurationsCount: configurations.length,
        },
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      const date = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `db-configurations-export-${date}.json`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert(`Экспорт успешен!\nКонфигураций: ${configurations.length}`);
    } catch (error) {
      console.error('Ошибка экспорта:', error);
      alert(`Ошибка экспорта: ${error.message}`);
    }
  };

  // Импорт конфигураций из JSON файла
  // ЗАЧЕМ: Восстановление данных из резервной копии
  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      // Валидация
      if (!importData.data || !importData.data.configurations) {
        alert('Неверный формат файла');
        return;
      }

      const configs = importData.data.configurations;
      
      if (window.confirm(`Импортировать ${configs.length} конфигураций в БД?`)) {
        const result = await createConfigurationsBatch(configs);
        
        if (result.status === 'success') {
          alert(`Импорт успешен!\nИмпортировано: ${result.data.imported}\nПропущено: ${result.data.skipped}`);
          await loadConfigurations(); // Перезагружаем список
        } else {
          alert(`Ошибка импорта: ${result.message || 'Неизвестная ошибка'}`);
        }
      }
    } catch (error) {
      console.error('Ошибка импорта:', error);
      alert(`Ошибка импорта: ${error.message}`);
    }
    
    // Сбрасываем input для повторного выбора того же файла
    event.target.value = '';
  };

  // Форматирование даты в UTC
  const formatDate = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  };

  // Самая ранняя дата входа (на момент сохранения)
  // ЗАЧЕМ: предпочитаем минимум из state.options[*].entryDate (формат YYYY-MM-DD,
  // без таймзоны — надёжно), fallback — config.entryDate из БД
  const getEntryDateValue = (config) => {
    const opts = config.state?.options || [];
    const withDates = opts.filter(o => o && o.entryDate);
    if (withDates.length > 0) {
      return withDates.reduce((min, o) => (o.entryDate < min ? o.entryDate : min), withDates[0].entryDate);
    }
    return config.entryDate || null;
  };

  const formatEntryDate = (value) => {
    if (!value) return '—';
    // ISO без таймзоны ("2026-04-13T00:00:00") трактуем как UTC, чтобы не уехать
    // на день из-за часового пояса браузера
    let iso = value;
    if (value.length === 10) {
      iso = `${value}T00:00:00.000Z`;
    } else if (!/Z|[+-]\d{2}:?\d{2}$/.test(value)) {
      iso = `${value}Z`;
    }
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    });
  };

  // Определение типа инструмента из конфигурации
  const getInstrumentType = (config) => {
    if (config.state?.calculatorMode) {
      const mode = config.state.calculatorMode;
      return mode === 'stocks' ? 'Акции' : mode === 'crypto' ? 'Крипто' : 'Фьючерсы';
    }
    
    const ticker = config.ticker || '';
    const futuresPatterns = [
      /^[A-Z]{1,2}[FGHJKMNQUVXZ]\d{2}$/,
      /^[A-Z]{2,4}\d{2}$/,
      /^[A-Z]{1,2}\d{1}!$/,
    ];
    
    const isFutures = futuresPatterns.some(pattern => pattern.test(ticker));
    return isFutures ? 'Фьючерсы' : 'Акции';
  };

  // Обработчик клика по заголовку колонки для сортировки
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Иконка сортировки для заголовка колонки
  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3.5 w-3.5 ml-1" />
      : <ArrowDown className="h-3.5 w-3.5 ml-1" />;
  };

  // Фильтрация и сортировка конфигураций
  const filteredConfigurations = useMemo(() => {
    return configurations.filter(config => {
      // Фильтр по дате
      if (filterDate) {
        const configDate = new Date(config.createdAt);
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
      
      // Фильтр по типу инструмента
      if (filterInstrumentType !== 'all') {
        const instrumentType = getInstrumentType(config);
        if (filterInstrumentType === 'stocks' && instrumentType !== 'Акции') {
          return false;
        }
        if (filterInstrumentType === 'futures' && instrumentType !== 'Фьючерсы') {
          return false;
        }
      }
      
      return true;
    }).sort((a, b) => {
      let valA, valB;
      if (sortField === 'createdAt') {
        valA = new Date(a.createdAt).getTime();
        valB = new Date(b.createdAt).getTime();
      } else if (sortField === 'ticker') {
        valA = (a.ticker || '').toLowerCase();
        valB = (b.ticker || '').toLowerCase();
      } else if (sortField === 'name') {
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
      } else {
        return 0;
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [configurations, filterDate, filterTicker, filterAuthor, filterInstrumentType, sortField, sortDirection]);

  // Пагинация отфильтрованных конфигураций
  // ЗАЧЕМ: Рендерим только часть записей для улучшения производительности
  const paginatedConfigurations = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredConfigurations.slice(startIndex, endIndex);
  }, [filteredConfigurations, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredConfigurations.length / itemsPerPage);

  // Сброс на первую страницу при изменении фильтров
  useEffect(() => {
    setCurrentPage(1);
  }, [filterDate, filterTicker, filterAuthor, filterInstrumentType]);

  // Сброс всех фильтров
  const clearFilters = () => {
    setFilterDate('');
    setFilterTicker('');
    setFilterAuthor('');
    setFilterInstrumentType('all');
  };

  // Миграция из localStorage в БД
  const handleMigration = async () => {
    try {
      setMigrationError(null);
      setMigrationResult(null);

      // Читаем конфигурации из localStorage
      const saved = localStorage.getItem('universalCalculatorConfigurations');
      if (!saved) {
        setMigrationError('Нет конфигураций в localStorage для миграции');
        return;
      }

      const localConfigs = JSON.parse(saved);
      if (localConfigs.length === 0) {
        setMigrationError('Нет конфигураций в localStorage для миграции');
        return;
      }

      // Отправляем на сервер
      const result = await createConfigurationsBatch(localConfigs);
      
      if (result.status === 'success') {
        setMigrationResult(result);
        await loadConfigurations(); // Перезагружаем список
      } else {
        setMigrationError('Ошибка миграции');
      }
    } catch (err) {
      console.error('Ошибка миграции:', err);
      setMigrationError(err.message || 'Ошибка миграции');
    }
  };

  return (
    <div className="w-full max-w-full py-6 px-4">
      {/* Заголовок */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold">
          Сохранённые позиции из БД
          {(() => {
            const n = configurations.length;
            const mod10 = n % 10;
            const mod100 = n % 100;
            let word = 'позиций';
            if (mod10 === 1 && mod100 !== 11) word = 'позиция';
            else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = 'позиции';
            return <span className="text-red-500 ml-2">— {n} {word}</span>;
          })()}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Конфигурации, сохранённые в базе данных и доступные всем пользователям
        </p>
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
              <Input
                id="filter-author"
                placeholder="Поиск по автору..."
                value={filterAuthor}
                onChange={(e) => setFilterAuthor(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Select value={filterInstrumentType} onValueChange={setFilterInstrumentType}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Тип инструмента..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все инструменты</SelectItem>
                  <SelectItem value="stocks">Акции</SelectItem>
                  <SelectItem value="futures">Фьючерсы</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            size="sm"
            onClick={clearFilters}
            disabled={!filterDate && !filterTicker && !filterAuthor && filterInstrumentType === 'all'}
            className="text-xs bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Сбросить
          </Button>
          
          {/* Кнопки управления данными */}
          <div className="flex gap-2 ml-4 border-l pl-4 border-gray-300">
            <TooltipProvider>
              {/* Кнопка экспорта */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExport}
                    disabled={configurations.length === 0}
                    className="text-xs"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Экспорт
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Экспортировать все конфигурации в JSON файл</p>
                </TooltipContent>
              </Tooltip>

              {/* Кнопка импорта */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => document.getElementById('import-file-input').click()}
                    className="text-xs"
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    Импорт
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Импортировать конфигурации из JSON файла</p>
                </TooltipContent>
              </Tooltip>

              {/* Скрытый input для выбора файла */}
              <input
                id="import-file-input"
                type="file"
                accept=".json"
                onChange={handleImport}
                style={{ display: 'none' }}
              />

              {/* Кнопка миграции */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowMigrationModal(true)}
                    className="text-xs"
                  >
                    <Save className="h-4 w-4 mr-1" />
                    Миграция из localStorage
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Перенести конфигурации из localStorage в БД</p>
                </TooltipContent>
              </Tooltip>

              {/* Кнопка удаления всех конфигураций */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDeleteAll}
                    disabled={configurations.length === 0 || loading}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Удалить всё
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Удалить все конфигурации из БД (требует подтверждения)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Контент */}
      <div>
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg">Загрузка...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-destructive">
            <AlertCircle className="h-12 w-12 mx-auto mb-4" />
            <p className="text-lg">{error}</p>
            <Button onClick={loadConfigurations} className="mt-4">
              Повторить попытку
            </Button>
          </div>
        ) : filteredConfigurations.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Save className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">
              {configurations.length === 0 
                ? 'Нет сохраненных конфигураций в БД'
                : 'Нет конфигураций, соответствующих фильтрам'
              }
            </p>
            <p className="text-sm mt-2">
              {configurations.length === 0
                ? 'Сохраните конфигурацию через кнопку "💾 Сохранить в БД" в калькуляторе'
                : 'Попробуйте изменить параметры фильтрации'
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort('createdAt')}
                  >
                    <span className="inline-flex items-center">
                      Дата/Время
                      <SortIcon field="createdAt" />
                    </span>
                  </TableHead>
                  <TableHead>Дата входа</TableHead>
                  <TableHead
                    className="cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort('ticker')}
                  >
                    <span className="inline-flex items-center">
                      Тикер
                      <SortIcon field="ticker" />
                    </span>
                  </TableHead>
                  <TableHead>Тип инструмента</TableHead>
                  <TableHead
                    className="cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort('name')}
                  >
                    <span className="inline-flex items-center">
                      Название
                      <SortIcon field="name" />
                    </span>
                  </TableHead>
                  <TableHead>Автор</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedConfigurations.map((config) => {
                  const instrumentType = getInstrumentType(config);
                  const isStocks = instrumentType === 'Акции';
                  const isCrypto = instrumentType === 'Крипто';
                  
                  return (
                    <TableRow key={config.id} className="hover:bg-gray-50">
                      <TableCell className="font-mono text-sm">
                        {formatDate(config.createdAt)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatEntryDate(getEntryDateValue(config))}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {config.ticker || '—'}
                      </TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                          isStocks
                            ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                            : isCrypto
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                            : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                        }`}>
                          {instrumentType}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-semibold">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link
                                to={`/tools/universal-calculator?dbConfig=${config.id}`}
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
                      <TableCell className="text-right flex gap-2 justify-end">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(config.id)}
                                className="text-blue-600 hover:text-blue-700"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Редактировать конфигурацию</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(config.id, config.author)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Пагинация */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <div className="text-sm text-muted-foreground">
                  Показано {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredConfigurations.length)} из {filteredConfigurations.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    Назад
                  </Button>
                  <div className="text-sm">
                    Страница {currentPage} из {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Вперед
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Модальное окно миграции */}
      {showMigrationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-cyan-500 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Миграция из localStorage
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowMigrationModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {migrationResult ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Миграция успешна!</span>
                </div>
                <div className="text-sm space-y-1">
                  <p>Перенесено конфигураций: <strong>{migrationResult.data?.length || 0}</strong></p>
                </div>
                <Button onClick={() => setShowMigrationModal(false)} className="w-full bg-cyan-500 hover:bg-cyan-600">
                  Закрыть
                </Button>
              </div>
            ) : (
              <>
                {migrationError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{migrationError}</p>
                  </div>
                )}

                <div className="mb-4">
                  <p className="text-sm text-muted-foreground">
                    Эта операция перенесёт все конфигурации из localStorage в базу данных.
                    Конфигурации в localStorage останутся без изменений.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleMigration}
                    className="flex-1 bg-cyan-500 hover:bg-cyan-600"
                  >
                    Начать миграцию
                  </Button>
                  <Button
                    onClick={() => setShowMigrationModal(false)}
                    variant="outline"
                    className="flex-1"
                  >
                    Отмена
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DatabaseSavedConfigurations;
