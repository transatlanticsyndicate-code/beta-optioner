import { State } from './types';
import { PositionService } from './PositionService';

export class ScenarioRenderer {
    private state: State;
    private onAction: (type: string, payload?: unknown) => void;

    constructor(state: State, onAction: (type: string, payload?: unknown) => void) {
        this.state = state;
        this.onAction = onAction;
    }

    public updateState(state: State) {
        this.state = state;
        this.render();
    }

    public render() {
        const container = document.getElementById('scenarios-editor');
        if (!container) return;

        let html = `
            <div class="config-table-container">
                <table class="config-table">
                <thead>
                    <tr>
                        <th width="120">Сценарий</th>
                        <th>База (S)</th>
                        <th style="text-align: center;">% 1 (a)</th>
                        <th style="text-align: center;">% 2 (b)</th>
                        <th style="text-align: center;">% 3 (c)</th>
                        <th style="text-align: center;">% 4 (d)</th>
                        <th width="40"></th>
                    </tr>
                </thead>
                <tbody>
        `;

        Object.entries(this.state.config.scenarios)
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
            .forEach(([key, sc]) => {
                const steps = PositionService.getStepValues(sc);
                html += `
                <tr>
                    <td><span class="config-label">Сценарий ${key}</span></td>
                    <td>
                        <input type="number" class="config-base" data-scenario="${key}" value="${sc.base}">
                    </td>
                    ${sc.percents.map((p, i) => `
                        <td style="text-align: center;">
                            <input type="number" step="0.01" class="config-percent" 
                                   data-scenario="${key}" data-idx="${i}" 
                                   value="${p}">
                            <span class="config-value-preview">${steps[i + 1].toLocaleString()}</span>
                        </td>
                    `).join('')}
                    <td style="text-align: center;">
                        <button class="delete-scenario-btn" data-scenario="${key}" title="Удалить сценарий">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                    </td>
                </tr>
            `;
            });

        // Save scroll position
        const tableContainer = container.querySelector('.config-table-container');
        const scrollPos = tableContainer ? tableContainer.scrollTop : 0;

        html += `</tbody></table></div>`;
        container.innerHTML = html;

        // Restore scroll position
        const newTableContainer = container.querySelector('.config-table-container');
        if (newTableContainer) newTableContainer.scrollTop = scrollPos;

        this.attachListeners();
    }

    private attachListeners() {
        const container = document.getElementById('scenarios-editor');
        if (!container) return;

        container.querySelectorAll('.delete-scenario-btn').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = (e.target as HTMLElement).closest('button');
                const key = parseInt(target?.dataset.scenario || '0');
                if (!isNaN(key)) this.onAction('DELETE_SCENARIO', key);
            });
        });

        container.querySelectorAll('.config-base').forEach(el => {
            el.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                this.onAction('UPDATE_CONFIG_BASE', { scenario: parseInt(target.dataset.scenario || '0'), value: parseFloat(target.value) || 0 });
            });
        });

        container.querySelectorAll('.config-percent').forEach(el => {
            el.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                this.onAction('UPDATE_CONFIG_PERCENT', {
                    scenario: parseInt(target.dataset.scenario || '0'),
                    idx: parseInt(target.dataset.idx || '0'),
                    value: parseFloat(target.value) || 0
                });
            });
        });
    }
}
