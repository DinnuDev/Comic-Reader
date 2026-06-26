import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
        configure: (proxy) => {
          // Forward all headers including cookies
          proxy.on('proxyReq', (proxyReq, req) => {
            if (req.headers.cookie) proxyReq.setHeader('Cookie', req.headers.cookie);
          });
        },
      },
      '/covers': { target: 'http://localhost:3001', changeOrigin: true },
      '/cache':  { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});

