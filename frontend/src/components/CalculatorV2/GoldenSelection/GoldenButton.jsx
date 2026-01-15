/**
 * Компонент "Золотая кнопка" для автоматического подбора опционов
 * ЗАЧЕМ: Альтернативный алгоритм подбора опционов
 */

import React from 'react';
import { Crown } from 'lucide-react';
import { Button } from '../../ui/button';

/**
 * Кнопка с золотым градиентом
 * @param {function} onClick - Обработчик клика
 * @param {boolean} disabled - Состояние блокировки
 */
function GoldenButton({ onClick, disabled = false }) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="h-8 text-white border-0 transition-all duration-200 hover:opacity-90 hover:scale-105"
      style={{
        background: 'linear-gradient(135deg, #facc15 0%, #eab308 50%, #ca8a04 100%)',
        boxShadow: disabled ? 'none' : '0 2px 8px rgba(234, 179, 8, 0.4)',
      }}
      title="Золотой подбор опционов"
    >
      <Crown className="h-4 w-4" />
    </Button>
  );
}

export default GoldenButton;
