/**
 * Утилиты форматирования для конфигураций
 * ЗАЧЕМ: Форматирование дат, опционов и данных
 */

export const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatExpirationDate = (dateString) => {
  if (!dateString) return '—';
  const [year, month, day] = dateString.split('-');
  return `${day}.${month}.${year}`;
};

export const formatOptions = (options) => {
  if (!options || options.length === 0) return 'Нет опционов';
  
  return options
    .map(opt => {
      const action = opt.action === 'Buy' ? 'Buy' : 'Sell';
      return `${action}${opt.type} ${opt.strike}`;
    })
    .join(', ');
};
