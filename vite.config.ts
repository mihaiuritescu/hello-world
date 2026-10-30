import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

// The API server that the dev server proxies to (`pnpm dev:api` listens on port 3000).
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    // Ship the third-party licence notices with the app.
    license: { fileName: 'third-party-licenses.md' },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': apiOrigin,
      '/healthz': apiOrigin,
      '/readyz': apiOrigin,
      '/socket.io': { target: apiOrigin, ws: true },
    },
  },
})
