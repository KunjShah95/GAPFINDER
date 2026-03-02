import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  // Override Gemini/Firecrawl env vars so that client-side apiKey guards never block
  // calls. The genai proxy shim in src/api/gemini.ts routes everything through the backend;
  // the actual API keys are configured server-side only.
  define: {
    'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify('backend-proxy'),
    'import.meta.env.VITE_FIRECRAWL_API_KEY': JSON.stringify('backend-proxy'),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-core';
            }
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('framer-motion')) return 'vendor-framer';
            if (id.includes('lucide-react')) return 'vendor-icons';
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
})
