import * as THREE from 'three'

import type { Movie } from '@/types/galaxy'

/**
 * Tech Spec §4.5.1 (same as `export_search_index.py`):
 * cast=1, director=2, dop=4, writers=8, producers=16, music_composer=32
 */
const MASK_CAST = 1
/** Director, DP, writers, composer — one merged temporal chain */
const MASK_CREW = 2 | 4 | 8 | 32
const MASK_PRODUCERS = 16

export type ChainKey = 'producers' | 'crew' | 'cast'

/** P22.6 — per-chain line opacity when not hovered */
export const CONSTELLATION_CHAIN_DEFAULT_OPACITY = 0.025
/** P22.6 — chain opacity when hovering a star that includes that chain's role for the selected person */
export const CONSTELLATION_CHAIN_HOVER_OPACITY = 0.2

/** When a chain’s target drops from hover to default, opacity eases linearly over this duration (ms). */
export const CONSTELLATION_CHAIN_OPACITY_FADE_MS = 500

const CHAIN_ORDER: readonly { key: ChainKey; mask: number }[] = [
  { key: 'producers', mask: MASK_PRODUCERS },
  { key: 'crew', mask: MASK_CREW },
  { key: 'cast', mask: MASK_CAST },
]

/** World-space gap beyond each endpoint's active-sphere radius (line stops short of the mesh). */
export const CONSTELLATION_SURFACE_GAP_WORLD = 0.2

const _seg = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 }

/**
 * Shorten segment A→B from both ends by (radius+gap) along the chord so endpoints sit outside each sphere.
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
  collectionMovieIds: readonly number[] | null
  /**
   * Per-film role mask for the selected person (`searchIndex.people[].movie_roles`).
   * When null/undefined, falls back to one polyline on the **producers** mesh only (legacy).
   */
  movieRoles: Readonly<Record<string, number>> | null | undefined
  /** World gap added on top of each endpoint's `getActiveWorldRadius` (see `CONSTELLATION_SURFACE_GAP_WORLD`). */
  surfaceGapWorld: number
  /** Active InstancedMesh world sphere radius (must match pick / `galaxyActive.vert`). */
  getActiveWorldRadius: (movie: Movie) => number
}

interface ChainHandle {
  mesh: THREE.LineSegments
  material: THREE.LineBasicMaterial
  geometry: THREE.BufferGeometry
  positions: Float32Array
}

function makeChain(maxSegments: number): ChainHandle {
  const maxVertices = maxSegments * 2
  console.assert(maxVertices >= 4, '[Constellation] need room for at least one segment')
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(maxVertices * 3)
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: CONSTELLATION_CHAIN_DEFAULT_OPACITY,
    depthTest: true,
    depthWrite: false,
  })
  const mesh = new THREE.LineSegments(geometry, material)
  mesh.frustumCulled = false
  mesh.visible = false
  geometry.setDrawRange(0, 0)
  return { mesh, material, geometry, positions }
}

type OpacityTargetMode = 'hover' | 'default'

interface OpacityFade {
  startMs: number
  from: number
}

function snapOpacityState(
  chains: Record<ChainKey, ChainHandle>,
  display: Record<ChainKey, number>,
  targetMode: Record<ChainKey, OpacityTargetMode>,
  fade: Record<ChainKey, OpacityFade | null>,
): void {
  const d = CONSTELLATION_CHAIN_DEFAULT_OPACITY
  for (const { key } of CHAIN_ORDER) {
    display[key] = d
    targetMode[key] = 'default'
    fade[key] = null
    chains[key].material.opacity = d
  }
}

export interface ConstellationHandle {
  /** Three `LineSegments` children (producers / crew / cast). */
  readonly group: THREE.Group
  setChainOpacity(chain: ChainKey, opacity: number): void
  /** All chains target default opacity; easing applied in `tickOpacity` (does not snap unless already at default). */
  resetChainOpacities(): void
  /**
   * P22.6 — set per-chain hover targets from role mask. Hover → material snaps up on next `tickOpacity`;
   * default → linear fade over `CONSTELLATION_CHAIN_OPACITY_FADE_MS`. `null` / `0` → all chains default.
   */
  updateHoverFromRoleMask(mask: number | null): void
  /** Apply opacity animation toward targets; call once per frame (e.g. from scene RAF). */
  tickOpacity(nowMs: number): void
  sync(p: ConstellationSyncParams): void
  dispose(): void
}

/**
 * P12.7 / P22.6 — `LineSegments` constellation for person select:
 * three white temporal chains (`movie_roles` present), or one chain on **producers** mesh when roles absent.
 */
export function createConstellation(maxSegmentsPerChain = 140): ConstellationHandle {
  const group = new THREE.Group()
  group.visible = false

  const chains: Record<ChainKey, ChainHandle> = {
    producers: makeChain(maxSegmentsPerChain),
    crew: makeChain(maxSegmentsPerChain),
    cast: makeChain(maxSegmentsPerChain),
  }
  for (const { key } of CHAIN_ORDER) {
    chains[key].mesh.renderOrder = 0.5
    group.add(chains[key].mesh)
  }

  /** `-1` = not visible; else last logged segment count sum. */
  let lastVisibleLogSeg = -1

  const opacityDisplay: Record<ChainKey, number> = {
    producers: CONSTELLATION_CHAIN_DEFAULT_OPACITY,
    crew: CONSTELLATION_CHAIN_DEFAULT_OPACITY,
    cast: CONSTELLATION_CHAIN_DEFAULT_OPACITY,
  }
  const opacityTargetMode: Record<ChainKey, OpacityTargetMode> = {
    producers: 'default',
    crew: 'default',
    cast: 'default',
  }
  const opacityFade: Record<ChainKey, OpacityFade | null> = {
    producers: null,
    crew: null,
    cast: null,
  }

  const setChainOpacity = (chain: ChainKey, opacity: number) => {
    opacityDisplay[chain] = opacity
    opacityTargetMode[chain] = opacity >= CONSTELLATION_CHAIN_HOVER_OPACITY - 1e-5 ? 'hover' : 'default'
    opacityFade[chain] = null
    chains[chain].material.opacity = opacity
  }

  const resetChainOpacities = () => {
    for (const { key } of CHAIN_ORDER) {
      opacityTargetMode[key] = 'default'
    }
  }

  const updateHoverFromRoleMask = (mask: number | null) => {
    const m = mask === null || mask === 0 ? null : mask
    const hi = CONSTELLATION_CHAIN_HOVER_OPACITY
    const def = CONSTELLATION_CHAIN_DEFAULT_OPACITY
    for (const { key, mask: chainRole } of CHAIN_ORDER) {
      const wantHover = m !== null && (m & chainRole) !== 0
      if (wantHover) {
        opacityTargetMode[key] = 'hover'
        opacityDisplay[key] = hi
        opacityFade[key] = null
        chains[key].material.opacity = hi
      } else {
        opacityTargetMode[key] = 'default'
        if (m !== null) {
          // Still hovering some star — chains that no longer match snap down immediately.
          opacityDisplay[key] = def
          opacityFade[key] = null
          chains[key].material.opacity = def
        }
      }
    }
  }

  const tickOpacity = (nowMs: number) => {
    const def = CONSTELLATION_CHAIN_DEFAULT_OPACITY
    const hi = CONSTELLATION_CHAIN_HOVER_OPACITY
    const fadeMs = CONSTELLATION_CHAIN_OPACITY_FADE_MS
    for (const { key } of CHAIN_ORDER) {
      if (opacityTargetMode[key] === 'hover') {
        opacityDisplay[key] = hi
        opacityFade[key] = null
        chains[key].material.opacity = hi
        continue
      }
      if (opacityDisplay[key] > def + 1e-6) {
        if (opacityFade[key] === null) {
          opacityFade[key] = { startMs: nowMs, from: opacityDisplay[key] }
        }
        const f = opacityFade[key]!
        const t = Math.min(1, (nowMs - f.startMs) / fadeMs)
        opacityDisplay[key] = f.from + (def - f.from) * t
        if (t >= 1) {
          opacityDisplay[key] = def
          opacityFade[key] = null
        }
      } else {
        opacityDisplay[key] = def
        opacityFade[key] = null
      }
      chains[key].material.opacity = opacityDisplay[key]
    }
  }

  const writeVertex = (positions: Float32Array, vi: number, x: number, y: number, z: number) => {
    const o = vi * 3
    positions[o] = x
    positions[o + 1] = y
    positions[o + 2] = z
  }

  const emitChainIntoBuffer = (
    positions: Float32Array,
    chainIds: readonly number[],
    p: ConstellationSyncParams,
    cap: number,
    gap: number,
  ): number => {
    let vi = 0
    if (chainIds.length < 2) return 0
    for (let i = 0; i < chainIds.length - 1; i++) {
      if (vi + 2 > cap) return vi
      const a = p.movieById.get(chainIds[i]!)
      const b = p.movieById.get(chainIds[i + 1]!)
      if (!a || !b) continue
      const rA = p.getActiveWorldRadius(a)
      const rB = p.getActiveWorldRadius(b)
      const inset = insetSegmentToAvoidSpheres(a.x, a.y, a.z, b.x, b.y, b.z, rA, rB, gap)
      if (!inset) continue
      writeVertex(positions, vi, inset.ax, inset.ay, inset.az)
      vi++
      writeVertex(positions, vi, inset.bx, inset.by, inset.bz)
      vi++
    }
    return vi
  }

  const sync = (p: ConstellationSyncParams): void => {
    if (!p.visible || p.hasFilmFocus || !p.collectionMovieIds || p.collectionMovieIds.length < 2) {
      group.visible = false
      snapOpacityState(chains, opacityDisplay, opacityTargetMode, opacityFade)
      for (const { key } of CHAIN_ORDER) {
        const ch = chains[key]
        ch.mesh.visible = false
        ch.geometry.setDrawRange(0, 0)
      }
      if (lastVisibleLogSeg >= 0) {
        lastVisibleLogSeg = -1
        console.log('[Constellation] hidden (off, focus, or <2 points)')
      }
      return
    }

    const gap = Math.max(0, p.surfaceGapWorld)
    snapOpacityState(chains, opacityDisplay, opacityTargetMode, opacityFade)
    const roles = p.movieRoles
    let anyVisible = false

    if (roles && Object.keys(roles).length > 0) {
      for (const { key, mask } of CHAIN_ORDER) {
        const ch = chains[key]
        const cap = ch.positions.length / 3
        const inGroup = p.collectionMovieIds.filter((id) => ((roles[String(id)] ?? 0) & mask) !== 0)
        const sorted = sortIdsByRelease(inGroup, p.movieById)
        const vi = emitChainIntoBuffer(ch.positions, sorted, p, cap, gap)
        if (vi < 2) {
          ch.mesh.visible = false
          ch.geometry.setDrawRange(0, 0)
        } else {
          ch.mesh.visible = true
          ch.geometry.setDrawRange(0, vi)
          const posAttr = ch.geometry.attributes.position as THREE.BufferAttribute
          posAttr.needsUpdate = true
          anyVisible = true
        }
      }
    } else {
      for (const { key } of CHAIN_ORDER) {
        const ch = chains[key]
        if (key !== 'producers') {
          ch.mesh.visible = false
          ch.geometry.setDrawRange(0, 0)
          continue
        }
        const cap = ch.positions.length / 3
        const sorted = sortIdsByRelease(p.collectionMovieIds, p.movieById)
        const vi = emitChainIntoBuffer(ch.positions, sorted, p, cap, gap)
        if (vi < 2) {
          ch.mesh.visible = false
          ch.geometry.setDrawRange(0, 0)
        } else {
          ch.mesh.visible = true
          ch.geometry.setDrawRange(0, vi)
          const posAttr = ch.geometry.attributes.position as THREE.BufferAttribute
          posAttr.needsUpdate = true
          anyVisible = true
        }
      }
      chains.crew.mesh.visible = false
      chains.crew.geometry.setDrawRange(0, 0)
      chains.cast.mesh.visible = false
      chains.cast.geometry.setDrawRange(0, 0)
    }

    if (!anyVisible) {
      group.visible = false
      snapOpacityState(chains, opacityDisplay, opacityTargetMode, opacityFade)
      for (const { key } of CHAIN_ORDER) {
        chains[key].mesh.visible = false
        chains[key].geometry.setDrawRange(0, 0)
      }
      if (lastVisibleLogSeg >= 0) {
        lastVisibleLogSeg = -1
        console.log('[Constellation] hidden (no drawable segments)')
      }
      return
    }

    group.visible = true

    const segTotal =
      (chains.producers.geometry.drawRange.count +
        chains.crew.geometry.drawRange.count +
        chains.cast.geometry.drawRange.count) /
      2
    if (segTotal !== lastVisibleLogSeg) {
      lastVisibleLogSeg = segTotal
      console.log(
        '[Constellation] visible | segments=',
        segTotal,
        '| chains=producers+crew(director|dop|writers|music)+cast',
      )
    }
  }

  const dispose = () => {
    for (const { key } of CHAIN_ORDER) {
      const ch = chains[key]
      ch.geometry.dispose()
      ch.material.dispose()
    }
  }

  return { group, setChainOpacity, resetChainOpacities, updateHoverFromRoleMask, tickOpacity, sync, dispose }
}
