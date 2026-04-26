import { fetchGunzippedJson, type GalaxyGzipProgress } from '@/data/loadGalaxyGzip'
import type { GalaxyData, Meta, Movie } from '@/types/galaxy'

export type { GalaxyGzipProgress } from '@/data/loadGalaxyGzip'

const DEFAULT_PATH = 'data/galaxy_data.json.gz'

/** Vite `base`-aware URL for the gzip asset (dev + GH Pages). */
function galaxyDataDefaultUrl(): string {
  const base = import.meta.env.BASE_URL
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}${DEFAULT_PATH}`
}

export const GALAXY_DATA_DEFAULT_URL = galaxyDataDefaultUrl()

export interface LoadGalaxyDataOptions {
  url?: string
  onProgress?: (p: GalaxyGzipProgress) => void
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function assertFinite(name: string, v: number, movieIndex: number): void {
  if (!Number.isFinite(v)) {
    throw new Error(
      `[GalaxyData] Invalid ${name} at movies[${movieIndex}]: expected finite number, got ${String(v)}`,
    )
  }
}

function validateMeta(meta: unknown): asserts meta is Meta {
  if (!isRecord(meta)) {
    throw new Error('[GalaxyData] meta must be a non-null object')
  }
  if (typeof meta.version !== 'string' || meta.version.length === 0) {
    throw new Error('[GalaxyData] meta.version must be a non-empty string')
  }
  if ('has_genre_hue' in meta && meta.has_genre_hue !== undefined && typeof meta.has_genre_hue !== 'boolean') {
    throw new Error('[GalaxyData] meta.has_genre_hue must be a boolean when present')
  }
  if (typeof meta.count !== 'number' || !Number.isInteger(meta.count) || meta.count < 0) {
    throw new Error(`[GalaxyData] meta.count must be a non-negative integer, got ${String(meta.count)}`)
  }
  if (!Array.isArray(meta.z_range) || meta.z_range.length !== 2) {
    throw new Error('[GalaxyData] meta.z_range must be a tuple of two numbers')
  }
  for (let i = 0; i < 2; i++) {
    const z = meta.z_range[i]
    if (typeof z !== 'number' || !Number.isFinite(z)) {
      throw new Error(`[GalaxyData] meta.z_range[${i}] must be finite`)
    }
  }
  const xyRaw = meta.xy_range
  if (!isRecord(xyRaw)) {
    throw new Error('[GalaxyData] meta.xy_range must be an object with x, y arrays')
  }
  const xArr = xyRaw.x
  const yArr = xyRaw.y
  if (!Array.isArray(xArr) || xArr.length !== 2 || !Array.isArray(yArr) || yArr.length !== 2) {
    throw new Error('[GalaxyData] meta.xy_range.x / .y must each be [min, max]')
  }
  for (let i = 0; i < 2; i++) {
    const vx = xArr[i]
    const vy = yArr[i]
    if (typeof vx !== 'number' || !Number.isFinite(vx)) {
      throw new Error(`[GalaxyData] meta.xy_range.x[${i}] must be finite`)
    }
    if (typeof vy !== 'number' || !Number.isFinite(vy)) {
      throw new Error(`[GalaxyData] meta.xy_range.y[${i}] must be finite`)
    }
  }
}

function validateMovie(m: unknown, index: number, requireGenreHue: boolean): asserts m is Movie {
  if (!isRecord(m)) {
    throw new Error(`[GalaxyData] movies[${index}] must be an object`)
  }
  if (typeof m.id !== 'number' || !Number.isInteger(m.id)) {
    throw new Error(`[GalaxyData] movies[${index}].id must be an integer TMDB id`)
  }
  if (typeof m.title !== 'string') {
    throw new Error(`[GalaxyData] movies[${index}].title must be a string`)
  }
  for (const key of ['x', 'y', 'z', 'size', 'emissive'] as const) {
    const v = m[key]
    if (typeof v !== 'number') {
      throw new Error(`[GalaxyData] movies[${index}].${key} must be a number`)
    }
    assertFinite(key, v, index)
  }
  if (!Array.isArray(m.genre_color) || m.genre_color.length !== 3) {
    throw new Error(`[GalaxyData] movies[${index}].genre_color must be [r,g,b] with length 3`)
  }
  for (let c = 0; c < 3; c++) {
    const comp = m.genre_color[c]
    if (typeof comp !== 'number' || !Number.isFinite(comp)) {
      throw new Error(`[GalaxyData] movies[${index}].genre_color[${c}] must be finite`)
    }
    if (comp < 0 || comp > 1) {
      throw new Error(
        `[GalaxyData] movies[${index}].genre_color[${c}] out of range [0,1]: ${String(comp)}`,
      )
    }
  }
  if (requireGenreHue) {
    const gh = (m as Record<string, unknown>).genre_hue
    if (typeof gh !== 'number' || !Number.isFinite(gh)) {
      throw new Error(`[GalaxyData] movies[${index}].genre_hue must be a finite number when meta.has_genre_hue`)
    }
    const twoPi = 2 * Math.PI
    if (gh < 0 || gh >= twoPi) {
      throw new Error(
        `[GalaxyData] movies[${index}].genre_hue must be in [0, 2π), got ${String(gh)}`,
      )
    }
  }
}

function parseAndValidate(raw: unknown): GalaxyData {
  if (!isRecord(raw)) {
    throw new Error('[GalaxyData] Root JSON must be an object')
  }
  if (!('meta' in raw) || !('movies' in raw)) {
    throw new Error('[GalaxyData] Missing required top-level keys: meta, movies')
  }
  const metaCandidate = raw.meta
  validateMeta(metaCandidate)
  const meta = metaCandidate
  const moviesUnknown = raw.movies
  if (!Array.isArray(moviesUnknown)) {
    throw new Error('[GalaxyData] movies must be an array')
  }
  if (meta.count !== moviesUnknown.length) {
    throw new Error(
      `[GalaxyData] meta.count (${meta.count}) !== movies.length (${moviesUnknown.length})`,
    )
  }
  const requireGenreHue = meta.has_genre_hue === true
  for (let i = 0; i < moviesUnknown.length; i++) {
    validateMovie(moviesUnknown[i], i, requireGenreHue)
  }
  const data: GalaxyData = { meta, movies: moviesUnknown as Movie[] }
  console.assert(data.meta.count === data.movies.length, 'GalaxyData count invariant')
  return data
}

/** Parse and validate already-fetched JSON (used by Vitest + tools). */
export function parseGalaxyJsonPayload(raw: unknown): GalaxyData {
  return parseAndValidate(raw)
}

/**
 * Fetch `galaxy_data.json.gz`, gunzip, parse JSON, and run runtime validation (Tech Spec §4).
 */
export async function loadGalaxyData(options?: string | LoadGalaxyDataOptions): Promise<GalaxyData> {
  const url = typeof options === 'string' ? options : (options?.url ?? galaxyDataDefaultUrl())
  const onProgress = typeof options === 'string' ? undefined : options?.onProgress

  const raw = await fetchGunzippedJson(url, onProgress)
  const data = parseAndValidate(raw)
  const n = data.movies.length
  console.log(`[GalaxyData] Loaded ${n} movies, meta.version=${data.meta.version}`)
  const preview = Math.min(5, n)
  for (let i = 0; i < preview; i++) {
    const m = data.movies[i]
    console.log(`[GalaxyData] sample ${i + 1}/${preview}: ${m.id}: ${m.title}`)
  }
  return data
}
