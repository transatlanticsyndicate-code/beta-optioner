
export class DateUtils {
    /**
     * Returns today's date in YYYY-MM-DD format (local time).
     */
    static getTodayISO(): string {
        const now = new Date();
        return new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    }

    static getDateRange(type: string, customStart: string | null | undefined, customEnd: string | null | undefined): { start: string | null; end: string | null } {
        const todayStr = this.getTodayISO();
        const now = new Date();

        switch (type) {
            case 'year': {
                const start = `${now.getFullYear()}-01-01`;
                return { start, end: todayStr };
            }
            case 'last_year': {
                const lastYear = now.getFullYear() - 1;
                return { start: `${lastYear}-01-01`, end: `${lastYear}-12-31` };
            }
            case 'month': {
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const start = `${now.getFullYear()}-${month}-01`;
                return { start, end: todayStr };
            }
            case 'last_month': {
                const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const year = lastMonthDate.getFullYear();
                const month = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
                const lastDay = new Date(year, lastMonthDate.getMonth() + 1, 0).getDate();
                return { start: `${year}-${month}-01`, end: `${year}-${month}-${lastDay}` };
            }
            case 'custom':
                return { start: customStart || null, end: customEnd || null };
            default:
                return { start: null, end: null };
        }
    }
}
