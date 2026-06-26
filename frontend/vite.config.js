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
        // No timeout — large file uploads (5 GB) take several minutes
        timeout: 0,
        proxyTimeout: 0,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            if (req.headers.cookie) proxyReq.setHeader('Cookie', req.headers.cookie);
          });
          proxy.on('error', (err, req, res) => {
            // Don't crash on proxy errors (e.g. client abort during large upload)
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
            }
          });
        },
      },
      '/covers': { target: 'http://localhost:3001', changeOrigin: true },
      '/cache':  { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});

