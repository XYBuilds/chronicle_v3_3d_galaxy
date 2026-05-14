import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import glsl from 'vite-plugin-glsl'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const OG_TODAY_IMAGE_BASE = 'https://themoviecosmos.com/data/og-today.png'

/** P23.5+: append `?v=YYYY-MM-DD` to og/twitter image URLs so crawlers see a new URL when the pick changes. */
function readOgTodayCacheBustDate(): string {
  const fromEnv = process.env.VITE_OG_TODAY_V?.trim()
  if (fromEnv && /^\d{4}-\d{2}-\d{2}$/.test(fromEnv)) {
    return fromEnv
  }
  const todayPath = path.resolve(dirname, 'public/data/today.json')
  try {
    const raw = fs.readFileSync(todayPath, 'utf-8')
    const j = JSON.parse(raw) as { date?: unknown }
    if (typeof j.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.date)) {
      return j.date
    }
  } catch {
    // missing or invalid (e.g. local dev without cron-exported data)
  }
  return new Date().toISOString().slice(0, 10)
}

function ogTodayImageCacheBustPlugin(): Plugin {
  return {
    name: 'og-today-image-cache-bust',
    enforce: 'pre',
    transformIndexHtml(html) {
      if (!html.includes(OG_TODAY_IMAGE_BASE)) {
        console.warn(
          '[og-today-image-cache-bust] index.html missing expected og/twitter image base URL; skip rewrite',
        )
        return html
      }
      const v = readOgTodayCacheBustDate()
      const withQuery = `${OG_TODAY_IMAGE_BASE}?v=${encodeURIComponent(v)}`
      console.log(`[og-today-image-cache-bust] og:image cache bust v=${v}`)
      return html.replaceAll(OG_TODAY_IMAGE_BASE, withQuery)
    },
  }
}

/** P20.5: inject Cloudflare Web Analytics only when `VITE_CF_BEACON_TOKEN` is set at build time. */
function cfWebAnalyticsPlugin(): Plugin {
  return {
    name: 'cf-web-analytics',
    transformIndexHtml(html) {
      const raw = process.env.VITE_CF_BEACON_TOKEN
      const token = typeof raw === 'string' ? raw.trim() : ''
      if (!token) return html
      const payload = JSON.stringify({ token })
      const escaped = payload.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      const script = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon="${escaped}"></script>`
      return html.replace('</body>', `    ${script}\n  </body>`)
    },
  }
}

const dirname = path.dirname(fileURLToPath(import.meta.url))
/** npm workspace hoists deps to repo root; Vite's optimizer still resolves `frontend/node_modules/react-dom`. */
const workspaceModules = path.resolve(dirname, '../node_modules')

/**
 * `index.css` uses absolute `/fonts/butler/…` (public/). Under `base: '/subpath/'`, that hits the site root
 * and often returns SPA HTML → OTS "invalid sfntVersion". Rewrite to app-relative URLs.
 */
function butlerPublicFontsBasePlugin(viteBase: string): Plugin {
  const fontDir =
    viteBase === '/' || viteBase === ''
      ? '/fonts/butler/'
      : `${viteBase.replace(/\/?$/, '')}/fonts/butler/`

  return {
    name: 'butler-public-fonts-base',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.replace(/\\/g, '/')
      if (!normalized.includes('/src/')) return null
      if (!/\.css($|\?)/.test(normalized)) return null
      if (!code.includes('/fonts/butler/')) return null
      return code.replace(/url\(\s*(['"])\/fonts\/butler\//g, (_m, q: string) => `url(${q}${fontDir}`)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, dirname, '')
  const rawBase = (env.VITE_BASE_PATH ?? process.env.VITE_BASE_PATH)?.trim()
  const base = rawBase && rawBase !== '' ? (rawBase.endsWith('/') ? rawBase : `${rawBase}/`) : '/'

  return {
    base,
    plugins: [
      butlerPublicFontsBasePlugin(base),
      ogTodayImageCacheBustPlugin(),
      react(),
      tailwindcss(),
      glsl(),
      cfWebAnalyticsPlugin(),
    ],
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
  }
})
