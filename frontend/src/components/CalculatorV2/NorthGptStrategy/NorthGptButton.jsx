/**
 * Кнопка «Стратегия СЕВЕР GPT» — открывает поп-ап ИИ-подбора через ChatGPT.
 *
 * Каркас как у «Севера», но сиреневый цвет и подбор делает ChatGPT, а не математика.
 * Лонг-позиция по активу не требуется: достаточно выбранного тикера с ценой.
 */

import React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '../../ui/button';

function NorthGptButton({ onClick, disabled = false }) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="h-8 text-white border-0 transition-all duration-200 hover:opacity-90 hover:scale-105 active:scale-95"
      style={{
        background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #7c3aed 100%)',
        boxShadow: disabled ? 'none' : '0 2px 8px rgba(168, 85, 247, 0.4)',
      }}
      title="Стратегия СЕВЕР GPT — подбор комбинации через ChatGPT к лонг-позиции по активу"
    >
      <Sparkles className="h-4 w-4 mr-1" />
      СЕВЕР GPT
    </Button>
  );
}

export default NorthGptButton;
