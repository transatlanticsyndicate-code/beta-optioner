/**
 * Страница сохраненных конфигураций для универсального калькулятора опционов
 * ЗАЧЕМ: Управление конфигурациями из универсального калькулятора с поддержкой акций и фьючерсов
 * Затрагивает: localStorage, навигация, фильтрация по типу инструмента
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Save, Trash2, ExternalLink, Filter, Calendar, Download, Upload, X, AlertCircle, CheckCircle, Edit2, TrendingUp, Bitcoin } from 'lucide-react';
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
import {
  exportConfigurations,
  readImportFile,
  validateImportData,
  importConfigurations,
} from '../utils/configExportImport';

function UniversalSavedConfigurations() {
  const navigate = useNavigate();
  const [configurations, setConfigurations] = useState([]);
  
  // Состояние фильтров
  const [filterDate, setFilterDate] = useState('');
  const [filterTicker, setFilterTicker] = useState('');
  const [filterAuthor, setFilterAuthor] = useState('');
  const [filterInstrumentType, setFilterInstrumentType] = useState('all');

  // Состояние импорта
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState(null);
  const [importResult, setImportResult] = useState(null);

  // Установка заголовка страницы
  useEffect(() => {
    document.title = 'Сохранения из Универсального калькулятора | SYNDICATE Platform';
    return () => {
      document.title = 'SYNDICATE Platform';
    };
  }, []);

  // Загрузка конфигураций из localStorage
  useEffect(() => {
    loadConfigurations();
  }, []);

  const loadConfigurations = () => {
    const saved = localStorage.getItem('universalCalculatorConfigurations');
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
      localStorage.setItem('universalCalculatorConfigurations', JSON.stringify(updated));
    }
  };

  // Открытие конфигурации в режиме редактирования
  // ЗАЧЕМ: Позволяет редактировать сохраненную конфигурацию в разблокированном виде
  const handleEdit = (configId) => {
    navigate(`/tools/universal-calculator?config=${configId}&edit=true`);
  };

  // Форматирование даты в UTC
  // ЗАЧЕМ: Все даты и время отображаются в UTC для консистентности между часовыми поясами
  const formatDate = (dateString) => {
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

  // Определение типа инструмента из конфигурации
  // ЗАЧЕМ: Извлекает тип инструмента (акции/фьючерсы) из сохраненного состояния
  const getInstrumentType = (config) => {
    // Проверяем наличие calculatorMode в состоянии
    if (config.state?.calculatorMode) {
      const result = config.state.calculatorMode === 'stocks' ? 'Акции' : 'Фьючерсы';
      console.log(`🔍 [getInstrumentType] Определен по calculatorMode: ${config.state.calculatorMode} -> ${result}`, config.name);
      return result;
    }
    
    // Fallback: определяем по тикеру
    const ticker = config.ticker || config.state?.selectedTicker || '';
    
    // Паттерны для фьючерсов
    const futuresPatterns = [
      /^[A-Z]{1,2}[FGHJKMNQUVXZ]\d{2}$/,  // ESU24, NQZ24
      /^[A-Z]{2,4}\d{2}$/,                 // MES24, MNQ24
      /^[A-Z]{1,2}\d{1}!$/,                // ES1!, NQ1!
    ];
    
    const isFutures = futuresPatterns.some(pattern => pattern.test(ticker));
    const result = isFutures ? 'Фьючерсы' : 'Акции';
    console.log(`🔍 [getInstrumentType] Определен по тикеру: ${ticker} -> ${result}`, config.name);
    return result;
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
    });
  }, [configurations, filterDate, filterTicker, filterAuthor, filterInstrumentType]);

  // Сброс всех фильтров
  const clearFilters = () => {
    setFilterDate('');
    setFilterTicker('');
    setFilterAuthor('');
    setFilterInstrumentType('all');
  };

  // Экспорт конфигураций
  // ЗАЧЕМ: Позволяет сохранить все конфигурации в файл для передачи коллегам
  const handleExport = () => {
    const result = exportConfigurations('User', 'universalCalculatorConfigurations');
    if (result.success) {
      alert(`Экспорт успешен! \nКонфигураций: ${result.stats.configurationsCount}\nПозиций: ${result.stats.positionsCount}`);
    } else {
      alert(`Ошибка экспорта: ${result.error}`);
    }
  };

  // Открытие модального окна импорта
  const handleImportClick = () => {
    setShowImportModal(true);
    setImportPreview(null);
    setImportError(null);
    setImportResult(null);
  };

  // Обработка выбора файла
  // ЗАЧЕМ: Читает и валидирует файл перед импортом
  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImportError(null);
      const data = await readImportFile(file);
      const validation = validateImportData(data);

      if (!validation.valid) {
        setImportError(validation.errors.join(', '));
        setImportPreview(null);
        return;
      }

      setImportPreview({ data, stats: validation.stats });
    } catch (error) {
      setImportError(error.message);
      setImportPreview(null);
    }
  };

  // Выполнение импорта
  // ЗАЧЕМ: Импортирует конфигурации в localStorage с выбранным режимом
  const handleImport = (mode) => {
    if (!importPreview) return;

    const result = importConfigurations(importPreview.data, mode, 'universalCalculatorConfigurations');
    
    if (result.success) {
      setImportResult(result);
      loadConfigurations(); // Перезагружаем список
    } else {
      setImportError(result.error);
    }
  };

  // Закрытие модального окна
  const closeImportModal = () => {
    setShowImportModal(false);
    setImportPreview(null);
    setImportError(null);
    setImportResult(null);
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
          
          {/* Кнопки экспорта/импорта */}
          <div className="flex gap-2 ml-4 border-l pl-4 border-gray-300">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExport}
                    className="text-xs"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Экспорт
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Скачать все конфигурации в файл</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleImportClick}
                    className="text-xs"
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    Импорт
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Загрузить конфигурации из файла</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
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
                  ? 'Сохраните конфигурацию универсального калькулятора, чтобы она появилась здесь'
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
                    <TableHead>Тип инструмента</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Автор</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredConfigurations.map((config) => {
                    const instrumentType = getInstrumentType(config);
                    const isStocks = instrumentType === 'Акции';
                    
                    return (
                      <TableRow key={config.id} className="hover:bg-gray-50">
                        <TableCell className="font-mono text-sm">
                          {formatDate(config.createdAt)}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {config.ticker || '—'}
                        </TableCell>
                        <TableCell>
                          <div className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                            isStocks 
                              ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
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
                                  to={`/tools/universal-calculator?config=${config.id}`}
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
            </div>
          )}
      </div>

      {/* Модальное окно импорта */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-cyan-500 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            {/* Заголовок */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Импорт конфигураций
              </h3>
              <Button variant="ghost" size="sm" onClick={closeImportModal}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Результат импорта */}
            {importResult ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Импорт успешен!</span>
                </div>
                <div className="text-sm space-y-1">
                  <p>Импортировано конфигураций: <strong>{importResult.imported.configurations}</strong></p>
                  <p>Импортировано позиций: <strong>{importResult.imported.positions}</strong></p>
                  {importResult.skipped && (
                    <>
                      <p className="text-muted-foreground">
                        Пропущено конфигураций (дубликаты): {importResult.skipped.configurations}
                      </p>
                      <p className="text-muted-foreground">
                        Пропущено позиций (дубликаты): {importResult.skipped.positions}
                      </p>
                    </>
                  )}
                </div>
                <Button onClick={closeImportModal} className="w-full bg-cyan-500 hover:bg-cyan-600">
                  Закрыть
                </Button>
              </div>
            ) : (
              <>
                {/* Выбор файла */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Выберите файл экспорта:</label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileSelect}
                    className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-cyan-500 file:text-white hover:file:bg-cyan-600 cursor-pointer"
                  />
                </div>

                {/* Ошибка */}
                {importError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{importError}</p>
                  </div>
                )}

                {/* Превью */}
                {importPreview && (
                  <div className="mb-4 p-3 bg-cyan-50 border border-cyan-200 rounded-md">
                    <p className="text-sm font-medium mb-2">Содержимое файла:</p>
                    <div className="text-sm space-y-1">
                      <p>Конфигураций: <strong>{importPreview.stats.configurationsCount}</strong></p>
                      <p>Позиций: <strong>{importPreview.stats.positionsCount}</strong></p>
                      <p className="text-muted-foreground text-xs">
                        Экспортировано: {new Date(importPreview.stats.exportedAt).toLocaleString('ru-RU')}
                      </p>
                      {importPreview.stats.exportedBy && (
                        <p className="text-muted-foreground text-xs">
                          Автор: {importPreview.stats.exportedBy}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Кнопки импорта */}
                {importPreview && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground mb-2">Выберите режим импорта:</p>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleImport('merge')}
                        className="flex-1 bg-cyan-500 hover:bg-cyan-600"
                      >
                        Объединить
                      </Button>
                      <Button
                        onClick={() => handleImport('replace')}
                        variant="outline"
                        className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                      >
                        Заменить всё
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <strong>Объединить</strong> — добавит новые, пропустит дубликаты<br />
                      <strong>Заменить</strong> — удалит текущие и загрузит из файла
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default UniversalSavedConfigurations;
