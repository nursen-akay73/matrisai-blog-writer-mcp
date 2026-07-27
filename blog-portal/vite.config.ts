import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8789',
        changeOrigin: true,
        // Gerçek pipeline 1–2 dk sürebilir
        timeout: 180_000,
        proxyTimeout: 180_000,
      },
    },
  },
})
