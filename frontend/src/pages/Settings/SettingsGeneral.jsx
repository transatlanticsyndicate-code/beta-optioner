import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';

function SettingsGeneral() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Общие настройки</h2>
        <p className="text-muted-foreground mt-1">Основные параметры приложения</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Раздел в разработке</CardTitle>
          <CardDescription>
            Здесь будут размещены основные настройки приложения
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Контент будет добавлен позже
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default SettingsGeneral;
