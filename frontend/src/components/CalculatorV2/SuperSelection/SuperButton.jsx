/**
 * Компонент "Супер кнопка" для запуска Супер подбора опционов
 * ЗАЧЕМ: Предоставляет доступ к расширенному алгоритму подбора опционов
 * Затрагивает: калькулятор опционов, модальное окно Супер подбора
 */

import React from 'react';
import { Gem } from 'lucide-react';
import { Button } from '../../ui/button';

/**
 * Кнопка с градиентом драгоценного камня (голубой-синий)
 * @param {function} onClick - Обработчик клика
 * @param {boolean} disabled - Состояние блокировки
 */
function SuperButton({ onClick, disabled = false }) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="h-8 text-white border-0 transition-all duration-200 hover:opacity-90 hover:scale-105 active:scale-95"
      style={{
        background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #0e7490 100%)',
        boxShadow: disabled ? 'none' : '0 2px 8px rgba(8, 145, 178, 0.4)',
      }}
      title="Супер подбор опционов"
    >
      <Gem className="h-4 w-4" />
    </Button>
  );
}

export default SuperButton;
