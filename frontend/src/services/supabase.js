/**
 * Конфигурация Supabase клиента для SSO аутентификации
 * ЗАЧЕМ: Обеспечивает единую аутентификацию (SSO) на всех поддоменах *.optioner.online
 * Затрагивает: аутентификация пользователей, управление сессиями, cookie на поддоменах
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

/**
 * Создание Supabase клиента с настройками для SSO
 * ВАЖНО: cookieOptions.domain = '.optioner.online' (с точкой) для работы на всех поддоменах
 * ПРИМЕЧАНИЕ: Если переменные окружения не установлены, клиент не будет инициализирован
 */
export const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey, {
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
}) : null;
