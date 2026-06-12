// ЗАЧЕМ: тонкий клиент к нашему backend (/api) вместо Supabase.
// Хранит токен-пропуск в localStorage, шлёт его в каждом защищённом запросе.

const TOKEN_KEY = 'crypto_api_token';

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
}

/** Вход по паролю. Возвращает true при успехе и сохраняет токен. */
export async function login(password: string): Promise<boolean> {
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.token) {
        setToken(data.token);
        return true;
    }
    return false;
}

/** Прочитать облачное состояние. null — если ещё ничего не сохранено. Бросает 'UNAUTHORIZED' при 401. */
export async function loadState(): Promise<any | null> {
    const token = getToken();
    const res = await fetch('/api/state', {
        headers: { 'Authorization': `Bearer ${token ?? ''}` },
    });
    if (res.status === 401) throw new Error('UNAUTHORIZED');
    if (!res.ok) throw new Error(`loadState failed: ${res.status}`);
    const data = await res.json();
    return data?.content ?? null;
}

/** Сохранить облачное состояние. Бросает 'UNAUTHORIZED' при 401. */
export async function saveState(content: any): Promise<void> {
    const token = getToken();
    const res = await fetch('/api/state', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ content }),
    });
    if (res.status === 401) throw new Error('UNAUTHORIZED');
    if (!res.ok) throw new Error(`saveState failed: ${res.status}`);
}
