// ЗАЧЕМ: простой парольный вход вместо Supabase Auth.
// Если в браузере есть валидный токен — сразу запускаем приложение (onReady).
// Иначе показываем экран ввода пароля; после успешного входа — onReady().
import { getToken, login, clearToken } from './lib/api';

export class Auth {
    private onReady: () => void | Promise<void>;

    constructor(onReady: () => void | Promise<void>) {
        this.onReady = onReady;
        this.init();
    }

    private async init() {
        if (getToken()) {
            // токен есть — пробуем сразу запуститься; при 401 Store бросит UNAUTHORIZED
            try {
                await this.start();
                return;
            } catch (e) {
                if ((e as Error).message === 'UNAUTHORIZED') {
                    clearToken();
                } else {
                    console.error('Startup error', e);
                    return;
                }
            }
        }
        this.renderLogin();
    }

    /** Показать защищённый контент и запустить загрузку данных. */
    private async start() {
        this.revealProtectedView();
        await this.onReady();
    }

    /** Раскрыть защищённый блок страницы (как было при «отключённом» Auth). */
    private revealProtectedView() {
        const protectedView = document.getElementById('protected-view');
        const publicView = document.getElementById('public-view');
        const globalStats = document.getElementById('global-stats');

        if (protectedView) protectedView.style.display = 'contents';
        if (globalStats) globalStats.style.display = 'flex';
        if (publicView) {
            publicView.style.display = 'none';
            publicView.innerHTML = '';
        }
        const authContainer = document.getElementById('auth-container');
        if (authContainer) authContainer.innerHTML = '';
    }

    private renderLogin() {
        const overlay = document.createElement('div');
        overlay.id = 'crypto-login-overlay';
        overlay.style.cssText =
            'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
            'background:var(--bg-color,#0e0e12);z-index:9999;';
        overlay.innerHTML = `
            <form id="crypto-login-form" style="display:flex;flex-direction:column;gap:12px;
                 min-width:280px;padding:28px;border:1px solid var(--border-color,#333);
                 border-radius:10px;background:var(--panel-bg,#16161c);">
                <div style="font-size:1.1rem;color:var(--text-primary,#eee);text-align:center;">
                    Вход</div>
                <input id="crypto-login-pw" type="password" placeholder="Пароль" autofocus
                    style="padding:10px;border-radius:6px;border:1px solid var(--border-color,#333);
                    background:var(--input-bg,#0e0e12);color:var(--text-primary,#eee);" />
                <div id="crypto-login-err" style="color:#e06;font-size:0.8rem;min-height:1em;"></div>
                <button type="submit" style="padding:10px;border-radius:6px;border:none;
                    background:var(--accent-color,#3b82f6);color:#fff;cursor:pointer;">Войти</button>
            </form>`;
        document.body.appendChild(overlay);

        const form = overlay.querySelector('#crypto-login-form') as HTMLFormElement;
        const input = overlay.querySelector('#crypto-login-pw') as HTMLInputElement;
        const err = overlay.querySelector('#crypto-login-err') as HTMLDivElement;

        form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            err.textContent = '';
            const ok = await login(input.value).catch(() => false);
            if (!ok) {
                err.textContent = 'Неверный пароль';
                input.select();
                return;
            }
            try {
                await this.start();
                overlay.remove();
            } catch (e) {
                err.textContent = 'Ошибка загрузки данных';
                console.error(e);
            }
        });
    }
}
