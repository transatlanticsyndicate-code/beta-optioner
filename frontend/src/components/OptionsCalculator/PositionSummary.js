import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Target, DollarSign, Activity, BarChart3 } from 'lucide-react';
import { calculatePortfolioGreeks, calculateProbabilityOfProfit } from '../../utils/greeksCalculator';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';

/**
 * PositionSummary - сводка по позициям (Max Profit/Loss, Breakeven, Total Cost)
 */
function PositionSummary({ positions, currentPrice }) {
  const metrics = useMemo(() => {
    if (positions.length === 0 || !currentPrice) {
      return null;
    }

    // Диапазон цен для анализа (±30% от текущей цены)
    const priceRange = currentPrice.price * 0.30;
    const minPrice = currentPrice.price - priceRange;
    const maxPrice = currentPrice.price + priceRange;
    const step = (maxPrice - minPrice) / 100;

    let maxProfit = -Infinity;
    let maxLoss = Infinity;
    let maxProfitPrice = 0;
    let maxLossPrice = 0;
    const breakevenPoints = [];

    // Расчет P&L для каждой точки цены
    for (let price = minPrice; price <= maxPrice; price += step) {
      let totalPL = 0;

      positions.forEach(pos => {
        if (!pos.visible) return;

        const { type, strike, direction, size, price: premium, commission } = pos;
        let pl = 0;

        // Расчет P&L для опциона
        if (type === 'call') {
          const intrinsicValue = Math.max(0, price - strike);
          if (direction === 'buy') {
            pl = (intrinsicValue - premium) * size * 100 - commission * size;
          } else {
            pl = (premium - intrinsicValue) * size * 100 - commission * size;
          }
        } else { // put
          const intrinsicValue = Math.max(0, strike - price);
          if (direction === 'buy') {
            pl = (intrinsicValue - premium) * size * 100 - commission * size;
          } else {
            pl = (premium - intrinsicValue) * size * 100 - commission * size;
          }
        }

        totalPL += pl;
      });

      // Обновление max profit/loss
      if (totalPL > maxProfit) {
        maxProfit = totalPL;
        maxProfitPrice = price;
      }
      if (totalPL < maxLoss) {
        maxLoss = totalPL;
        maxLossPrice = price;
      }

      // Поиск breakeven points (где P&L пересекает 0)
      if (Math.abs(totalPL) < 50) { // Порог для определения breakeven
        breakevenPoints.push(price);
      }
    }

    // Убираем дубликаты breakeven points (оставляем только уникальные с разницей > 1%)
    const uniqueBreakevens = [];
    breakevenPoints.forEach(point => {
      if (!uniqueBreakevens.some(bp => Math.abs(bp - point) / point < 0.01)) {
        uniqueBreakevens.push(point);
      }
    });

    // Общая стоимость позиций
    const totalCost = positions.reduce((sum, pos) => {
      return sum + (pos.price * pos.size * 100 + pos.commission * pos.size);
    }, 0);

    // Общие комиссии
    const totalCommission = positions.reduce((sum, pos) => {
      return sum + (pos.commission * pos.size);
    }, 0);

    // Расчет Greeks и PoP
    const greeks = calculatePortfolioGreeks(positions, currentPrice);
    const pop = calculateProbabilityOfProfit(positions, currentPrice);

    return {
      maxProfit: maxProfit === -Infinity ? 0 : maxProfit,
      maxLoss: maxLoss === Infinity ? 0 : maxLoss,
      maxProfitPrice,
      maxLossPrice,
      breakevenPoints: uniqueBreakevens.sort((a, b) => a - b),
      totalCost,
      totalCommission,
      greeks,
      pop
    };
  }, [positions, currentPrice]);

  if (!metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Position Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Добавьте позиции для просмотра сводки
          </p>
        </CardContent>
      </Card>
    );
  }

  const { maxProfit, maxLoss, maxProfitPrice, maxLossPrice, breakevenPoints, totalCost, totalCommission, greeks, pop } = metrics;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Position Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Max Profit */}
          <div className="bg-muted rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              <span className="text-sm text-muted-foreground">Max Profit</span>
            </div>
            <div className="text-2xl font-bold text-green-500">
              ${maxProfit.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              at ${maxProfitPrice.toFixed(2)}
            </div>
          </div>

          {/* Max Loss */}
          <div className="bg-muted rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-5 h-5 text-red-500" />
              <span className="text-sm text-muted-foreground">Max Loss</span>
            </div>
            <div className="text-2xl font-bold text-red-500">
              ${maxLoss.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              at ${maxLossPrice.toFixed(2)}
            </div>
          </div>

          {/* Breakeven Points */}
          <div className="bg-muted rounded-lg p-4 md:col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Breakeven Points</span>
            </div>
            {breakevenPoints.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {breakevenPoints.map((point, index) => (
                  <Badge key={index} variant="secondary" className="text-yellow-600 font-semibold">
                    ${point.toFixed(2)}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Нет точек безубыточности</p>
            )}
          </div>

          {/* Total Cost */}
          <div className="bg-muted rounded-lg p-4">
            <div className="text-sm text-muted-foreground mb-1">Total Cost</div>
            <div className="text-xl font-bold">
              ${totalCost.toFixed(2)}
            </div>
          </div>

          {/* Total Commission */}
          <div className="bg-muted rounded-lg p-4">
            <div className="text-sm text-muted-foreground mb-1">Total Commission</div>
            <div className="text-xl font-bold">
              ${totalCommission.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Risk/Reward Ratio */}
        {maxProfit > 0 && Math.abs(maxLoss) > 0 && (
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Risk/Reward Ratio</span>
              <span className="font-semibold">
                1:{(maxProfit / Math.abs(maxLoss)).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Greeks */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Portfolio Greeks</h3>
          </div>
          
          {positions.length === 0 ? (
            <div className="bg-muted/50 rounded-lg p-6 text-center border-2 border-dashed border-muted-foreground/20">
              <Activity className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Добавьте опционные позиции для расчета Greeks
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Delta */}
              <div className="bg-muted rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Delta</div>
                <div className={`text-lg font-bold ${greeks.delta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {greeks.delta.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground/70 mt-1">Directional</div>
              </div>

              {/* Gamma */}
              <div className="bg-muted rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Gamma</div>
                <div className="text-lg font-bold text-purple-500">
                  {greeks.gamma.toFixed(4)}
                </div>
                <div className="text-xs text-muted-foreground/70 mt-1">Acceleration</div>
              </div>

              {/* Theta */}
              <div className="bg-muted rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Theta</div>
                <div className={`text-lg font-bold ${greeks.theta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {greeks.theta.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground/70 mt-1">Time Decay</div>
              </div>

              {/* Vega */}
              <div className="bg-muted rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Vega</div>
                <div className="text-lg font-bold text-orange-500">
                  {greeks.vega.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground/70 mt-1">Volatility</div>
              </div>
            </div>
          )}
        </div>

        {/* Probability of Profit */}
        <div className="bg-muted rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-muted-foreground">Probability of Profit (PoP)</span>
            <span className={`text-2xl font-bold ${pop >= 50 ? 'text-green-500' : 'text-red-500'}`}>
              {pop.toFixed(1)}%
            </span>
          </div>
          <Progress value={pop} className="h-2" />
          <p className="text-xs text-muted-foreground/70 mt-2">
            Упрощенный расчет на основе дельты портфеля
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default PositionSummary;
