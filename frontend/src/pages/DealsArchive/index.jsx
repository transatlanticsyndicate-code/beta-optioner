/**
 * Страница архива сделок
 * ЗАЧЕМ: Просмотр, фильтрация и управление сохраненными сделками
 * Затрагивает: управление сделками, localStorage
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Archive } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { loadDeals, deleteDeal } from './utils/storage';
import { filterDeals } from './utils/filters';
import { FiltersPanel, DealsTable } from './components';

function DealsArchive() {
  const [deals, setDeals] = useState([]);
  const [filterDate, setFilterDate] = useState('');
  const [filterTicker, setFilterTicker] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    document.title = 'Архив сделок | SYNDICATE Platform';
    return () => {
      document.title = 'SYNDICATE Platform';
    };
  }, []);

  useEffect(() => {
    const savedDeals = loadDeals();
    setDeals(savedDeals);
  }, []);

  const handleEdit = (deal) => {
    window.open(`/tools/new-deal?edit=${deal.id}`, '_blank');
  };

  const handleDelete = (id) => {
    if (window.confirm('Вы уверены, что хотите удалить эту сделку?')) {
      try {
        const updated = deleteDeal(deals, id);
        setDeals(updated);
      } catch (error) {
        console.error('Ошибка удаления сделки:', error);
        alert('Ошибка удаления сделки!');
      }
    }
  };

  const filteredDeals = useMemo(() => {
    return filterDeals(deals, { filterDate, filterTicker, filterType, filterStatus });
  }, [deals, filterDate, filterTicker, filterType, filterStatus]);

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
          <div></div>
          <Button
            onClick={() => window.open('/tools/new-deal?new=true', '_blank')}
            className="bg-cyan-500 hover:bg-cyan-600 text-white h-10 whitespace-nowrap"
          >
            <Plus className="h-4 w-4 mr-2" />
            СДЕЛКА
          </Button>
        </div>
      </div>

      <FiltersPanel
        filterDate={filterDate}
        setFilterDate={setFilterDate}
        filterTicker={filterTicker}
        setFilterTicker={setFilterTicker}
        filterType={filterType}
        setFilterType={setFilterType}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        onClearFilters={clearFilters}
      />

      <div>
        {deals.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Archive className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">Нет сделок в архиве</p>
            <p className="text-sm mt-2">Создайте первую сделку, чтобы она появилась здесь</p>
          </div>
        ) : (
          <DealsTable deals={filteredDeals} onEdit={handleEdit} onDelete={handleDelete} />
        )}
      </div>
    </div>
  );
}

export default DealsArchive;
