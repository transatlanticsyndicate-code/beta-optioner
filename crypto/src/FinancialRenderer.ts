import { State, FinancialActionType } from './types';
import { FinancialService } from './FinancialService';
import { FinancialTableRenderer } from './FinancialTableRenderer';
import { FinancialAnalyticsRenderer } from './FinancialAnalyticsRenderer';
import { FinancialSettingsRenderer } from './FinancialSettingsRenderer';
import { FinancialForm } from './FinancialForm';
import { UIComponents } from './UIComponents';

/**
 * FinancialRenderer acts as the main coordinator for the Financial module's UI.
 * It manages form logic, settings editors, and delegates table/analytics rendering.
 */
export class FinancialRenderer {
    private state: State;
    private onAction: (type: string, payload?: unknown) => void;
    private editingId: string | null = null;

    private tableRenderer: FinancialTableRenderer;
    private analyticsRenderer: FinancialAnalyticsRenderer;
    private settingsRenderer: FinancialSettingsRenderer;
    private financialForm: FinancialForm;

    constructor(state: State, onAction: (type: string, payload?: unknown) => void) {
        this.state = state;
        this.onAction = onAction;
        this.tableRenderer = new FinancialTableRenderer();
        this.analyticsRenderer = new FinancialAnalyticsRenderer();
        this.settingsRenderer = new FinancialSettingsRenderer(state, onAction);
        this.financialForm = new FinancialForm(state, onAction, () => this.render());
        this.initEventListeners();
        this.financialForm.initEventListeners();
    }

    public updateState(state: State) {
        this.state = state;
        this.settingsRenderer.updateState(state);
        this.financialForm.updateState(state);
        this.render();
    }

    public resetAutoScroll() {
        this.tableRenderer.resetAutoScroll();
    }


    private initEventListeners() {
        // Table actions delegation
        const tbody = document.getElementById('fin-entry-list');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;

                // Edit (карандаш) — войти в режим редактирования строки
                const editBtn = target.closest('.edit-btn') as HTMLElement;
                if (editBtn) {
                    const id = editBtn.dataset.id;
                    if (id) {
                        this.editingId = id;
                        this.renderTable();
                    }
                    return;
                }

                // Save (галочка) — сохранить отредактированную запись
                const saveBtn = target.closest('.save-btn') as HTMLElement;
                if (saveBtn) {
                    const id = saveBtn.dataset.id;
                    if (id) this.saveEditing(id);
                    return;
                }

                // Cancel (крестик в режиме edit) — выйти без сохранения
                const cancelBtn = target.closest('.cancel-btn') as HTMLElement;
                if (cancelBtn) {
                    this.editingId = null;
                    this.renderTable();
                    return;
                }

                // Delete (корзина) — обычное удаление
                const deleteBtn = target.closest('.delete-btn') as HTMLElement;
                if (deleteBtn && deleteBtn.dataset.id) {
                    if (confirm('Удалить эту запись?')) {
                        this.onAction(FinancialActionType.DELETE_TRANSACTION, deleteBtn.dataset.id);
                    }
                }
            });

            // Смена категории в режиме редактирования — пересобрать поле суммы под валюту категории
            tbody.addEventListener('change', (e) => {
                const target = e.target as HTMLElement;
                if (target.matches('select[data-field="category"]')) {
                    this.handleEditCategoryChange(target as HTMLSelectElement);
                }
            });

            // Пересчёт предпросмотра доллара при вводе суммы/курса евро
            tbody.addEventListener('input', (e) => {
                const target = e.target as HTMLElement;
                if (target.matches('input[data-field="eurAmount"], input[data-field="eurRate"]')) {
                    this.updateEurPreview(target);
                }
            });
        }

        // ESC — отмена редактирования
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.editingId !== null) {
                this.editingId = null;
                this.renderTable();
            }
        });


        // Sort Header
        const sortHeader = document.getElementById('fin-sort-date');
        if (sortHeader) {
            sortHeader.addEventListener('click', () => {
                const currentOrder = this.state.financial.sortOrder || 'asc';
                const newOrder = currentOrder === 'asc' ? 'desc' : 'asc';
                this.onAction(FinancialActionType.UPDATE_SORT_ORDER, newOrder);
            });
        }

        // Settings Actions -> Delegate scrolling flags to SettingsRenderer
        document.getElementById('fin-add-type-btn')?.addEventListener('click', () => {
            this.settingsRenderer.shouldScrollTypesToBottom = true;
            this.onAction(FinancialActionType.ADD_FIN_TYPE);
        });

        document.getElementById('fin-add-category-btn')?.addEventListener('click', () => {
            this.settingsRenderer.shouldScrollCategoriesToBottom = true;
            this.onAction(FinancialActionType.ADD_FIN_CATEGORY);
        });

        // Date Period Filter Actions
        document.getElementById('fin-date-filter-type')?.addEventListener('change', (e) => {
            const val = (e.target as HTMLSelectElement).value;
            this.onAction(FinancialActionType.UPDATE_DATE_FILTER_TYPE, val);
        });

        document.getElementById('fin-filter-start-date')?.addEventListener('change', (e) => {
            const val = (e.target as HTMLInputElement).value;
            this.onAction(FinancialActionType.UPDATE_CUSTOM_START_DATE, val);
        });

        document.getElementById('fin-filter-end-date')?.addEventListener('change', (e) => {
            const val = (e.target as HTMLInputElement).value;
            this.onAction(FinancialActionType.UPDATE_CUSTOM_END_DATE, val);
        });
    }

    // Form logic delegated to FinancialForm

    public render() {
        // Update Date Period Filter UI
        const dateSelect = document.getElementById('fin-date-filter-type') as HTMLSelectElement;
        const customGroup = document.getElementById('fin-custom-date-group') as HTMLElement;
        const startDateInput = document.getElementById('fin-filter-start-date') as HTMLInputElement;
        const endDateInput = document.getElementById('fin-filter-end-date') as HTMLInputElement;

        if (dateSelect) dateSelect.value = this.state.financial.dateFilterType || 'all';

        if (customGroup) {
            const isCustom = this.state.financial.dateFilterType === 'custom';
            customGroup.style.display = isCustom ? 'grid' : 'none';
            if (isCustom) {
                if (startDateInput) startDateInput.value = this.state.financial.customStartDate || '';
                if (endDateInput) endDateInput.value = this.state.financial.customEndDate || '';
            }
        }

        const filteredTransactions = FinancialService.getFilteredTransactions(this.state.financial);

        // Если редактируемой записи больше нет в данных (например, удалена) — сбросить режим
        if (this.editingId !== null && !filteredTransactions.some(t => t.id === this.editingId)) {
            this.editingId = null;
        }

        const stats = FinancialService.calculateStats(this.state.financial.transactions, filteredTransactions);

        // Delegate Rendering
        this.analyticsRenderer.renderStats(stats);
        this.tableRenderer.render(filteredTransactions, this.state.financial, this.editingId);

        const analyticsData = FinancialService.calculateAnalytics(filteredTransactions);
        this.analyticsRenderer.renderAnalyticsSummary(analyticsData);
        this.analyticsRenderer.renderExpenseChart(analyticsData);

        // Render Dynamic Deposit
        const deposit = FinancialService.calculateDeposit(this.state.financial);
        const depDisplay = document.getElementById('fin-deposit-display');
        if (depDisplay) depDisplay.innerText = `$${deposit.toLocaleString()}`;

        // Delegate Form Rendering
        this.financialForm.render();

        // Render Filter Dropdown
        UIComponents.renderCategoryCustomSelect(
            'fin-filter-category-container',
            this.state.financial.categories,
            this.state.financial.types,
            this.state.financial.categoryFilter,
            (id) => this.onAction(FinancialActionType.UPDATE_CATEGORY_FILTER, id),
            'Все категории',
            true,
            true
        );

        // Delegate Settings Rendering
        this.settingsRenderer.renderTypeEditor();
        this.settingsRenderer.renderCategoryEditor();
    }

    // Перерисовка только таблицы — для входа/выхода из режима редактирования без пересчёта виджетов
    private renderTable() {
        const filteredTransactions = FinancialService.getFilteredTransactions(this.state.financial);
        this.tableRenderer.render(filteredTransactions, this.state.financial, this.editingId);
    }

    // Смена категории в редактируемой строке: подменяем поле суммы под валюту выбранной категории.
    // Для евро подгружаем актуальный курс (как в форме добавления).
    private async handleEditCategoryChange(select: HTMLSelectElement) {
        const row = select.closest('tr[data-editing-id]') as HTMLElement | null;
        if (!row) return;
        const cell = row.querySelector('.fin-edit-amount-cell') as HTMLElement | null;
        if (!cell) return;

        const category = this.state.financial.categories.find(c => c.id === select.value);
        if (!category) return;

        if (category.currency === 'EUR') {
            const rate = await FinancialService.fetchEurRate();
            cell.innerHTML = FinancialTableRenderer.buildEditAmountCell('EUR', {
                rate: rate > 0 ? String(rate) : ''
            });
        } else {
            cell.innerHTML = FinancialTableRenderer.buildEditAmountCell('USD', {});
        }
    }

    // Обновление предпросмотра суммы в долларах при правке евро-полей
    private updateEurPreview(input: HTMLElement) {
        const row = input.closest('tr[data-editing-id]') as HTMLElement | null;
        if (!row) return;
        const eurInput = row.querySelector('input[data-field="eurAmount"]') as HTMLInputElement | null;
        const rateInput = row.querySelector('input[data-field="eurRate"]') as HTMLInputElement | null;
        const preview = row.querySelector('.fin-edit-usd-preview') as HTMLElement | null;
        if (!eurInput || !rateInput || !preview) return;
        const eur = parseFloat(eurInput.value) || 0;
        const rate = parseFloat(rateInput.value) || 0;
        preview.textContent = `$${Math.round(eur * rate).toLocaleString()}`;
    }

    // Сохранение отредактированной записи: читаем поля строки и пересобираем запись,
    // сохраняя оригинальный id (та же логика конвертации, что и при создании).
    private saveEditing(id: string) {
        const row = document.querySelector(`tr[data-editing-id="${id}"]`) as HTMLElement | null;
        if (!row) return;

        const getVal = (field: string): string => {
            const el = row.querySelector(`[data-field="${field}"]`) as HTMLInputElement | HTMLSelectElement | null;
            return el ? el.value : '';
        };

        const categoryId = getVal('category');
        if (!categoryId) {
            alert('Выберите категорию перед сохранением.');
            return;
        }

        const created = FinancialService.createEntry({
            categoryId,
            dateStr: getVal('date'),
            note: getVal('description'),
            eurAmount: getVal('eurAmount'),
            eurRate: getVal('eurRate'),
            usdAmount: getVal('usdAmount'),
            state: this.state.financial
        });

        if (!created) {
            alert('Проверьте заполнение полей: дата и корректная сумма (для евро — ещё и курс).');
            return;
        }

        // Сохраняем оригинальный id, чтобы запись осталась той же и на своём месте
        const updated = { ...created, id };

        this.editingId = null;
        this.onAction(FinancialActionType.UPDATE_TRANSACTION, updated);
    }
}
