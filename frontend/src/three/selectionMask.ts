import * as THREE from 'three'

import type {
  ExplorationMaskMode,
  ExplorationSelection,
} from '@/lib/exploration'
import type { Movie } from '@/types/galaxy'

export interface SelectionMaskProjection {
  readonly mode: ExplorationMaskMode
  readonly movieIds: readonly number[] | null
}

export function resolveSelectionMask(
  exploration: ExplorationSelection,
  focusNeighborIds: readonly number[] | null,
): SelectionMaskProjection {
  if (exploration.maskMode === 0) {
    return { mode: 0, movieIds: null }
  }
  if (exploration.maskMode === 1) {
    if (exploration.selectionMovieIds === null) {
      throw new Error('[SelectionMask] Select session requires movie IDs')
    }
    return { mode: 1, movieIds: exploration.selectionMovieIds }
  }
  return { mode: 2, movieIds: focusNeighborIds ?? [] }
}

export function getSelectionMaskPickSet(
  selectionMask: SelectionMaskProjection,
): Set<number> | null {
  return selectionMask.mode === 0
    ? null
    : new Set(selectionMask.movieIds ?? [])
}

/** P12.5 — uniforms shared by idle/active galaxy shaders for `uSelectionMask` + mode. */
export interface SelectionMaskUniformBag {
  uSelectionMask: THREE.IUniform<THREE.DataTexture>
  uSelectionCount: THREE.IUniform<number>
  uSelectionMode: THREE.IUniform<number>
  uMovieCount: THREE.IUniform<number>
  uSelectionAtlasWidth: THREE.IUniform<number>
  uSelectionAtlasHeight: THREE.IUniform<number>
}

/**
 * Pack `movieCount` instances into a 2D R8 atlas ≤ `maxTextureSize` on each axis
 * (`gl.MAX_TEXTURE_SIZE`; single-row 59k×1 exceeds typical 16384).
 */
export function computeSelectionMaskAtlasDimensions(
  movieCount: number,
  maxTextureSize: number,
): { width: number; height: number } {
  const cap = Math.max(1, Math.floor(maxTextureSize))
  if (movieCount <= 0) {
    return { width: 1, height: 1 }
  }
  if (movieCount > cap * cap) {
    throw new Error(
      `[SelectionMask] movieCount=${movieCount} exceeds atlas capacity ${cap}×${cap} (raise pipeline limit or use chunked masks)`,
    )
  }
  const width = Math.min(movieCount, cap)
  const height = Math.max(1, Math.ceil(movieCount / width))
  console.assert(width <= cap && height <= cap, '[SelectionMask] atlas dims')
  console.assert(width * height >= movieCount, '[SelectionMask] atlas area')
  return { width, height }
}

/**
 * One TMDB `Movie.id` → InstancedMesh instance index (array order in `galaxy_data`).
 */
export function buildMovieIdToIndexMap(movies: Movie[]): Map<number, number> {
  const map = new Map<number, number>()
  for (let i = 0; i < movies.length; i++) {
    const id = movies[i]!.id
    console.assert(!map.has(id), `[SelectionMask] duplicate movie id=${id} at index ${i}`)
    map.set(id, i)
  }
  console.log('[SelectionMask] id→index map size=', map.size, '| movies.length=', movies.length)
  console.assert(map.size === movies.length, '[SelectionMask] map size must equal movie count')
  return map
}

/**
 * Writes one resolved R8 selection mask projection (0/255 per instance) and its explicit mode.
 */
export function setSelectionMask(
  selectionMask: SelectionMaskProjection,
  idToIndex: Map<number, number>,
  uniforms: SelectionMaskUniformBag,
): void {
  const idsOrNull = selectionMask.movieIds
  const tex = uniforms.uSelectionMask.value
  const data = (tex.image as { data: Uint8Array }).data
  const atlasW = uniforms.uSelectionAtlasWidth.value
  const movieN = uniforms.uMovieCount.value
  uniforms.uSelectionMode.value = selectionMask.mode
  console.assert(atlasW >= 1, '[SelectionMask] uSelectionAtlasWidth')

  if (idsOrNull === null || idsOrNull.length === 0) {
    data.fill(0)
    tex.needsUpdate = true
    uniforms.uSelectionCount.value = 0
    console.log('[SelectionMask] cleared | mode=', selectionMask.mode, '| movieCount=', movieN)
    return
  }

  data.fill(0)
  let written = 0
  for (const id of idsOrNull) {
    const idx = idToIndex.get(id)
    if (idx === undefined) {
      console.warn(`[SelectionMask] unknown movie id=${id} — skipped`)
      continue
    }
    console.assert(idx >= 0 && idx < movieN, '[SelectionMask] instance index out of range')
    const x = idx % atlasW
    const y = Math.floor(idx / atlasW)
    const offset = y * atlasW + x
    console.assert(offset >= 0 && offset < data.length, '[SelectionMask] atlas offset')
    data[offset] = 255
    written++
  }
  tex.needsUpdate = true
  uniforms.uSelectionCount.value = written
  console.log(
    '[SelectionMask] written=',
    written,
    '| requested=',
    idsOrNull.length,
    '| mode=',
    selectionMask.mode,
  )
}
