/**
 * Кнопка "Стратегия СЕВЕР" — открывает поп-ап подбора пары Buy Call + Buy Put.
 * Появляется когда есть LONG-позиция по БА и нет ни одного опциона.
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
      title="Стратегия СЕВЕР"
    >
      <Snowflake className="h-4 w-4 mr-1" />
      СЕВЕР
    </Button>
  );
}

export default NorthButton;
