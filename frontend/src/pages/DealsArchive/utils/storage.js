/**
 * Утилиты работы с localStorage для сделок
 * ЗАЧЕМ: Загрузка и сохранение сделок
 * Затрагивает: персистентность данных
 */

// Загрузка сделок из localStorage
export const loadDeals = () => {
  try {
    const savedDeals = JSON.parse(localStorage.getItem('savedDeals') || '[]');
    console.log('✅ Загружено сделок из localStorage:', savedDeals.length);
    return savedDeals;
  } catch (error) {
    console.error('Ошибка загрузки сделок из localStorage:', error);
    return [];
  }
};

// Сохранение сделок в localStorage
export const saveDeals = (deals) => {
  try {
    localStorage.setItem('savedDeals', JSON.stringify(deals));
    console.log('✅ Сделки сохранены в localStorage');
    return true;
  } catch (error) {
    console.error('Ошибка сохранения сделок:', error);
    return false;
  }
};

// Удаление сделки
export const deleteDeal = (deals, id) => {
  const updated = deals.filter(deal => deal.id !== id);
  saveDeals(updated);
  return updated;
};
