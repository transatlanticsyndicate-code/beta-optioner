import { Asset, Config, State, GlobalStats, ScenarioConfig, SortOrder } from './types';
import Decimal from 'decimal.js';

/**
 * Класс PositionService инкапсулирует всю бизнес-логику расчетов приложения.
 * Использует decimal.js для обеспечения высокой точности финансовых вычислений.
 */
export class PositionService {
    /**
     * Calculates specific step values (a, b, c, d) based on user formula
     */
    static getStepValues(sc: ScenarioConfig): number[] {
        const s = new Decimal(sc.base);

        const a = s.div(100).times(sc.percents[0]).toDecimalPlaces(0);
        const b = s.minus(a).div(100).times(sc.percents[1]).toDecimalPlaces(0);
        const c = s.minus(a).minus(b).div(100).times(sc.percents[2]).toDecimalPlaces(0);
        const d = s.minus(a).minus(b).minus(c).div(100).times(sc.percents[3]).toDecimalPlaces(0);

        return [
            s.toNumber(),
            a.toNumber(),
            b.toNumber(),
            c.toNumber(),
            d.toNumber()
        ];
    }

    /**
     * Calculates "Сумма остатка" based on active steps
     */
    static calculateRemainingSum(asset: Asset, config: Config): number {
        // If orders are placed, we assume full amount is yet to be bought, so current remaining "holdings" logic might differ.
        // Based on requirements: if orders checked -> it contributes to "Add Purchase".
        // Does it contribute to "Remaining Sum"? Typically "Remaining Sum" implies "What is left to reach target from CURRENT state".
        // If we haven't bought anything (orders checked), then we technically have 0 "held" in the context of this step flow, OR we have full amount to buy.
        // User request: "If checkbox in orders column is checked... value appears in Add Purchase... make it fall into sum column".
        // Previous logic for Add Purchase: if orders -> return Base.
        // Previous logic for Remaining Sum: if steps...

        const sc = config.scenarios[asset.scenario];
        if (!sc) return 0;

        // Если отмечен чекбокс ордера, возвращаем полную сумму сценария в остаток,
        // НО ТОЛЬКО если актив включен (зеленый чекбокс)
        if (asset.orders) {
            return asset.isActive ? sc.base : 0;
        }

        const s = new Decimal(sc.base);
        const a = s.div(100).times(sc.percents[0]).toDecimalPlaces(0);
        const b = s.minus(a).div(100).times(sc.percents[1]).toDecimalPlaces(0);
        const c = s.minus(a).minus(b).div(100).times(sc.percents[2]).toDecimalPlaces(0);

        if (asset.steps[3]) return 0;
        if (asset.steps[2]) return Decimal.max(0, s.minus(a).minus(b).minus(c)).toNumber();
        if (asset.steps[1]) return Decimal.max(0, s.minus(a).minus(b)).toNumber();
        if (asset.steps[0]) return Decimal.max(0, s.minus(a)).toNumber();

        return s.toNumber();
    }

    /**
     * Calculates "Сумма дозакупки" (Sum of additional purchases)
     */
    static calculateAddPurchase(asset: Asset, config: Config): number {
        const sc = config.scenarios[asset.scenario];
        if (!sc) return 0;

        // If Orders is checked, return the full scenario base value
        if (asset.orders) {
            return sc.base;
        }

        const base = new Decimal(sc.base);
        const remaining = new Decimal(this.calculateRemainingSum(asset, config));

        return base.minus(remaining).toNumber();
    }

    /**
     * Вычисляет агрегированную глобальную статистику по всему состоянию приложения.
     * @param state Текущее состояние
     */
    static calculateGlobalStats(state: State): GlobalStats {
        // Include asset if it is explicitly active OR if "Orders" is checked
        const activeAssets = state.assets.filter(a => a.isActive || a.orders);

        // Strictly active assets (green checkbox) for "Positions" count
        const strictlyActiveAssets = state.assets.filter(a => a.isActive);

        const totalRemaining = activeAssets.reduce(
            (sum, a) => sum.plus(this.calculateRemainingSum(a, state.config)),
            new Decimal(0)
        );

        const totalAdd = activeAssets.reduce(
            (sum, a) => sum.plus(this.calculateAddPurchase(a, state.config)),
            new Decimal(0)
        );

        const deposit = new Decimal(state.deposit);
        const percentUsed = deposit.isZero() ? new Decimal(0) : totalRemaining.div(deposit).times(100);

        const scenarioCounts: Record<number, number> = {};
        // Initialize counts for configured scenarios
        Object.keys(state.config.scenarios).forEach(key => {
            scenarioCounts[Number(key)] = 0;
        });

        activeAssets.forEach(asset => {
            const s = asset.scenario;
            if (scenarioCounts[s] === undefined) scenarioCounts[s] = 0;
            scenarioCounts[s]++;
        });

        return {
            totalRemaining: totalRemaining.toNumber(),
            totalAdd: totalAdd.toNumber(),
            percentUsed: percentUsed.toNumber(),
            activePositionsCount: strictlyActiveAssets.length,
            scenarioCounts,
            totalAssetsCount: state.assets.length,
            lastUpdated: new Date()
        };
    }

    /**
     * Сортирует список активов в соответствии с выбранным порядком.
     * @param assets Исходный массив активов
     * @param order Тип сортировки
     * @param rankings Текущие рейтинги (опционально)
     */
    static sortAssets(assets: Asset[], order: SortOrder, rankings: Record<string, number> = {}): Asset[] {
        const sorted = [...assets];

        switch (order) {
            case 'asc':
                return sorted.sort((a, b) => a.name.localeCompare(b.name));
            case 'desc':
                return sorted.sort((a, b) => b.name.localeCompare(a.name));
            case 'rankAsc':
                return sorted.sort((a, b) => {
                    const rA = rankings[a.name] ?? Infinity;
                    const rB = rankings[b.name] ?? Infinity;
                    return rA - rB;
                });
            case 'rankDesc':
                return sorted.sort((a, b) => {
                    const rA = rankings[a.name] ?? -Infinity;
                    const rB = rankings[b.name] ?? -Infinity;
                    return rB - rA;
                });
            case 'ordersAsc':
                return sorted.sort((a, b) => (Number(a.orders || 0) - Number(b.orders || 0)));
            case 'ordersDesc':
                return sorted.sort((a, b) => (Number(b.orders || 0) - Number(a.orders || 0)));
            case 'newest':
            default:
                // Newest first is the default order
                return sorted;
        }
    }


}
