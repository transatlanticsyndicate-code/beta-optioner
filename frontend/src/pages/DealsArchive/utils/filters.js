/**
 * Утилиты фильтрации сделок
 * ЗАЧЕМ: Фильтрация списка сделок по различным критериям
 * Затрагивает: отображение отфильтрованных данных
 */

// Фильтрация сделок
export const filterDeals = (deals, filters) => {
  const { filterDate, filterTicker, filterType, filterStatus } = filters;
  
  return deals.filter(deal => {
    // Фильтр по дате
    if (filterDate) {
      const dealDate = new Date(deal.createdAt);
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
};
