import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  appType: 'spa', // Ensure SPA mode with history API fallback
  server: {
    port: 3000,
    host: true,
    open: false,
    proxy: {
      // Proxy API requests to the backend during development
      // Use 'backend' as target when running in Docker, 'localhost' otherwise
      '/api': {
        target: process.env.DOCKER_ENV ? 'http://backend:3001' : 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // Proxy asset proxy requests
      '/a': {
        target: process.env.DOCKER_ENV ? 'http://backend:3001' : 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // Proxy health check
      '/health': {
        target: process.env.DOCKER_ENV ? 'http://backend:3001' : 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // Proxy Socket.IO
      '/socket.io': {
        target: process.env.DOCKER_ENV ? 'http://backend:3001' : 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
  // Preview server config (for production build preview)
  preview: {
    port: 3000,
    host: true
  },
  build: {
    rollupOptions: {
      output: {
        // Function form (Rollup 4 / Vite 8 type-safe) — same vendor splitting
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/.test(id)) return 'vendor-react'
          if (id.includes('node_modules/lucide-react')) return 'vendor-ui'
          if (id.includes('node_modules/html2canvas')) return 'vendor-charts'
        },
      }
    }
  }
})
