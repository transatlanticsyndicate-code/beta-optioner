/**
 * Логика фильтрации конфигураций
 * ЗАЧЕМ: Фильтрация по дате, тикеру и автору
 */

export const filterConfigurations = (configurations, { filterDate, filterTicker, filterAuthor }) => {
  return configurations.filter(config => {
    if (filterDate) {
      const configDate = new Date(config.createdAt);
      const configDateStr = configDate.toISOString().split('T')[0];
      if (configDateStr !== filterDate) return false;
    }
    
    if (filterTicker && !config.ticker?.toLowerCase().includes(filterTicker.toLowerCase())) {
      return false;
    }
    
    if (filterAuthor && !config.author?.toLowerCase().includes(filterAuthor.toLowerCase())) {
      return false;
    }
    
    return true;
  });
};
