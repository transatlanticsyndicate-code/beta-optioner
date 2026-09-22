import { State, SortOrder, Asset } from './types';
import { PositionService } from './PositionService';

// Column Indices Constants
const COLS = {
    RANK: 0,
    ACTIVE: 1,
    NAME: 2,
    SCENARIO: 3,
    TYPE: 4,
    ORDERS: 5,
    REMAINING: 6,
    STEP_0_CHECK: 7,
    STEP_0_VAL: 8,
    STEP_1_CHECK: 9,
    STEP_1_VAL: 10,
    STEP_2_CHECK: 11,
    STEP_2_VAL: 12,
    STEP_3_CHECK: 13,
    STEP_3_VAL: 14,
    ADD_PURCHASE: 15,
    ACTIONS: 16
} as const;

const TOTAL_COLS = 17;

const HIGHLIGHTED_COLS = new Set<number>([
    COLS.STEP_0_CHECK,
    COLS.STEP_0_VAL,
    COLS.STEP_2_CHECK,
    COLS.STEP_2_VAL,
    COLS.ADD_PURCHASE
]);

const PENCIL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>`;
const CROSS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

/** Значение фильтра «без типа» — отдельное от пустой строки, которая означает «все типы» */
const NO_TYPE = '__none__';

export class TableRenderer {
    private state: State;
    private onAction: (type: string, payload?: unknown) => void;
    private searchQuery = '';
    private filterScenario: number | null = null;
    private filterTypeId: string | null = null;
    private sortOrder: SortOrder = 'newest';
    // Строка, открытая на редактирование (одновременно — не более одной)
    private editingId: string | null = null;

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

    public setFilterType(typeId: string | null) {
        this.filterTypeId = typeId;
        this.render();
    }

    public setSortOrder(order: SortOrder) {
        this.sortOrder = order;
        this.render();
    }

    public getSortOrder() {
        return this.sortOrder;
    }

    // Экранирование значений, попадающих в HTML (тикеры и названия типов вводит пользователь)
    private static escapeAttr(value: string): string {
        return (value || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    private typeName(typeId?: string): string {
        if (!typeId) return '';
        return this.state.positionTypes.find(t => t.id === typeId)?.name || '';
    }

    private typeNameMap(): Record<string, string> {
        const map: Record<string, string> = {};
        this.state.positionTypes.forEach(t => { map[t.id] = t.name; });
        return map;
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

        // ЗАЧЕМ: заголовок «Тип позиции» сортирует по клику, а иконка подсказки
        // лежит внутри него — без этого наведение с кликом меняло бы сортировку
        const typeInfoIcon = document.querySelector('#type-header-sort .info-icon-wrapper');
        if (typeInfoIcon) typeInfoIcon.addEventListener('click', (e) => e.stopPropagation());

        attachHeaderListener('type-header-sort', () => {
            if (this.sortOrder === 'typeAsc') this.setSortOrder('typeDesc');
            else if (this.sortOrder === 'typeDesc') this.setSortOrder('newest');
            else this.setSortOrder('typeAsc');
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
            } else if (target.classList.contains('order-check')) {
                this.onAction('TOGGLE_ORDER', { id, active: (target as HTMLInputElement).checked });
            }
        });

        tbody.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            const editBtn = target.closest('.edit-btn') as HTMLElement;
            if (editBtn?.dataset.id) {
                this.editingId = editBtn.dataset.id;
                this.render();
                return;
            }

            const cancelBtn = target.closest('.cancel-btn') as HTMLElement;
            if (cancelBtn) {
                this.editingId = null;
                this.render();
                return;
            }

            const saveBtn = target.closest('.save-btn') as HTMLElement;
            if (saveBtn?.dataset.id) {
                this.saveEditingRow(saveBtn.dataset.id);
                return;
            }

            const delBtn = target.closest('.delete-btn') as HTMLElement;
            if (delBtn?.dataset.id) {
                if (confirm('Вы уверены, что хотите удалить этот актив?')) {
                    if (this.editingId === delBtn.dataset.id) this.editingId = null;
                    this.onAction('DELETE_ASSET', delBtn.dataset.id);
                }
            }
        });

        // Enter — сохранить, Escape — отменить: привычное поведение при правке строки
        tbody.addEventListener('keydown', (e) => {
            const ev = e as KeyboardEvent;
            if (!this.editingId) return;
            if (ev.key === 'Enter') {
                ev.preventDefault();
                this.saveEditingRow(this.editingId);
            } else if (ev.key === 'Escape') {
                this.editingId = null;
                this.render();
            }
        });
    }

    /**
     * Собирает значения из открытой на правку строки и отправляет их в Store.
     * Проверки делаются здесь, чтобы при ошибке строка осталась открытой и введённое не пропало.
     */
    private saveEditingRow(id: string) {
        const tbody = document.getElementById('asset-list');
        const tr = tbody?.querySelector(`tr[data-id="${id}"]`) as HTMLTableRowElement | null;
        if (!tr) return;

        const nameInput = tr.querySelector('.asset-edit-name') as HTMLInputElement | null;
        const scenarioSelect = tr.querySelector('.asset-edit-scenario') as HTMLSelectElement | null;
        const typeSelect = tr.querySelector('.asset-edit-type') as HTMLSelectElement | null;
        if (!nameInput || !scenarioSelect) return;

        const name = nameInput.value.trim().toUpperCase();
        if (!name) {
            alert('Тикер не может быть пустым!');
            nameInput.focus();
            return;
        }
        if (this.state.assets.some(a => a.id !== id && a.name === name)) {
            alert(`Тикер ${name} уже есть в списке!`);
            nameInput.focus();
            return;
        }

        const scenario = parseInt(scenarioSelect.value);
        if (isNaN(scenario)) {
            alert('Выберите сценарий!');
            return;
        }

        this.editingId = null;
        this.onAction('UPDATE_ASSET', { id, name, scenario, typeId: typeSelect?.value || undefined });
    }

    public render() {
        const tbody = document.getElementById('asset-list');
        if (!tbody) return;

        const filteredAssets = this.state.assets.filter(asset => {
            const matchesSearch = !this.searchQuery || asset.name.toUpperCase().startsWith(this.searchQuery.toUpperCase());
            const matchesScenario = this.filterScenario === null || asset.scenario === this.filterScenario;
            const matchesType = this.filterTypeId === null
                || (this.filterTypeId === NO_TYPE ? !asset.typeId : asset.typeId === this.filterTypeId);
            return matchesSearch && matchesScenario && matchesType;
        });

        // Apply sorting
        const sortedAssets = PositionService.sortAssets(filteredAssets, this.sortOrder, this.state.rankings, this.typeNameMap());

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
            const isEditing = this.editingId === asset.id;
            let tr = existingRows.get(asset.id);

            if (!tr) {
                // Create new
                tr = document.createElement('tr');
                tr.dataset.id = asset.id;
                tr.dataset.mode = isEditing ? 'edit' : 'view';
                tr.innerHTML = this.getInitialRowHTML(asset, isEditing);

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
                // Переключение режима просмотр/правка меняет разметку строки целиком
                const mode = isEditing ? 'edit' : 'view';
                if (tr.dataset.mode !== mode) {
                    tr.dataset.mode = mode;
                    tr.innerHTML = this.getInitialRowHTML(asset, isEditing);
                }
                existingRows.delete(asset.id);
            }

            this.updateRow(tr, asset, isEditing);
        });

        // 3. Remove remaining rows (deleted ones)
        existingRows.forEach(tr => tr.remove());

        // Фокус в поле тикера сразу после открытия правки
        if (this.editingId) {
            const input = tbody.querySelector(`tr[data-id="${this.editingId}"] .asset-edit-name`) as HTMLInputElement | null;
            if (input && document.activeElement !== input) input.focus();
        }
    }

    private updateSortIndicators() {
        const indicators: Record<string, string> = {
            'sort-indicator': '',
            'rank-sort-indicator': '',
            'orders-sort-indicator': '',
            'type-sort-indicator': ''
        };

        if (this.sortOrder === 'asc') indicators['sort-indicator'] = '▲';
        else if (this.sortOrder === 'desc') indicators['sort-indicator'] = '▼';
        else if (this.sortOrder === 'rankAsc') indicators['rank-sort-indicator'] = '▲';
        else if (this.sortOrder === 'rankDesc') indicators['rank-sort-indicator'] = '▼';
        else if (this.sortOrder === 'ordersAsc') indicators['orders-sort-indicator'] = '▲';
        else if (this.sortOrder === 'ordersDesc') indicators['orders-sort-indicator'] = '▼';
        else if (this.sortOrder === 'typeAsc') indicators['type-sort-indicator'] = '▲';
        else if (this.sortOrder === 'typeDesc') indicators['type-sort-indicator'] = '▼';
        else indicators['sort-indicator'] = '🕒';

        Object.entries(indicators).forEach(([id, text]) => {
            const el = document.getElementById(id);
            if (el) el.innerText = text;
        });
    }

    /** Выпадающий список сценариев для режима правки */
    private buildScenarioSelect(asset: Asset): string {
        const options = Object.keys(this.state.config.scenarios)
            .map(k => parseInt(k))
            .sort((a, b) => a - b)
            .map(s => `<option value="${s}" ${s === asset.scenario ? 'selected' : ''}>${s}</option>`)
            .join('');
        return `<select class="asset-edit-scenario">${options}</select>`;
    }

    /** Выпадающий список типов для режима правки (с пунктом «Без типа») */
    private buildTypeSelect(asset: Asset): string {
        const options = this.state.positionTypes
            .map(t => `<option value="${TableRenderer.escapeAttr(t.id)}" ${t.id === asset.typeId ? 'selected' : ''}>${TableRenderer.escapeAttr(t.name)}</option>`)
            .join('');
        return `<select class="asset-edit-type">
                    <option value="" ${!asset.typeId ? 'selected' : ''}>Без типа</option>
                    ${options}
                </select>`;
    }

    private getInitialRowHTML(asset: Asset, isEditing: boolean): string {
        const nameCell = isEditing
            ? `<td class="cell-name"><input type="text" class="asset-edit-name" value="${TableRenderer.escapeAttr(asset.name)}" style="width: 100%; text-transform: uppercase;"></td>`
            : `<td class="cell-name"><strong></strong></td>`;

        const scenarioCell = isEditing
            ? `<td class="cell-scenario">${this.buildScenarioSelect(asset)}</td>`
            : `<td class="cell-scenario"></td>`;

        const typeCell = isEditing
            ? `<td class="cell-type">${this.buildTypeSelect(asset)}</td>`
            : `<td class="cell-type" style="color: var(--text-secondary);"></td>`;

        const actionsCell = isEditing
            ? `<td style="text-align: center; white-space: nowrap;">
                    <button class="save-btn" data-id="${asset.id}" title="Сохранить">${CHECK_SVG}</button>
                    <button class="cancel-btn" data-id="${asset.id}" title="Отменить">${CROSS_SVG}</button>
               </td>`
            : `<td style="text-align: center; white-space: nowrap;">
                    <button class="edit-btn" data-id="${asset.id}" title="Редактировать">${PENCIL_SVG}</button>
                    <button class="delete-btn" data-id="${asset.id}" title="Удалить">${CROSS_SVG}</button>
               </td>`;

        return `
            <td class="cell-rank" style="text-align: center; color: var(--text-secondary); font-size: 0.85rem;"></td>
            <td class="cell-active" style="text-align: center;"><input type="checkbox" class="active-check" data-id="${asset.id}"></td>
            ${nameCell}
            ${scenarioCell}
            ${typeCell}
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
            ${actionsCell}
        `;
    }

    private updateRow(tr: HTMLTableRowElement, asset: Asset, isEditing: boolean) {
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
            // Logic: Base coverage ends at Step 0 Val.
            // Each subsequent step adds 2 columns (Check + Val).
            const maxColIndex = COLS.STEP_0_VAL + (lastCheckedIndex * 2);
            const borderClass = lastCheckedIndex === 3 ? 'border-gray-bottom' : 'border-blue-bottom';
            for (let i = 0; i <= maxColIndex; i++) {
                colClasses[i] = borderClass;
            }
        }

        // Apply Row Classes
        tr.className = `row-s-${asset.scenario} ${!asset.isActive ? 'asset-inactive' : ''} ${isFullyCompleted ? 'row-fully-completed' : ''} ${isEditing ? 'row-editing' : ''}`;

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

        // Поля, которые в режиме правки редактирует пользователь — их не перетираем
        if (!isEditing) {
            const nameCell = tr.querySelector('.cell-name strong');
            if (nameCell && nameCell.textContent !== asset.name) nameCell.textContent = asset.name;

            updateCell('.cell-scenario', asset.scenario.toString());
            updateCell('.cell-type', this.typeName(asset.typeId) || '—');
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
