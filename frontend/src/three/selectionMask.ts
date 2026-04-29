import * as THREE from 'three'

import type { Movie } from '@/types/galaxy'

/** P12.5 — uniforms shared by idle/active galaxy shaders for `uSelectionMask` + mode. */
export interface SelectionMaskUniformBag {
  uSelectionMask: THREE.IUniform<THREE.DataTexture>
  uSelectionCount: THREE.IUniform<number>
  uSelectionMode: THREE.IUniform<number>
  uMovieCount: THREE.IUniform<number>
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
 * Writes R8 selection mask (0/255 per instance) and sets `uSelectionMode`: 0 = off (timeline inFocus),
 * 1 = mask overrides `inFocus` in shaders (P12.6 person/genre select).
 */
export function setSelectionMask(
  idsOrNull: number[] | null,
  idToIndex: Map<number, number>,
  uniforms: SelectionMaskUniformBag,
): void {
  const tex = uniforms.uSelectionMask.value
  const data = (tex.image as { data: Uint8Array }).data
  const n = data.length

  if (idsOrNull === null || idsOrNull.length === 0) {
    data.fill(0)
    tex.needsUpdate = true
    uniforms.uSelectionCount.value = 0
    uniforms.uSelectionMode.value = 0
    console.log('[SelectionMask] cleared | mode=0 | instances=', n)
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
    console.assert(idx >= 0 && idx < n, '[SelectionMask] index out of range')
    data[idx] = 255
    written++
  }
  tex.needsUpdate = true
  uniforms.uSelectionCount.value = written
  uniforms.uSelectionMode.value = written > 0 ? 1 : 0
  console.log('[SelectionMask] mode=', uniforms.uSelectionMode.value, '| count=', written, '| requested=', idsOrNull.length)
}
