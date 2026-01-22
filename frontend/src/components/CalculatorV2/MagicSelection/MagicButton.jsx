/**
 * Компонент "Волшебная кнопка" для автоматического подбора опционов
 * ЗАЧЕМ: Предоставляет быстрый доступ к интеллектуальному подбору опционов
 * Затрагивает: калькулятор опционов, модальное окно подбора
 */

import React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '../../ui/button';

/**
 * Кнопка с градиентом от сиреневого к фиолетовому
 * @param {function} onClick - Обработчик клика
 * @param {boolean} disabled - Состояние блокировки
 */
function MagicButton({ onClick, disabled = false }) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="h-8 text-white border-0 transition-all duration-200 hover:opacity-90 hover:scale-105 active:scale-95"
      style={{
        background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 50%, #6d28d9 100%)',
        boxShadow: disabled ? 'none' : '0 2px 8px rgba(139, 92, 246, 0.4)',
      }}
      title="Волшебный подбор опционов"
    >
      <Sparkles className="h-4 w-4" />
    </Button>
  );
}

export default MagicButton;
