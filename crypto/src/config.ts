import { Config } from './types';

export const DEFAULT_CONFIG: Config = {
    scenarios: {
        1500: { base: 1500, percents: [10, 25, 50, 100] },
        3000: { base: 3000, percents: [25, 50, 75, 100] },
        6000: { base: 6000, percents: [50, 25, 10, 100] },
        12000: { base: 12000, percents: [50, 25, 10, 100] }
    }
};

export const DEFAULT_DEPOSIT = 1670536;

export const DEFAULT_SCENARIO_PERCENTS = [25, 50, 75, 100];

export const UI_CONSTANTS = {
    USAGE_HUES: {
        SAFE: 140,    // Green
        WARNING: 35   // Orange/Red
    },
    USAGE_THRESHOLDS: {
        WARNING: 50,
        CRITICAL: 75
    }
};
