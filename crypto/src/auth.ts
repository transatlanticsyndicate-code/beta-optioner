
import { User } from '@supabase/supabase-js';

/**
 * Класс Auth отвечает за интеграцию с Supabase Auth, отображение форм входа
 * и управление UI-компонентами профиля пользователя.
 */
export class Auth {
    /** Текущий авторизованный пользователь */
    user: User | null = null;
    /** Колбэк, вызываемый при изменении статуса авторизации */
    onAuthStateChange: ((user: User | null) => void) | null = null;

    constructor(onAuthStateChange?: (user: User | null) => void) {
        this.onAuthStateChange = onAuthStateChange || null;
        this.init();
        this.injectStyles();
    }

    private injectStyles() {
        // Keeping styles for dropdown and avatar, adding styles for inline login
        const style = document.createElement('style');
        style.innerHTML = `
            .auth-dropdown {
                position: absolute;
                top: 100%;
                right: 0;
                margin-top: 8px;
                background: var(--panel-bg);
                border: 1px solid var(--border-color);
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                z-index: 100;
                min-width: 160px;
                display: none;
                flex-direction: column;
                padding: 4px;
            }
            .auth-dropdown.show {
                display: flex;
            }
            .auth-item {
                padding: 8px 12px;
                font-size: 0.85rem;
                color: var(--text-primary);
                cursor: pointer;
                border-radius: 4px;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: background 0.1s;
            }
            .auth-item:hover {
                background: var(--highlight-bg);
            }
            .auth-item.danger {
                color: var(--danger-color);
            }
            .user-avatar-btn {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: var(--btn-bg);
                border: 1px solid var(--border-color);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--text-secondary);
                transition: all 0.2s;
            }
            .user-avatar-btn:hover {
                border-color: var(--accent-color);
                color: var(--accent-color);
            }
            
            /* Inline Login Form Styles */
            .inline-auth-container {
                background: var(--panel-bg);
                padding: 2rem;
                border-radius: 12px;
                border: 1px solid var(--border-color);
                width: 100%;
                max-width: 360px;
                box-shadow: 0 4px 24px rgba(0,0,0,0.2);
                text-align: center;
            }
            .inline-auth-container h2 {
                margin-top: 0;
                margin-bottom: 1.5rem;
                font-size: 1.5rem;
                color: var(--text-primary);
            }
            .inline-auth-input {
                width: 100%;
                margin-bottom: 1rem;
                padding: 10px;
                border-radius: 6px;
                border: 1px solid var(--border-color);
                background: var(--input-bg);
                color: var(--text-primary);
                box-sizing: border-box;
                font-family: inherit;
            }
            .inline-auth-btn {
                width: 100%;
                padding: 10px;
                background: var(--accent-color);
                color: #fff;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
                margin-bottom: 1rem;
                transition: opacity 0.2s;
            }
            .inline-auth-btn:hover {
                opacity: 0.9;
            }
            .inline-auth-switch {
                background: transparent;
                border: none;
                color: var(--text-secondary);
                font-size: 0.9rem;
                cursor: pointer;
                text-decoration: underline;
            }
            .inline-auth-switch:hover {
                color: var(--accent-color);
            }
        `;
        document.head.appendChild(style);
    }

    private async init() {
        // Auth disabled: skip session check, immediately show protected view
        this.handleViewChange();

        // Notify subscriber as if anonymous/guest user
        if (this.onAuthStateChange) {
            this.onAuthStateChange(this.user);
        }
    }

    private handleViewChange() {
        // Auth disabled: always show protected content unconditionally
        const protectedView = document.getElementById('protected-view');
        const publicView = document.getElementById('public-view');
        const globalStats = document.getElementById('global-stats');

        if (protectedView) protectedView.style.display = 'contents';
        if (globalStats) globalStats.style.display = 'flex';
        if (publicView) {
            publicView.style.display = 'none';
            publicView.innerHTML = '';
        }
        // Clear auth container (no login/user button shown)
        const authContainer = document.getElementById('auth-container');
        if (authContainer) authContainer.innerHTML = '';
    }

}

