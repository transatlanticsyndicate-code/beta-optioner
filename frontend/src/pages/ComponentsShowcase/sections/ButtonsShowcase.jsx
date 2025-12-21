/**
 * Демонстрация кнопок
 * ЗАЧЕМ: Показать все варианты кнопок
 */

import React from 'react';
import { Mail, Plus } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Separator } from '../../../components/ui/separator';

export function ButtonsShowcase() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Кнопки</CardTitle>
        <CardDescription>Различные варианты и размеры кнопок</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Варианты</h4>
          <div className="flex flex-wrap gap-3">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </div>
        </div>
        <Separator />
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Размеры</h4>
          <div className="flex flex-wrap gap-3 items-center">
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">Large</Button>
          </div>
        </div>
        <Separator />
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">С иконками</h4>
          <div className="flex flex-wrap gap-3">
            <Button><Mail className="mr-2 h-4 w-4" />Email</Button>
            <Button><Plus className="mr-2 h-4 w-4" />Добавить</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
