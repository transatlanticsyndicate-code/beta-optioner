import React from 'react';
import { Layers } from 'lucide-react';
import PositionItemTable from './PositionItemTable';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

/**
 * PositionsListTable - табличный список всех позиций
 */
function PositionsListTable({ positions, onToggleVisibility, onDuplicate, onRemove, onUpdate, onClearAll }) {
  if (positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Positions
            <Badge variant="secondary" className="ml-2">0</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-2">Нет позиций</p>
            <p className="text-sm text-muted-foreground/70">Добавьте первую позицию используя форму выше</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Positions
            <Badge variant="secondary" className="ml-2">{positions.length}</Badge>
          </CardTitle>
          <Button
            onClick={onClearAll}
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
          >
            Clear All
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground w-8"></th>
                <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground">B/S</th>
                <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground">Type</th>
                <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground">Strike</th>
                <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground">Exp</th>
                <th className="px-2 py-2 text-center font-medium text-xs text-muted-foreground">Qty</th>
                <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground">Price</th>
                <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground">Total</th>
                <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground">Comm</th>
                <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground">Net</th>
                <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {positions.map(position => (
                <PositionItemTable
                  key={position.id}
                  position={position}
                  onToggleVisibility={onToggleVisibility}
                  onDuplicate={onDuplicate}
                  onRemove={onRemove}
                  onUpdate={onUpdate}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default PositionsListTable;
