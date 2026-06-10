import { Asset, Config, FinancialEntry, State } from './types';
import { WeeklyStatsService } from './WeeklyStatsService';
import { DEFAULT_CONFIG, DEFAULT_DEPOSIT } from './config';
import { INITIAL_ASSETS, INITIAL_FINANCIAL_CATEGORIES, INITIAL_FINANCIAL_TYPES } from './initialAssets';
import { loadState, saveState } from './lib/api';

/**
 * Класс Store управляет состоянием приложения, синхронизацией с LocalStorage и нашим backend.
 * Реализует паттерн Observable для уведомления подписчиков об изменениях.
 */
export class Store {
    private state: State = {
        deposit: DEFAULT_DEPOSIT,
        assets: INITIAL_ASSETS,
        config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
        rankings: {},
        lastRankingsUpdate: 0,
        cmcApiKey: '',
        financial: {
            transactions: [],
            types: INITIAL_FINANCIAL_TYPES,
            categories: INITIAL_FINANCIAL_CATEGORIES,
            categoryFilter: [],
            dateFilterType: 'all',
            customStartDate: null,
            customEndDate: null,
            sortOrder: 'asc'
        },
        weeklyStats: {
            transactions: WeeklyStatsService.getInitialData(),
            types: [],
            categories: [],
            categoryFilter: [],
            sortOrder: 'desc'
        }
    };

    private readonly STORAGE_KEY = 'crypto_manager_state_v7';
    private isSyncing = false;
    private debounceTimer: number | null = null;
    private onStateChange: (state: State) => void;


    // Safety metrics to prevent accidental data loss
    private lastValidCounts = {
        financial: 0,
        weekly: 0
    };

    /**
     * @param onStateChange Колбэк, вызываемый при любом изменении состояния
     */
    constructor(onStateChange: (state: State) => void) {
        this.onStateChange = onStateChange;
        this.loadLocalState();
    }

    /**
     * Возвращает текущую копию состояния (read-only по смыслу)
     */
    getState(): State {
        return this.state;
    }

    private validateState(data: unknown): data is State {
        if (!data || typeof data !== 'object') return false;
        const state = data as State;

        // Check required top-level fields
        if (typeof state.deposit !== 'number') return false;
        if (!Array.isArray(state.assets)) return false;
        if (!state.config || typeof state.config !== 'object' || !state.config.scenarios) return false;
        // Optional but if present should be valid
        if (state.rankings && typeof state.rankings !== 'object') return false;

        // Basic check for assets integrity
        for (const asset of state.assets) {
            if (!asset.id || !asset.name || typeof asset.scenario !== 'number' || !Array.isArray(asset.steps)) {
                return false;
            }
        }

        return true;
    }

    private loadLocalState() {
        // If we have a user, cloud loading is handled via loadFromCloud() called by Auth
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (this.validateState(parsed)) {
                    // We only use local state as a temporary cache while offline or before login 
                    this.state = {
                        ...parsed,
                        financial: {
                            transactions: (parsed.financial?.transactions || []).map((t: Partial<FinancialEntry> & { amount?: number }) => ({
                                id: t.id || Math.random().toString(36).substr(2, 9),
                                date: typeof t.date === 'number'
                                    ? new Date(t.date).toLocaleDateString('ru-RU').split('.').reverse().join('-') // Convert timestamp to YYYY-MM-DD
                                    : (t.date || new Date().toISOString().split('T')[0]),
                                amountUSD: t.amountUSD !== undefined ? t.amountUSD : (t.amount || 0),
                                type: t.type || 'expense',
                                category: t.category || 'Unknown',
                                originalAmount: t.originalAmount,
                                originalCurrency: t.originalCurrency,
                                exchangeRate: t.exchangeRate,
                                description: t.description || ''
                            } as FinancialEntry)),
                            types: parsed.financial?.types || INITIAL_FINANCIAL_TYPES,
                            categories: parsed.financial?.categories || INITIAL_FINANCIAL_CATEGORIES,
                            categoryFilter: Array.isArray(parsed.financial?.categoryFilter)
                                ? parsed.financial.categoryFilter
                                : (parsed.financial?.categoryFilter ? [parsed.financial.categoryFilter] : []),
                            dateFilterType: parsed.financial?.dateFilterType || 'all',
                            customStartDate: parsed.financial?.customStartDate || null,
                            customEndDate: parsed.financial?.customEndDate || null,
                            sortOrder: parsed.financial?.sortOrder || 'asc'
                        },
                        weeklyStats: {
                            transactions: (parsed.weeklyStats?.transactions && parsed.weeklyStats.transactions.length > 0)
                                ? parsed.weeklyStats.transactions
                                : WeeklyStatsService.getInitialData(),
                            types: parsed.weeklyStats?.types || [],
                            categories: parsed.weeklyStats?.categories || [],
                            categoryFilter: parsed.weeklyStats?.categoryFilter || [],
                            sortOrder: parsed.weeklyStats?.sortOrder || 'desc',
                            dateFilterType: parsed.weeklyStats?.dateFilterType || 'all',
                            customStartDate: parsed.weeklyStats?.customStartDate || null,
                            customEndDate: parsed.weeklyStats?.customEndDate || null
                        }
                    };
                    // Update safety counts
                    this.lastValidCounts.financial = this.state.financial.transactions.length;
                    this.lastValidCounts.weekly = this.state.weeklyStats.transactions.length;
                }
            } catch (e) { }
        }
        this.notify();
    }

    private saveLocalState() {
        // Always save to localStorage as cache (works offline)
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));

        // Always sync to cloud (debounced)
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = window.setTimeout(() => {
            this.saveToCloud();
            this.debounceTimer = null;
        }, 1000);
    }

    /**
     * Загружает данные из нашего облачного хранилища (backend beta, таблица crypto_app_state, id: global).
     */
    async loadFromCloud() {

        try {
            const content = await loadState();

            if (content) {
                if (this.validateState(content)) {
                    // Normalize/Migrate state
                    this.state = {
                        ...content,
                        financial: {
                            transactions: (content.financial?.transactions || []).map((t: Partial<FinancialEntry> & { amount?: number }) => ({
                                id: t.id || Math.random().toString(36).substr(2, 9),
                                type: t.type || 'expense',
                                category: t.category || 'Unknown',
                                amountUSD: t.amountUSD !== undefined ? t.amountUSD : (t.amount || 0),
                                date: typeof t.date === 'number'
                                    ? new Date(t.date).toLocaleDateString('ru-RU').split('.').reverse().join('-')
                                    : (t.date || new Date().toISOString().split('T')[0]),
                                originalAmount: t.originalAmount,
                                originalCurrency: t.originalCurrency || 'USD',
                                exchangeRate: t.exchangeRate,
                                description: t.description || ''
                            } as FinancialEntry)),
                            types: content.financial?.types || INITIAL_FINANCIAL_TYPES,
                            categories: content.financial?.categories || INITIAL_FINANCIAL_CATEGORIES,
                            categoryFilter: Array.isArray(content.financial?.categoryFilter)
                                ? content.financial.categoryFilter
                                : (content.financial?.categoryFilter ? [content.financial.categoryFilter] : []),
                            dateFilterType: content.financial?.dateFilterType || 'all',
                            customStartDate: content.financial?.customStartDate || null,
                            customEndDate: content.financial?.customEndDate || null,
                            sortOrder: content.financial?.sortOrder || 'asc'
                        },
                        weeklyStats: {
                            transactions: (content.weeklyStats?.transactions && content.weeklyStats.transactions.length > 0)
                                ? content.weeklyStats.transactions
                                : WeeklyStatsService.getInitialData(),
                            types: content.weeklyStats?.types || [],
                            categories: content.weeklyStats?.categories || [],
                            categoryFilter: content.weeklyStats?.categoryFilter || [],
                            sortOrder: content.weeklyStats?.sortOrder || 'desc',
                            dateFilterType: content.weeklyStats?.dateFilterType || 'all',
                            customStartDate: content.weeklyStats?.customStartDate || null,
                            customEndDate: content.weeklyStats?.customEndDate || null
                        }
                    };

                    // Update safety counts
                    this.lastValidCounts.financial = this.state.financial.transactions.length;
                    this.lastValidCounts.weekly = this.state.weeklyStats.transactions.length;

                    // Sync Cloud State to Local Storage (Cache)
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
                    this.notify();
                } else {
                    console.error('Invalid cloud state received');
                }
            } else {
                // Облачного состояния ещё нет — сохраняем текущее (дефолтное)
                this.saveToCloud();
            }
        } catch (e) {
            if ((e as Error).message === 'UNAUTHORIZED') throw e; // пусть Auth покажет экран пароля
            console.error('Error loading from cloud:', e);
        }
    }

    private async saveToCloud() {
        if (this.isSyncing) return;

        // Safety Check: Prevent saving if data count dropped significantly (e.g., to 0)
        // while we previously had data. This prevents empty states from overwriting cloud data.
        const currentFinancial = this.state.financial.transactions.length;
        const currentWeekly = this.state.weeklyStats.transactions.length;

        if (this.lastValidCounts.financial > 0 && currentFinancial === 0) {
            console.warn('Safety Check: Financial data is empty but was previously present. Sync aborted to prevent data loss.');
            return;
        }
        if (this.lastValidCounts.weekly > 0 && currentWeekly === 0) {
            console.warn('Safety Check: Weekly stats are empty but were previously present. Sync aborted to prevent data loss.');
            return;
        }

        try {
            this.isSyncing = true;
            await saveState(this.state);
        } catch (e) {
            console.error('Error saving to cloud:', e);
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Универсальный метод обновления состояния.
     * @param updates Частичное обновление или полный объект состояния.
     */
    updateState(updates: Partial<State> | State) {
        // If updates is a full state object (like from import)
        if ('assets' in updates && 'config' in updates && 'deposit' in updates) {
            if (this.validateState(updates)) {
                this.state = updates as State;
            } else {
                alert('Ошибка: Некорректный формат данных!');
                return;
            }
        } else {
            // Partial update
            this.state = { ...this.state, ...updates };
        }

        this.saveLocalState();
        this.notify();
    }

    /**
     * Обновляет только список активов.
     */
    updateAssets(assets: Asset[]) {
        this.state.assets = assets;
        this.saveLocalState();
        this.notify();
    }

    /**
     * Обновляет глобальную конфигурацию сценариев.
     */
    updateConfig(config: Config) {
        this.state.config = config;
        this.saveLocalState();
        this.notify();
    }

    updateRankings(rankings: Record<string, number>) {
        this.state.rankings = rankings;
        this.state.lastRankingsUpdate = Date.now();
        this.saveLocalState();
        this.notify();
    }

    /**
     * Массово обновляет список финансовых транзакций.
     * Заменяет текущий список новым.
     */
    bulkUpdateFinancialTransactions(transactions: FinancialEntry[]) {
        this.state.financial.transactions = transactions;
        this.saveLocalState();
        this.notify();
    }

    private notify() {
        this.onStateChange(this.state);
    }
}
