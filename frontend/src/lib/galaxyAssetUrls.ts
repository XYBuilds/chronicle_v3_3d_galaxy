import type { ActiveFocusEmissionProfilePointer } from '@/types/galaxy'
import { experimentDatasetGalaxyUrl } from '@/utils/loadGalaxyData'

export const FOCUS_EMISSION_PROFILE_RESOURCE_DIRECTORY = 'data/focus-emission-profiles' as const

/**
 * Manifest URL inputs remain limited to galaxy assets. Profile artifacts resolve only from this
 * versioned local namespace; untrusted profile URLs and local filesystem paths are never accepted.
 */
export function focusEmissionProfileResourcePath(profileId: string): string {
  if (!/^[a-z0-9][a-z0-9-]{2,127}$/.test(profileId)) {
    throw new Error('[GalaxyAssets] profile_id must be a lowercase immutable identifier')
  }
  return `${FOCUS_EMISSION_PROFILE_RESOURCE_DIRECTORY}/${profileId}.json`
}

export function resolveFocusEmissionProfileResourceUrl(pointer: ActiveFocusEmissionProfilePointer): string {
  if (pointer.status !== 'active') throw new Error('[GalaxyAssets] only verified active profile pointers resolve to a resource')
  return withBase(focusEmissionProfileResourcePath(pointer.profile_id))
}

/** Written by ``scripts/cron/upload_galaxy_r2.py`` when CI uploads gzip assets to R2 (P18.6b + P23.1). */
export interface GalaxyAssetsManifest {
  galaxy_data_gzip_url: string
  galaxy_search_index_gzip_url?: string
  /** Minimal provenance only; the full 201-sample artifact stays in its own controlled resource. */
  focus_emission_profile?: ActiveFocusEmissionProfilePointer
  /** Immutable R2 artifact URL; path must end with the trusted profile_id resource. */
  focus_emission_profile_url?: string
  data_version: string
  exported_at?: string
}

export function parseActiveFocusEmissionProfilePointer(raw: unknown): ActiveFocusEmissionProfilePointer | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const pointer = raw as Record<string, unknown>
  const allowed = new Set(['profile_id', 'period', 'model_version', 'curve_sha256', 'source_data_version', 'source_movie_count', 'status', 'activated_at'])
  if (Object.keys(pointer).some((key) => !allowed.has(key))) return null
  const profileId = pointer.profile_id
  const period = pointer.period
  const modelVersion = pointer.model_version
  const curveSha256 = pointer.curve_sha256
  const sourceDataVersion = pointer.source_data_version
  const sourceMovieCount = pointer.source_movie_count
  const status = pointer.status
  const activatedAt = pointer.activated_at
  if (
    typeof profileId !== 'string' || !/^[a-z0-9][a-z0-9-]{2,127}$/.test(profileId) ||
    typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) ||
    modelVersion !== 'rating-midrank-cdf-lut-v1' ||
    typeof curveSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(curveSha256) ||
    typeof sourceDataVersion !== 'string' || !sourceDataVersion.trim() ||
    typeof sourceMovieCount !== 'number' || !Number.isSafeInteger(sourceMovieCount) || sourceMovieCount <= 0 ||
    status !== 'active' ||
    typeof activatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(activatedAt) || !Number.isFinite(Date.parse(activatedAt))
  ) return null

  return {
    profile_id: profileId,
    period,
    model_version: modelVersion,
    curve_sha256: curveSha256,
    source_data_version: sourceDataVersion.trim(),
    source_movie_count: sourceMovieCount,
    status,
    activated_at: activatedAt,
  }
}

export function parseFocusEmissionProfileUrl(raw: unknown, profileId: string): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const url = new URL(raw.trim())
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null
    return url.pathname.endsWith(`/focus-emission-profiles/${profileId}.json`) ? url.toString() : null
  } catch {
    return null
  }
}

function withBase(relativePath: string): string {
  const base = import.meta.env.BASE_URL
  const prefix = base.endsWith('/') ? base : `${base}/`
  const trimmed = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath
  return `${prefix}${trimmed}`
}

function parseReleaseAssetUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const url = new URL(raw.trim())
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
  }
}

export function parseGalaxyAssetsManifest(raw: unknown): GalaxyAssetsManifest | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const g = parseReleaseAssetUrl(o.galaxy_data_gzip_url)
  const dv = o.data_version
  if (g === null) return null
  if (typeof dv !== 'string' || !dv.trim()) return null
  const si = parseReleaseAssetUrl(o.galaxy_search_index_gzip_url)
  const out: GalaxyAssetsManifest = {
    galaxy_data_gzip_url: g,
    data_version: dv.trim(),
  }
  if (si !== null) {
    out.galaxy_search_index_gzip_url = si
  } else if (o.galaxy_search_index_gzip_url !== undefined) {
    return null
  }
  if (typeof o.exported_at === 'string' && o.exported_at.trim()) {
    out.exported_at = o.exported_at.trim()
  }
  if (o.focus_emission_profile !== undefined) {
    const profile = parseActiveFocusEmissionProfilePointer(o.focus_emission_profile)
    if (profile === null) return null
    const profileUrl = parseFocusEmissionProfileUrl(o.focus_emission_profile_url, profile.profile_id)
    if (profileUrl === null) return null
    out.focus_emission_profile = profile
    out.focus_emission_profile_url = profileUrl
  } else if (o.focus_emission_profile_url !== undefined) {
    return null
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
          // An omitted field is an old-manifest compatibility case. A declared field that
          // fails the active-pointer contract is authoritative corruption and must not turn
          // into a DEV legacy fallback.
          if (typeof raw === 'object' && raw !== null && !Array.isArray(raw) && 'focus_emission_profile' in raw) {
            throw new Error('[GalaxyAssets] declared focus_emission_profile has invalid shape')
          }
          console.warn('[GalaxyAssets] manifest JSON invalid shape', { url })
        }
        return m
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('[GalaxyAssets] declared focus_emission_profile')) throw e
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

  // Manifest ships production R2 URLs. In dev, prefer the Vite-served gzip under `public/data`
  // so a local `export_galaxy_json.py` run is what the app loads (P25.5 full cast, etc.).
  if (import.meta.env.DEV) {
    console.log('[GalaxyAssets] dev: skip manifest, use bundled galaxy gzip', { url: defaultRelativeGzip })
    return defaultRelativeGzip
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

  if (import.meta.env.DEV) {
    console.log('[GalaxyAssets] dev: skip manifest, use bundled search index gzip', { url: defaultRelativeGzip })
    return defaultRelativeGzip
  }

  const man = await fetchManifestOnce()
  if (man?.galaxy_search_index_gzip_url) {
    return man.galaxy_search_index_gzip_url
  }

  return defaultRelativeGzip
}
