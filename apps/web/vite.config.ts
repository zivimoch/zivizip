import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.API_URL || 'http://notes:8080',
        changeOrigin: false,
        configure(proxy) {
          proxy.on('proxyReq', (out, req) =>
            out.setHeader('X-Real-IP', req.socket.remoteAddress || 'local'),
          );
        },
      },
    },
  },
});
