import { State, FinancialActionType, FinancialType, FinancialCategory } from './types';

export class FinancialSettingsRenderer {
    private state: State;
    private onAction: (type: string, payload?: unknown) => void;

    public shouldScrollTypesToBottom = false;
    public shouldScrollCategoriesToBottom = false;

    constructor(state: State, onAction: (type: string, payload?: unknown) => void) {
        this.state = state;
        this.onAction = onAction;
    }

    public updateState(state: State) {
        this.state = state;
    }

    public renderTypeEditor() {
        const container = document.getElementById('fin-types-editor');
        if (!container) return;

        container.innerHTML = ''; // Clear previous

        const tableContainer = document.createElement('div');
        tableContainer.className = 'config-table-container fin-settings-table';
        container.appendChild(tableContainer); // Append config table container

        const types = this.state.financial.types;

        let html = `
                <table class="config-table">
                <thead>
                    <tr>
                        <th>Название типа</th>
                        <th width="40"></th>
                    </tr>
                </thead>
                <tbody>
        `;

        types.forEach(t => {
            html += `
                <tr>
                    <td>
                        <input type="text" class="fin-type-name" data-id="${t.id}" value="${t.name}" style="width: 100%;">
                    </td>
                    <td style="text-align: center;">
                        <button class="delete-btn delete-fin-type-btn" data-id="${t.id}" title="Удалить тип">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        tableContainer.innerHTML = html;

        // Restore scroll not needed here as we recreate logic slightly differently but let's try to be consistent
        if (this.shouldScrollTypesToBottom) {
            tableContainer.scrollTop = tableContainer.scrollHeight;
            this.shouldScrollTypesToBottom = false;
        }

        this.attachTypeEditorListeners(container);
    }

    private attachTypeEditorListeners(container: HTMLElement) {
        container.querySelectorAll('.delete-fin-type-btn').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = (e.target as HTMLElement).closest('button');
                const id = target?.dataset.id;
                if (id) {
                    const hasCategories = this.state.financial.categories.some(c => c.typeId === id);
                    if (hasCategories) {
                        alert('Нельзя удалить тип, у которого есть привязанные детали. Сначала удалите все детали этого типа.');
                        return;
                    }
                    if (confirm('Удалить этот тип?')) {
                        this.onAction(FinancialActionType.DELETE_FIN_TYPE, id);
                    }
                }
            });
        });

        container.querySelectorAll('.fin-type-name').forEach(el => {
            el.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                const id = target.dataset.id;
                if (id) {
                    this.onAction(FinancialActionType.UPDATE_FIN_TYPE, { id, name: target.value });
                }
            });
        });
    }

    public renderCategoryEditor() {
        const container = document.getElementById('fin-categories-editor');
        if (!container) return;

        const tableContainer = container.querySelector('.config-table-container');
        const scrollPos = tableContainer ? tableContainer.scrollTop : 0;
        const categories = this.state.financial.categories;
        const types = this.state.financial.types;

        let html = `
            <div class="config-table-container fin-settings-table">
                <table class="config-table">
                <thead>
                    <tr>
                        <th width="180">Тип</th>
                        <th>Название детали</th>
                        <th width="100" style="text-align: center;">Валюта</th>
                        <th width="40"></th>
                    </tr>
                </thead>
                <tbody>
        `;

        categories.forEach(c => {
            const typeOptions = types.map(t => `<option value="${t.id}" ${t.id === c.typeId ? 'selected' : ''}>${t.name}</option>`).join('');
            html += `
                <tr>
                    <td>
                        <select class="fin-cat-typeid" data-id="${c.id}" style="width: 100%;">
                            ${typeOptions}
                        </select>
                    </td>
                    <td>
                        <input type="text" class="fin-cat-name" data-id="${c.id}" value="${c.name}" style="width: 100%;">
                    </td>
                    <td style="text-align: center;">
                        <select class="fin-cat-currency" data-id="${c.id}" style="width: 100%;">
                            <option value="USD" ${c.currency === 'USD' ? 'selected' : ''}>USD</option>
                            <option value="EUR" ${c.currency === 'EUR' ? 'selected' : ''}>EUR</option>
                        </select>
                    </td>
                    <td style="text-align: center;">
                        <button class="delete-btn delete-fin-cat-btn" data-id="${c.id}" title="Удалить деталь">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;

        const newTableContainer = container.querySelector('.config-table-container');
        if (newTableContainer) {
            if (this.shouldScrollCategoriesToBottom) {
                newTableContainer.scrollTop = newTableContainer.scrollHeight;
                this.shouldScrollCategoriesToBottom = false;
            } else {
                newTableContainer.scrollTop = scrollPos;
            }
        }

        this.attachCategoryEditorListeners(container);
    }

    private attachCategoryEditorListeners(container: HTMLElement) {
        container.querySelectorAll('.delete-fin-cat-btn').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = (e.target as HTMLElement).closest('button');
                const id = target?.dataset.id;
                if (id) {
                    const category = this.getCategoryById(id);
                    if (category) {
                        const type = this.getTypeById(category.typeId);
                        const typeName = type ? type.name.toUpperCase() : 'UNKNOWN';
                        const fullCatName = `${typeName} - ${category.name}`;
                        const hasTransactions = this.state.financial.transactions.some(t => t.category === fullCatName);
                        if (hasTransactions) {
                            alert(`Нельзя удалить деталь "${category.name}", так как в таблице есть записи с этой деталью. Сначала удалите записи в таблице.`);
                            return;
                        }
                    }
                    if (confirm('Удалить эту деталь?')) {
                        this.onAction(FinancialActionType.DELETE_FIN_CATEGORY, id);
                    }
                }
            });
        });

        const updateHandler = (e: Event, field: string) => {
            const target = e.target as HTMLInputElement | HTMLSelectElement;
            const id = target.dataset.id;
            if (id) this.onAction(FinancialActionType.UPDATE_FIN_CATEGORY, { id, field, value: target.value });
        };

        container.querySelectorAll('.fin-cat-typeid').forEach(el => el.addEventListener('change', (e) => updateHandler(e, 'typeId')));
        container.querySelectorAll('.fin-cat-name').forEach(el => el.addEventListener('change', (e) => updateHandler(e, 'name')));
        container.querySelectorAll('.fin-cat-currency').forEach(el => el.addEventListener('change', (e) => updateHandler(e, 'currency')));
    }

    private getCategoryById(id: string): FinancialCategory | undefined {
        return this.state.financial.categories.find(c => c.id === id);
    }

    private getTypeById(id: string): FinancialType | undefined {
        return this.state.financial.types.find(t => t.id === id);
    }
}
