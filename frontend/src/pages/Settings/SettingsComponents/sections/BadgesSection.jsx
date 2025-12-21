/**
 * Секция значков (badges)
 * ЗАЧЕМ: Демонстрация меток статуса
 */

import React from 'react';
import { Star, Heart, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';
import { Separator } from '../../../../components/ui/separator';

export function BadgesSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Значки (Badges)</CardTitle>
        <CardDescription>Метки статуса и категории</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm mb-3">Базовые варианты</h4>
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="outline">Outline</Badge>
            </div>
          </div>
          <Separator />
          <div>
            <h4 className="font-semibold text-sm mb-3">Со статусами</h4>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-green-600 hover:bg-green-700">Активен</Badge>
              <Badge className="bg-yellow-600 hover:bg-yellow-700">Ожидание</Badge>
              <Badge className="bg-blue-600 hover:bg-blue-700">В процессе</Badge>
              <Badge className="bg-gray-600 hover:bg-gray-700">Неактивен</Badge>
            </div>
          </div>
          <Separator />
          <div>
            <h4 className="font-semibold text-sm mb-3">С иконками</h4>
            <div className="flex flex-wrap gap-2">
              <Badge><Star className="mr-1 h-3 w-3" />Избранное</Badge>
              <Badge variant="secondary"><Heart className="mr-1 h-3 w-3" />Нравится</Badge>
              <Badge variant="destructive"><Trash2 className="mr-1 h-3 w-3" />Удалить</Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
