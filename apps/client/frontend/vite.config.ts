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
        manualChunks: {
          // Split large dependencies into separate chunks
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['lucide-react'],
          'vendor-charts': ['html2canvas'],
        }
      }
    }
  }
})
