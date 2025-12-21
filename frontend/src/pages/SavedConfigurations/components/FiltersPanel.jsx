/**
 * Панель фильтров конфигураций
 * ЗАЧЕМ: Фильтрация по дате, тикеру, автору
 */

import React from 'react';
import { Filter, Calendar, Download, Upload } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../components/ui/tooltip';

export function FiltersPanel({ 
  filterDate, setFilterDate, 
  filterTicker, setFilterTicker, 
  filterAuthor, setFilterAuthor,
  onClearFilters, onExport, onImport 
}) {
  const hasActiveFilters = filterDate || filterTicker || filterAuthor;

  return (
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
                <Button variant="outline" className="h-9 w-full justify-start text-left font-normal">
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
                    <Button variant="ghost" size="sm" onClick={() => setFilterDate('')} className="w-full mt-2">
                      Очистить
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Input
              placeholder="Поиск по тикеру..."
              value={filterTicker}
              onChange={(e) => setFilterTicker(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <Input
              placeholder="Поиск по автору..."
              value={filterAuthor}
              onChange={(e) => setFilterAuthor(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
        <Button
          size="sm"
          onClick={onClearFilters}
          disabled={!hasActiveFilters}
          className="text-xs bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          Сбросить
        </Button>
        
        <div className="flex gap-2 ml-4 border-l pl-4 border-gray-300">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={onExport} className="text-xs">
                  <Download className="h-4 w-4 mr-1" />
                  Экспорт
                </Button>
              </TooltipTrigger>
              <TooltipContent>Экспортировать все конфигурации в файл</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={onImport} className="text-xs">
                  <Upload className="h-4 w-4 mr-1" />
                  Импорт
                </Button>
              </TooltipTrigger>
              <TooltipContent>Импортировать конфигурации из файла</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
