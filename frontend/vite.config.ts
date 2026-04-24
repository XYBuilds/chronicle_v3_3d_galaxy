import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: '/chronicle_v3_3d_galaxy/',
  plugins: [react(), tailwindcss(), glsl()],
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
})