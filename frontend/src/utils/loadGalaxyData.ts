import type { GalaxyData, Meta, Movie } from '@/types/galaxy'

const DEFAULT_URL = '/data/galaxy_data.json'

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
}

function validateMovie(m: unknown, index: number): asserts m is Movie {
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
  for (let i = 0; i < moviesUnknown.length; i++) {
    validateMovie(moviesUnknown[i], i)
  }
  const data: GalaxyData = { meta, movies: moviesUnknown as Movie[] }
  console.assert(data.meta.count === data.movies.length, 'GalaxyData count invariant')
  return data
}

/**
 * Fetch `galaxy_data.json`, parse JSON, and run runtime validation (Tech Spec §4).
 */
export async function loadGalaxyData(url: string = DEFAULT_URL): Promise<GalaxyData> {
  let res: Response
  try {
    res = await fetch(url)
  } catch (e) {
    const hint =
      e instanceof TypeError
        ? ' (network error — is the dev server running and is the file under public/data/?)'
        : ''
    throw new Error(`[GalaxyData] fetch failed for ${url}${hint}: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!res.ok) {
    throw new Error(
      `[GalaxyData] HTTP ${res.status} ${res.statusText} for ${url} — place pipeline output at frontend/public/data/galaxy_data.json`,
    )
  }
  let raw: unknown
  try {
    raw = await res.json()
  } catch (e) {
    throw new Error(
      `[GalaxyData] JSON parse error for ${url}: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
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

export { DEFAULT_URL as GALAXY_DATA_DEFAULT_URL }
