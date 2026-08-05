import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import {
  decideExploration,
  selectExploration,
  type ExplorationContext,
  type SelectSession,
} from '@/lib/exploration'
import {
  getSelectionMaskPickSet,
  resolveSelectionMask,
  setSelectionMask,
  type SelectionMaskUniformBag,
} from './selectionMask'

const session = {
  relation: { kind: 'genre', key: 'genre:science-fiction' },
  movieIds: [10, 20, 30],
  conditions: { operator: 'and', genres: ['Science Fiction'] },
} satisfies SelectSession

function maskFor(
  context: ExplorationContext,
  focusNeighborIds: readonly number[] | null = null,
) {
  return resolveSelectionMask(selectExploration(context), focusNeighborIds)
}

describe('selection mask projection', () => {
  it('writes GPU bytes and CPU membership from the same explicit projection', () => {
    const texture = new THREE.DataTexture(new Uint8Array(4), 4, 1, THREE.RedFormat)
    const uniforms = {
      uSelectionMask: { value: texture },
      uSelectionCount: { value: 0 },
      uSelectionMode: { value: 0 },
      uMovieCount: { value: 4 },
      uSelectionAtlasWidth: { value: 4 },
      uSelectionAtlasHeight: { value: 1 },
    } satisfies SelectionMaskUniformBag
    const projection = maskFor({ kind: 'select', session })

    setSelectionMask(
      projection,
      new Map([
        [10, 0],
        [20, 2],
        [30, 3],
      ]),
      uniforms,
    )

    expect(uniforms.uSelectionMode.value).toBe(projection.mode)
    expect(uniforms.uSelectionCount.value).toBe(3)
    const maskData = texture.image.data
    if (maskData === null) throw new Error('selection mask texture data is missing')
    expect(Array.from(maskData)).toEqual([255, 0, 255, 255])
    expect(getSelectionMaskPickSet(projection)).toEqual(new Set([10, 20, 30]))
    texture.dispose()
  })

  it('uses one projection for shader mode and CPU pick membership', () => {
    const searchMask = maskFor({ kind: 'select', session })
    expect(searchMask).toEqual({ mode: 1, memberMovieIds: session.movieIds })
    expect(getSelectionMaskPickSet(searchMask)).toEqual(new Set(session.movieIds))

    const focusMask = maskFor(
      { kind: 'focus', movieId: 20, parent: session },
      [20, 99],
    )
    expect(focusMask).toEqual({ mode: 2, memberMovieIds: [20, 99] })
    expect(getSelectionMaskPickSet(focusMask)).toEqual(new Set([20, 99]))
  })

  it('keeps focus mode when its scene-owned neighborhood cache is not ready', () => {
    const focusMask = maskFor({ kind: 'focus', movieId: 99 })
    expect(focusMask).toEqual({ mode: 2, memberMovieIds: [] })
    expect(getSelectionMaskPickSet(focusMask)).toEqual(new Set())
  })

  it('restores search mask after Nested exit and timeline mode after Replacing exit', () => {
    const nested = {
      kind: 'focus',
      movieId: 20,
      parent: session,
    } satisfies ExplorationContext
    const replacing = { kind: 'focus', movieId: 99 } satisfies ExplorationContext

    expect(maskFor(decideExploration(nested, { type: 'focus/exited' }))).toEqual({
      mode: 1,
      memberMovieIds: session.movieIds,
    })
    expect(maskFor(decideExploration(replacing, { type: 'focus/exited' }))).toEqual({
      mode: 0,
      memberMovieIds: null,
    })
  })
})