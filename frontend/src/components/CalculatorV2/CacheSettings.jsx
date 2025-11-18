import React from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

function CacheSettings({ cacheTTLMinutes, onCacheTTLChange }) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="cache-ttl" className="text-sm font-medium">
          Кэшировать загружаемые данные на срок в минутах
        </Label>
        <Input
          id="cache-ttl"
          type="number"
          min="0"
          max="1440"
          value={cacheTTLMinutes}
          onChange={(e) => onCacheTTLChange(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-20 h-8 text-sm text-right"
          title="0 = не кэшировать, максимум 1440 минут (24 часа)"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {cacheTTLMinutes === 0 
          ? '⚠️ Кэширование отключено - данные загружаются всегда заново'
          : `✅ Данные кэшируются на ${cacheTTLMinutes} минут`
        }
      </p>
    </div>
  );
}

export default CacheSettings;
