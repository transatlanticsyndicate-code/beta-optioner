import { FinancialEntry, FinancialState, FinancialCategory } from './types';

export class FinancialTableRenderer {
    private hasScrolledToBottom = false;

    constructor() { }

    public resetAutoScroll() {
        this.hasScrolledToBottom = false;
    }

    // Экранирование значений, попадающих в атрибуты HTML (текст примечания/категории)
    private static escapeAttr(value: string): string {
        return (value || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // Подбираем id категории, соответствующей сохранённой в записи строке "ТИП - Деталь".
    // Возвращает '' если категория была удалена/переименована и совпадения нет.
    private static matchCategoryId(entry: FinancialEntry, state: FinancialState): string {
        const target = entry.category;
        for (const cat of state.categories) {
            const type = state.types.find(t => t.id === cat.typeId);
            const typeName = type ? type.name.toUpperCase() : 'UNKNOWN';
            if (`${typeName} - ${cat.name}` === target) return cat.id;
        }
        return '';
    }

    // Строит ВНУТРЕННЕЕ содержимое ячейки суммы (USD: одно поле, EUR: сумма + курс + предпросмотр).
    // Используется и при входе в редактирование, и при смене категории (другой валюты).
    public static buildEditAmountCell(
        currency: 'USD' | 'EUR',
        values: { usd?: string; eur?: string; rate?: string } = {}
    ): string {
        if (currency === 'EUR') {
            const eur = values.eur ?? '';
            const rate = values.rate ?? '';
            const eurNum = parseFloat(eur) || 0;
            const rateNum = parseFloat(rate) || 0;
            const preview = `$${Math.round(eurNum * rateNum).toLocaleString()}`;
            return `
                <div style="display:flex; align-items:center; gap:4px; justify-content:flex-end;">
                    <div style="position:relative; display:flex; align-items:center;">
                        <span style="position:absolute; left:6px; color:var(--text-secondary); pointer-events:none;">€</span>
                        <input type="number" class="fin-edit-input" data-field="eurAmount" value="${eur}" min="0" step="0.01" style="width:70px; padding-left:16px;" />
                    </div>
                    <input type="number" class="fin-edit-input" data-field="eurRate" value="${rate}" step="0.0001" min="0" title="Курс" style="width:64px;" />
                    <span class="fin-edit-usd-preview" style="font-size:0.8em; color:var(--text-secondary); min-width:54px; text-align:right;">${preview}</span>
                </div>
            `;
        }

        const usd = values.usd ?? '';
        return `
            <div style="position:relative; display:flex; align-items:center;">
                <span style="position:absolute; left:6px; color:var(--text-secondary); pointer-events:none;">$</span>
                <input type="number" class="fin-edit-input" data-field="usdAmount" value="${usd}" min="0" step="0.01" style="width:100%; padding-left:16px; text-align:right;" />
            </div>
        `;
    }

    // Строит выпадающий список категорий, сгруппированный по типам (optgroup).
    private static buildCategorySelect(entry: FinancialEntry, state: FinancialState): string {
        const selectedId = FinancialTableRenderer.matchCategoryId(entry, state);

        // Группируем категории по типам — как в форме добавления
        const groups: Record<string, FinancialCategory[]> = {};
        state.categories.forEach(c => {
            const type = state.types.find(t => t.id === c.typeId);
            const typeKey = type ? type.name.toUpperCase() : 'UNKNOWN';
            if (!groups[typeKey]) groups[typeKey] = [];
            groups[typeKey].push(c);
        });

        // Если категория записи не найдена (удалена/переименована) — заставляем выбрать заново
        const placeholder = selectedId
            ? ''
            : `<option value="" selected disabled>Выберите категорию</option>`;

        let optionsHtml = '';
        for (const typeName in groups) {
            optionsHtml += `<optgroup label="${FinancialTableRenderer.escapeAttr(typeName)}">`;
            groups[typeName].forEach(c => {
                const sel = c.id === selectedId ? 'selected' : '';
                optionsHtml += `<option value="${c.id}" ${sel}>${FinancialTableRenderer.escapeAttr(c.name)}</option>`;
            });
            optionsHtml += `</optgroup>`;
        }

        return `<select class="fin-edit-input" data-field="category">${placeholder}${optionsHtml}</select>`;
    }

    public render(transactions: FinancialEntry[], financialState: FinancialState, editingId: string | null = null) {
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

        const pencilSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>`;
        const trashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
        const checkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

        tbody.innerHTML = transactions.map(t => {
            const isEditing = editingId === t.id;

            if (isEditing) {
                const currency: 'USD' | 'EUR' = t.originalCurrency === 'EUR' ? 'EUR' : 'USD';
                const amountInner = FinancialTableRenderer.buildEditAmountCell(currency, {
                    usd: currency === 'USD' ? String(t.amountUSD) : '',
                    eur: t.originalAmount !== undefined ? String(t.originalAmount) : '',
                    rate: t.exchangeRate !== undefined ? String(t.exchangeRate) : ''
                });

                return `
                <tr data-editing-id="${t.id}" class="fin-row-editing">
                    <td style="width: 130px;">
                        <input type="date" class="fin-edit-input" data-field="date" value="${t.date}" />
                    </td>
                    <td>${FinancialTableRenderer.buildCategorySelect(t, financialState)}</td>
                    <td class="fin-edit-amount-cell" style="text-align: right;">${amountInner}</td>
                    <td>
                        <input type="text" class="fin-edit-input" data-field="description" value="${FinancialTableRenderer.escapeAttr(t.description)}" placeholder="Примечание" style="text-align:left;" />
                    </td>
                    <td style="text-align: center; white-space: nowrap;">
                        <button class="save-btn" data-id="${t.id}" title="Сохранить">${checkSvg}</button>
                        <button class="cancel-btn" data-id="${t.id}" title="Отменить">${trashSvg}</button>
                    </td>
                </tr>
                `;
            }

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
                container.scrollTop = container.scrollHeight;
                this.hasScrolledToBottom = true;
            }
        }
    }
}
