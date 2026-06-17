/**
 * ⚠️ УСТАРЕЛО (DEPRECATED) — классический математический «Север» отключён и НЕ
 * используется (заменён на «Север GPT»). Кнопка скрыта (canShowNorthButton = false).
 * Код не удалён. Не «чинить», не развивать и не возвращать без явной просьбы.
 *
 * Кнопка «Стратегия СЕВЕР» — открывает поп-ап подбора пары Buy Call + Buy Put.
 *
 * v2-corrected: одна кнопка, появляется только при наличии лонг-позиции БА.
 * Анализатор всегда гонит ОБА варианта (актив+опционы и только опционы)
 * на одной и той же введённой позиции и показывает оба результата.
 */

import React from 'react';
import { Snowflake } from 'lucide-react';
import { Button } from '../../ui/button';

function NorthButton({ onClick, disabled = false }) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="h-8 text-white border-0 transition-all duration-200 hover:opacity-90 hover:scale-105 active:scale-95"
      style={{
        background: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 50%, #0369a1 100%)',
        boxShadow: disabled ? 'none' : '0 2px 8px rgba(14, 165, 233, 0.4)',
      }}
      title="Стратегия СЕВЕР — подбор пары Buy Call + Buy Put к лонг-позиции по активу"
    >
      <Snowflake className="h-4 w-4 mr-1" />
      СЕВЕР
    </Button>
  );
}

export default NorthButton;
