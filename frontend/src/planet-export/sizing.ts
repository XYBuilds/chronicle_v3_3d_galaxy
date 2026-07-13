import type { Movie } from '@/types/galaxy'
import { computeActiveShellWorldRadius, computeMoviePlanetOuterRadius } from '@/three/planetSizing'
import { PLANET_VISUAL_DEFAULTS } from '@/three/planetVisualDefaults'

export function computeGlobalPlanetRadius(movies: Movie[]): number {
  if (movies.length === 0) throw new Error('[PlanetExport] cannot compute radius for empty movie list')
  let max = 0
  for (const movie of movies) {
    const radius = computeMoviePlanetOuterRadius(movie)
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

export function computeExportWorldRadius(movie: Movie): number {
  return computeActiveShellWorldRadius(
    movie.size,
    PLANET_VISUAL_DEFAULTS.activeShell.sizeScale,
    PLANET_VISUAL_DEFAULTS.activeShell.activeSizeMultiplier,
  )
}