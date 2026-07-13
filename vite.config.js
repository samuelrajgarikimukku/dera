import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { registerDeraRoutes } from './backend/server.js'

// https://vite.dev/config/
export default defineConfig({
  server: {
    watch: {
      ignored: [
        '**/DERA/**',
        '**/*.py'
      ]
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'dera-filesystem-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          registerDeraRoutes(req, res, next);
        });
      }
    }
  ]
})
