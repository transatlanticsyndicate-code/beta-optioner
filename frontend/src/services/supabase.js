/**
 * Заглушка Supabase-клиента
 * ЗАЧЕМ: Аутентификация полностью отключена, а реальный клиент инициировал сетевые
 * запросы к supabase.co (autoRefreshToken, getSession), что ломало доступ пользователям
 * из регионов, где домен *.supabase.co заблокирован DNS (например, Панама).
 * Экспортируем безопасный no-op объект — совместимый по API с supabase-js —
 * чтобы существующие вызовы `supabase.auth.getSession()` и т.п. не делали сетевых запросов.
 */

const emptySession = { data: { session: null }, error: null };
const emptyUser = { data: { user: null }, error: null };

const noopSubscription = {
    data: { subscription: { unsubscribe: () => {} } },
};

export const supabase = {
    auth: {
        getSession: async () => emptySession,
        getUser: async () => emptyUser,
        onAuthStateChange: (_callback) => noopSubscription,
        signInWithPassword: async () => ({
            data: { user: null, session: null },
            error: new Error('Аутентификация отключена'),
        }),
        signOut: async () => ({ error: null }),
    },
};
