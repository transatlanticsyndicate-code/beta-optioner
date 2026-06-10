import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    // ЗАЧЕМ: в dev-режиме проксируем /api/* на локальный backend beta (префикс /crypto),
    // чтобы код фронта работал с одинаковым относительным URL и локально, и в prod (через nginx)
    const env = loadEnv(mode, process.cwd(), '');
    const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8002';

    return {
        server: {
            proxy: {
                '/cmc-api': {
                    target: 'https://pro-api.coinmarketcap.com',
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/cmc-api/, ''),
                    secure: false,
                },
                '/api': {
                    target: apiTarget,
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api/, '/crypto'),
                    secure: false,
                },
            },
        },
    };
});
