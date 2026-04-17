import { State, SortOrder, Asset } from './types';
import { PositionService } from './PositionService';

// Column Indices Constants
const COLS = {
    RANK: 0,
    ACTIVE: 1,
    NAME: 2,
    SCENARIO: 3,
    ORDERS: 4,
    REMAINING: 5,
    STEP_0_CHECK: 6,
    STEP_0_VAL: 7,
    STEP_1_CHECK: 8,
    STEP_1_VAL: 9,
    STEP_2_CHECK: 10,
    STEP_2_VAL: 11,
    STEP_3_CHECK: 12,
    STEP_3_VAL: 13,
    ADD_PURCHASE: 14,
    DELETE: 15
} as const;

const TOTAL_COLS = 16;

const HIGHLIGHTED_COLS = new Set<number>([
    COLS.STEP_0_CHECK,
    COLS.STEP_0_VAL,
    COLS.STEP_2_CHECK,
    COLS.STEP_2_VAL,
    COLS.ADD_PURCHASE
]);

export class TableRenderer {
    private state: State;
    private onAction: (type: string, payload?: unknown) => void;
    private searchQuery = '';
    private filterScenario: number | null = null;
    private sortOrder: SortOrder = 'newest';

    constructor(state: State, onAction: (type: string, payload?: unknown) => void) {
        this.state = state;
        this.onAction = onAction;
        this.initEventListeners();
    }

    public updateState(state: State) {
        this.state = state;
        this.render();
    }

    public setSearchQuery(query: string) {
        this.searchQuery = query;
        this.render();
    }

    public setFilterScenario(scenario: number | null) {
        this.filterScenario = scenario;
        this.render();
    }

    public setSortOrder(order: SortOrder) {
        this.sortOrder = order;
        this.render();
    }

    public getSortOrder() {
        return this.sortOrder;
    }

    private initEventListeners() {
        // Static Header Listeners
        const attachHeaderListener = (id: string, handler: () => void) => {
            const el = document.getElementById(id);
            if (el) el.onclick = handler;
        };

        attachHeaderListener('asset-header-sort', () => {
            if (this.sortOrder === 'asc') this.setSortOrder('desc');
            else if (this.sortOrder === 'desc') this.setSortOrder('newest');
            else this.setSortOrder('asc');
        });

        attachHeaderListener('rank-header-sort', () => {
            if (this.sortOrder === 'rankAsc') this.setSortOrder('rankDesc');
            else if (this.sortOrder === 'rankDesc') this.setSortOrder('newest');
            else this.setSortOrder('rankAsc');
        });

        attachHeaderListener('orders-header-sort', () => {
            if (this.sortOrder === 'ordersDesc') this.setSortOrder('ordersAsc');
            else if (this.sortOrder === 'ordersAsc') this.setSortOrder('newest');
            else this.setSortOrder('ordersDesc');
        });

        // Event Delegation for Table Body
        const tbody = document.getElementById('asset-list');
        if (!tbody) return;

        tbody.addEventListener('change', (e) => {
            const target = e.target as HTMLElement;
            const id = target.dataset.id;
            if (!id) return;

            if (target.classList.contains('active-check')) {
                this.onAction('TOGGLE_ASSET', { id, active: (target as HTMLInputElement).checked });
            } else if (target.classList.contains('step-check')) {
                const idx = parseInt(target.dataset.idx || '0');
                this.onAction('UPDATE_STEP', { id, idx, value: (target as HTMLInputElement).checked });
            } else if (target.classList.contains('asset-scenario')) {
                this.onAction('UPDATE_ASSET_SCENARIO', { id, scenario: parseInt((target as HTMLSelectElement).value) });
            } else if (target.classList.contains('order-check')) {
                this.onAction('TOGGLE_ORDER', { id, active: (target as HTMLInputElement).checked });
            }
        });

        tbody.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const btn = target.closest('.delete-btn') as HTMLElement;
            if (btn && btn.dataset.id) {
                if (confirm('Вы уверены, что хотите удалить этот актив?')) {
                    this.onAction('DELETE_ASSET', btn.dataset.id);
                }
            }
        });
    }

    public render() {
        const tbody = document.getElementById('asset-list');
        if (!tbody) return;

        const filteredAssets = this.state.assets.filter(asset => {
            const matchesSearch = !this.searchQuery || asset.name.toUpperCase().startsWith(this.searchQuery.toUpperCase());
            const matchesScenario = this.filterScenario === null || asset.scenario === this.filterScenario;
            return matchesSearch && matchesScenario;
        });

        // Apply sorting
        const sortedAssets = PositionService.sortAssets(filteredAssets, this.sortOrder, this.state.rankings);

        // Update Sort Indicators
        this.updateSortIndicators();

        // Diffing / Reconciliation
        // 1. Identify existing Row IDs
        const existingRows = new Map<string, HTMLTableRowElement>();
        Array.from(tbody.children).forEach(row => {
            const tr = row as HTMLTableRowElement;
            if (tr.dataset.id) existingRows.set(tr.dataset.id, tr);
        });

        // 2. Iterate sorted assets and update/create rows
        // We use stable reconciliation to avoid moving nodes if they are already in correct position.
        sortedAssets.forEach((asset, index) => {
            let tr = existingRows.get(asset.id);

            if (!tr) {
                // Create new
                tr = document.createElement('tr');
                tr.dataset.id = asset.id;
                tr.innerHTML = this.getInitialRowHTML(asset);

                // Insert at correct position
                if (index < tbody.children.length) {
                    tbody.insertBefore(tr, tbody.children[index]);
                } else {
                    tbody.appendChild(tr);
                }
            } else {
                // Check if it's already in the correct position
                // The expected element at 'index' should be 'tr'.
                // If tbody.children[index] is DIFFERENT, we need to move 'tr' here.
                const currentRowAtPos = tbody.children[index];
                if (currentRowAtPos !== tr) {
                    if (index < tbody.children.length) {
                        tbody.insertBefore(tr, tbody.children[index]);
                    } else {
                        tbody.appendChild(tr);
                    }
                }
                existingRows.delete(asset.id);
            }

            this.updateRow(tr, asset);
        });

        // 3. Remove remaining rows (deleted ones)
        existingRows.forEach(tr => tr.remove());
    }

    private updateSortIndicators() {
        const assetIndicator = document.getElementById('sort-indicator');
        const rankIndicator = document.getElementById('rank-sort-indicator');
        const ordersIndicator = document.getElementById('orders-sort-indicator');

        if (assetIndicator) assetIndicator.innerText = '';
        if (rankIndicator) rankIndicator.innerText = '';
        if (ordersIndicator) ordersIndicator.innerText = '';

        if (this.sortOrder === 'asc') { if (assetIndicator) assetIndicator.innerText = '▲'; }
        else if (this.sortOrder === 'desc') { if (assetIndicator) assetIndicator.innerText = '▼'; }
        else if (this.sortOrder === 'rankAsc') { if (rankIndicator) rankIndicator.innerText = '▲'; }
        else if (this.sortOrder === 'rankDesc') { if (rankIndicator) rankIndicator.innerText = '▼'; }
        else if (this.sortOrder === 'ordersAsc') { if (ordersIndicator) ordersIndicator.innerText = '▲'; }
        else if (this.sortOrder === 'ordersDesc') { if (ordersIndicator) ordersIndicator.innerText = '▼'; }
        else { if (assetIndicator) assetIndicator.innerText = '🕒'; }
    }

    private getInitialRowHTML(asset: Asset): string {
        return `
            <td class="cell-rank" style="text-align: center; color: var(--text-secondary); font-size: 0.85rem;"></td>
            <td class="cell-active" style="text-align: center;"><input type="checkbox" class="active-check" data-id="${asset.id}"></td>
            <td class="cell-name"><strong></strong></td>
            <td class="cell-scenario">
                <select class="asset-scenario" data-id="${asset.id}"></select>
            </td>
            <td class="cell-orders" style="text-align: center;">
                <input type="checkbox" class="order-check" data-id="${asset.id}">
            </td>
            <td class="cell-remaining remaining-sum" style="font-weight: 600; text-align: right;"></td>
            <td class="cell-step-check-0" style="text-align: center;"><input type="checkbox" class="step-check" data-id="${asset.id}" data-idx="0"></td>
            <td class="cell-step-val-0" style="text-align: right; font-size: 0.85rem; color: var(--text-secondary); opacity: 0.8;"></td>
            <td class="cell-step-check-1" style="text-align: center;"><input type="checkbox" class="step-check" data-id="${asset.id}" data-idx="1"></td>
            <td class="cell-step-val-1" style="text-align: right; font-size: 0.85rem; color: var(--text-secondary); opacity: 0.8;"></td>
            <td class="cell-step-check-2" style="text-align: center;"><input type="checkbox" class="step-check" data-id="${asset.id}" data-idx="2"></td>
            <td class="cell-step-val-2" style="text-align: right; font-size: 0.85rem; color: var(--text-secondary); opacity: 0.8;"></td>
            <td class="cell-step-check-3" style="text-align: center;"><input type="checkbox" class="step-check" data-id="${asset.id}" data-idx="3"></td>
            <td class="cell-step-val-3" style="text-align: right; font-size: 0.85rem; color: var(--text-secondary); opacity: 0.8;"></td>
            
            <td class="cell-add-purchase add-purchase col-highlight" style="color: var(--accent-color); font-weight: 600; text-align: right;"></td>
            <td style="text-align: center;">
                <button class="delete-btn" data-id="${asset.id}" title="Удалить">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
            </td>
        `;
    }
    private updateRow(tr: HTMLTableRowElement, asset: Asset) {
        const remainingSum = PositionService.calculateRemainingSum(asset, this.state.config);
        const addPurchase = PositionService.calculateAddPurchase(asset, this.state.config);
        const scenario = this.state.config.scenarios[asset.scenario];
        if (!scenario) return;

        const stepValues = PositionService.getStepValues(scenario);
        const isFullyCompleted = asset.steps.every((s: boolean) => s);

        // 1. Calculate and set border classes
        const colClasses = new Array(TOTAL_COLS).fill('');
        const lastCheckedIndex = asset.steps.lastIndexOf(true);
        if (lastCheckedIndex >= 0) {
            // Logic: Base coverage ends at Step 0 Val (Index 7).
            // Each subsequent step adds 2 columns (Check + Val).
            const maxColIndex = COLS.STEP_0_VAL + (lastCheckedIndex * 2);
            const borderClass = lastCheckedIndex === 3 ? 'border-gray-bottom' : 'border-blue-bottom';
            for (let i = 0; i <= maxColIndex; i++) {
                colClasses[i] = borderClass;
            }
        }

        // Apply Row Classes
        tr.className = `row-s-${asset.scenario} ${!asset.isActive ? 'asset-inactive' : ''} ${isFullyCompleted ? 'row-fully-completed' : ''}`;

        // Helper to safely update cell content
        const updateCell = (selector: string, content: string | null = null) => {
            const cell = tr.querySelector(selector) as HTMLElement;
            if (!cell) return;
            if (content !== null && cell.textContent !== content) cell.textContent = content;
        };

        // Update Borders
        const tds = tr.children;
        for (let i = 0; i < tds.length && i < colClasses.length; i++) {
            const td = tds[i] as HTMLElement;
            td.classList.remove('border-blue-bottom', 'border-gray-bottom');
            if (colClasses[i]) td.classList.add(colClasses[i]);

            // Re-apply col-highlight for specific columns
            if (HIGHLIGHTED_COLS.has(i)) {
                td.classList.add('col-highlight');
            }
        }


        // Rank
        const rank = this.state.rankings?.[asset.name] || '—';
        updateCell('.cell-rank', rank.toString());

        // Active Checkbox
        const activeCheck = tr.querySelector('.active-check') as HTMLInputElement;
        if (activeCheck && activeCheck.checked !== asset.isActive) activeCheck.checked = asset.isActive;

        // Name
        const nameCell = tr.querySelector('.cell-name strong');
        if (nameCell && nameCell.textContent !== asset.name) nameCell.textContent = asset.name;

        // Scenario Select
        const scenarioSelect = tr.querySelector('.asset-scenario') as HTMLSelectElement;
        if (scenarioSelect) {
            const scenarios = Object.keys(this.state.config.scenarios);
            if (scenarioSelect.options.length !== scenarios.length) {
                scenarioSelect.innerHTML = scenarios.map(s => `
                    <option value="${s}">${s}</option>
                `).join('');
            }
            const val = asset.scenario.toString();
            if (scenarioSelect.value !== val) scenarioSelect.value = val;
        }

        // Order Checkbox
        const orderCheck = tr.querySelector('.order-check') as HTMLInputElement;
        if (orderCheck) {
            if (orderCheck.checked !== asset.orders) orderCheck.checked = asset.orders;
            // Disable Orders if Step 1 (index 0) is checked
            orderCheck.disabled = asset.steps[0];
        }

        // Remaining Sum
        updateCell('.cell-remaining', remainingSum.toLocaleString());

        // Steps
        asset.steps.forEach((val: boolean, i: number) => {
            // Checkbox
            const stepCheck = tr.querySelector(`.cell-step-check-${i} .step-check`) as HTMLInputElement;
            if (stepCheck) {
                if (stepCheck.checked !== val) stepCheck.checked = val;

                // Logic for disabling steps
                let isEnabled = false;
                if (i === 0) {
                    // Step 1 is enabled only if Orders is NOT checked AND asset is Active
                    isEnabled = !asset.orders && asset.isActive;
                } else {
                    // Subsequent steps depend on the previous step
                    isEnabled = asset.steps[i - 1];
                }

                stepCheck.disabled = !isEnabled;
            }

            // Value
            const valCell = tr.querySelector(`.cell-step-val-${i}`);
            if (valCell) {
                const text = stepValues[i + 1].toLocaleString();
                if (valCell.textContent !== text) valCell.textContent = text;
            }
        });

        // Add Purchase
        updateCell('.cell-add-purchase', addPurchase.toLocaleString());
    }
}
