
import { createClient } from '@supabase/supabase-js';

// ЗАЧЕМ: идём через прокси на нашем домене — домен *.supabase.co
// заблокирован DNS в ряде регионов (Панама и др.). Nginx (prod) и Vite (dev)
// пробрасывают /sb/* на реальный Supabase.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    || (typeof window !== 'undefined' ? `${window.location.origin}/sb` : '');
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('VITE_SUPABASE_ANON_KEY обязателен. Проверьте crypto/.env.local');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        // @ts-ignore: cookieOptions is supported but might not be in the current types
        cookieOptions: {
            domain: '.optioner.online',
            path: '/',
            sameSite: 'Lax',
            secure: true,
        },
    },
});
