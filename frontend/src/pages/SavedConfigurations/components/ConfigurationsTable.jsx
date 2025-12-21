/**
 * Таблица конфигураций
 * ЗАЧЕМ: Отображение списка сохраненных конфигураций
 */

import React from 'react';
import { ExternalLink, Trash2, Edit2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { formatDate, formatExpirationDate, formatOptions } from '../utils/formatters';

export function ConfigurationsTable({ configurations, onDelete, onEdit }) {
  if (configurations.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Нет сохраненных конфигураций</p>
        <p className="text-sm mt-2">Создайте конфигурацию в калькуляторе опционов</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Название</TableHead>
          <TableHead>Тикер</TableHead>
          <TableHead>Дата экспирации</TableHead>
          <TableHead>Опционы</TableHead>
          <TableHead>Автор</TableHead>
          <TableHead>Дата создания</TableHead>
          <TableHead className="text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {configurations.map((config) => (
          <TableRow key={config.id}>
            <TableCell className="font-medium">{config.name || 'Без названия'}</TableCell>
            <TableCell>{config.ticker || '—'}</TableCell>
            <TableCell>{formatExpirationDate(config.expirationDate)}</TableCell>
            <TableCell className="max-w-xs truncate">{formatOptions(config.positions)}</TableCell>
            <TableCell>{config.author || '—'}</TableCell>
            <TableCell>{formatDate(config.createdAt)}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onEdit(config.id)}
                  title="Редактировать"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Link to={`/tools/options-calculator?config=${config.id}`}>
                  <Button size="sm" variant="ghost" title="Открыть">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(config.id)}
                  className="text-destructive hover:text-destructive"
                  title="Удалить"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
