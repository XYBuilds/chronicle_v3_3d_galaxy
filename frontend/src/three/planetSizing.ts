import { PLANET_MAX_BANDS, PLANET_VISUAL_DEFAULTS } from './planetVisualDefaults'

export function planetBandCount(genres: string[], maxBands = PLANET_MAX_BANDS): number {
  return Math.max(1, genres.filter(Boolean).slice(0, maxBands).length)
}

export function planetTerraceRadiusMultiplier(
  bandCount: number,
  stepHeight: number = PLANET_VISUAL_DEFAULTS.bands.stepHeight,
): number {
  if (!Number.isFinite(bandCount) || bandCount < 1) {
    throw new RangeError(`bandCount must be >= 1; received ${bandCount}`)
  }
  if (!Number.isFinite(stepHeight) || stepHeight < 0) {
    throw new RangeError(`stepHeight must be >= 0; received ${stepHeight}`)
  }
  return 1 + (Math.round(bandCount) - 1) * stepHeight
}

export function computePlanetOuterRadius(
  baseWorldRadius: number,
  bandCount: number,
  stepHeight: number = PLANET_VISUAL_DEFAULTS.bands.stepHeight,
): number {
  if (!Number.isFinite(baseWorldRadius) || baseWorldRadius < 0) {
    throw new RangeError(`baseWorldRadius must be >= 0; received ${baseWorldRadius}`)
  }
  return baseWorldRadius * planetTerraceRadiusMultiplier(bandCount, stepHeight)
}

export function computeMoviePlanetOuterRadius(
  movie: { size: number; genres: string[] },
  options: {
    sizeScale?: number
    activeSizeMultiplier?: number
    stepHeight?: number
  } = {},
): number {
  const sizeScale = options.sizeScale ?? PLANET_VISUAL_DEFAULTS.activeShell.sizeScale
  const activeSizeMultiplier =
    options.activeSizeMultiplier ?? PLANET_VISUAL_DEFAULTS.activeShell.activeSizeMultiplier
  const baseWorldRadius = computeActiveShellWorldRadius(
    movie.size,
    sizeScale,
    activeSizeMultiplier,
  )
  return computePlanetOuterRadius(
    baseWorldRadius,
    planetBandCount(movie.genres),
    options.stepHeight,
  )
}

export function computeActiveShellWorldRadius(
  movieSize: number,
  sizeScale: number,
  activeSizeMultiplier: number,
  inFocus = 1,
  extraWorldScale = 1,
): number {
  const values = { movieSize, sizeScale, activeSizeMultiplier, inFocus, extraWorldScale }
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be >= 0; received ${value}`)
    }
  }
  return inFocus * sizeScale * activeSizeMultiplier * movieSize * extraWorldScale
}

export function resolveSelectionRadiusValues(
  movieSize: number,
  sizeScale: number,
  activeSizeMultiplier: number,
  inFocus: number,
): { r: number; rActive: number } {
  const rActive = computeActiveShellWorldRadius(
    movieSize,
    sizeScale,
    activeSizeMultiplier,
    inFocus,
  )
  if (rActive > 1e-6) return { r: rActive, rActive }

  const rShell = computeActiveShellWorldRadius(movieSize, sizeScale, activeSizeMultiplier)
  return { r: Math.max(rShell, 1e-6), rActive }
}