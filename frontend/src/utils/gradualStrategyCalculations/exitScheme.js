/**
 * Парсинг и валидация схемы выхода
 * ЗАЧЕМ: Обработка пользовательского ввода схемы выхода
 */

export const parseExitScheme = (input) => {
  if (!input || typeof input !== 'string') return null;
  
  const groups = input
    .replace(/\s/g, '')
    .split(/[,+]/)
    .map(num => parseInt(num, 10))
    .filter(num => !isNaN(num) && num > 0);
  
  return groups.length > 0 ? groups : null;
};

export const validateExitScheme = (groups, totalContracts) => {
  if (!groups || !Array.isArray(groups) || groups.length === 0) {
    return { isValid: false, error: 'Схема выхода не указана' };
  }
  
  const sum = groups.reduce((acc, g) => acc + g, 0);
  
  if (sum !== totalContracts) {
    return { 
      isValid: false, 
      error: `Сумма контрактов (${sum}) не равна общему количеству (${totalContracts})` 
    };
  }
  
  return { isValid: true, error: null };
};
