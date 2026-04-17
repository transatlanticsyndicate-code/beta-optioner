import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    // ЗАЧЕМ: в dev-режиме проксируем /sb/* на реальный Supabase,
    // чтобы код фронта работал с одинаковым относительным URL и локально, и в prod (через nginx)
    const env = loadEnv(mode, process.cwd(), '');
    const supabaseTarget = env.VITE_SUPABASE_PROXY_TARGET
        || 'https://heqxverlxphawhnuntph.supabase.co';

    return {
        server: {
            proxy: {
                '/cmc-api': {
                    target: 'https://pro-api.coinmarketcap.com',
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/cmc-api/, ''),
                    secure: false,
                },
                '/sb': {
                    target: supabaseTarget,
                    changeOrigin: true,
                    ws: true,
                    secure: true,
                    rewrite: (path) => path.replace(/^\/sb/, ''),
                },
            },
        },
    };
});
