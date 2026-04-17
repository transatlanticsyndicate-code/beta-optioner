import { State, WeeklyStatsEntry, DateFilterType, WeeklyStatsActionType } from './types';

export class WeeklyStatsActions {
    /**
     * Handles weekly stats related actions and returns the partial state update.
     * Returns null if the action type is not handled.
     */
    static handle(state: State, type: string, payload: unknown): Partial<State> | null {
        // Create a shallow copy of weekly stats state to modify
        const weeklyStats = { ...state.weeklyStats };
        let hasChanges = false;

        switch (type) {
            case WeeklyStatsActionType.ADD_TRANSACTION: {
                const t = payload as WeeklyStatsEntry;
                weeklyStats.transactions = [t, ...weeklyStats.transactions];
                hasChanges = true;
                break;
            }

            case WeeklyStatsActionType.DELETE_TRANSACTION: {
                const id = payload as string;
                weeklyStats.transactions = weeklyStats.transactions.filter(t => t.id !== id);
                hasChanges = true;
                break;
            }

            case WeeklyStatsActionType.UPDATE_SORT_ORDER: {
                const order = payload as 'asc' | 'desc';
                weeklyStats.sortOrder = order;
                hasChanges = true;
                break;
            }

            case WeeklyStatsActionType.UPDATE_CATEGORY_FILTER: {
                const payloadVal = payload as string | string[] | null;

                // Initialize if undefined (migration safety)
                if (!weeklyStats.categoryFilter) weeklyStats.categoryFilter = [];

                if (payloadVal === null) {
                    // Start fresh / Clear all
                    weeklyStats.categoryFilter = [];
                } else if (Array.isArray(payloadVal)) {
                    // Bulk Set
                    weeklyStats.categoryFilter = payloadVal;
                } else {
                    // Toggle Single ID
                    const idx = weeklyStats.categoryFilter.indexOf(payloadVal);
                    if (idx >= 0) {
                        // Remove
                        weeklyStats.categoryFilter = [
                            ...weeklyStats.categoryFilter.slice(0, idx),
                            ...weeklyStats.categoryFilter.slice(idx + 1)
                        ];
                    } else {
                        // Add
                        weeklyStats.categoryFilter = [...weeklyStats.categoryFilter, payloadVal];
                    }
                }
                hasChanges = true;
                break;
            }

            case WeeklyStatsActionType.UPDATE_DATE_FILTER_TYPE: {
                const filterType = payload as DateFilterType;
                weeklyStats.dateFilterType = filterType;
                hasChanges = true;
                break;
            }

            case WeeklyStatsActionType.UPDATE_CUSTOM_START_DATE: {
                const date = payload as string | null;
                weeklyStats.customStartDate = date;
                hasChanges = true;
                break;
            }

            case WeeklyStatsActionType.UPDATE_CUSTOM_END_DATE: {
                const date = payload as string | null;
                weeklyStats.customEndDate = date;
                hasChanges = true;
                break;
            }

            case WeeklyStatsActionType.ADD_TYPE: {
                const newType = {
                    id: Date.now().toString(),
                    name: 'Новый тип',
                    isIncome: false
                };
                weeklyStats.types = [...weeklyStats.types, newType];
                hasChanges = true;
                break;
            }

            case WeeklyStatsActionType.DELETE_TYPE: {
                const id = payload as string;
                weeklyStats.types = weeklyStats.types.filter(t => t.id !== id);
                hasChanges = true;
                break;
            }

            case WeeklyStatsActionType.UPDATE_TYPE: {
                const p = payload as { id: string, name?: string, isIncome?: boolean };
                const type = weeklyStats.types.find(t => t.id === p.id);
                if (type) {
                    if (p.name !== undefined) type.name = p.name;
                    if (p.isIncome !== undefined) type.isIncome = p.isIncome;
                    hasChanges = true;
                }
                break;
            }

            case WeeklyStatsActionType.ADD_CATEGORY: {
                const firstType = weeklyStats.types[0]?.id || 'wt1';
                const newCat = {
                    id: Date.now().toString(),
                    typeId: firstType,
                    name: 'Новая деталь',
                    currency: 'USD' as const
                };
                weeklyStats.categories = [...weeklyStats.categories, newCat];
                hasChanges = true;
                break;
            }

            case WeeklyStatsActionType.DELETE_CATEGORY: {
                const id = payload as string;
                weeklyStats.categories = weeklyStats.categories.filter(c => c.id !== id);
                hasChanges = true;
                break;
            }

            case WeeklyStatsActionType.UPDATE_CATEGORY: {
                const p = payload as { id: string, field: string, value: string };
                const cat = weeklyStats.categories.find(c => c.id === p.id);
                if (cat) {
                    // Data Integrity Fix: If renaming, update all historical transactions
                    if (p.field === 'name' && cat.name !== p.value) {
                        // const type = weeklyStats.types.find(t => t.id === cat.typeId);
                        // Legacy logic disabled

                        // Update Transactions
                        // let transactionsUpdated = false;
                        // Legacy type update logic disabled for Import Mode
                        // transactions: state.transactions; // This line was not present in the original code, but is added and commented out as per instruction.

                        // Legacy category update disabled
                        // const newTransactions = weeklyStats.transactions;

                        // Legacy update logic removed
                        // if (transactionsUpdated) { ... }
                    }

                    if (p.field === 'typeId' && cat.typeId !== p.value) {
                        const oldType = weeklyStats.types.find(t => t.id === cat.typeId);
                        const newType = weeklyStats.types.find(t => t.id === p.value);

                        if (oldType && newType) {
                            // Legacy logic disabled
                            // Legacy category update disabled
                            // Legacy logic disabled
                            // Legacy category update disabled
                        }
                    }

                    if (p.field === 'typeId') {
                        cat.typeId = p.value;
                    } else if (p.field === 'name') {
                        cat.name = p.value;
                    } else if (p.field === 'currency') {
                        cat.currency = p.value as 'USD' | 'EUR';
                    }
                }
            }
                break;
        }

        if (hasChanges) {
            return { weeklyStats };
        }

        return null;
    }
}
