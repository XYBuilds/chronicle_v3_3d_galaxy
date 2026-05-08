import { experimentDatasetGalaxyUrl } from '@/utils/loadGalaxyData'

/** Written by ``scripts/cron/upload_galaxy_r2.py`` when CI uploads gzip assets to R2 (P18.6b + P23.1). */
export interface GalaxyAssetsManifest {
  galaxy_data_gzip_url: string
  galaxy_search_index_gzip_url?: string
  /** P23.1: absolute public URL for ``today.json`` on R2 (cache-busted ``?v=``). */
  today_url?: string
  data_version: string
  exported_at?: string
}

function withBase(relativePath: string): string {
  const base = import.meta.env.BASE_URL
  const prefix = base.endsWith('/') ? base : `${base}/`
  const trimmed = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath
  return `${prefix}${trimmed}`
}

export function parseGalaxyAssetsManifest(raw: unknown): GalaxyAssetsManifest | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const g = o.galaxy_data_gzip_url
  const dv = o.data_version
  if (typeof g !== 'string' || !g.trim()) return null
  if (typeof dv !== 'string' || !dv.trim()) return null
  const si = o.galaxy_search_index_gzip_url
  const out: GalaxyAssetsManifest = {
    galaxy_data_gzip_url: g.trim(),
    data_version: dv.trim(),
  }
  if (typeof si === 'string' && si.trim()) {
    out.galaxy_search_index_gzip_url = si.trim()
  }
  const tu = o.today_url
  if (typeof tu === 'string' && tu.trim()) {
    out.today_url = tu.trim()
  }
  if (typeof o.exported_at === 'string' && o.exported_at.trim()) {
    out.exported_at = o.exported_at.trim()
  }
  return out
}

let manifestPromise: Promise<GalaxyAssetsManifest | null> | null = null

function fetchManifestOnce(): Promise<GalaxyAssetsManifest | null> {
  if (manifestPromise === null) {
    manifestPromise = (async () => {
      const url = withBase('data/galaxy_assets_manifest.json')
      try {
        const res = await fetch(url, { cache: 'no-cache' })
        if (!res.ok) {
          console.log('[GalaxyAssets] no manifest', { url, status: res.status })
          return null
        }
        const raw: unknown = await res.json()
        const m = parseGalaxyAssetsManifest(raw)
        if (m) {
          console.log('[GalaxyAssets] manifest', {
            data_version: m.data_version,
            galaxy: m.galaxy_data_gzip_url.slice(0, 80),
          })
        } else {
          console.warn('[GalaxyAssets] manifest JSON invalid shape', { url })
        }
        return m
      } catch (e) {
        console.log('[GalaxyAssets] manifest fetch failed', e)
        return null
      }
    })()
  }
  return manifestPromise
}

/** Singleton manifest fetch (same cache as ``resolveGalaxyDataGzipUrl``). */
export function getGalaxyAssetsManifest(): Promise<GalaxyAssetsManifest | null> {
  return fetchManifestOnce()
}

/**
 * Resolve URL for ``today.json``: ``VITE_TODAY_JSON_URL``; else bundled path when ``?dataset=`` experiment;
 * else manifest ``today_url``; else Vite ``/data/today.json``.
 */
export async function resolveTodayJsonUrl(defaultRelativePath = 'data/today.json'): Promise<string> {
  const viteToday = import.meta.env.VITE_TODAY_JSON_URL
  if (typeof viteToday === 'string' && viteToday.trim()) {
    console.log('[GalaxyAssets] using VITE_TODAY_JSON_URL')
    return viteToday.trim()
  }
  if (experimentDatasetGalaxyUrl() !== null) {
    return withBase(defaultRelativePath)
  }
  const man = await fetchManifestOnce()
  if (man?.today_url?.trim()) {
    return man.today_url.trim()
  }
  return withBase(defaultRelativePath)
}

/** Absolute ``VITE_*`` override wins; then ``?dataset=`` experiments; then R2 manifest; then bundled gzip. */
export async function resolveGalaxyDataGzipUrl(defaultRelativeGzip: string): Promise<string> {
  const viteGal = import.meta.env.VITE_GALAXY_DATA_GZIP_URL
  if (typeof viteGal === 'string' && viteGal.trim()) {
    console.log('[GalaxyAssets] using VITE_GALAXY_DATA_GZIP_URL')
    return viteGal.trim()
  }

  const exp = experimentDatasetGalaxyUrl()
  if (exp !== null) {
    return exp
  }

  const man = await fetchManifestOnce()
  if (man !== null) {
    return man.galaxy_data_gzip_url
  }

  return defaultRelativeGzip
}

export async function resolveSearchIndexGzipUrl(defaultRelativeGzip: string): Promise<string> {
  const viteIdx = import.meta.env.VITE_GALAXY_SEARCH_INDEX_GZIP_URL
  if (typeof viteIdx === 'string' && viteIdx.trim()) {
    console.log('[GalaxyAssets] using VITE_GALAXY_SEARCH_INDEX_GZIP_URL')
    return viteIdx.trim()
  }

  if (experimentDatasetGalaxyUrl() !== null) {
    return defaultRelativeGzip
  }

  const man = await fetchManifestOnce()
  if (man?.galaxy_search_index_gzip_url) {
    return man.galaxy_search_index_gzip_url
  }

  return defaultRelativeGzip
}
