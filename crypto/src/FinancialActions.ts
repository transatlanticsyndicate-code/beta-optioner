import { State, FinancialEntry, DateFilterType, FinancialActionType } from './types';

export class FinancialActions {
    /**
     * Handles financial-related actions and returns the partial state update.
     * Returns null if the action type is not handled.
     */
    static handle(state: State, type: string, payload: unknown): Partial<State> | null {
        // Create a shallow copy of financial state to modify
        const financial = { ...state.financial };
        let hasChanges = false;

        switch (type) {
            case FinancialActionType.ADD_TRANSACTION: {
                const t = payload as FinancialEntry;
                financial.transactions = [t, ...financial.transactions];
                hasChanges = true;
                break;
            }

            case FinancialActionType.DELETE_TRANSACTION: {
                const id = payload as string;
                financial.transactions = financial.transactions.filter(t => t.id !== id);
                hasChanges = true;
                break;
            }

            case FinancialActionType.UPDATE_SORT_ORDER: {
                const order = payload as 'asc' | 'desc';
                financial.sortOrder = order;
                hasChanges = true;
                break;
            }

            case FinancialActionType.UPDATE_CATEGORY_FILTER: {
                const payloadVal = payload as string | string[] | null;

                // Initialize if undefined (migration safety)
                if (!financial.categoryFilter) financial.categoryFilter = [];

                if (payloadVal === null) {
                    // Start fresh / Clear all
                    financial.categoryFilter = [];
                } else if (Array.isArray(payloadVal)) {
                    // Bulk Set
                    financial.categoryFilter = payloadVal;
                } else {
                    // Toggle Single ID
                    const idx = financial.categoryFilter.indexOf(payloadVal);
                    if (idx >= 0) {
                        // Remove
                        financial.categoryFilter = [
                            ...financial.categoryFilter.slice(0, idx),
                            ...financial.categoryFilter.slice(idx + 1)
                        ];
                    } else {
                        // Add
                        financial.categoryFilter = [...financial.categoryFilter, payloadVal];
                    }
                }
                hasChanges = true;
                break;
            }

            case FinancialActionType.UPDATE_DATE_FILTER_TYPE: {
                const filterType = payload as DateFilterType;
                financial.dateFilterType = filterType;
                hasChanges = true;
                break;
            }

            case FinancialActionType.UPDATE_CUSTOM_START_DATE: {
                const date = payload as string | null;
                financial.customStartDate = date;
                hasChanges = true;
                break;
            }

            case FinancialActionType.UPDATE_CUSTOM_END_DATE: {
                const date = payload as string | null;
                financial.customEndDate = date;
                hasChanges = true;
                break;
            }

            case FinancialActionType.ADD_FIN_TYPE: {
                const newType = {
                    id: Date.now().toString(),
                    name: 'Новый тип',
                    isIncome: false
                };
                financial.types = [...financial.types, newType];
                hasChanges = true;
                break;
            }

            case FinancialActionType.DELETE_FIN_TYPE: {
                const id = payload as string;
                financial.types = financial.types.filter(t => t.id !== id);
                hasChanges = true;
                break;
            }

            case FinancialActionType.UPDATE_FIN_TYPE: {
                const p = payload as { id: string, name?: string, isIncome?: boolean };
                const type = financial.types.find(t => t.id === p.id);
                if (type) {
                    if (p.name !== undefined && p.name.trim() !== '' && type.name !== p.name) {
                        const oldTypeName = type.name.toUpperCase();
                        const newTypeName = p.name.toUpperCase();
                        const prefixOld = `${oldTypeName} - `;
                        const prefixNew = `${newTypeName} - `;
                        
                        let transactionsUpdated = false;
                        const newTransactions = financial.transactions.map(t => {
                            if (t.category.startsWith(prefixOld)) {
                                transactionsUpdated = true;
                                return { ...t, category: t.category.replace(prefixOld, prefixNew) };
                            }
                            return t;
                        });
                        
                        if (transactionsUpdated) {
                            financial.transactions = newTransactions;
                        }
                        type.name = p.name;
                    }
                    if (p.isIncome !== undefined) type.isIncome = p.isIncome;
                    hasChanges = true;
                }
                break;
            }

            case FinancialActionType.ADD_FIN_CATEGORY: {
                const firstType = financial.types[0]?.id || 't1';
                const newCat = {
                    id: Date.now().toString(),
                    typeId: firstType,
                    name: 'Новая деталь',
                    currency: 'USD' as const
                };
                financial.categories = [...financial.categories, newCat];
                hasChanges = true;
                break;
            }

            case FinancialActionType.DELETE_FIN_CATEGORY: {
                const id = payload as string;
                financial.categories = financial.categories.filter(c => c.id !== id);
                hasChanges = true;
                break;
            }

            case FinancialActionType.UPDATE_FIN_CATEGORY: {
                const p = payload as { id: string, field: string, value: string };
                const cat = financial.categories.find(c => c.id === p.id);
                if (cat) {
                    // Data Integrity Fix: If renaming, update all historical transactions
                    if (p.field === 'name' && cat.name !== p.value) {
                        const type = financial.types.find(t => t.id === cat.typeId);
                        const currentTypeName = type ? type.name.toUpperCase() : 'UNKNOWN';
                        const oldSuffix = ` - ${cat.name}`;
                        const newSuffix = ` - ${p.value}`;
                        const exactCurrentOldTarget = `${currentTypeName}${oldSuffix}`;
                        const exactCurrentNewTarget = `${currentTypeName}${newSuffix}`;

                        let transactionsUpdated = false;
                        const newTransactions = financial.transactions.map(t => {
                            if (t.category === exactCurrentOldTarget) {
                                transactionsUpdated = true;
                                return { ...t, category: exactCurrentNewTarget };
                            } else if (t.category.endsWith(oldSuffix)) {
                                const prefix = t.category.substring(0, t.category.length - oldSuffix.length);
                                const isOtherType = financial.types.some(otherT => 
                                    otherT.id !== type?.id && otherT.name.toUpperCase() === prefix
                                );
                                if (!isOtherType) {
                                    transactionsUpdated = true;
                                    return { ...t, category: exactCurrentNewTarget };
                                }
                            }
                            return t;
                        });

                        if (transactionsUpdated) {
                            financial.transactions = newTransactions;
                        }
                    }

                    if (p.field === 'typeId' && cat.typeId !== p.value) {
                        const oldType = financial.types.find(t => t.id === cat.typeId);
                        const newType = financial.types.find(t => t.id === p.value);

                        if (oldType && newType) {
                            const exactCurrentOldTarget = `${oldType.name.toUpperCase()} - ${cat.name}`;
                            const exactCurrentNewTarget = `${newType.name.toUpperCase()} - ${cat.name}`;
                            const oldSuffix = ` - ${cat.name}`;

                            let transactionsUpdated = false;
                            const newTransactions = financial.transactions.map(t => {
                                if (t.category === exactCurrentOldTarget) {
                                    transactionsUpdated = true;
                                    return { ...t, category: exactCurrentNewTarget };
                                } else if (t.category.endsWith(oldSuffix)) {
                                    const prefix = t.category.substring(0, t.category.length - oldSuffix.length);
                                    const isOtherType = financial.types.some(otherT => 
                                        otherT.id !== oldType.id && otherT.name.toUpperCase() === prefix
                                    );
                                    if (!isOtherType) {
                                        transactionsUpdated = true;
                                        return { ...t, category: exactCurrentNewTarget };
                                    }
                                }
                                return t;
                            });
                            if (transactionsUpdated) {
                                financial.transactions = newTransactions;
                            }
                        }
                    }

                    if (p.field === 'typeId') {
                        cat.typeId = p.value;
                    } else if (p.field === 'name') {
                        cat.name = p.value;
                    } else if (p.field === 'currency') {
                        cat.currency = p.value as 'USD' | 'EUR';
                    }
                    hasChanges = true;
                }
                break;
            }


        }

        if (hasChanges) {
            return { financial };
        }

        return null;
    }
}
