/**
 * Кнопка ИИ подбора опциона
 * ЗАЧЕМ: Предоставляет быстрый доступ к функции ИИ-подбора опционов
 * Затрагивает: панель инструментов калькулятора опционов
 */

import React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '../../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';

/**
 * Квадратная кнопка с градиентом для вызова ИИ подбора опциона
 * ЗАЧЕМ: Визуально выделяется среди других кнопок благодаря градиенту
 * @param {function} onClick - Обработчик клика
 * @param {boolean} disabled - Состояние недоступности
 */
function AIOptionSelectorButton({ onClick, disabled = false }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            onClick={onClick}
            disabled={disabled}
            className="h-8 w-8 p-0 text-white border-0 transition-all duration-200 hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            }}
          >
            <Sparkles className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Подбор опциона</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default AIOptionSelectorButton;
