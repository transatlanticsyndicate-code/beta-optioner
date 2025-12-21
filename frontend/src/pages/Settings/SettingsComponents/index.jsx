/**
 * SettingsComponents - демонстрация UI компонентов
 * ЗАЧЕМ: Показать все доступные компоненты интерфейса
 * Затрагивает: дизайн-система, UI библиотека
 */

import React from 'react';
import { ButtonsSection, InputsSection, BadgesSection } from './sections';

function SettingsComponents() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Компоненты UI</h2>
        <p className="text-muted-foreground mt-1">Полная библиотека компонентов для разработки интерфейса</p>
      </div>
      <ButtonsSection />
      <InputsSection />
      <BadgesSection />
    </div>
  );
}

export default SettingsComponents;
