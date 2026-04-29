import * as THREE from 'three'

import type { Movie } from '@/types/galaxy'

/**
 * Tech Spec ?4.5.1 (same as `export_search_index.py`):
 * cast=1, director=2, dop=4, writers=8, producers=16, music_composer=32
 */
const MASK_CAST = 1
/** Director, DP, writers, composer ? one merged temporal chain */
const MASK_CREW = 2 | 4 | 8 | 32
const MASK_PRODUCERS = 16

/** Three chains: producers / crew / cast ? white lines, geometry only */
const LINE_GROUPS: readonly { label: string; mask: number }[] = [
  { label: 'producers', mask: MASK_PRODUCERS },
  { label: 'crew', mask: MASK_CREW },
  { label: 'cast', mask: MASK_CAST },
]

/** World-space gap beyond each endpoint's active-sphere radius (line stops short of the mesh). */
export const CONSTELLATION_SURFACE_GAP_WORLD = 0.2

const _seg = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 }

/**
 * Shorten segment A?B from both ends by (radius+gap) along the chord so endpoints sit outside each sphere.
 * Returns null if degenerate or fully inside the offset envelopes.
 */
function insetSegmentToAvoidSpheres(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  rA: number,
  rB: number,
  gap: number,
): { ax: number; ay: number; az: number; bx: number; by: number; bz: number } | null {
  const abx = bx - ax
  const aby = by - ay
  const abz = bz - az
  const len = Math.hypot(abx, aby, abz)
  if (len < 1e-8) return null
  const inv = 1 / len
  const dx = abx * inv
  const dy = aby * inv
  const dz = abz * inv
  const pullA = rA + gap
  const pullB = rB + gap
  if (pullA + pullB >= len - 1e-6) return null
  _seg.ax = ax + dx * pullA
  _seg.ay = ay + dy * pullA
  _seg.az = az + dz * pullA
  _seg.bx = bx - dx * pullB
  _seg.by = by - dy * pullB
  _seg.bz = bz - dz * pullB
  return _seg
}

function sortIdsByRelease(ids: readonly number[], movieById: ReadonlyMap<number, Movie>): number[] {
  return [...ids].sort((a, b) => {
    const da = movieById.get(a)?.release_date ?? ''
    const db = movieById.get(b)?.release_date ?? ''
    return da.localeCompare(db)
  })
}

export interface ConstellationSyncParams {
  visible: boolean
  /** When true (single-film focus / Perlin), constellation is hidden. */
  hasFilmFocus: boolean
  movieById: ReadonlyMap<number, Movie>
  selectionIds: readonly number[] | null
  /**
   * Per-film role mask for the selected person (`searchIndex.people[].movie_roles`).
   * When null/undefined, falls back to one polyline over all `selectionIds` sorted by `release_date`.
   */
  movieRoles: Readonly<Record<string, number>> | null | undefined
  /** World gap added on top of each endpoint's `getActiveWorldRadius` (see `CONSTELLATION_SURFACE_GAP_WORLD`). */
  surfaceGapWorld: number
  /** Active InstancedMesh world sphere radius (must match pick / `galaxyActive.vert`). */
  getActiveWorldRadius: (movie: Movie) => number
}

export interface ConstellationHandle {
  readonly mesh: THREE.LineSegments
  sync(p: ConstellationSyncParams): void
  dispose(): void
}

/**
 * P12.7 ? `LineSegments` constellation for person select:
 * three white temporal chains when `movie_roles` is present (producers / crew / cast),
 * or one chain when `movie_roles` is absent.
 */
export function createConstellation(maxSegments = 420): ConstellationHandle {
  const maxVertices = maxSegments * 2
  console.assert(maxVertices >= 4, '[Constellation] need room for at least one segment')
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(maxVertices * 3)
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.07,
    depthTest: true,
    depthWrite: false,
  })
  const mesh = new THREE.LineSegments(geometry, material)
  mesh.frustumCulled = false
  mesh.visible = false
  geometry.setDrawRange(0, 0)

  let lastLogVertices = -1

  const writeVertex = (vi: number, x: number, y: number, z: number) => {
    const o = vi * 3
    positions[o] = x
    positions[o + 1] = y
    positions[o + 2] = z
  }

  const sync = (p: ConstellationSyncParams): void => {
    if (!p.visible || p.hasFilmFocus || !p.selectionIds || p.selectionIds.length < 2) {
      mesh.visible = false
      geometry.setDrawRange(0, 0)
      if (lastLogVertices !== 0) {
        lastLogVertices = 0
        console.log('[Constellation] hidden (off, focus, or <2 points)')
      }
      return
    }

    let vi = 0
    const cap = maxVertices
    const gap = Math.max(0, p.surfaceGapWorld)

    const emitChain = (chainIds: readonly number[]) => {
      if (chainIds.length < 2) return
      for (let i = 0; i < chainIds.length - 1; i++) {
        if (vi + 2 > cap) return
        const a = p.movieById.get(chainIds[i]!)
        const b = p.movieById.get(chainIds[i + 1]!)
        if (!a || !b) continue
        const rA = p.getActiveWorldRadius(a)
        const rB = p.getActiveWorldRadius(b)
        const inset = insetSegmentToAvoidSpheres(a.x, a.y, a.z, b.x, b.y, b.z, rA, rB, gap)
        if (!inset) continue
        writeVertex(vi, inset.ax, inset.ay, inset.az)
        vi++
        writeVertex(vi, inset.bx, inset.by, inset.bz)
        vi++
      }
    }

    const roles = p.movieRoles
    if (roles && Object.keys(roles).length > 0) {
      for (const g of LINE_GROUPS) {
        const inGroup = p.selectionIds.filter((id) => ((roles[String(id)] ?? 0) & g.mask) !== 0)
        const sorted = sortIdsByRelease(inGroup, p.movieById)
        emitChain(sorted)
      }
    } else {
      const sorted = sortIdsByRelease(p.selectionIds, p.movieById)
      emitChain(sorted)
    }

    if (vi < 2) {
      mesh.visible = false
      geometry.setDrawRange(0, 0)
      return
    }

    mesh.visible = true
    geometry.setDrawRange(0, vi)
    const posAttr = geometry.attributes.position as THREE.BufferAttribute
    posAttr.needsUpdate = true

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
