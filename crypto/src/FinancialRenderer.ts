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
                const deleteBtn = target.closest('.delete-btn') as HTMLElement;
                if (deleteBtn && deleteBtn.dataset.id) {
                    if (confirm('Удалить эту запись?')) {
                        this.onAction(FinancialActionType.DELETE_TRANSACTION, deleteBtn.dataset.id);
                    }
                }
            });
        }


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
        const stats = FinancialService.calculateStats(this.state.financial.transactions, filteredTransactions);

        // Delegate Rendering
        this.analyticsRenderer.renderStats(stats);
        this.tableRenderer.render(filteredTransactions, this.state.financial);

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


    // renderCategoryCustomSelect, renderDefaultAmountInput, renderEurAmountInput moved to UIComponents / FinancialForm
}
