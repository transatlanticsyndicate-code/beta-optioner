import { WeeklyStatsEntry, WeeklyStatsState, FinancialState } from './types';
import { DateUtils } from './DateUtils';

export class WeeklyStatsService {

    public static getInitialData(): WeeklyStatsEntry[] {
        // Return empty initial data now that migration is complete
        return [];
    }

    /**
     * Calculates the sum of weekly profit for a given set of transactions.
     * Use case: Show profit for the selected filtered period.
     */
    static calculatePeriodProfit(transactions: WeeklyStatsEntry[]): number {
        const parseVal = (str: string) => parseFloat(str.replace(/[$\s]/g, '').replace(',', '.') || '0');
        return transactions.reduce((sum, t) => sum + parseVal(t.weeklyProfit), 0);
    }

    /**
     * Calculates the Accumulated Profit.
     * Logic: Last Weekly "Ready USDT" + "Ready EUR"(x1.1) + Sum of Financial "Profit Withdrawal"
     */
    static calculateAccumulatedProfit(weeklyState: WeeklyStatsState, financialState: FinancialState): number {
        // 1. Get Weekly Stats component: Last Row
        // Use a copy to avoid mutating state
        const weeklyTx = [...weeklyState.transactions].sort((a, b) => {
            const dateA = a.date.split('.').reverse().join('-');
            const dateB = b.date.split('.').reverse().join('-');
            return dateA.localeCompare(dateB);
        });

        const latestEntry = weeklyTx[weeklyTx.length - 1];
        let weeklyPart = 0;
        const ESTIMATED_EUR_RATE = 1.1;

        if (latestEntry) {
            const parseVal = (str: string) => parseFloat(str.replace(/[$\s€]/g, '').replace(',', '.') || '0');
            const usdt = parseVal(latestEntry.readyUSDT);
            const eur = parseVal(latestEntry.readyEUR);
            weeklyPart = usdt + (eur * ESTIMATED_EUR_RATE);
        }

        // 2. Get Financial Component
        const financialWithdrawals = (financialState?.transactions || [])
            .filter(t => t.category && t.category.toUpperCase().includes('ВЫВОД ПРИБЫЛИ'))
            .reduce((sum, t) => sum + t.amountUSD, 0);

        return weeklyPart + financialWithdrawals;
    }

    static createEntry(params: {
        date: string;
        weeklyProfit: string;
        portfolioLoss: string;
        positionsAmount: string;
        readyUSDT: string;
        readyEUR: string;
    }): WeeklyStatsEntry {
        const profitValue = parseFloat(params.weeklyProfit.replace(/[$\s]/g, '').replace(',', '.') || '0');
        const lossValue = parseFloat(params.portfolioLoss.replace(/[$\s]/g, '').replace(',', '.') || '0');
        const positionsValue = parseFloat(params.positionsAmount.replace(/[$\s]/g, '').replace(',', '.') || '0');
        let profitPercent = '-';
        let lossPercent = '-';

        if (!isNaN(profitValue) && !isNaN(positionsValue) && positionsValue > 0) {
            const percent = (profitValue / positionsValue) * 100;
            profitPercent = `${percent.toFixed(2)}%`;
        }

        if (!isNaN(lossValue) && !isNaN(positionsValue) && positionsValue > 0) {
            const percent = (lossValue / positionsValue) * 100;
            lossPercent = `${percent.toFixed(2)}%`;
        }

        const formatCurrency = (val: string, currency: '$' | '€') => {
            if (!val) return `${currency}0`;
            const num = parseFloat(val.replace(/[$\s€]/g, '').replace(',', '.') || '0');
            if (isNaN(num)) return `${currency}0`;
            // Format with spaces (ru-RU) and no decimals for integer parts unless huge
            return `${currency}${Math.round(num).toLocaleString('ru-RU').replace(',', '.')}`;
        };

        return {
            id: `manual-${Date.now()}`,
            date: params.date.split('-').reverse().join('.'), // Convert YYYY-MM-DD to DD.MM.YYYY
            weeklyProfit: formatCurrency(params.weeklyProfit, '$'),
            profitPercent: profitPercent,
            portfolioLoss: formatCurrency(params.portfolioLoss, '$'),
            lossPercent: lossPercent,
            positionsAmount: formatCurrency(params.positionsAmount, '$'),
            readyUSDT: formatCurrency(params.readyUSDT, '$'),
            readyEUR: formatCurrency(params.readyEUR, '€')
        };
    }

    static getFilteredTransactions(state: WeeklyStatsState): WeeklyStatsEntry[] {
        let transactions = [...state.transactions];

        // 1. Date Filter
        const dateFilter = state.dateFilterType || 'all';
        if (dateFilter !== 'all') {
            const { start, end } = DateUtils.getDateRange(dateFilter, state.customStartDate, state.customEndDate);

            if (start || end) {
                const startDate = start || '0000-00-00';
                const endDate = end || '9999-99-99';

                transactions = transactions.filter(t => {
                    // Convert DD.MM.YYYY to YYYY-MM-DD for comparison
                    const parts = t.date.split('.');
                    if (parts.length === 3) {
                        const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                        return isoDate >= startDate && isoDate <= endDate;
                    }
                    return true;
                });
            }
        }

        // Only sorting by date (DD.MM.YYYY)
        const order = state.sortOrder || 'asc'; // Default to oldest first (user request)
        const modifier = order === 'asc' ? 1 : -1;

        return transactions.sort((a, b) => {
            const dateA = a.date.split('.').reverse().join('-');
            const dateB = b.date.split('.').reverse().join('-');
            return dateA.localeCompare(dateB) * modifier;
        });
    }

    /**
     * Returns the latest entry from all transactions, ignoring filters.
     */
    static getLatestEntry(state: WeeklyStatsState): WeeklyStatsEntry | null {
        if (!state.transactions || state.transactions.length === 0) return null;

        // Sort copy by date ascending
        const sorted = [...state.transactions].sort((a, b) => {
            const dateA = a.date.split('.').reverse().join('-');
            const dateB = b.date.split('.').reverse().join('-');
            return dateA.localeCompare(dateB);
        });

        return sorted[sorted.length - 1];
    }

    // Deprecated methods kept as stubs if needed or removed
    static calculateStats() {
        return { totalBalance: 0, monthlyIncome: 0, monthlyExpense: 0 };
    }
}
