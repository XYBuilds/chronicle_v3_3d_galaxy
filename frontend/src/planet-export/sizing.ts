import type { Movie } from '@/types/galaxy'
import {
  computeActiveShellWorldRadius,
  computePlanetOuterRadius,
  planetBandCount,
} from '@/three/planetSizing'
import { PLANET_VISUAL_DEFAULTS } from '@/three/planetVisualDefaults'

/**
 * Offline acceptance images compress the runtime linear particle-size scale.
 * This keeps small planets legible without letting large planets dominate the frame.
 */
export const PLANET_EXPORT_SIZE_ROOTS = [2, 3, 4] as const
export type PlanetExportSizeRoot = (typeof PLANET_EXPORT_SIZE_ROOTS)[number]

export function mapMovieSizeForExport(movieSize: number, sizeRoot: PlanetExportSizeRoot): number {
  if (!Number.isFinite(movieSize) || movieSize < 0) {
    throw new RangeError(`[PlanetExport] movie.size must be non-negative; received ${movieSize}`)
  }
  return Math.pow(movieSize, 1 / sizeRoot)
}

export function computeGlobalPlanetRadius(movies: Movie[], sizeRoot: PlanetExportSizeRoot): number {
  if (movies.length === 0) throw new Error('[PlanetExport] cannot compute radius for empty movie list')
  let max = 0
  for (const movie of movies) {
    const radius = computePlanetOuterRadius(computeExportWorldRadius(movie, sizeRoot), planetBandCount(movie.genres))
    if (!Number.isFinite(radius) || radius <= 0) throw new Error(`[PlanetExport] invalid radius for movieId ${movie.id}`)
    max = Math.max(max, radius)
  }
  console.assert(max > 0, '[PlanetExport] global radius must be positive')
  return max
}

export function computeOrthographicHalfExtent(globalRadius: number, padding: number): number {
  if (!Number.isFinite(globalRadius) || globalRadius <= 0) throw new RangeError('[PlanetExport] globalRadius must be positive')
  if (!Number.isFinite(padding) || padding < 0 || padding >= 0.5) throw new RangeError('[PlanetExport] padding must be in [0, 0.5)')
  return globalRadius / (1 - padding)
}

export function computeExportWorldRadius(movie: Movie, sizeRoot: PlanetExportSizeRoot): number {
  return computeActiveShellWorldRadius(
    mapMovieSizeForExport(movie.size, sizeRoot),
    PLANET_VISUAL_DEFAULTS.activeShell.sizeScale,
    PLANET_VISUAL_DEFAULTS.activeShell.activeSizeMultiplier,
  )
}