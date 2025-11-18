import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';

function SettingsMarketData() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Рыночные данные</h2>
        <p className="text-muted-foreground mt-1">Настройки источников и параметров рыночных данных</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Раздел в разработке</CardTitle>
          <CardDescription>
            Здесь будут размещены настройки рыночных данных
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

export default SettingsMarketData;
