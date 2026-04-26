import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

const dirname = path.dirname(fileURLToPath(import.meta.url))
/** npm workspace hoists deps to repo root; Vite’s optimizer still resolves `frontend/node_modules/react-dom`. */
const workspaceModules = path.resolve(dirname, '../node_modules')

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
      react: path.join(workspaceModules, 'react'),
      'react-dom': path.join(workspaceModules, 'react-dom'),
      'react/jsx-runtime': path.join(workspaceModules, 'react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.join(workspaceModules, 'react/jsx-dev-runtime.js'),
      'react-dom/client': path.join(workspaceModules, 'react-dom/client.js'),
    },
  },
})