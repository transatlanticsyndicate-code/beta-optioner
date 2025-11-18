import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

/**
 * StrategyPresets - компонент для быстрого создания опционных стратегий
 */
function StrategyPresets({ ticker, currentPrice, onApplyStrategy }) {
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [showInfo, setShowInfo] = useState(null);

  // Определение стратегий
  const strategies = {
    longCall: {
      name: 'Long Call',
      description: 'Покупка колл-опциона. Прибыль при росте цены.',
      risk: 'Ограниченный (премия)',
      reward: 'Неограниченный',
      positions: (price) => [
        {
          type: 'call',
          direction: 'buy',
          strike: Math.round(price * 1.02), // ATM +2%
          size: 1
        }
      ]
    },
    longPut: {
      name: 'Long Put',
      description: 'Покупка пут-опциона. Прибыль при падении цены.',
      risk: 'Ограниченный (премия)',
      reward: 'Высокий',
      positions: (price) => [
        {
          type: 'put',
          direction: 'buy',
          strike: Math.round(price * 0.98), // ATM -2%
          size: 1
        }
      ]
    },
    bullCallSpread: {
      name: 'Bull Call Spread',
      description: 'Покупка колла + продажа колла выше. Умеренная прибыль при росте.',
      risk: 'Ограниченный',
      reward: 'Ограниченный',
      positions: (price) => [
        {
          type: 'call',
          direction: 'buy',
          strike: Math.round(price),
          size: 1
        },
        {
          type: 'call',
          direction: 'sell',
          strike: Math.round(price * 1.05),
          size: 1
        }
      ]
    },
    bearPutSpread: {
      name: 'Bear Put Spread',
      description: 'Покупка пута + продажа пута ниже. Умеренная прибыль при падении.',
      risk: 'Ограниченный',
      reward: 'Ограниченный',
      positions: (price) => [
        {
          type: 'put',
          direction: 'buy',
          strike: Math.round(price),
          size: 1
        },
        {
          type: 'put',
          direction: 'sell',
          strike: Math.round(price * 0.95),
          size: 1
        }
      ]
    },
    straddle: {
      name: 'Long Straddle',
      description: 'Покупка колла и пута ATM. Прибыль при сильном движении в любую сторону.',
      risk: 'Ограниченный (2 премии)',
      reward: 'Высокий',
      positions: (price) => [
        {
          type: 'call',
          direction: 'buy',
          strike: Math.round(price),
          size: 1
        },
        {
          type: 'put',
          direction: 'buy',
          strike: Math.round(price),
          size: 1
        }
      ]
    },
    strangle: {
      name: 'Long Strangle',
      description: 'Покупка OTM колла и пута. Дешевле стрэддла, нужно большее движение.',
      risk: 'Ограниченный (2 премии)',
      reward: 'Высокий',
      positions: (price) => [
        {
          type: 'call',
          direction: 'buy',
          strike: Math.round(price * 1.05),
          size: 1
        },
        {
          type: 'put',
          direction: 'buy',
          strike: Math.round(price * 0.95),
          size: 1
        }
      ]
    },
    ironCondor: {
      name: 'Iron Condor',
      description: 'Продажа стрэнгла + покупка дальних опционов. Прибыль в диапазоне.',
      risk: 'Ограниченный',
      reward: 'Ограниченный',
      positions: (price) => [
        // Sell strangle
        {
          type: 'put',
          direction: 'sell',
          strike: Math.round(price * 0.95),
          size: 1
        },
        {
          type: 'call',
          direction: 'sell',
          strike: Math.round(price * 1.05),
          size: 1
        },
        // Buy wings
        {
          type: 'put',
          direction: 'buy',
          strike: Math.round(price * 0.90),
          size: 1
        },
        {
          type: 'call',
          direction: 'buy',
          strike: Math.round(price * 1.10),
          size: 1
        }
      ]
    },
    butterfly: {
      name: 'Butterfly Spread',
      description: 'Покупка 2 ATM + продажа 1 выше и 1 ниже. Прибыль если цена не движется.',
      risk: 'Ограниченный',
      reward: 'Ограниченный',
      positions: (price) => [
        {
          type: 'call',
          direction: 'buy',
          strike: Math.round(price * 0.95),
          size: 1
        },
        {
          type: 'call',
          direction: 'sell',
          strike: Math.round(price),
          size: 2
        },
        {
          type: 'call',
          direction: 'buy',
          strike: Math.round(price * 1.05),
          size: 1
        }
      ]
    }
  };

  const handleApplyStrategy = () => {
    if (!selectedStrategy || !currentPrice) return;

    const strategy = strategies[selectedStrategy];
    const positions = strategy.positions(currentPrice.price);

    onApplyStrategy(positions);
    setSelectedStrategy('');
  };

  if (!ticker || !currentPrice) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Quick Strategies
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Strategy Selector */}
        <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
          <SelectTrigger>
            <SelectValue placeholder="Select Strategy..." />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(strategies).map(([key, strategy]) => (
              <SelectItem key={key} value={key}>
                {strategy.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Strategy Info */}
        {selectedStrategy && strategies[selectedStrategy] && (
          <div className="bg-muted rounded-lg p-4 space-y-3">
            <p className="text-sm">{strategies[selectedStrategy].description}</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                Risk: {strategies[selectedStrategy].risk}
              </Badge>
              <Badge variant="secondary">
                Reward: {strategies[selectedStrategy].reward}
              </Badge>
              <Badge variant="outline">
                {strategies[selectedStrategy].positions(currentPrice.price).length} positions
              </Badge>
            </div>
          </div>
        )}

        {/* Apply Button */}
        <Button
          onClick={handleApplyStrategy}
          disabled={!selectedStrategy}
          className="w-full"
          variant="default"
        >
          <Zap className="h-4 w-4 mr-2" />
          Apply Strategy
        </Button>
      </CardContent>
    </Card>
  );
}

export default StrategyPresets;
