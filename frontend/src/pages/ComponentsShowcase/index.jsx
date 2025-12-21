/**
 * ComponentsShowcase - демонстрация UI компонентов
 * ЗАЧЕМ: Показать все доступные компоненты Shadcn UI
 * Затрагивает: дизайн-система, UI библиотека
 */

import React, { useEffect } from 'react';
import { ButtonsShowcase, InputsShowcase, BadgesShowcase } from './sections';

const ComponentsShowcase = () => {
  useEffect(() => {
    document.title = 'Компоненты UI | SYNDICATE Platform';
    return () => { document.title = 'SYNDICATE Platform'; };
  }, []);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-12">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-foreground">Компоненты Shadcn UI</h1>
          <p className="text-lg text-muted-foreground">
            Полная библиотека компонентов для разработки интерфейса
          </p>
        </div>
        <ButtonsShowcase />
        <InputsShowcase />
        <BadgesShowcase />
      </div>
    </div>
  );
};

export default ComponentsShowcase;
