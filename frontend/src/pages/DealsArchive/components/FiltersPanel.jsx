/**
 * Панель фильтров для архива сделок
 * ЗАЧЕМ: Фильтрация сделок по дате, тикеру, типу и статусу
 * Затрагивает: поиск и фильтрация данных
 */

import React from 'react';
import { Filter, Calendar, TrendingUp, Activity, BarChart3, Target, Bitcoin } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';

export function FiltersPanel({
  filterDate,
  setFilterDate,
  filterTicker,
  setFilterTicker,
  filterType,
  setFilterType,
  filterStatus,
  setFilterStatus,
  onClearFilters
}) {
  const hasActiveFilters = filterDate || filterTicker || filterType !== 'all' || filterStatus !== 'all';

  return (
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
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Все типы" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all"><div className="flex items-center gap-2"><Filter className="h-4 w-4" />Все типы</div></SelectItem>
                <SelectItem value="stocks"><div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-green-500" />Акции</div></SelectItem>
                <SelectItem value="futures"><div className="flex items-center gap-2"><Activity className="h-4 w-4 text-blue-500" />Фьючерсы</div></SelectItem>
                <SelectItem value="indices"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-purple-500" />Индексы</div></SelectItem>
                <SelectItem value="options"><div className="flex items-center gap-2"><Target className="h-4 w-4 text-orange-500" />Опционы</div></SelectItem>
                <SelectItem value="crypto"><div className="flex items-center gap-2"><Bitcoin className="h-4 w-4 text-yellow-500" />Критовалюта</div></SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Все статусы" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all"><div className="flex items-center gap-2"><Filter className="h-4 w-4" />Все статусы</div></SelectItem>
                <SelectItem value="ПРОЕКТ"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-black"></div>ПРОЕКТ</div></SelectItem>
                <SelectItem value="В РАБОТЕ"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-600"></div>В РАБОТЕ</div></SelectItem>
                <SelectItem value="ЗАКРЫТА"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-gray-500"></div>ЗАКРЫТА</div></SelectItem>
              </SelectContent>
            </Select>
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
      </div>
    </div>
  );
}
