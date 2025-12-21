/**
 * Компонент состояния ошибки
 * ЗАЧЕМ: Отображение сообщения об ошибке с кнопкой возврата
 * Затрагивает: UI состояния ошибки
 */

import React from 'react';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';

export function ErrorState({ error, onBack }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="p-8 max-w-md">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Ошибка</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button onClick={onBack}>
            Вернуться к анализатору
          </Button>
        </div>
      </Card>
    </div>
  );
}
