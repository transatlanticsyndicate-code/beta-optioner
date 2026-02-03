# Инструкция для ИИ-агента: Реализация SSO через Supabase

Эта инструкция описывает, как интегрировать единую аутентификацию (SSO) для проекта на поддомене `*.optioner.online`.

## 1. Установка зависимостей
Установи официальный клиент Supabase:
```bash
npm install @supabase/supabase-js
```

## 2. Конфигурация клиента (SSO)
Создай файл [src/lib/supabase.ts](file:///Users/andres/Desktop/ANTIGRAVITY/crypto.optioner.online/src/lib/supabase.ts) (или `.js`). 

> [!IMPORTANT]
> Параметр `cookieOptions` критически важен. Он должен содержать `domain: '.optioner.online'` (с точкой в начале), чтобы сессия была видна на всех поддоменах.

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        cookieOptions: {
            domain: '.optioner.online',
            path: '/',
            sameSite: 'Lax',
            secure: true,
        },
    },
});
```

## 3. UI Компонент: Кнопка профиля и меню
Реализуй UI для отображения текущего пользователя и возможности выхода.

### HTML
Добавь контейнер в шапку сайта:
```html
<div id="auth-container"></div>
```

### CSS
Добавь стили для аватара и выпадающего меню:
```css
#auth-container { position: relative; }
.user-avatar-btn {
    width: 32px; height: 32px; border-radius: 50%;
    background: var(--btn-bg, #2a2a2a); border: 1px solid var(--border, #3d3d3d);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.auth-dropdown {
    position: absolute; top: 100%; right: 0; margin-top: 8px;
    background: var(--bg, #1e1e1e); border: 1px solid var(--border, #333);
    border-radius: 6px; display: none; flex-direction: column; padding: 4px; z-index: 100;
}
.auth-dropdown.show { display: flex; }
.auth-item { padding: 8px 12px; cursor: pointer; border-radius: 4px; }
.auth-item:hover { background: var(--hover, #2d2d2d); }
.auth-item.danger { color: #ff4d4d; }
```

### Логика (TypeScript/JavaScript)
Создай класс или функцию для управления состоянием:
```typescript
import { supabase } from './lib/supabase';

export function setupAuth() {
    const container = document.getElementById('auth-container');
    if (!container) return;

    supabase.auth.onAuthStateChange((event, session) => {
        const user = session?.user;
        if (user) {
            renderUserMenu(container, user);
        } else {
            container.innerHTML = '<!-- Ссылка на логин или кнопка войти -->';
        }
    });
}

function renderUserMenu(container: HTMLElement, user: any) {
    container.innerHTML = `
        <div class="user-avatar-btn" id="avatar-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div class="auth-dropdown" id="auth-dropdown">
            <div style="padding: 8px; border-bottom: 1px solid #333; font-size: 0.8rem;">
                ${user.email}
            </div>
            <div class="auth-item danger" id="logout-btn">Выйти</div>
        </div>
    `;

    const btn = document.getElementById('avatar-btn');
    const dropdown = document.getElementById('auth-dropdown');

    btn!.onclick = (e) => {
        e.stopPropagation();
        dropdown!.classList.toggle('show');
    };

    document.addEventListener('click', () => dropdown!.classList.remove('show'));
    document.getElementById('logout-btn')!.onclick = () => supabase.auth.signOut();
}
```

## 4. Особенности SSO
- Пользователь может войти на ЛЮБОМ из поддоменов, где настроен этот код.
- После входа на одном поддомене, при переходе на другой, `supabase.auth.onAuthStateChange` сработает автоматически и `session` будет содержать данные пользователя.
- Выход ([signOut](file:///Users/andres/Desktop/ANTIGRAVITY/crypto.optioner.online/src/auth.ts#278-281)) также сработает для всех поддоменов сразу.
