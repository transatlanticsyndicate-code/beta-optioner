import { FinancialEntry, FinancialState } from './types';

export class FinancialTableRenderer {
    private hasScrolledToBottom = false;

    constructor() { }

    public resetAutoScroll() {
        this.hasScrolledToBottom = false;
    }

    public render(transactions: FinancialEntry[], financialState: FinancialState) {
        const tbody = document.getElementById('fin-entry-list');
        if (!tbody) return;

        if (transactions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 20px;">Записей нет</td></tr>`;
            return;
        }

        // Update Sort Arrow
        const indicator = document.getElementById('fin-sort-indicator');
        if (indicator) {
            const order = financialState.sortOrder || 'asc';
            indicator.textContent = order === 'asc' ? '▲' : '▼';
        }

        tbody.innerHTML = transactions.map(t => {
            const isExpense = t.type === 'expense';
            const sign = isExpense ? '-' : '+';

            // date is YYYY-MM-DD
            const dateStr = t.date.split('-').reverse().join('.');

            const usdFormatted = `$${Math.round(t.amountUSD).toLocaleString()}`;
            const mainDisplay = `${sign}${usdFormatted}`;

            let secondaryDisplay = '';
            if (t.originalCurrency === 'EUR' && t.originalAmount) {
                secondaryDisplay = `<span style="font-size:0.8em; color:var(--text-secondary); margin-right: 6px; font-weight: normal;">(€${Math.round(t.originalAmount).toLocaleString()})</span>`;
            }

            let badgeClass = 'category-badge-default';
            const catUpper = t.category.toUpperCase();
            if (catUpper.includes('ВВОД')) badgeClass = 'category-badge-input';
            else if (catUpper.includes('ВЫВОД СРЕДСТВ')) badgeClass = 'category-badge-output';
            else if (catUpper.includes('ВЫВОД ПРИБЫЛИ')) badgeClass = 'category-badge-profit';

            return `
                <tr>
                    <td style="color:var(--text-secondary); width: 85px;">${dateStr}</td>
                    <td><span class="category-badge ${badgeClass}">${catUpper}</span></td>
                    <td style="text-align: right; font-weight: 600;">
                        ${secondaryDisplay}
                        ${mainDisplay}
                    </td>
                    <td style="color:var(--text-secondary); font-style: italic;">${t.description}</td>
                    <td style="text-align: center;">
                         <button class="delete-btn" data-id="${t.id}" title="Удалить">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach listeners (though FinancialRenderer handles delegation, we should ensure delete-btn works)
        // Actually, FinancialRenderer uses event delegation on global level or in initEventListeners.
        // I will let the coordinator handle the delegation.

        if (!this.hasScrolledToBottom && transactions.length > 0) {
            const container = tbody.closest('.asset-table-container');
            if (container) {
                container.scrollTop = container.scrollHeight;
                this.hasScrolledToBottom = true;
            }
        }
    }
}
