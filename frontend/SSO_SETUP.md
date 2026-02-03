# Настройка SSO Аутентификации через Supabase

## Обзор

Проект использует Supabase для единой аутентификации (SSO) на всех поддоменах `*.optioner.online`.

## Установка

Зависимости уже установлены:
```bash
npm install @supabase/supabase-js
```

## Конфигурация

### 1. Переменные окружения

Создайте файл `.env.local` в директории `frontend/`:

```env
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key-here
REACT_APP_AUTH_DISABLED=false
```

**Где получить значения:**
1. Перейдите на [app.supabase.com](https://app.supabase.com)
2. Откройте ваш проект
3. Перейдите в Settings → API
4. Скопируйте:
   - **Project URL** → `REACT_APP_SUPABASE_URL`
   - **anon/public key** → `REACT_APP_SUPABASE_ANON_KEY`

### 2. Настройка Supabase проекта

В панели Supabase настройте:

#### Authentication → URL Configuration
- **Site URL**: `https://beta.optioner.online`
- **Redirect URLs**: 
  - `https://beta.optioner.online/**`
  - `https://crypto.optioner.online/**`
  - `http://localhost:3000/**` (для разработки)

#### Authentication → Providers
Включите нужные провайдеры:
- Email/Password
- Google OAuth (опционально)
- GitHub OAuth (опционально)

## Архитектура

### Файлы

- **`src/services/supabase.js`** - Конфигурация Supabase клиента с SSO настройками
- **`src/services/authService.js`** - Сервис управления аутентификацией (опциональный, для ванильного JS)
- **`src/components/SupabaseUserMenu.jsx`** - React компонент меню пользователя
- **`src/index.css`** - CSS стили для UI компонентов аутентификации

### Ключевые особенности SSO

**Критически важно**: В `src/services/supabase.js` параметр `cookieOptions.domain` установлен как `.optioner.online` (с точкой в начале). Это обеспечивает:

- Сессия доступна на всех поддоменах (`beta.optioner.online`, `crypto.optioner.online` и т.д.)
- Пользователь входит один раз и авторизован везде
- Выход работает на всех поддоменах одновременно

## Использование

### Компонент уже интегрирован

Компонент `SupabaseUserMenu` уже добавлен в `TopNav.jsx` и отображается в шапке приложения.

### Проверка аутентификации в коде

```javascript
import { supabase } from '../services/supabase';

// Получить текущего пользователя
const { data: { session } } = await supabase.auth.getSession();
const user = session?.user;

// Слушать изменения состояния
supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    console.log('User logged in:', session.user);
  } else {
    console.log('User logged out');
  }
});

// Выход
await supabase.auth.signOut();
```

### Защита маршрутов (TODO)

Для защиты маршрутов можно создать HOC или использовать React Router guards:

```javascript
import { Navigate } from 'react-router-dom';
import { supabase } from '../services/supabase';

function ProtectedRoute({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!session) return <Navigate to="/login" />;
  
  return children;
}
```

## Разработка

### Локальная разработка

При разработке на `localhost:3000` SSO будет работать, но cookie будут доступны только на localhost. Для тестирования SSO на нескольких поддоменах используйте:

1. Настройте локальные домены в `/etc/hosts`:
   ```
   127.0.0.1 local.optioner.online
   127.0.0.1 beta.local.optioner.online
   127.0.0.1 crypto.local.optioner.online
   ```

2. Запустите приложение на `local.optioner.online:3000`

3. Добавьте эти URL в Supabase Redirect URLs

## Troubleshooting

### Cookie не работают на поддоменах
- Проверьте, что `domain` в `cookieOptions` начинается с точки: `.optioner.online`
- Убедитесь, что `secure: true` и используется HTTPS в продакшене

### Redirect после логина не работает
- Проверьте настройки Redirect URLs в Supabase
- Убедитесь, что все поддомены добавлены в список

### Сессия не сохраняется
- Проверьте, что `persistSession: true` в конфигурации
- Проверьте настройки браузера (cookies должны быть разрешены)

## Следующие шаги

1. **Создать страницу логина** - Реализовать UI для входа через email/password или OAuth
2. **Добавить защиту маршрутов** - Создать ProtectedRoute компонент
3. **Настроить OAuth провайдеры** - Добавить Google/GitHub авторизацию
4. **Добавить страницу профиля** - Позволить пользователям редактировать свои данные

## Ссылки

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/auth-signup)
- [SSO Best Practices](https://supabase.com/docs/guides/auth/auth-deep-dive/auth-deep-dive-jwts)
