import {
  LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
  assertActiveFocusEmissionProfilePointer,
  parseProductionRatingEmissionProfile,
  productionProfileToLutProfile,
  profileCurveHashInput,
  type RatingMidrankCdfLutProfile,
} from '@/three/focusEmission'
import { PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE } from '@/three/productionFocusEmissionProfile'
import {
  resolveFocusEmissionProfileResourceUrl,
  parseActiveFocusEmissionProfilePointer,
  type GalaxyAssetsManifest,
} from '@/lib/galaxyAssetUrls'
import type { FocusEmissionProfileProvenance } from '@/types/galaxy'

export type FocusEmissionProfileSource = 'active' | 'legacy-fallback'

export type ResolvedFocusEmissionProfile = {
  lut: RatingMidrankCdfLutProfile
  provenance: FocusEmissionProfileProvenance
  source: FocusEmissionProfileSource
}

export type FocusEmissionProfileLoaderDependencies = {
  fetchImpl?: typeof fetch
  sha256?: (input: string) => Promise<string>
  log?: (message: string, fields: Record<string, unknown>) => void
}

export type LoadFocusEmissionProfileOptions = FocusEmissionProfileLoaderDependencies & {
  manifest: GalaxyAssetsManifest
  /** Exporter-only controlled artifact URL; must end at the pointer's immutable resource name. */
  profileUrl?: string
  /** Compatibility is opt-in for local development and deliberately constructed test fixtures only. */
  allowLegacyFallback?: boolean
}

const activeCache = new Map<string, Promise<ResolvedFocusEmissionProfile>>()
let legacyCache: Promise<ResolvedFocusEmissionProfile> | null = null
const loggedKeys = new Set<string>()

function defaultLog(message: string, fields: Record<string, unknown>): void {
  console.log(message, fields)
}

async function browserSha256(input: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('[FocusEmissionProfile] Web Crypto SHA-256 is unavailable')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

function logResolved(
  resolved: ResolvedFocusEmissionProfile,
  log: (message: string, fields: Record<string, unknown>) => void,
): void {
  const key = `${resolved.source}:${resolved.provenance.profile_id}:${resolved.provenance.curve_sha256}`
  if (loggedKeys.has(key)) return
  loggedKeys.add(key)
  const samples = resolved.lut.samples
  log('[FocusEmissionProfile] resolved', {
    profile_id: resolved.provenance.profile_id,
    source: resolved.source,
    period: resolved.provenance.period,
    source_data_version: resolved.provenance.source_data_version,
    source_movie_count: resolved.provenance.source_movie_count,
    sample_count: samples.length,
    samples: { first: samples[0], middle: samples[Math.floor(samples.length / 2)], last: samples[samples.length - 1] },
  })
}

function legacyResolved(): ResolvedFocusEmissionProfile {
  return {
    lut: {
      ...PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
      samples: [...PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE.samples],
    },
    provenance: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
    source: 'legacy-fallback',
  }
}

function activeCacheKey(pointer: GalaxyAssetsManifest['focus_emission_profile'], url: string): string {
  if (pointer === undefined) throw new Error('[FocusEmissionProfile] active cache requires a pointer')
  return JSON.stringify({
    url,
    profile_id: pointer.profile_id,
    period: pointer.period,
    model_version: pointer.model_version,
    curve_sha256: pointer.curve_sha256,
    source_data_version: pointer.source_data_version,
    source_movie_count: pointer.source_movie_count,
    status: pointer.status,
    activated_at: pointer.activated_at,
  })
}

/**
 * Fetches an immutable profile once per full trusted pointer identity. Active pointers always
 * fail closed; only an omitted manifest field may opt into the Phase 41 compatibility fixture.
 */
export async function loadFocusEmissionProfile(options: LoadFocusEmissionProfileOptions): Promise<ResolvedFocusEmissionProfile> {
  const log = options.log ?? defaultLog
  const pointer = options.manifest.focus_emission_profile
  if (pointer !== undefined && parseActiveFocusEmissionProfilePointer(pointer) === null) {
    throw new Error('[FocusEmissionProfile] declared active pointer violates the trusted contract')
  }
  if (pointer === undefined) {
    if (!options.allowLegacyFallback) {
      throw new Error('[FocusEmissionProfile] manifest has no active profile; legacy fallback was not explicitly enabled')
    }
    if (legacyCache === null) {
      legacyCache = Promise.resolve(legacyResolved())
    }
    const resolved = await legacyCache
    logResolved(resolved, log)
    return resolved
  }

  const url = options.profileUrl ?? resolveFocusEmissionProfileResourceUrl(pointer)
  const urlPath = new URL(url, typeof window === 'undefined' ? 'http://localhost/' : window.location.href).pathname
  if (!urlPath.endsWith(`/${pointer.profile_id}.json`)) {
    throw new Error('[FocusEmissionProfile] active profile URL does not match the controlled pointer resource')
  }
  const cacheKey = activeCacheKey(pointer, url)
  let pending = activeCache.get(cacheKey)
  if (pending === undefined) {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch
    if (typeof fetchImpl !== 'function') throw new Error('[FocusEmissionProfile] fetch is unavailable')
    const sha256 = options.sha256 ?? browserSha256
    pending = (async () => {
      const response = await fetchImpl(url, { cache: 'no-cache' })
      if (!response.ok) throw new Error(`[FocusEmissionProfile] active profile fetch failed: ${response.status} ${response.statusText}`)
      const profile = parseProductionRatingEmissionProfile(await response.json())
      const actualHash = await sha256(profileCurveHashInput(profile))
      if (!/^[a-f0-9]{64}$/.test(actualHash)) throw new Error('[FocusEmissionProfile] SHA-256 returned an invalid digest')
      if (actualHash !== profile.curve_sha256) throw new Error('[FocusEmissionProfile] curve_sha256 does not match the canonical curve input')
      assertActiveFocusEmissionProfilePointer(pointer, profile, () => actualHash)
      return {
        lut: productionProfileToLutProfile(profile),
        provenance: {
          profile_id: profile.profile_id,
          period: profile.period,
          model_version: profile.model_version,
          curve_sha256: profile.curve_sha256,
          source_data_version: profile.source_data_version,
          source_movie_count: profile.source_movie_count,
        },
        source: 'active' as const,
      }
    })()
    activeCache.set(cacheKey, pending)
  }
  try {
    const resolved = await pending
    logResolved(resolved, log)
    return resolved
  } catch (error) {
    // A later retry may have installed a new promise after this shared waiter failed.
    // Never delete that newer trusted identity entry.
    if (activeCache.get(cacheKey) === pending) activeCache.delete(cacheKey)
    throw error
  }
}

/** Test-only isolation hook; production lifecycle is process-lifetime cached. */
export function resetFocusEmissionProfileLoaderCacheForTests(): void {
  activeCache.clear()
  legacyCache = null
  loggedKeys.clear()
}