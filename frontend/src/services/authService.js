/**
 * Сервис управления аутентификацией через Supabase SSO
 * ЗАЧЕМ: Предоставляет UI для входа/выхода и управления сессией пользователя
 * Затрагивает: отображение профиля пользователя, управление сессией, UI компоненты
 */

import { supabase } from './supabase';

/**
 * Инициализация системы аутентификации
 * ЗАЧЕМ: Подключает слушатель изменений сессии и рендерит UI в зависимости от статуса
 */
export function setupAuth() {
    const container = document.getElementById('auth-container');
    if (!container) {
        console.warn('Auth container not found. Add <div id="auth-container"></div> to your layout.');
        return;
    }

    // Слушатель изменений состояния аутентификации
    // ЗАЧЕМ: Автоматически обновляет UI при входе/выходе пользователя
    supabase.auth.onAuthStateChange((event, session) => {
        const user = session?.user;
        if (user) {
            renderUserMenu(container, user);
        } else {
            renderLoginButton(container);
        }
    });

    // Проверка текущей сессии при загрузке
    // ЗАЧЕМ: Отображает корректное состояние сразу при открытии страницы
    supabase.auth.getSession().then(({ data: { session } }) => {
        const user = session?.user;
        if (user) {
            renderUserMenu(container, user);
        } else {
            renderLoginButton(container);
        }
    });
}

/**
 * Рендер кнопки входа для неавторизованных пользователей
 * ЗАЧЕМ: Предоставляет точку входа в систему аутентификации
 */
function renderLoginButton(container) {
    container.innerHTML = `
        <button class="auth-login-btn" id="login-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            <span>Войти</span>
        </button>
    `;

    // Обработчик клика на кнопку входа
    // ЗАЧЕМ: Перенаправляет на страницу авторизации или открывает модальное окно
    document.getElementById('login-btn')?.addEventListener('click', () => {
        // TODO: Реализовать логику входа (модальное окно или редирект)
        console.log('Login clicked - implement login flow');
    });
}

/**
 * Рендер меню профиля для авторизованных пользователей
 * ЗАЧЕМ: Отображает информацию о пользователе и предоставляет возможность выхода
 */
function renderUserMenu(container, user) {
    container.innerHTML = `
        <div class="user-avatar-btn" id="avatar-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
            </svg>
        </div>
        <div class="auth-dropdown" id="auth-dropdown">
            <div class="auth-user-info">
                ${user.email}
            </div>
            <div class="auth-item danger" id="logout-btn">Выйти</div>
        </div>
    `;

    const btn = document.getElementById('avatar-btn');
    const dropdown = document.getElementById('auth-dropdown');

    // Переключение видимости выпадающего меню
    // ЗАЧЕМ: Показывает/скрывает меню при клике на аватар
    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown?.classList.toggle('show');
    });

    // Закрытие меню при клике вне его
    // ЗАЧЕМ: Улучшает UX, автоматически скрывая меню
    document.addEventListener('click', () => {
        dropdown?.classList.remove('show');
    });

    // Обработчик выхода из системы
    // ЗАЧЕМ: Завершает сессию пользователя на всех поддоменах
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        try {
            await supabase.auth.signOut();
            console.log('User signed out successfully');
        } catch (error) {
            console.error('Error signing out:', error);
        }
    });
}

/**
 * Получение текущего пользователя
 * ЗАЧЕМ: Предоставляет доступ к данным пользователя из других частей приложения
 */
export async function getCurrentUser() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user || null;
}

/**
 * Проверка авторизации пользователя
 * ЗАЧЕМ: Используется для защиты маршрутов и функционала
 */
export async function isAuthenticated() {
    const user = await getCurrentUser();
    return !!user;
}
