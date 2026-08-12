import type { GalaxyData, ActiveFocusEmissionProfilePointer } from '@/types/galaxy'
import { parseActiveFocusEmissionProfilePointer } from '@/lib/galaxyAssetUrls'

export type PlanetExportRenderMode = 'basic' | 'shader'

export type PlanetExportRequest = {
  movieId: number
  dataUrl: string
  resolution: number
  padding: number
  bloom: boolean
  sizeRoot: 2 | 3 | 4
  renderMode: PlanetExportRenderMode
  profilePointer?: ActiveFocusEmissionProfilePointer
  profileUrl?: string
}

const PRODUCTION_REQUEST_PARAMS = new Set(['movieId', 'dataUrl', 'resolution', 'padding', 'bloom', 'sizeRoot', 'renderMode', 'profilePointer', 'profileUrl'])

function requiredUniqueParam(params: URLSearchParams, name: string): string {
  const values = params.getAll(name)
  if (values.length !== 1) {
    throw new Error(`[PlanetExport] ${name} must appear exactly once`)
  }
  const value = values[0]!.trim()
  if (!value) throw new Error(`[PlanetExport] ${name} is required`)
  return value
}

function parsePositiveInteger(value: string, name: string, max: number): number {
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`[PlanetExport] ${name} must be a positive integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed > max) {
    throw new Error(`[PlanetExport] ${name} must be between 1 and ${max}`)
  }
  return parsed
}

function parseDataUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('[PlanetExport] dataUrl must be an absolute http(s) URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('[PlanetExport] dataUrl must use http or https')
  }
  if (url.username || url.password || url.hash) {
    throw new Error('[PlanetExport] dataUrl must not contain credentials or a fragment')
  }
  if (!/\.json(?:\.gz)?$/i.test(url.pathname)) {
    throw new Error('[PlanetExport] dataUrl must address a .json or .json.gz dataset')
  }
  return url.href
}

function parseProfilePointer(value: string): ActiveFocusEmissionProfilePointer {
  let raw: unknown
  try {
    raw = JSON.parse(value)
  } catch {
    throw new Error('[PlanetExport] profilePointer must be valid JSON')
  }
  const pointer = parseActiveFocusEmissionProfilePointer(raw)
  if (pointer === null) throw new Error('[PlanetExport] profilePointer violates the active profile contract')
  return pointer
}

function parseProfileUrl(value: string, pointer: ActiveFocusEmissionProfilePointer): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('[PlanetExport] profileUrl must be an absolute http(s) URL')
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || url.hash) {
    throw new Error('[PlanetExport] profileUrl must be http(s) without credentials or fragment')
  }
  if (!url.pathname.endsWith(`/focus-emission-profiles/${pointer.profile_id}.json`)) {
    throw new Error('[PlanetExport] profileUrl must address the pointer immutable .json resource')
  }
  return url.href
}

export function parsePlanetExportRequest(search: string): PlanetExportRequest {
  const params = new URLSearchParams(search)
  for (const [name] of params) {
    if (!PRODUCTION_REQUEST_PARAMS.has(name)) throw new Error(`[PlanetExport] unknown request parameter ${name}`)
  }

  const movieId = parsePositiveInteger(requiredUniqueParam(params, 'movieId'), 'movieId', Number.MAX_SAFE_INTEGER)
  const dataUrl = parseDataUrl(requiredUniqueParam(params, 'dataUrl'))
  const resolution = parsePositiveInteger(requiredUniqueParam(params, 'resolution'), 'resolution', 16384)

  const paddingText = requiredUniqueParam(params, 'padding')
  if (!/^(?:0|0\.\d+)$/.test(paddingText)) {
    throw new Error('[PlanetExport] padding must be a decimal in [0, 0.5)')
  }
  const padding = Number(paddingText)
  if (!Number.isFinite(padding) || padding >= 0.5) {
    throw new Error('[PlanetExport] padding must be a decimal in [0, 0.5)')
  }

  const bloomText = requiredUniqueParam(params, 'bloom')
  if (bloomText !== 'on' && bloomText !== 'off') throw new Error('[PlanetExport] bloom must be on or off')

  const sizeRoot = params.has('sizeRoot') ? Number(requiredUniqueParam(params, 'sizeRoot')) : 3
  if (sizeRoot !== 2 && sizeRoot !== 3 && sizeRoot !== 4) {
    throw new Error('[PlanetExport] sizeRoot must be 2, 3, or 4')
  }

  const renderMode = requiredUniqueParam(params, 'renderMode')
  if (renderMode !== 'basic' && renderMode !== 'shader') {
    throw new Error('[PlanetExport] renderMode must be basic or shader')
  }
  if (renderMode === 'basic' && bloomText === 'on') {
    throw new Error('[PlanetExport] basic renderMode requires bloom=off')
  }

  const pointerValues = params.getAll('profilePointer')
  const urlValues = params.getAll('profileUrl')
  if (pointerValues.length > 1) throw new Error('[PlanetExport] profilePointer must appear at most once')
  if (urlValues.length > 1) throw new Error('[PlanetExport] profileUrl must appear at most once')
  if (pointerValues.length !== urlValues.length) throw new Error('[PlanetExport] profilePointer and profileUrl must appear together')
  if (pointerValues.length === 1 && !pointerValues[0]!.trim()) throw new Error('[PlanetExport] profilePointer must be non-empty')
  if (urlValues.length === 1 && !urlValues[0]!.trim()) throw new Error('[PlanetExport] profileUrl must be non-empty')
  const profilePointer = pointerValues.length === 1 ? parseProfilePointer(pointerValues[0]!.trim()) : undefined
  const profileUrl = profilePointer === undefined ? undefined : parseProfileUrl(urlValues[0]!.trim(), profilePointer)

  return {
    movieId,
    dataUrl,
    resolution,
    padding,
    bloom: bloomText === 'on',
    sizeRoot: sizeRoot as 2 | 3 | 4,
    renderMode,
    ...(profilePointer === undefined ? {} : { profilePointer, profileUrl: profileUrl! }),
  }
}

export function indexGalaxyMovies(data: GalaxyData): Map<number, GalaxyData['movies'][number]> {
  const index = new Map<number, GalaxyData['movies'][number]>()
  for (const movie of data.movies) {
    if (index.has(movie.id)) throw new Error(`[PlanetExport] duplicate movieId ${movie.id}`)
    index.set(movie.id, movie)
  }
  console.assert(index.size === data.movies.length, '[PlanetExport] movie index size invariant')
  return index
}

export function findExportMovie(
  index: ReadonlyMap<number, GalaxyData['movies'][number]>,
  movieId: number,
): GalaxyData['movies'][number] {
  const movie = index.get(movieId)
  if (!movie) throw new Error(`[PlanetExport] movieId ${movieId} not found`)
  return movie
}
