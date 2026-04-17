import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        proxy: {
            '/cmc-api': {
                target: 'https://pro-api.coinmarketcap.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/cmc-api/, ''),
                secure: false,
            },
        },
    },
});
