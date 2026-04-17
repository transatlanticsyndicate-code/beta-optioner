import { State, Asset } from './types';
import { DEFAULT_CONFIG, DEFAULT_DEPOSIT, DEFAULT_SCENARIO_PERCENTS } from './config';
import { INITIAL_ASSETS, INITIAL_FINANCIAL_CATEGORIES, INITIAL_FINANCIAL_TYPES } from './initialAssets';

export class CryptoActions {
    /**
     * Handles crypto-related actions and returns the partial state update.
     * Returns null if the action type is not handled.
     */
    static handle(state: State, type: string, payload: unknown): Partial<State> | null {
        switch (type) {
            case 'UPDATE_DEPOSIT':
                return { deposit: payload as number };

            case 'TOGGLE_ASSET': {
                const p = payload as { id: string, active: boolean };
                const assets = [...state.assets];
                const asset = assets.find(a => a.id === p.id);
                if (asset) {
                    asset.isActive = p.active;
                    if (!p.active) {
                        asset.steps = [false, false, false, false];
                    }
                }
                return { assets };
            }

            case 'TOGGLE_ORDER': {
                const p = payload as { id: string, active: boolean };
                const assets = [...state.assets];
                const asset = assets.find(a => a.id === p.id);
                if (asset) {
                    asset.orders = p.active;
                    if (p.active) {
                        asset.steps = [false, false, false, false];
                    }
                }
                return { assets };
            }

            case 'UPDATE_STEP': {
                const p = payload as { id: string, idx: number, value: boolean };
                const assets = [...state.assets];
                const asset = assets.find(a => a.id === p.id);
                if (asset) {
                    if (p.value) {
                        if (p.idx === 0) asset.orders = false;
                        if (p.idx === 0 || asset.steps[p.idx - 1]) {
                            asset.steps[p.idx] = true;
                        }
                    } else {
                        for (let i = p.idx; i < asset.steps.length; i++) {
                            asset.steps[i] = false;
                        }
                    }
                }
                return { assets };
            }

            case 'UPDATE_ASSET_SCENARIO': {
                const p = payload as { id: string, scenario: number };
                const assets = [...state.assets];
                const asset = assets.find(a => a.id === p.id);
                if (asset) asset.scenario = p.scenario;
                return { assets };
            }

            case 'DELETE_ASSET':
                return { assets: state.assets.filter(a => a.id !== (payload as string)) };

            case 'ADD_ASSET': {
                const p = payload as { name: string, scenario: number };
                const newAsset: Asset = {
                    id: Date.now().toString(),
                    name: p.name,
                    scenario: p.scenario,
                    steps: [false, false, false, false],
                    isActive: false,
                    isVerified: false,
                    orders: true
                };
                return { assets: [newAsset, ...state.assets] };
            }

            case 'ADD_SCENARIO': {
                const key = payload as number;
                const config = { ...state.config };
                if (!config.scenarios[key]) {
                    config.scenarios[key] = { base: key, percents: [...DEFAULT_SCENARIO_PERCENTS] };
                    return { config };
                }
                return null;
            }

            case 'DELETE_SCENARIO': {
                const key = payload as number;
                const config = { ...state.config };
                const assets = [...state.assets];

                const usingAssets = assets.filter(a => a.scenario === key);
                const otherKeys = Object.keys(config.scenarios).map(k => parseInt(k)).filter(k => k !== key);

                if (usingAssets.length > 0) {
                    if (otherKeys.length === 0) {
                        alert('Нельзя удалить последний сценарий!');
                        return null;
                    }
                    usingAssets.forEach(a => a.scenario = otherKeys[0]);
                } else if (Object.keys(config.scenarios).length <= 1) {
                    alert('Нельзя удалить последний сценарий!');
                    return null;
                }

                delete config.scenarios[key];
                return { config, assets };
            }

            case 'UPDATE_CONFIG_BASE': {
                const p = payload as { scenario: number, value: number };
                const config = { ...state.config };
                if (config.scenarios[p.scenario]) {
                    config.scenarios[p.scenario].base = p.value;
                    return { config };
                }
                return null;
            }

            case 'UPDATE_CONFIG_PERCENT': {
                const p = payload as { scenario: number, idx: number, value: number };
                const config = { ...state.config };
                if (config.scenarios[p.scenario]) {
                    config.scenarios[p.scenario].percents[p.idx] = p.value;
                    return { config };
                }
                return null;
            }

            case 'RESET_CONFIG':
                return { config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)) };

            case 'FULL_RESET':
                return {
                    deposit: DEFAULT_DEPOSIT,
                    assets: JSON.parse(JSON.stringify(INITIAL_ASSETS)),
                    config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
                    rankings: {},
                    lastRankingsUpdate: 0,
                    cmcApiKey: '',
                    financial: {
                        transactions: [],
                        types: INITIAL_FINANCIAL_TYPES,
                        categories: INITIAL_FINANCIAL_CATEGORIES,
                        categoryFilter: [],
                        sortOrder: 'asc'
                    }
                };

            case 'UPDATE_CMC_KEY': {
                const key = payload as string;
                return { cmcApiKey: key };
            }

            default:
                return null;
        }
    }
}
