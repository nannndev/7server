import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        // Keep original Host header so it matches browser Origin for backend CSRF checks.
        changeOrigin: false
      },
      '/ws': {
        target: 'ws://localhost:5001',
        ws: true
      }
    }
  }
});

