/**
 * Секция полей ввода
 * ЗАЧЕМ: Демонстрация текстовых полей
 */

import React from 'react';
import { Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/textarea';

export function InputsSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Поля ввода</CardTitle>
        <CardDescription>Текстовые поля и формы</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="text-input">Текстовое поле</Label>
            <Input id="text-input" placeholder="Введите текст..." />
          </div>
          <div>
            <Label htmlFor="email-input">Email</Label>
            <Input id="email-input" type="email" placeholder="example@email.com" />
          </div>
          <div>
            <Label htmlFor="password-input">Пароль</Label>
            <Input id="password-input" type="password" placeholder="••••••••" />
          </div>
          <div>
            <Label htmlFor="search-input">Поиск</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input id="search-input" className="pl-10" placeholder="Поиск..." />
            </div>
          </div>
          <div>
            <Label htmlFor="textarea">Текстовая область</Label>
            <Textarea id="textarea" placeholder="Введите многострочный текст..." rows={4} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
