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
    private editingId: string | null = null;

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
        const tbody = document.getElementById('weekly-entry-list');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;

                // Edit (pencil) — войти в режим редактирования
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
                const delBtn = target.closest('.delete-btn') as HTMLElement;
                if (delBtn) {
                    const id = delBtn.dataset.id;
                    if (id && confirm('Вы уверены, что хотите удалить эту запись?')) {
                        this.onAction(WeeklyStatsActionType.DELETE_TRANSACTION, id);
                    }
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

        // Если редактируемой записи больше нет в данных (например, удалена другим путём), сбросить editingId
        if (this.editingId !== null && !filteredTransactions.some(t => t.id === this.editingId)) {
            this.editingId = null;
        }

        // Disable Stats Calculation for now as the logic was removed/deprecated
        // const stats = WeeklyStatsService.calculateStats(this.state.weeklyStats.transactions, filteredTransactions);
        // this.analyticsRenderer.renderStats(stats);

        this.tableRenderer.render(filteredTransactions, this.state.weeklyStats, this.editingId);

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

    // Перерисовка только таблицы — для смены режима редактирования без перерасчёта виджетов
    private renderTable() {
        const filteredTransactions = WeeklyStatsService.getFilteredTransactions(this.state.weeklyStats);
        this.tableRenderer.render(filteredTransactions, this.state.weeklyStats, this.editingId);
    }

    private saveEditing(id: string) {
        const row = document.querySelector(`tr[data-editing-id="${id}"]`) as HTMLTableRowElement | null;
        if (!row) return;

        const getVal = (field: string): string => {
            const input = row.querySelector(`input[data-field="${field}"]`) as HTMLInputElement | null;
            return input ? input.value : '';
        };

        const dateVal = getVal('date');
        const profitVal = getVal('weeklyProfit');
        const lossVal = getVal('portfolioLoss');
        const posVal = getVal('positionsAmount');
        const usdtVal = getVal('readyUSDT');
        const eurVal = getVal('readyEUR');

        // Те же правила валидации, что и при создании
        const isValid = dateVal &&
            profitVal !== '' &&
            lossVal !== '' &&
            posVal !== '' &&
            usdtVal !== '' &&
            eurVal !== '';

        if (!isValid) {
            alert('Заполните все поля перед сохранением.');
            return;
        }

        const created = WeeklyStatsService.createEntry({
            date: dateVal,
            weeklyProfit: profitVal,
            portfolioLoss: lossVal,
            positionsAmount: posVal,
            readyUSDT: usdtVal,
            readyEUR: eurVal
        });

        // Сохраняем оригинальный id, чтобы запись осталась той же
        const updated = { ...created, id };

        this.editingId = null;
        this.onAction(WeeklyStatsActionType.UPDATE_TRANSACTION, updated);
    }
}
