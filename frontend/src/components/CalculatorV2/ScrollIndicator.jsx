import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Индикатор скролла (стрелка влево или вправо)
 * 
 * @param {Object} props
 * @param {'left'|'right'} props.direction - направление стрелки
 * @param {Function} props.onClick - обработчик клика
 * @param {boolean} props.visible - видимость индикатора
 */
export function ScrollIndicator({ direction, onClick, visible }) {
  if (!visible) return null;

  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
  const positionClass = direction === 'left' ? 'left-0' : 'right-0';

  return (
    <button
      onClick={onClick}
      className={`
        scroll-indicator
        absolute ${positionClass} top-1/2 -translate-y-1/2 z-10
        bg-white rounded-full shadow-lg
        p-2
        hover:bg-gray-50 active:bg-gray-100
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
      `}
      aria-label={direction === 'left' ? 'Скроллить влево' : 'Скроллить вправо'}
    >
      <Icon className="w-5 h-5 text-gray-700" />
    </button>
  );
}
