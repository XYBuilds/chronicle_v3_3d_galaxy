/**
 * P30.7: After `vite build`, assert SPA fallback artifacts for Cloudflare Pages.
 * GitHub Pages `404.html` is created only in deploy-pages.yml (not in dist for CF).
 */
import fs from 'node:fs'
import path from 'node:path'

const DIST_DIR = path.resolve(import.meta.dirname, '..', 'dist')
const REDIRECTS_PATH = path.join(DIST_DIR, '_redirects')

const REQUIRED_REDIRECT_LINES = ['/movie/*  /index.html  200']

function assert(cond, msg) {
  if (!cond) {
    console.error(`[spa-fallback-dist] ${msg}`)
    process.exit(1)
  }
}

function main() {
  assert(fs.existsSync(DIST_DIR), `missing dist: ${DIST_DIR}`)
  assert(fs.existsSync(path.join(DIST_DIR, 'index.html')), 'missing dist/index.html')

  assert(fs.existsSync(REDIRECTS_PATH), 'missing dist/_redirects (copy from public/)')
  const redirects = fs.readFileSync(REDIRECTS_PATH, 'utf-8')
  for (const line of REQUIRED_REDIRECT_LINES) {
    assert(redirects.includes(line), `_redirects must include: ${line}`)
  }

  assert(
    !fs.existsSync(path.join(DIST_DIR, '404.html')),
    'dist/404.html must not exist after default build (CF Pages uses implicit SPA + _redirects)',
  )

  assert(fs.existsSync(path.join(DIST_DIR, '_headers')), 'missing dist/_headers')
  assert(fs.existsSync(path.join(DIST_DIR, 'fonts')), 'missing dist/fonts/')
  const assetsDir = path.join(DIST_DIR, 'assets')
  assert(fs.existsSync(assetsDir), 'missing dist/assets/')
  const assetEntries = fs.readdirSync(assetsDir)
  assert(assetEntries.length > 0, 'dist/assets/ must contain built chunks')

  console.log('[spa-fallback-dist] ok', {
    redirects: REQUIRED_REDIRECT_LINES.length,
    assets: assetEntries.length,
  })
}

main()
