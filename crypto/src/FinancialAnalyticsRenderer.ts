export class FinancialAnalyticsRenderer {
    // Analytics/Chart Colors (Extracted from magic strings)
    private static readonly COLORS = {
        PROFIT: '#2da4a8',
        WITHDRAWAL: '#3fb950',
        FALLBACK: 'var(--danger-color)',
        BG_BAR: 'var(--highlight-header)'
    };

    constructor() { }

    public renderStats(stats: { totalBalance: number, monthlyIncome: number, monthlyExpense: number }) {
        const balanceEl = document.getElementById('fin-total-balance');
        const incomeEl = document.getElementById('fin-monthly-income');
        const expenseEl = document.getElementById('fin-monthly-expense');

        if (balanceEl) balanceEl.textContent = `$${Math.round(stats.totalBalance).toLocaleString()}`;
        if (incomeEl) incomeEl.textContent = `+$${Math.round(stats.monthlyIncome).toLocaleString()}`;
        if (expenseEl) expenseEl.textContent = `-$${Math.round(stats.monthlyExpense).toLocaleString()}`;
    }

    public renderAnalyticsSummary(data: { type: string; total: number; categories: { name: string; total: number }[] }[]) {
        const container = document.getElementById('fin-analytics-summary');
        if (!container) return;

        if (data.length === 0) {
            container.innerHTML = `<p style="color: var(--text-secondary); font-size: 0.85rem; text-align: center;">Нет данных</p>`;
            return;
        }

        let html = `<div style="display: flex; flex-direction: column; gap: 12px;">`;

        data.forEach((group, index) => {
            const isPositive = group.type.includes('ВВОД') || group.type.includes('ДОХОД');
            const colorClass = isPositive ? 'fin-positive' : 'fin-negative';
            const sign = isPositive ? '+' : '-';
            const isLast = index === data.length - 1;
            const borderStyle = isLast ? 'padding-bottom: 8px;' : 'border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 8px;';

            let badgeClass = 'category-badge-default';
            if (group.type.includes('ВВОД')) badgeClass = 'category-badge-input';
            else if (group.type.includes('ВЫВОД СРЕДСТВ')) badgeClass = 'category-badge-output';
            else if (group.type.includes('ВЫВОД ПРИБЫЛИ')) badgeClass = 'category-badge-profit';

            const categoriesHtml = group.categories.map(c => `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span class="category-badge ${badgeClass}" style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; font-family: var(--font-mono);">${c.name.toUpperCase()}</span>
                    <span style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem; font-family: var(--font-mono);">${sign}$${Math.round(c.total).toLocaleString()}</span>
                </div>
            `).join('');

            html += `
                <div style="${borderStyle}">
                    <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 0.9rem; margin-bottom: 8px;">
                        <span style="color: var(--text-primary); text-transform: uppercase; font-family: var(--font-mono);">${group.type}</span>
                        <span class="${colorClass}" style="font-family: var(--font-mono);">${sign}$${Math.round(group.total).toLocaleString()}</span>
                    </div>
                    <div style="padding-left: 0;">
                        ${categoriesHtml}
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;
    }

    public renderExpenseChart(data: { type: string; total: number; categories: { name: string; total: number }[] }[]) {
        const container = document.getElementById('fin-analytics-chart-container');
        if (!container) return;

        const relevantGroups = data.filter(g =>
            g.type.includes('ВЫВОД СРЕДСТВ') ||
            g.type.includes('ВЫВОД ПРИБЫЛИ')
        );

        if (relevantGroups.length === 0) {
            container.innerHTML = `
                <div style="height: 150px; display: flex; align-items: center; justify-content: center; background: var(--highlight-header); border-radius: 4px;">
                     <span style="font-size: 0.8rem; color: var(--text-secondary);">Нет данных о расходах</span>
                </div>`;
            return;
        }

        const items: { name: string; amount: number; color: string }[] = [];
        relevantGroups.forEach(g => {
            const isProfit = g.type.includes('ВЫВОД ПРИБЫЛИ');
            const isWithdrawal = g.type.includes('ВЫВОД СРЕДСТВ');

            let color = FinancialAnalyticsRenderer.COLORS.FALLBACK;
            if (isProfit) color = FinancialAnalyticsRenderer.COLORS.PROFIT;
            else if (isWithdrawal) color = FinancialAnalyticsRenderer.COLORS.WITHDRAWAL;

            g.categories.forEach(c => {
                items.push({
                    name: c.name,
                    amount: Math.abs(c.total),
                    color: color
                });
            });
        });

        items.sort((a, b) => b.amount - a.amount);
        if (items.length === 0) return;

        const maxAmount = items[0].amount;

        const barsHtml = items.map(item => {
            const widthPercent = (item.amount / maxAmount) * 100;
            return `
                <div style="margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 2px; font-family: var(--font-mono);">
                        <span style="color: var(--text-secondary); max-width: 70%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.name}">${item.name.toUpperCase()}</span>
                        <span style="color: var(--text-secondary); font-weight: 500;">$${Math.round(item.amount).toLocaleString()}</span>
                    </div>
                    <div style="width: 100%; background: ${FinancialAnalyticsRenderer.COLORS.BG_BAR}; height: 6px; border-radius: 3px; overflow: hidden;">
                        <div style="width: ${widthPercent}%; height: 100%; background-color: ${item.color}; border-radius: 3px;"></div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div style="display: flex; flex-direction: column; padding-top: 4px;">
                ${barsHtml}
            </div>
        `;
    }
}
