import * as THREE from 'three'

import type { Movie } from '@/types/galaxy'

/** Same bit order as Tech Spec §4.5.1 / `export_search_index.py`. */
const ROLE_BITS = [1, 2, 4, 8, 16, 32] as const

const ROLE_COLOR_SRGB: Record<number, [number, number, number]> = {
  1: [0.55, 0.78, 1.0],
  2: [1.0, 0.82, 0.45],
  4: [0.68, 0.55, 1.0],
  8: [0.45, 1.0, 0.72],
  16: [1.0, 0.55, 0.65],
  32: [0.55, 1.0, 0.85],
}

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
 * P12.7 — `LineSegments` “constellation” for person select: one temporal chain per job bit
 * (cast / director / …), or a single chain when `movie_roles` is absent.
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
      for (const bit of ROLE_BITS) {
        const inRole = p.selectionIds.filter((id) => ((roles[String(id)] ?? 0) & bit) !== 0)
        const sorted = sortIdsByRelease(inRole, p.movieById)
        const rgb = ROLE_COLOR_SRGB[bit] ?? FALLBACK_LINE_SRGB
        emitChain(sorted, rgb)
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
      console.log('[Constellation] visible | vertices=', vi, 'segments=', segCount, '| byRole=', Boolean(roles && Object.keys(roles).length > 0))
    }
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }

  return { mesh, sync, dispose }
}
