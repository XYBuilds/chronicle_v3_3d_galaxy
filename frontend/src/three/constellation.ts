import * as THREE from 'three'

import type { Movie } from '@/types/galaxy'

/**
 * Tech Spec §4.5.1 — `export_search_index.py` 同序:
 * cast=1, director=2, dop=4, writers=8, producers=16, music_composer=32
 */
const MASK_CAST = 1
/** 导演、摄影、编剧、作曲 — 合并为一根时间序线 */
const MASK_CREW = 2 | 4 | 8 | 32
const MASK_PRODUCERS = 16

/** 三根线：制片 / 主创(导演·摄影·编剧·作曲) / 演员 */
const LINE_GROUPS: readonly { label: string; mask: number; rgb: [number, number, number] }[] = [
  { label: 'producers', mask: MASK_PRODUCERS, rgb: [1.0, 0.55, 0.72] },
  { label: 'crew', mask: MASK_CREW, rgb: [1.0, 0.82, 0.45] },
  { label: 'cast', mask: MASK_CAST, rgb: [0.55, 0.78, 1.0] },
]

const FALLBACK_LINE_SRGB: [number, number, number] = [0.92, 0.92, 0.95]

function sortIdsByRelease(ids: readonly number[], movieById: ReadonlyMap<number, Movie>): number[] {
  return [...ids].sort((a, b) => {
    const da = movieById.get(a)?.release_date ?? ''
    const db = movieById.get(b)?.release_date ?? ''
    return da.localeCompare(db)
  })
}

export interface ConstellationSyncParams {
  visible: boolean
  movieById: ReadonlyMap<number, Movie>
  selectionIds: readonly number[] | null
  /**
   * Per-film role mask for the selected person (`searchIndex.people[].movie_roles`).
   * When null/undefined, falls back to one polyline over all `selectionIds` sorted by `release_date`.
   */
  movieRoles: Readonly<Record<string, number>> | null | undefined
}

export interface ConstellationHandle {
  readonly mesh: THREE.LineSegments
  sync(p: ConstellationSyncParams): void
  dispose(): void
}

/**
 * P12.7 — `LineSegments` “constellation” for person select:
 * three temporal chains when `movie_roles` is present — **制片**、**导演+摄影+编剧+作曲**、**演员**；
 * or one chain when `movie_roles` is absent.
 */
export function createConstellation(maxSegments = 420): ConstellationHandle {
  const maxVertices = maxSegments * 2
  console.assert(maxVertices >= 4, '[Constellation] need room for at least one segment')
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(maxVertices * 3)
  const colors = new Float32Array(maxVertices * 3)
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.52,
    depthTest: true,
    depthWrite: false,
  })
  const mesh = new THREE.LineSegments(geometry, material)
  mesh.frustumCulled = false
  mesh.visible = false
  geometry.setDrawRange(0, 0)

  let lastLogVertices = -1

  const writeVertex = (vi: number, x: number, y: number, z: number, r: number, g: number, b: number) => {
    const o = vi * 3
    positions[o] = x
    positions[o + 1] = y
    positions[o + 2] = z
    colors[o] = r
    colors[o + 1] = g
    colors[o + 2] = b
  }

  const sync = (p: ConstellationSyncParams): void => {
    if (!p.visible || !p.selectionIds || p.selectionIds.length < 2) {
      mesh.visible = false
      geometry.setDrawRange(0, 0)
      if (lastLogVertices !== 0) {
        lastLogVertices = 0
        console.log('[Constellation] hidden (off or <2 points)')
      }
      return
    }

    let vi = 0
    const cap = maxVertices

    const emitChain = (chainIds: readonly number[], rgb: readonly [number, number, number]) => {
      if (chainIds.length < 2) return
      for (let i = 0; i < chainIds.length - 1; i++) {
        if (vi + 2 > cap) return
        const a = p.movieById.get(chainIds[i]!)
        const b = p.movieById.get(chainIds[i + 1]!)
        if (!a || !b) continue
        writeVertex(vi, a.x, a.y, a.z, rgb[0], rgb[1], rgb[2])
        vi++
        writeVertex(vi, b.x, b.y, b.z, rgb[0], rgb[1], rgb[2])
        vi++
      }
    }

    const roles = p.movieRoles
    if (roles && Object.keys(roles).length > 0) {
      for (const g of LINE_GROUPS) {
        const inGroup = p.selectionIds.filter((id) => ((roles[String(id)] ?? 0) & g.mask) !== 0)
        const sorted = sortIdsByRelease(inGroup, p.movieById)
        emitChain(sorted, g.rgb)
      }
    } else {
      const sorted = sortIdsByRelease(p.selectionIds, p.movieById)
      emitChain(sorted, FALLBACK_LINE_SRGB)
    }

    if (vi < 2) {
      mesh.visible = false
      geometry.setDrawRange(0, 0)
      return
    }

    mesh.visible = true
    geometry.setDrawRange(0, vi)
    const posAttr = geometry.attributes.position as THREE.BufferAttribute
    const colAttr = geometry.attributes.color as THREE.BufferAttribute
    posAttr.needsUpdate = true
    colAttr.needsUpdate = true

    if (vi !== lastLogVertices) {
      lastLogVertices = vi
      const segCount = vi / 2
      console.log(
        '[Constellation] visible | vertices=',
        vi,
        'segments=',
        segCount,
        '| groups=producers+crew(director|dop|writers|music)+cast',
      )
    }
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }

  return { mesh, sync, dispose }
}
