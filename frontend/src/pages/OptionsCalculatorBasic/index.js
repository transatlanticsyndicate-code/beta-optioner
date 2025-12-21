/**
 * Централизованные экспорты модуля OptionsCalculatorBasic
 * ЗАЧЕМ: Удобный импорт всех утилит и компонентов из одного места
 */

export * from './constants';
export * from './utils';
export * from './calculations';
export { useCalculatorState } from './hooks/useCalculatorState';

// Дефолтный экспорт основного компонента
// Пока импортируем из старого файла, позже заменим
export { default } from '../OptionsCalculatorBasic.jsx';
