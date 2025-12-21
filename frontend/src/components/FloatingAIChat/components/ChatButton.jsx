/**
 * Плавающая кнопка открытия чата
 * ЗАЧЕМ: Доступ к AI-ассистенту
 */

import React from 'react';
import { Bot } from 'lucide-react';

export function ChatButton({ onClick, unreadCount }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group z-50"
      style={{ background: 'linear-gradient(to bottom right, rgb(27, 186, 207), rgb(147, 236, 248))' }}
      title="Открыть AI-ассистент (Cmd+K)"
    >
      <Bot className="w-7 h-7 text-white group-hover:scale-110 transition-transform" />
      {unreadCount > 0 && (
        <div className="absolute -top-1 -right-1 w-6 h-6 bg-destructive rounded-full flex items-center justify-center text-xs font-bold text-white">
          {unreadCount}
        </div>
      )}
      <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ backgroundColor: 'rgb(27, 186, 207)' }}></div>
    </button>
  );
}
