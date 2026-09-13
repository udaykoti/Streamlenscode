import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { streamlensFallbackApiPlugin } from './dev-api/handler.js'

// The real analyzer is the Spring Boot service in `backend/` (port 8080).
// When it is not running, `dev-api/` answers `/api/*` with an equivalent Node
// engine so the UI stays usable — see dev-api/handler.js.
const BACKEND_TARGET = process.env.STREAMLENS_BACKEND || 'http://localhost:8080'

export default defineConfig({
  plugins: [react(), streamlensFallbackApiPlugin({ target: BACKEND_TARGET })],
  server: {
    host: '0.0.0.0',
    port: 3000,
    // Allow any host so the app works behind dev proxies / preview URLs.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: BACKEND_TARGET,
        changeOrigin: true,
      },
    },
  },
})
