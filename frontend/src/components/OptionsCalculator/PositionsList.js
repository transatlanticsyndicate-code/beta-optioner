import React from 'react';
import { Layers } from 'lucide-react';
import PositionItem from './PositionItem';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

/**
 * PositionsList - список всех позиций
 */
function PositionsList({ positions, onToggleVisibility, onDuplicate, onRemove, onUpdate, onClearAll }) {
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

      <CardContent className="space-y-3">
        {positions.map(position => (
          <PositionItem
            key={position.id}
            position={position}
            onToggleVisibility={onToggleVisibility}
            onDuplicate={onDuplicate}
            onRemove={onRemove}
            onUpdate={onUpdate}
          />
        ))}
      </CardContent>
    </Card>
  );
}

export default PositionsList;
