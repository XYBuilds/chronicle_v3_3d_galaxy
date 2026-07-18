import { validatePerlinBloomParams, type PerlinBloomParams } from '@/three/perlinBloomContract'
import type { GalaxyData } from '@/types/galaxy'

export type PlanetExportRenderMode = 'basic' | 'shader'

export type PlanetExportRequest = {
  movieId: number
  dataUrl: string
  resolution: number
  padding: number
  bloom: boolean
  sizeRoot: 2 | 3 | 4
  renderMode: PlanetExportRenderMode
  /** Offline proof only; absent in production requests. */
  bloomParamsOverride?: PerlinBloomParams
}

const REQUEST_PARAMS = new Set(['movieId', 'dataUrl', 'resolution', 'padding', 'bloom', 'sizeRoot', 'renderMode', 'bloomStrength'])

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

export function parsePlanetExportRequest(search: string): PlanetExportRequest {
  const params = new URLSearchParams(search)
  for (const [name] of params) {
    if (!REQUEST_PARAMS.has(name)) throw new Error(`[PlanetExport] unknown request parameter ${name}`)
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

  const bloomStrengthText = params.has('bloomStrength') ? requiredUniqueParam(params, 'bloomStrength') : undefined
  if (
    bloomStrengthText !== undefined
    && (!/^(?:0|(?:[1-9]\d*|0)\.\d+|[1-9]\d*)$/.test(bloomStrengthText) || bloomText !== 'on')
  ) {
    throw new Error('[PlanetExport] bloomStrength must be a finite non-negative decimal and requires bloom=on')
  }
  const bloomParamsOverride = bloomStrengthText === undefined
    ? undefined
    : validatePerlinBloomParams({
      enabled: true,
      strength: Number(bloomStrengthText),
      radius: 1,
      threshold: 0,
    })

  return {
    movieId,
    dataUrl,
    resolution,
    padding,
    bloom: bloomText === 'on',
    sizeRoot: sizeRoot as 2 | 3 | 4,
    renderMode,
    ...(bloomParamsOverride === undefined ? {} : { bloomParamsOverride }),
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
