import { State, GlobalStats } from './types';
import { PositionService } from './PositionService';
import { UI_CONSTANTS } from './config';
import { FinancialService } from './FinancialService';

export class StatsRenderer {
    private state: State;

    constructor(state: State, _onAction: (type: string, payload?: unknown) => void) {
        this.state = state;
    }

    public updateState(state: State) {
        this.state = state;
        this.render();
    }

    public render() {
        const statsContainer = document.getElementById('global-stats');
        if (!statsContainer) return;

        const stats: GlobalStats = PositionService.calculateGlobalStats(this.state);

        // Calculate dynamic deposit
        const dynamicDeposit = FinancialService.calculateDeposit(this.state.financial);

        // Update headers directly
        const headerTotal = document.getElementById('total-remaining-header');
        if (headerTotal) headerTotal.innerText = stats.totalRemaining.toLocaleString();

        const headerAddTotal = document.getElementById('total-add-header');
        if (headerAddTotal) headerAddTotal.innerText = stats.totalAdd.toLocaleString();

        const usageColor = this.getUsageColor(stats.percentUsed);
        const fillPercent = Math.min(Math.max(stats.percentUsed, 0), 100);

        // Targeted updates for stats cards
        let depositDisplay = document.getElementById('deposit-display');
        if (depositDisplay) {
            depositDisplay.innerHTML = `$${dynamicDeposit.toLocaleString()}`;
        } else {
            // Initial render of stats container if it's empty
            statsContainer.innerHTML = `
                <div class="stat-card" id="deposit-card">
                    <div class="stat-label">Депозит</div>
                    <div class="stat-value" id="deposit-display">
                        $${dynamicDeposit.toLocaleString()}
                    </div>
                </div>
                <div class="stat-card" id="usage-card">
                    <div class="stat-label">Использовано %</div>
                    <div class="stat-value" id="usage-value">${stats.percentUsed.toFixed(2)}%</div>
                </div>
                
                <div class="stat-card" id="combined-positions-card" style="display: flex; flex-direction: column; justify-content: center; gap: 2px;">
                     <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: var(--text-secondary);">
                        <span>Позиций:</span>
                        <span id="active-positions-value" style="color: var(--text-primary); font-weight: 500; font-family: var(--font-mono);">${stats.activePositionsCount}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: var(--text-secondary);">
                        <span>Всего монет:&nbsp;</span>
                        <span id="total-assets-value" style="color: var(--text-primary); font-weight: 500; font-family: var(--font-mono);">${stats.totalAssetsCount}</span>
                    </div>
                </div>
            `;
        }

        // Update usage card styling and other values
        const usageCard = document.getElementById('usage-card');
        if (usageCard) {
            usageCard.style.background = `linear-gradient(to right, ${usageColor} ${fillPercent}%, transparent ${fillPercent}%)`;
            const val = document.getElementById('usage-value');
            if (val) val.innerText = `${stats.percentUsed.toFixed(2)}%`;
        }

        const activePosVal = document.getElementById('active-positions-value');
        if (activePosVal) activePosVal.innerText = stats.activePositionsCount.toString();

        const totalAssetsVal = document.getElementById('total-assets-value');
        if (totalAssetsVal) totalAssetsVal.innerText = stats.totalAssetsCount.toString();

        // Render Scenario Stats in Tooltip
        const scenarioStatsContent = document.getElementById('scenario-tooltip-content');
        if (scenarioStatsContent) {
            const scenarios = Object.keys(this.state.config.scenarios)
                .map(k => Number(k))
                .sort((a, b) => a - b);

            const rows = scenarios.map(s => {
                const count = stats.scenarioCounts[s] || 0;
                return `
                    <tr>
                        <td class="scenario-tooltip-label">Сценарий ${s}:</td>
                        <td class="scenario-tooltip-value">${count}</td>
                    </tr>
                `;
            }).join('');

            scenarioStatsContent.innerHTML = `
                <table class="scenario-tooltip-table">
                    ${rows}
                </table>
            `;
        }

        // Render Position Type Stats in Tooltip
        const typeStatsContent = document.getElementById('type-tooltip-content');
        if (typeStatsContent) {
            const rows = this.state.positionTypes.map(t => ({
                label: t.name,
                count: stats.typeCounts[t.id] || 0
            }));

            // Позиции без типа показываем последней строкой и только если они есть
            const noTypeCount = stats.typeCounts[''] || 0;
            if (noTypeCount > 0) rows.push({ label: 'Без типа', count: noTypeCount });

            typeStatsContent.innerHTML = `
                <table class="scenario-tooltip-table">
                    ${rows.map(r => `
                        <tr>
                            <td class="scenario-tooltip-label">${this.escapeHtml(r.label)}:</td>
                            <td class="scenario-tooltip-value">${r.count}</td>
                        </tr>
                    `).join('')}
                </table>
            `;
        }

        const lastUpdated = document.getElementById('last-updated');
        if (lastUpdated) lastUpdated.innerText = `Обновлено: ${stats.lastUpdated.toLocaleString()}`;
    }

    // Названия типов вводит пользователь — экранируем перед вставкой в разметку
    private escapeHtml(value: string): string {
        return (value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    private getUsageColor(pct: number) {
        const { SAFE, WARNING } = UI_CONSTANTS.USAGE_HUES;
        const { WARNING: WARN_THRES, CRITICAL: CRIT_THRES } = UI_CONSTANTS.USAGE_THRESHOLDS;

        let hue = SAFE;
        if (pct > WARN_THRES && pct <= CRIT_THRES) {
            // Interpolate between SAFE and WARNING
            hue = SAFE - ((pct - WARN_THRES) / (CRIT_THRES - WARN_THRES) * (SAFE - WARNING));
        } else if (pct > CRIT_THRES) {
            // Interpolate between WARNING and 0 (Red)
            // Assuming max is 100 for the gradient to 0
            const range = 100 - CRIT_THRES;
            hue = WARNING - (Math.min((pct - CRIT_THRES) / range, 1) * WARNING);
        }
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        const s = 40;
        const l = isDark ? 18 : 65;
        const a = isDark ? 0.6 : 0.4;
        return `hsla(${hue}, ${s}%, ${l}%, ${a})`;
    }
}
