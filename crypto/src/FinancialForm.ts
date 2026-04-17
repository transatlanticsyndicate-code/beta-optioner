import { State, FinancialCategory, FinancialActionType } from './types';
import { FinancialService } from './FinancialService';
import { DateUtils } from './DateUtils';
import { UIComponents } from './UIComponents';

export class FinancialForm {
    private state: State;
    private onAction: (type: string, payload?: unknown) => void;
    private selectedCategoryId: string | null = null;
    private updateCallback: () => void; // call parent render if needed or local render

    constructor(state: State, onAction: (type: string, payload?: unknown) => void, updateCallback: () => void) {
        this.state = state;
        this.onAction = onAction;
        this.updateCallback = updateCallback;
    }

    public updateState(state: State) {
        this.state = state;
    }

    public getSelectedCategoryId(): string | null {
        return this.selectedCategoryId;
    }

    public render() {
        // Render Category Select using UIComponents
        UIComponents.renderCategoryCustomSelect(
            'fin-category-container',
            this.state.financial.categories,
            this.state.financial.types,
            this.selectedCategoryId,
            (id) => this.handleCategoryChange(id as string | null)
        );

        // Allow parent/wrapper to handle other parts if needed, but we handle inputs here
        // We might need to call renderAmountGroup if category is selected
        const category = this.selectedCategoryId ? this.getCategoryById(this.selectedCategoryId) : undefined;
        if (category) {
            // Check if amount group is empty or needs re-render?
            // Actually, we should just ensure checking existence
            // The logic was: handleCategoryChange -> render() -> renderAmountGroup()
            // We can do it here.
            // But wait, renderAmountGroup is async.
            // We probably shouldn't call it on every render unless needed.
            // But render() is called on state update.
            // Let's assume we call it.
        }

        // Render inputs validation
        this.validateForm();
    }

    public handleCategoryChange(categoryId: string | null) {
        this.selectedCategoryId = categoryId;
        this.updateCallback(); // This triggers full re-render including this form

        if (!categoryId) {
            this.renderDefaultAmountInput();
            return;
        }

        const category = this.getCategoryById(categoryId);
        if (category) {
            this.renderAmountGroup(category);
        }
    }

    public initEventListeners() {
        const addBtn = document.getElementById('fin-add-entry-btn');
        const dateInput = document.getElementById('fin-date-input') as HTMLInputElement;

        if (dateInput) {
            dateInput.value = DateUtils.getTodayISO();
            dateInput.addEventListener('input', () => this.validateForm());
        }

        if (addBtn) {
            addBtn.addEventListener('click', () => this.handleAddEntry());
        }
    }

    private getCategoryById(id: string): FinancialCategory | undefined {
        return this.state.financial.categories.find(c => c.id === id);
    }

    private async renderAmountGroup(category: FinancialCategory) {
        if (category.currency === 'EUR') {
            const rate = await FinancialService.fetchEurRate();
            this.renderEurAmountInput(rate);
        } else {
            this.renderDefaultAmountInput();
        }
    }

    private renderDefaultAmountInput() {
        const amountGroup = document.getElementById('fin-amount-group');
        if (!amountGroup) return;
        amountGroup.innerHTML = `
            <div style="position:relative; display:flex; align-items:center;">
                <span style="position:absolute; left:8px; color:var(--text-secondary); pointer-events:none;">$</span>
                <input type="number" id="fin-amount-input" placeholder="0.00" min="0" step="0.01" style="width: 100px; padding-left: 20px;" />
            </div>
        `;
        const usdInput = document.getElementById('fin-amount-input') as HTMLInputElement;
        usdInput?.addEventListener('input', () => this.validateForm());
        this.validateForm();
    }

    private renderEurAmountInput(rate: number) {
        const amountGroup = document.getElementById('fin-amount-group');
        if (!amountGroup) return;
        amountGroup.innerHTML = `
            <div style="position:relative; display:flex; align-items:center;">
                <span style="position:absolute; left:8px; color:var(--text-secondary); pointer-events:none;">€</span>
                <input type="number" id="fin-amount-eur" placeholder="0.00" min="0" step="0.01" style="width: 80px; padding-left: 20px;" />
            </div>
            <div style="position:relative; display:flex; align-items:center;">
                 <input type="number" id="fin-rate-input" placeholder="Курс" value="${rate}" step="0.0001" style="width: 70px;" />
            </div>
            <div id="fin-usd-preview" style="font-size: 0.8rem; color: var(--text-secondary); min-width: 60px;">$0.00</div>
        `;

        const eurInput = document.getElementById('fin-amount-eur') as HTMLInputElement;
        const rateInput = document.getElementById('fin-rate-input') as HTMLInputElement;
        const preview = document.getElementById('fin-usd-preview');

        const updatePreview = () => {
            const eur = parseFloat(eurInput.value) || 0;
            const r = parseFloat(rateInput.value) || 0;
            if (preview) preview.textContent = `$${Math.round(eur * r).toLocaleString()}`;
            this.validateForm();
        };

        eurInput.addEventListener('input', updatePreview);
        rateInput.addEventListener('input', updatePreview);
        this.validateForm();
    }

    private validateForm() {
        const addBtn = document.getElementById('fin-add-entry-btn') as HTMLButtonElement;
        const dateInput = document.getElementById('fin-date-input') as HTMLInputElement;
        const eurInput = document.getElementById('fin-amount-eur') as HTMLInputElement;
        const rateInput = document.getElementById('fin-rate-input') as HTMLInputElement;
        const usdInput = document.getElementById('fin-amount-input') as HTMLInputElement;

        let isValid = true;
        const categoryId = this.selectedCategoryId;
        if (!categoryId) isValid = false;
        if (!dateInput || !dateInput.value) isValid = false;

        const category = categoryId ? this.getCategoryById(categoryId) : undefined;

        if (category) {
            if (category.currency === 'EUR') {
                if (!eurInput || !rateInput) isValid = false;
                else if (parseFloat(eurInput.value) <= 0 || isNaN(parseFloat(eurInput.value))) isValid = false;
                else if (parseFloat(rateInput.value) <= 0 || isNaN(parseFloat(rateInput.value))) isValid = false;
            } else {
                if (!usdInput) isValid = false;
                else if (parseFloat(usdInput.value) <= 0 || isNaN(parseFloat(usdInput.value))) isValid = false;
            }
        } else {
            isValid = false;
        }

        if (addBtn) addBtn.disabled = !isValid;
    }

    private handleAddEntry() {
        const dateInput = document.getElementById('fin-date-input') as HTMLInputElement;
        const noteInput = document.getElementById('fin-note-input') as HTMLInputElement;
        const eurInput = document.getElementById('fin-amount-eur') as HTMLInputElement;
        const rateInput = document.getElementById('fin-rate-input') as HTMLInputElement;
        const usdInput = document.getElementById('fin-amount-input') as HTMLInputElement;

        const categoryId = this.selectedCategoryId;
        if (!categoryId) {
            alert('Выберите категорию');
            return;
        }

        const newEntry = FinancialService.createEntry({
            categoryId,
            dateStr: dateInput?.value || '',
            note: noteInput?.value || '',
            eurAmount: eurInput?.value,
            eurRate: rateInput?.value,
            usdAmount: usdInput?.value,
            state: this.state.financial
        });

        if (!newEntry) return;

        // Reset state before action to ensure UI reflects it after render
        this.selectedCategoryId = null;
        if (noteInput) noteInput.value = '';

        this.renderDefaultAmountInput();

        this.onAction(FinancialActionType.ADD_TRANSACTION, newEntry);

        // We need to trigger local updates too slightly
        this.validateForm();
        this.updateCallback(); // Full refresh
    }
}
