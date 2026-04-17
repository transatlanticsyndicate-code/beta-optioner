import { State, WeeklyStatsActionType } from './types';
import { WeeklyStatsService } from './WeeklyStatsService';
import { FinancialService } from './FinancialService';
import { WeeklyStatsTableRenderer } from './WeeklyStatsTableRenderer';
import { WeeklyStatsSettingsRenderer } from './WeeklyStatsSettingsRenderer';

/**
 * WeeklyStatsRenderer acts as the main coordinator for the Weekly Stats module's UI.
 */
export class WeeklyStatsRenderer {
    private state: State;
    private onAction: (type: string, payload?: unknown) => void;

    private tableRenderer: WeeklyStatsTableRenderer;
    private settingsRenderer: WeeklyStatsSettingsRenderer;

    constructor(state: State, onAction: (type: string, payload?: unknown) => void) {
        this.state = state;
        this.onAction = onAction;
        this.tableRenderer = new WeeklyStatsTableRenderer();
        this.settingsRenderer = new WeeklyStatsSettingsRenderer(state, onAction);
        this.initEventListeners();
    }

    public updateState(state: State) {
        this.state = state;
        this.settingsRenderer.updateState(state);
        this.render();
    }

    public resetAutoScroll() {
        this.tableRenderer.resetAutoScroll();
    }

    private initEventListeners() {
        // Table actions delegation
        // Table actions delegation
        const tbody = document.getElementById('weekly-entry-list');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                // Handle Delete Button
                const delBtn = target.closest('.delete-btn') as HTMLElement;
                if (delBtn) {
                    const id = delBtn.dataset.id;
                    if (id && confirm('Вы уверены, что хотите удалить эту запись?')) {
                        this.onAction(WeeklyStatsActionType.DELETE_TRANSACTION, id);
                    }
                }
            });
        }

        // --- Manual Entry Logic ---
        const addBtn = document.getElementById('weekly-add-entry-btn') as HTMLButtonElement;
        const dateInput = document.getElementById('weekly-date-input') as HTMLInputElement;
        const profitInput = document.getElementById('weekly-profit-input') as HTMLInputElement;
        const lossInput = document.getElementById('weekly-loss-input') as HTMLInputElement;
        const posInput = document.getElementById('weekly-positions-input') as HTMLInputElement;
        const usdtInput = document.getElementById('weekly-usdt-input') as HTMLInputElement;
        const eurInput = document.getElementById('weekly-eur-input') as HTMLInputElement;

        // Set default date to today
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }

        const checkFormValidity = () => {
            if (!addBtn) return;
            // Validate: Date required, all amounts present (can be 0)
            const isValid = dateInput?.value &&
                profitInput?.value !== '' &&
                lossInput?.value !== '' &&
                posInput?.value !== '' &&
                usdtInput?.value !== '' &&
                eurInput?.value !== '';
            addBtn.disabled = !isValid;
        };

        const inputs = [dateInput, profitInput, lossInput, posInput, usdtInput, eurInput];
        inputs.forEach(input => {
            if (input) {
                input.style.display = ''; // Ensure visible
                input.addEventListener('input', checkFormValidity);
            }
        });
        if (addBtn) {
            addBtn.style.display = ''; // Ensure visible
            checkFormValidity(); // Initial check

            addBtn.addEventListener('click', () => {
                const entry = WeeklyStatsService.createEntry({
                    date: dateInput.value,
                    weeklyProfit: profitInput.value,
                    portfolioLoss: lossInput.value,
                    positionsAmount: posInput.value,
                    readyUSDT: usdtInput.value,
                    readyEUR: eurInput.value
                });

                this.onAction(WeeklyStatsActionType.ADD_TRANSACTION, entry);

                // Clear Inputs (except date maybe? User said default to today, so keep it?)
                // Let's reset amounts to empty to force re-entry or 0
                profitInput.value = '';
                lossInput.value = '';
                posInput.value = '';
                usdtInput.value = '';
                eurInput.value = '';
                checkFormValidity();
            });
        }

        // Hide Old Category Containers
        // ... (Already removed from HTML, but keep safety check in render)

        // Sort Header
        const sortHeader = document.getElementById('weekly-sort-date');
        if (sortHeader) {
            sortHeader.addEventListener('click', () => {
                const currentOrder = this.state.weeklyStats.sortOrder || 'desc';
                const newOrder = currentOrder === 'asc' ? 'desc' : 'asc';
                this.onAction(WeeklyStatsActionType.UPDATE_SORT_ORDER, newOrder);
            });
        }

        // Settings Actions - Helper
        // ...

        // Date Period Filter Actions
        document.getElementById('weekly-date-filter-type')?.addEventListener('change', (e) => {
            const val = (e.target as HTMLSelectElement).value;
            this.onAction(WeeklyStatsActionType.UPDATE_DATE_FILTER_TYPE, val);
        });

        document.getElementById('weekly-filter-start-date')?.addEventListener('change', (e) => {
            const val = (e.target as HTMLInputElement).value;
            this.onAction(WeeklyStatsActionType.UPDATE_CUSTOM_START_DATE, val);
        });

        document.getElementById('weekly-filter-end-date')?.addEventListener('change', (e) => {
            const val = (e.target as HTMLInputElement).value;
            this.onAction(WeeklyStatsActionType.UPDATE_CUSTOM_END_DATE, val);
        });
    }

    public render() {
        // Update Date Period Filter UI
        const dateSelect = document.getElementById('weekly-date-filter-type') as HTMLSelectElement;
        const customGroup = document.getElementById('weekly-custom-date-group') as HTMLElement;
        const startDateInput = document.getElementById('weekly-filter-start-date') as HTMLInputElement;
        const endDateInput = document.getElementById('weekly-filter-end-date') as HTMLInputElement;

        if (dateSelect) dateSelect.value = this.state.weeklyStats.dateFilterType || 'all';

        if (customGroup) {
            const isCustom = this.state.weeklyStats.dateFilterType === 'custom';
            customGroup.style.display = isCustom ? 'grid' : 'none';
            if (isCustom) {
                if (startDateInput) startDateInput.value = this.state.weeklyStats.customStartDate || '';
                if (endDateInput) endDateInput.value = this.state.weeklyStats.customEndDate || '';
            }
        }

        const filteredTransactions = WeeklyStatsService.getFilteredTransactions(this.state.weeklyStats);

        // Disable Stats Calculation for now as the logic was removed/deprecated
        // const stats = WeeklyStatsService.calculateStats(this.state.weeklyStats.transactions, filteredTransactions);
        // this.analyticsRenderer.renderStats(stats);

        this.tableRenderer.render(filteredTransactions, this.state.weeklyStats);

        // Render Period Profit Widget
        const periodProfit = WeeklyStatsService.calculatePeriodProfit(filteredTransactions);
        const periodProfitWidget = document.getElementById('weekly-period-profit');
        if (periodProfitWidget) {
            periodProfitWidget.textContent = `$${Math.round(periodProfit).toLocaleString('ru-RU').replace(',', ' ')}`;
        }

        // Render Accumulated Profit Widget
        this.renderAccumulatedProfit();
    }

    private renderAccumulatedProfit() {
        // Business logic moved to Service
        const totalAccumulated = WeeklyStatsService.calculateAccumulatedProfit(this.state.weeklyStats, this.state.financial);

        const widget = document.getElementById('weekly-accumulated-profit');
        if (widget) {
            widget.textContent = `$${Math.round(totalAccumulated).toLocaleString('ru-RU').replace(',', ' ')}`;
        }

        // Render Dynamic Deposit
        const deposit = FinancialService.calculateDeposit(this.state.financial);
        const depDisplay = document.getElementById('weekly-deposit-display');
        if (depDisplay) depDisplay.innerHTML = `$${deposit.toLocaleString()}`;

        // Render Sum in Positions (Last Entry)
        // usage of getLatestEntry ensures we show the latest status regardless of date filter
        const lastEntry = WeeklyStatsService.getLatestEntry(this.state.weeklyStats);

        const positionsDisplay = document.getElementById('weekly-positions-display');
        let positionsVal = 0;
        if (positionsDisplay) {
            // Strip non-numeric characters (except dot and minus) before parsing
            // This handles '$', spaces, and potential currency symbols
            const rawVal = lastEntry ? lastEntry.positionsAmount.replace(/[^\d.-]/g, '') : '0';
            positionsVal = parseFloat(rawVal) || 0;
            positionsDisplay.innerText = `$${positionsVal.toLocaleString('ru-RU').replace(',', ' ')}`;
        }

        // Render % of Deposit
        const depositPercentDisplay = document.getElementById('weekly-deposit-percent-display');
        if (depositPercentDisplay) {
            const pct = deposit > 0 ? (positionsVal / deposit) * 100 : 0;
            depositPercentDisplay.innerText = `${pct.toFixed(0)}%`;
        }

        const catContainer = document.getElementById('weekly-category-container');
        if (catContainer) catContainer.style.display = 'none';

        const filterCatContainer = document.getElementById('weekly-filter-category-container');
        if (filterCatContainer) filterCatContainer.style.display = 'none';

        // this.settingsRenderer.renderTypeEditor();
        // this.settingsRenderer.renderCategoryEditor();
    }
}
