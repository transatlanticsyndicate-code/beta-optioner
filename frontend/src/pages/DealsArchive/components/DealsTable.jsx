/**
 * Таблица сделок
 * ЗАЧЕМ: Отображение списка сделок с возможностью редактирования и удаления
 * Затрагивает: основной интерфейс архива
 */

import React from 'react';
import { Archive, Trash2, Edit } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../components/ui/tooltip';
import { formatDate, formatDealType, formatStatus } from '../utils/formatters';

export function DealsTable({ deals, onEdit, onDelete }) {
  if (deals.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Archive className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg">Нет сделок, соответствующих фильтрам</p>
        <p className="text-sm mt-2">Попробуйте изменить параметры фильтрации</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Сохранено</TableHead>
            <TableHead className="w-20">Тикер</TableHead>
            <TableHead className="w-32">Тип</TableHead>
            <TableHead className="flex-1">Название</TableHead>
            <TableHead className="w-12">Статус</TableHead>
            <TableHead className="text-right w-24">Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deals.map((deal) => (
            <TableRow key={deal.id} className="hover:bg-gray-50">
              <TableCell className="font-mono text-sm text-gray-500">
                {formatDate(deal.createdAt)}
              </TableCell>
              <TableCell className="font-semibold">{deal.ticker}</TableCell>
              <TableCell>{formatDealType(deal.type)}</TableCell>
              <TableCell className="max-w-xs font-bold">
                <Button
                  variant="link"
                  className="p-0 h-auto text-left justify-start hover:underline"
                  onClick={() => onEdit(deal)}
                  title="Нажмите для редактирования сделки"
                >
                  <span className="block font-bold" title={deal.name}>{deal.name}</span>
                </Button>
              </TableCell>
              <TableCell>{formatStatus(deal.status)}</TableCell>
              <TableCell className="text-right">
                <div className="flex gap-1 justify-end">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(deal)}
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Редактировать сделку</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(deal.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Удалить сделку</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
