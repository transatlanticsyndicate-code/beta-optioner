import { WeeklyStatsEntry, WeeklyStatsState } from './types';

export class WeeklyStatsTableRenderer {
    private hasScrolledToBottom = false;

    constructor() { }

    public resetAutoScroll() {
        this.hasScrolledToBottom = false;
    }

    public render(transactions: WeeklyStatsEntry[], statsState: WeeklyStatsState, editingId: string | null = null) {
        const tbody = document.getElementById('weekly-entry-list');
        if (!tbody) return;

        if (transactions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 20px;">Записей нет</td></tr>`;
            return;
        }

        // Update Sort Arrow
        const indicator = document.getElementById('weekly-sort-indicator');
        if (indicator) {
            const order = statsState.sortOrder || 'desc';
            indicator.textContent = order === 'asc' ? '▲' : '▼';
        }

        const pencilSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>`;
        const trashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
        const checkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

        const parseNum = (str: string): string => {
            const cleaned = (str || '').replace(/[$\s€]/g, '').replace(',', '.');
            const num = parseFloat(cleaned);
            return isNaN(num) ? '' : String(num);
        };

        const toIsoDate = (date: string): string => {
            const parts = (date || '').split('.');
            return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : '';
        };

        tbody.innerHTML = transactions.map(t => {
            const isEditing = editingId === t.id;

            if (isEditing) {
                return `
                <tr data-editing-id="${t.id}" class="weekly-row-editing">
                    <td style="width: 130px;">
                        <input type="date" class="weekly-edit-input" data-field="date" value="${toIsoDate(t.date)}" />
                    </td>
                    <td>
                        <input type="number" step="0.01" class="weekly-edit-input" data-field="weeklyProfit" value="${parseNum(t.weeklyProfit)}" />
                    </td>
                    <td style="text-align: right; color: var(--text-secondary);">—</td>
                    <td>
                        <input type="number" step="0.01" class="weekly-edit-input" data-field="portfolioLoss" value="${parseNum(t.portfolioLoss)}" />
                    </td>
                    <td style="text-align: right; color: var(--text-secondary);">—</td>
                    <td>
                        <input type="number" step="0.01" min="0" class="weekly-edit-input" data-field="positionsAmount" value="${parseNum(t.positionsAmount)}" />
                    </td>
                    <td>
                        <input type="number" step="0.01" min="0" class="weekly-edit-input" data-field="readyUSDT" value="${parseNum(t.readyUSDT)}" />
                    </td>
                    <td>
                        <input type="number" step="0.01" min="0" class="weekly-edit-input" data-field="readyEUR" value="${parseNum(t.readyEUR)}" />
                    </td>
                    <td style="text-align: center; white-space: nowrap;">
                        <button class="save-btn" data-id="${t.id}" title="Сохранить">${checkSvg}</button>
                        <button class="cancel-btn" data-id="${t.id}" title="Отменить">${trashSvg}</button>
                    </td>
                </tr>
                `;
            }

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
                    <td style="text-align: center; white-space: nowrap;">
                         <button class="edit-btn" data-id="${t.id}" title="Редактировать">${pencilSvg}</button>
                         <button class="delete-btn" data-id="${t.id}" title="Удалить">${trashSvg}</button>
                    </td>
                </tr>
            `;
        }).join('');

        if (!this.hasScrolledToBottom && transactions.length > 0) {
            const container = tbody.closest('.asset-table-container');
            if (container) {
                this.hasScrolledToBottom = true;
            }
        }
    }
}
