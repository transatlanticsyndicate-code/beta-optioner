/**
 * Красная иконка закрытого замочка для зафиксированных позиций
 * ЗАЧЕМ: Визуальный индикатор того, что позиции зафиксированы и не редактируются
 */
import React from 'react';

const LockIcon = ({ className = '', size = 16 }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    width={size} 
    height={size}
    className={className}
  >
    {/* Тело замка и дужка */}
    <path 
      fill="#FF0000" 
      d="M18 10V6c0-3.31-2.69-6-6-6S6 2.69 6 6v4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V12c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm4-9H8V6c0-2.21 1.79-4 4-4s4 1.79 4 4v4z"
    />
  </svg>
);

export default LockIcon;
