import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Хук для управления индикаторами горизонтального скролла
 * 
 * @returns {Object} - объект с состояниями и функциями
 * @returns {boolean} canScrollLeft - можно ли скроллить влево
 * @returns {boolean} canScrollRight - можно ли скроллить вправо
 * @returns {Function} scrollLeft - функция скролла влево
 * @returns {Function} scrollRight - функция скролла вправо
 * @returns {React.RefObject} scrollRef - ref для контейнера скролла
 */
export function useScrollIndicators() {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  /**
   * Проверяет, можно ли скроллить в каждом направлении
   */
  const checkScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const { scrollLeft, scrollWidth, clientWidth } = element;
    
    // Можно скроллить влево, если scrollLeft > 0
    setCanScrollLeft(scrollLeft > 0);
    
    // Можно скроллить вправо, если не достигнут конец
    // Добавляем небольшой порог (1px) для учета погрешностей округления
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  /**
   * Скролл влево на ширину контейнера
   */
  const scrollLeft = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const scrollAmount = element.clientWidth * 0.8; // Скроллим на 80% ширины
    element.scrollBy({
      left: -scrollAmount,
      behavior: 'smooth'
    });
  }, []);

  /**
   * Скролл вправо на ширину контейнера
   */
  const scrollRight = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const scrollAmount = element.clientWidth * 0.8; // Скроллим на 80% ширины
    element.scrollBy({
      left: scrollAmount,
      behavior: 'smooth'
    });
  }, []);

  /**
   * Эффект для отслеживания скролла и изменения размера окна
   */
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    // Проверяем при монтировании
    checkScroll();

    // Слушаем события скролла
    element.addEventListener('scroll', checkScroll);
    
    // Слушаем изменение размера окна
    window.addEventListener('resize', checkScroll);

    // Используем ResizeObserver для отслеживания изменения размера контейнера
    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
      resizeObserver.disconnect();
    };
  }, [checkScroll]);

  return {
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    scrollRight,
    scrollRef
  };
}
