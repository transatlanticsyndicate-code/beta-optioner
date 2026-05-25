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
import { isEtfTicker } from '../utils/etfSettings';

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
  // Фильтр по статусу позиции: 'all' | 'pending' | 'standard'
  // ЗАЧЕМ: По задаче пользователь должен иметь возможность отфильтровать
  // только «В ожидании» или только «Зафиксирована».
  const [filterStatus, setFilterStatus] = useState('all');

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

  // Множественное выделение строк для пакетного удаления.
  // ЗАЧЕМ: позволяет удалить несколько своих сохранений за раз без подтверждения каждой.
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  // ID текущего пользователя — передаётся в deleteConfiguration для backend-авторизации.
  // Если пользователь не залогинен или supabase недоступен, остаётся null.
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.user) setCurrentUserId(session.user.id || null);
      } catch (e) {
        console.warn('Не удалось определить текущего пользователя:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  // Удаление конфигурации.
  // Проверка «только свои» во фронте снята — на текущем этапе пользователь
  // явно попросил разрешить удалять любые записи; авторизация остаётся за backend.
  const handleDelete = async (id) => {
    let userId = null;
    if (supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) userId = session.user.id;
      } catch (e) { /* анонимный режим — без user_id */ }
    }

    if (window.confirm('Вы уверены, что хотите удалить эту конфигурацию?')) {
      try {
        await deleteConfiguration(id, userId);
        await loadConfigurations(); // Перезагружаем список
      } catch (err) {
        console.error('Ошибка удаления:', err);
        alert(`Ошибка удаления: ${err.message}`);
      }
    }
  };

  // Пакетное удаление выбранных конфигураций.
  // Проверка «только свои» во фронте снята — авторизацию выполняет backend.
  // Удаление параллельное через Promise.allSettled, чтобы один сбой не блокировал остальные.
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);
    if (!window.confirm(`Удалить ${ids.length} ${ids.length === 1 ? 'конфигурацию' : 'конфигураций'}?`)) return;

    try {
      setLoading(true);
      const results = await Promise.allSettled(
        ids.map(id => deleteConfiguration(id, currentUserId))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      const succeeded = ids.length - failed;

      if (failed > 0) {
        alert(`Удалено: ${succeeded}. Не удалось удалить: ${failed}.`);
      }
      setSelectedIds(new Set());
      await loadConfigurations();
    } catch (err) {
      console.error('Ошибка пакетного удаления:', err);
      alert(`Ошибка пакетного удаления: ${err.message}`);
    } finally {
      setLoading(false);
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
      return mode === 'etf' ? 'ETF'
        : mode === 'stocks' ? 'Акции'
        : mode === 'crypto' ? 'Крипто'
        : 'Фьючерсы';
    }

    const ticker = config.ticker || '';

    // ETF проверяем ДО фьючерсов — пользовательский список ETF переопределяет паттерны.
    if (isEtfTicker(ticker)) {
      return 'ETF';
    }

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
        if (filterInstrumentType === 'etf' && instrumentType !== 'ETF') {
          return false;
        }
        if (filterInstrumentType === 'futures' && instrumentType !== 'Фьючерсы') {
          return false;
        }
        if (filterInstrumentType === 'crypto' && instrumentType !== 'Крипто') {
          return false;
        }
      }

      // Фильтр по статусу позиции
      // ЗАЧЕМ: Старые записи в БД могут не иметь поля status — считаем такие 'pending'.
      if (filterStatus !== 'all') {
        const positionStatus = config.status === 'pending' ? 'pending' : 'standard';
        if (positionStatus !== filterStatus) {
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
      } else if (sortField === 'status') {
        // Сортировка по статусу: pending выше standard в asc-порядке
        // ЗАЧЕМ: «В ожидании» — это активные планы, их полезно держать сверху.
        // Fallback на 'standard' — старые записи без поля status считаются зафиксированными.
        valA = (a.status === 'pending' ? 'pending' : 'standard');
        valB = (b.status === 'pending' ? 'pending' : 'standard');
      } else {
        return 0;
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [configurations, filterDate, filterTicker, filterAuthor, filterInstrumentType, filterStatus, sortField, sortDirection]);

  // Пагинация отфильтрованных конфигураций
  // ЗАЧЕМ: Рендерим только часть записей для улучшения производительности
  const paginatedConfigurations = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredConfigurations.slice(startIndex, endIndex);
  }, [filteredConfigurations, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredConfigurations.length / itemsPerPage);

  // Сброс на первую страницу при изменении фильтров.
  // Также сбрасываем множественное выделение, иначе пользователь может «случайно»
  // удалить записи, скрытые текущим фильтром, — это удивит и расстроит.
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [filterDate, filterTicker, filterAuthor, filterInstrumentType, filterStatus]);

  // Состояние master-чекбокса в шапке: «выбраны все на текущей странице».
  // Считаем по всем записям без фильтра по автору — пользователь явно попросил
  // разрешить выделять и удалять любые конфигурации.
  const allOnPageSelected = paginatedConfigurations.length > 0
    && paginatedConfigurations.every(c => selectedIds.has(c.id));
  const someOnPageSelected = paginatedConfigurations.some(c => selectedIds.has(c.id));

  const togglePageSelection = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        paginatedConfigurations.forEach(c => next.delete(c.id));
      } else {
        paginatedConfigurations.forEach(c => next.add(c.id));
      }
      return next;
    });
  };

  const toggleRowSelection = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Сброс всех фильтров
  const clearFilters = () => {
    setFilterDate('');
    setFilterTicker('');
    setFilterAuthor('');
    setFilterInstrumentType('all');
    setFilterStatus('all');
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
          <div className="flex-1 grid grid-cols-5 gap-4">
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
                  <SelectItem value="etf">ETF</SelectItem>
                  <SelectItem value="futures">Фьючерсы</SelectItem>
                  <SelectItem value="crypto">Крипто</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Фильтр по статусу позиции */}
            <div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Статус..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="pending">В ожидании</SelectItem>
                  <SelectItem value="standard">Зафиксирована</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            size="sm"
            onClick={clearFilters}
            disabled={!filterDate && !filterTicker && !filterAuthor && filterInstrumentType === 'all' && filterStatus === 'all'}
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


              {/* Кнопка пакетного удаления выбранных конфигураций.
                  ЗАЧЕМ: позволяет удалить N своих сохранений одним кликом
                  без подтверждения каждой записи отдельно. */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDeleteSelected}
                    disabled={selectedIds.size === 0 || loading}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Удалить выбранные{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Удалить только отмеченные галочкой конфигурации (можно удалять только свои)</p>
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
                  {/* Master-чекбокс: выбирает/снимает все записи на текущей странице. */}
                  <TableHead className="w-[40px]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-cyan-500"
                      checked={allOnPageSelected}
                      ref={el => { if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected; }}
                      onChange={togglePageSelection}
                      aria-label="Выбрать все на этой странице"
                      title="Выбрать все на этой странице"
                    />
                  </TableHead>
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
                    onClick={() => handleSort('status')}
                  >
                    <span className="inline-flex items-center">
                      Статус
                      <SortIcon field="status" />
                    </span>
                  </TableHead>
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
                  const isEtf = instrumentType === 'ETF';
                  const isCrypto = instrumentType === 'Крипто';

                  return (
                    <TableRow key={config.id} className="hover:bg-gray-50">
                      {/* Чекбокс выбора — доступен для любой записи. */}
                      <TableCell className="w-[40px]">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-cyan-500"
                          checked={selectedIds.has(config.id)}
                          onChange={() => toggleRowSelection(config.id)}
                          aria-label="Выбрать конфигурацию"
                        />
                      </TableCell>
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
                            : isEtf
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            : isCrypto
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                            : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                        }`}>
                          {instrumentType}
                        </div>
                      </TableCell>
                      <TableCell>
                        {/* Лейбл статуса позиции
                            ЗАЧЕМ: Жёлтый = «В ожидании» (предварительная схема),
                            голубой = «Зафиксирована» (реально открытая позиция). */}
                        {(() => {
                          const positionStatus = config.status === 'pending' ? 'pending' : 'standard';
                          return positionStatus === 'pending' ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-400 dark:bg-yellow-900/30 dark:text-yellow-300">
                              ⏳ В ожидании
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-cyan-100 text-cyan-800 border border-cyan-400 dark:bg-cyan-900/30 dark:text-cyan-300">
                              🔒 Зафиксирована
                            </span>
                          );
                        })()}
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
                          onClick={() => handleDelete(config.id)}
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
