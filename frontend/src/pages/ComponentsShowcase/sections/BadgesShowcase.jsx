/**
 * Демонстрация значков
 * ЗАЧЕМ: Показать метки статуса
 */

import React from 'react';
import { Star, Heart } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Separator } from '../../../components/ui/separator';

export function BadgesShowcase() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Значки</CardTitle>
        <CardDescription>Метки статуса и категории</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-semibold text-sm mb-3">Базовые</h4>
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </div>
        <Separator />
        <div>
          <h4 className="font-semibold text-sm mb-3">Статусы</h4>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-green-600">Активен</Badge>
            <Badge className="bg-yellow-600">Ожидание</Badge>
            <Badge className="bg-blue-600">В процессе</Badge>
          </div>
        </div>
        <Separator />
        <div>
          <h4 className="font-semibold text-sm mb-3">С иконками</h4>
          <div className="flex flex-wrap gap-2">
            <Badge><Star className="mr-1 h-3 w-3" />Избранное</Badge>
            <Badge variant="secondary"><Heart className="mr-1 h-3 w-3" />Нравится</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
