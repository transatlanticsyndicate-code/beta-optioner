/**
 * Демонстрация полей ввода
 * ЗАЧЕМ: Показать текстовые поля
 */

import React from 'react';
import { Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';

export function InputsShowcase() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Поля ввода</CardTitle>
        <CardDescription>Текстовые поля и формы</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="text">Текст</Label>
          <Input id="text" placeholder="Введите текст..." />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="example@email.com" />
        </div>
        <div>
          <Label htmlFor="search">Поиск</Label>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input id="search" className="pl-10" placeholder="Поиск..." />
          </div>
        </div>
        <div>
          <Label htmlFor="textarea">Текстовая область</Label>
          <Textarea id="textarea" placeholder="Многострочный текст..." rows={4} />
        </div>
      </CardContent>
    </Card>
  );
}
