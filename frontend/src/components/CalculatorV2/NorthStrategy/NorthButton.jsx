/**
 * Кнопка «Стратегия СЕВЕР» — открывает поп-ап подбора пары Buy Call + Buy Put.
 *
 * v2: одна кнопка с динамическим названием, режим определяется наличием позиции БА:
 *   - есть позиция → «СЕВЕР актив + опционы», режим WITH_STOCK
 *   - нет позиции → «СЕВЕР только опционы»,   режим OPTIONS_ONLY
 *
 * Сам режим определяется снаружи; компонент только показывает нужный текст.
 */

import React from 'react';
import { Snowflake } from 'lucide-react';
import { Button } from '../../ui/button';
import { NORTH_MODES } from '../../../utils/northStrategy/analyzer';

function NorthButton({ onClick, disabled = false, mode = NORTH_MODES.WITH_STOCK }) {
  const label = mode === NORTH_MODES.OPTIONS_ONLY ? 'СЕВЕР только опционы' : 'СЕВЕР актив + опционы';
  const title = mode === NORTH_MODES.OPTIONS_ONLY
    ? 'Стратегия СЕВЕР — подбор пары Buy Call + Buy Put без базового актива'
    : 'Стратегия СЕВЕР — подбор пары Buy Call + Buy Put к лонг-позиции по активу';

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
      title={title}
    >
      <Snowflake className="h-4 w-4 mr-1" />
      {label}
    </Button>
  );
}

export default NorthButton;
