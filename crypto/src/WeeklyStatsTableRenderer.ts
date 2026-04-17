import { WeeklyStatsEntry, WeeklyStatsState } from './types';

export class WeeklyStatsTableRenderer {
    private hasScrolledToBottom = false;

    constructor() { }

    public resetAutoScroll() {
        this.hasScrolledToBottom = false;
    }

    public render(transactions: WeeklyStatsEntry[], statsState: WeeklyStatsState) {
        const tbody = document.getElementById('weekly-entry-list');
        if (!tbody) return;

        if (transactions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 20px;">Записей нет</td></tr>`;
            return;
        }

        // Update Sort Arrow
        const indicator = document.getElementById('weekly-sort-indicator');
        if (indicator) {
            const order = statsState.sortOrder || 'desc';
            indicator.textContent = order === 'asc' ? '▲' : '▼';
        }

        tbody.innerHTML = transactions.map(t => {
            // Format Ready EUR column
            let eurDisplay = t.readyEUR || '€0';
            const readyEUR = t.readyEUR || '';
            const eurClean = readyEUR.replace(/[€\s]/g, '').replace(',', '.');
            const eurValue = parseFloat(eurClean);

            if (!isNaN(eurValue) && eurValue !== 0) {
                // Simulate conversion rate ~1.1
                const RATE = 1.1;
                const usdValue = eurValue * RATE;
                const usdFormatted = `$${Math.round(usdValue).toLocaleString('ru-RU').replace(',', ' ')}`;
                // Match FinancialTableRenderer style: (EUR) USD
                eurDisplay = `<span style="font-size:0.8em; color:var(--text-secondary); margin-right: 6px; font-weight: normal;">(${t.readyEUR || '€0'})</span>${usdFormatted}`;
            }

            return `
                <tr>
                    <td style="color:var(--text-secondary); width: 100px; text-align: right;">${t.date || '-'}</td>
                    <td style="font-weight: 600; text-align: right;">${t.weeklyProfit || '-'}</td>
                    <td style="text-align: right;">${t.profitPercent || '-'}</td>
                    <td style="font-weight: 600; text-align: right;">${t.portfolioLoss || '-'}</td>
                    <td style="text-align: right;">${t.lossPercent || '-'}</td>
                    <td style="text-align: right;">${t.positionsAmount || '-'}</td>
                    <td style="text-align: right;">${t.readyUSDT || '-'}</td>
                    <td style="text-align: right; font-weight: 600;">${eurDisplay}</td>
                    <td style="text-align: center;">
                         <button class="delete-btn" data-id="${t.id}" title="Удалить">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                         </button>
                    </td>
                </tr>
            `;
        }).join('');

        if (!this.hasScrolledToBottom && transactions.length > 0) {
            const container = tbody.closest('.asset-table-container');
            if (container) {
                // container.scrollTop = container.scrollHeight; // Maybe don't auto scroll for sheet data
                this.hasScrolledToBottom = true;
            }
        }
    }
}
