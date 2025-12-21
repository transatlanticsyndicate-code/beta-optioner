/**
 * Утилиты получения контекста страницы
 * ЗАЧЕМ: Определение текущей страницы для AI
 */

export const getPageContext = () => {
  const path = window.location.pathname;
  const contexts = {
    '/tools/options-calculator': 'Пользователь находится на странице калькулятора опционов',
    '/tools/options-analyzer': 'Пользователь находится на странице анализатора опционов',
    '/': 'Пользователь находится на главной странице'
  };
  return contexts[path] || `Пользователь находится на странице: ${path}`;
};
