/**
 * Pipeline `vote_count` → `size` mapping (mirror of `export_galaxy_json.py` `linear_map_array` on log10(vc+1)).
 * Used for focus size reference rings so radii match InstancedMesh / Perlin base shell.
 */

import type { Movie } from '@/types/galaxy'

/** Defaults aligned with `export_galaxy_json.py` `--size-min` / `--size-max`. */
export const PIPELINE_SIZE_MIN = 2.0
export const PIPELINE_SIZE_MAX = 25.0

export const FOCUS_VOTE_REFERENCE_TIERS = [10, 100, 1000, 10_000, 100_000] as const

export function computeLogVoteRangeFromMovies(movies: readonly Movie[]): { logMin: number; logMax: number } {
  console.assert(movies.length > 0, '[galaxyVoteSize] need at least one movie for log range')
  let logMin = Infinity
  let logMax = -Infinity
  for (const m of movies) {
    const lx = Math.log10(m.vote_count + 1)
    if (lx < logMin) logMin = lx
    if (lx > logMax) logMax = lx
  }
  console.assert(Number.isFinite(logMin) && Number.isFinite(logMax), '[galaxyVoteSize] finite log range', logMin, logMax)
  console.log('[galaxyVoteSize] log10(vote_count+1) range', { logMin, logMax, n: movies.length })
  return { logMin, logMax }
}

/** Python `linear_map_array` for a single value. */
export function linearMapInRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (!(inMax > inMin)) {
    return (outMin + outMax) / 2
  }
  const t = (value - inMin) / (inMax - inMin)
  const tClamped = Math.max(0, Math.min(1, t))
  return outMin + tClamped * (outMax - outMin)
}

/** Exported `size` field for a hypothetical vote_count (same normalization as pipeline JSON). */
export function pipelineParticleSizeForVoteCount(
  voteCount: number,
  logMin: number,
  logMax: number,
  sizeMin = PIPELINE_SIZE_MIN,
  sizeMax = PIPELINE_SIZE_MAX,
): number {
  const lx = Math.log10(Math.max(0, voteCount) + 1)
  return linearMapInRange(lx, logMin, logMax, sizeMin, sizeMax)
}

/** Base world shell radius for focus Perlin / active sizing (`galaxyActive.vert` inFocus=1 path). */
export function focusShellWorldRadiusFromParticleSize(
  particleSize: number,
  uSizeScale: number,
  uActiveSizeMul: number,
): number {
  return uSizeScale * uActiveSizeMul * particleSize
}

export function focusShellRadiiForVoteTiers(
  logMin: number,
  logMax: number,
  uSizeScale: number,
  uActiveSizeMul: number,
): number[] {
  const radii = FOCUS_VOTE_REFERENCE_TIERS.map((vc) => {
    const sz = pipelineParticleSizeForVoteCount(vc, logMin, logMax)
    return focusShellWorldRadiusFromParticleSize(sz, uSizeScale, uActiveSizeMul)
  })
  for (let i = 1; i < radii.length; i++) {
    console.assert(radii[i]! > radii[i - 1]!, '[galaxyVoteSize] tier radii must strictly increase', radii)
  }
  return radii
}
