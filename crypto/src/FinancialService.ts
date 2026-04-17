import { FinancialEntry, FinancialState } from './types';
import Decimal from 'decimal.js';

export interface FinancialStats {
    totalBalance: number;
    monthlyIncome: number;
    monthlyExpense: number;
}

import { DateUtils } from './DateUtils';

interface AnalyticsGroup {
    total: any;
    categories: Record<string, any>;
}

export class FinancialService {
    /**
     * Calculates statistics based on transactions.
     * Uses decimal.js for precision.
     */
    static calculateStats(allTransactions: FinancialEntry[], filteredTransactions: FinancialEntry[]): FinancialStats {
        let balance = new Decimal(0);
        let income = new Decimal(0);
        let expense = new Decimal(0);

        // Convert filtered IDs to a Set for O(1) lookup
        const filteredIds = new Set(filteredTransactions.map(t => t.id));

        allTransactions.forEach(t => {
            const amount = new Decimal(t.amountUSD);

            // Total balance calculation
            if (t.type === 'income') balance = balance.plus(amount);
            else balance = balance.minus(amount);

            // Month/Period stats for filtered subset
            if (filteredIds.has(t.id)) {
                if (t.type === 'income') income = income.plus(amount);
                else expense = expense.plus(amount);
            }
        });

        return {
            totalBalance: balance.toNumber(),
            monthlyIncome: income.toNumber(),
            monthlyExpense: expense.toNumber()
        };
    }

    static calculateDeposit(state: FinancialState): number {
        let inputTotal = new Decimal(0);
        let profitWithdrawTotal = new Decimal(0);

        state.transactions.forEach(t => {
            const cat = t.category.toUpperCase();
            if (cat.includes('ВВОД')) {
                inputTotal = inputTotal.plus(t.amountUSD);
            } else if (cat.includes('ВЫВОД СРЕДСТВ')) {
                profitWithdrawTotal = profitWithdrawTotal.plus(t.amountUSD);
            }
        });

        return Math.round(inputTotal.minus(profitWithdrawTotal).toNumber());
    }

    // Date methods delegated to DateUtils


    /**
     * Filters and sorts transactions.
     */
    static getFilteredTransactions(state: FinancialState): FinancialEntry[] {
        let transactions = [...state.transactions];

        // 1. Category Filter
        if (state.categoryFilter && state.categoryFilter.length > 0) {
            const allowedCategoryNames = new Set<string>();
            state.categoryFilter.forEach(id => {
                const cat = state.categories.find(c => c.id === id);
                if (cat) {
                    const type = state.types.find(t => t.id === cat.typeId);
                    const typeName = type ? type.name.toUpperCase() : 'UNKNOWN';
                    allowedCategoryNames.add(`${typeName} - ${cat.name}`);
                }
            });

            transactions = transactions.filter(t => allowedCategoryNames.has(t.category));
        }

        // 2. Date Filter
        const dateFilter = state.dateFilterType || 'all';
        if (dateFilter !== 'all') {
            const { start, end } = DateUtils.getDateRange(dateFilter, state.customStartDate, state.customEndDate);
            if (start || end) {
                const startDate = start || '0000-00-00';
                const endDate = end || '9999-99-99';

                transactions = transactions.filter(t => {
                    return t.date >= startDate && t.date <= endDate;
                });
            }
        }

        // Sort based on state preference
        const order = state.sortOrder || 'asc';
        const modifier = order === 'asc' ? 1 : -1;

        return transactions.sort((a, b) => {
            const dateDiff = a.date.localeCompare(b.date) * modifier;
            if (dateDiff !== 0) return dateDiff;
            // Secondary sort by ID (creation timestamp)
            return (parseInt(a.id) - parseInt(b.id)) * modifier;
        });
    }

    /**
     * Creates a new financial entry from raw input data.
     * Encapsulates all conversion and type detection logic.
     */
    static createEntry(params: {
        categoryId: string;
        dateStr: string;
        note: string;
        eurAmount?: string;
        eurRate?: string;
        usdAmount?: string;
        state: FinancialState;
    }): FinancialEntry | null {
        const category = params.state.categories.find(c => c.id === params.categoryId);
        if (!category) return null;

        const type = params.state.types.find(t => t.id === category.typeId);
        if (!type) return null;

        const date = params.dateStr;
        const description = params.note.trim();

        let amountUSD = new Decimal(0);
        let originalAmount: number | undefined = undefined;
        let originalCurrency: 'USD' | 'EUR' = 'USD';
        let exchangeRate: number | undefined = undefined;

        if (category.currency === 'EUR') {
            const eur = parseFloat(params.eurAmount || '0');
            const rate = parseFloat(params.eurRate || '0');
            if (isNaN(eur) || eur <= 0 || isNaN(rate) || rate <= 0) return null;

            originalAmount = eur;
            originalCurrency = 'EUR';
            exchangeRate = rate;
            amountUSD = new Decimal(eur).times(rate).toDecimalPlaces(2);
        } else {
            const usd = parseFloat(params.usdAmount || '0');
            if (isNaN(usd) || usd <= 0) return null;
            amountUSD = new Decimal(usd).toDecimalPlaces(2);
            originalCurrency = 'USD';
        }

        // Determine type (Income/Expense) using robust isIncome flag
        const isIncome = type.isIncome !== undefined
            ? type.isIncome
            : (type.name.toLowerCase().includes('ввод') || type.name.toLowerCase().includes('доход'));

        return {
            id: Date.now().toString(),
            date,
            type: isIncome ? 'income' : 'expense',
            category: `${type.name.toUpperCase()} - ${category.name}`,
            amountUSD: amountUSD.toNumber(),
            originalAmount,
            originalCurrency,
            exchangeRate,
            description
        };
    }

    static async fetchEurRate(): Promise<number> {
        try {
            const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=EURUSDT');
            if (res.ok) {
                const data = await res.json();
                return parseFloat(data.price);
            }
        } catch (e) { console.error('Binance rate fetch failed', e); }

        try {
            const res = await fetch('https://api.exchangerate-api.com/v4/latest/EUR');
            if (res.ok) {
                const data = await res.json();
                return data.rates.USD;
            }
        } catch (e) { console.error('Rate fetch failed', e); }

        return 0; // Return 0 to indicate failure, caller must handle
    }

    static calculateAnalytics(transactions: FinancialEntry[]): {
        type: string;
        total: number;
        categories: { name: string; total: number }[];
    }[] {
        const groups: Record<string, AnalyticsGroup> = {};

        transactions.forEach(t => {
            let typeName = 'UNKNOWN';
            let catName = 'Other';

            if (t.category.includes(' - ')) {
                const parts = t.category.split(' - ');
                typeName = parts[0];
                catName = parts.slice(1).join(' - ');
            } else {
                typeName = t.category;
            }

            if (!groups[typeName]) {
                groups[typeName] = { total: new Decimal(0), categories: {} };
            }

            const amount = new Decimal(t.amountUSD);
            const group = groups[typeName];

            group.total = group.total.plus(amount);

            if (!group.categories[catName]) {
                group.categories[catName] = new Decimal(0);
            }
            group.categories[catName] = group.categories[catName].plus(amount);
        });

        return Object.entries(groups).map(([typeName, data]) => {
            const categories = Object.entries(data.categories)
                .map(([name, total]) => ({ name, total: total.toNumber() }))
                .sort((a, b) => b.total - a.total);

            return {
                type: typeName,
                total: data.total.toNumber(),
                categories
            };
        }).sort((a, b) => b.total - a.total);
    }
}
