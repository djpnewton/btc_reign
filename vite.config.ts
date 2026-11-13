import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // coins.json is ~900 kB of chart data baked into the bundle.
    chunkSizeWarningLimit: 1200,
  },
})
