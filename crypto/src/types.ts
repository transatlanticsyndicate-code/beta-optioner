export interface ScenarioConfig {
    base: number;
    percents: number[];
}

export interface Config {
    scenarios: { [key: number]: ScenarioConfig };
}

export interface Asset {
    id: string;
    name: string;
    scenario: number;
    steps: boolean[]; // [Step 1, Step 2, Step 3, Step 4]
    isActive: boolean;
    isVerified: boolean;
    orders: boolean;
}



export interface GlobalStats {
    totalRemaining: number;
    totalAdd: number;
    percentUsed: number;
    activePositionsCount: number;
    scenarioCounts: Record<number, number>;
    totalAssetsCount: number;
    lastUpdated: Date;
}

export type SortOrder = 'asc' | 'desc' | 'newest' | 'rankAsc' | 'rankDesc' | 'ordersAsc' | 'ordersDesc';

// Financial Types
export type FinancialEntryType = 'income' | 'expense';

export enum FinancialActionType {
    ADD_TRANSACTION = 'ADD_TRANSACTION',
    DELETE_TRANSACTION = 'DELETE_TRANSACTION',
    UPDATE_SORT_ORDER = 'UPDATE_SORT_ORDER',
    UPDATE_CATEGORY_FILTER = 'UPDATE_CATEGORY_FILTER',
    UPDATE_DATE_FILTER_TYPE = 'UPDATE_DATE_FILTER_TYPE',
    UPDATE_CUSTOM_START_DATE = 'UPDATE_CUSTOM_START_DATE',
    UPDATE_CUSTOM_END_DATE = 'UPDATE_CUSTOM_END_DATE',
    ADD_FIN_TYPE = 'ADD_FIN_TYPE',
    DELETE_FIN_TYPE = 'DELETE_FIN_TYPE',
    UPDATE_FIN_TYPE = 'UPDATE_FIN_TYPE',
    ADD_FIN_CATEGORY = 'ADD_FIN_CATEGORY',
    DELETE_FIN_CATEGORY = 'DELETE_FIN_CATEGORY',
    UPDATE_FIN_CATEGORY = 'UPDATE_FIN_CATEGORY'
}

export interface FinancialType {
    id: string;
    name: string;
    isIncome?: boolean; // True if this type represents income, false for expense
}

export interface FinancialCategory {
    id: string;
    typeId: string; // ID of the FinancialType
    name: string; // The specific detail, e.g., "USDT - Revolut"
    currency: 'USD' | 'EUR'; // Default currency for this category
}

export interface FinancialEntry {
    id: string;
    date: string; // YYYY-MM-DD
    type: FinancialEntryType;
    category: string; // Combined "Type - Detail"
    amountUSD: number;
    originalAmount?: number; // If different from USD
    originalCurrency?: 'USD' | 'EUR';
    exchangeRate?: number;
    description: string; // "Примечание"
}

export type DateFilterType = 'all' | 'year' | 'last_year' | 'month' | 'last_month' | 'custom';

export interface FinancialState {
    transactions: FinancialEntry[];
    types: FinancialType[]; // Managed list of types
    categories: FinancialCategory[]; // Details linked to types
    categoryFilter: string[];
    dateFilterType?: DateFilterType;
    customStartDate?: string | null;
    customEndDate?: string | null;
    sortOrder: 'asc' | 'desc';
}

export interface State {
    deposit: number;
    assets: Asset[];
    config: Config;
    theme?: 'light' | 'dark';
    rankings: Record<string, number>;
    lastRankingsUpdate: number;
    cmcApiKey?: string;
    financial: FinancialState;
    weeklyStats: WeeklyStatsState;
}

// Weekly Stats Types (Mirrors Financial for now)
// Weekly Stats Types (Mirrors Financial for now)
export enum WeeklyStatsActionType {
    ADD_TRANSACTION = 'WEEKLY_ADD_TRANSACTION',
    UPDATE_TRANSACTION = 'WEEKLY_UPDATE_TRANSACTION',
    DELETE_TRANSACTION = 'WEEKLY_DELETE_TRANSACTION',
    UPDATE_SORT_ORDER = 'WEEKLY_UPDATE_SORT_ORDER',
    UPDATE_CATEGORY_FILTER = 'WEEKLY_UPDATE_CATEGORY_FILTER',
    UPDATE_DATE_FILTER_TYPE = 'WEEKLY_UPDATE_DATE_FILTER_TYPE',
    UPDATE_CUSTOM_START_DATE = 'WEEKLY_UPDATE_CUSTOM_START_DATE',
    UPDATE_CUSTOM_END_DATE = 'WEEKLY_UPDATE_CUSTOM_END_DATE',
    ADD_TYPE = 'WEEKLY_ADD_TYPE',
    DELETE_TYPE = 'WEEKLY_DELETE_TYPE',
    UPDATE_TYPE = 'WEEKLY_UPDATE_TYPE',
    ADD_CATEGORY = 'WEEKLY_ADD_CATEGORY',
    DELETE_CATEGORY = 'WEEKLY_DELETE_CATEGORY',
    UPDATE_CATEGORY = 'WEEKLY_UPDATE_CATEGORY'
}

export interface WeeklyStatsEntry {
    id: string;
    date: string; // "DD.MM.YYYY"
    weeklyProfit: string;
    profitPercent: string;
    portfolioLoss: string;
    lossPercent: string;
    positionsAmount: string;
    readyUSDT: string;
    readyEUR: string;
}

// Deprecated/Unused legacy types (kept as any to prevent build errors in other files temporarily)
export type WeeklyStatsType = any;
export type WeeklyStatsCategory = any;

export interface WeeklyStatsState {
    transactions: WeeklyStatsEntry[];
    // Legacy fields can be optional or removed if no longer referenced
    types: WeeklyStatsType[];
    categories: WeeklyStatsCategory[];
    categoryFilter: string[];
    dateFilterType?: DateFilterType;
    customStartDate?: string | null;
    customEndDate?: string | null;
    sortOrder: 'asc' | 'desc';
}


