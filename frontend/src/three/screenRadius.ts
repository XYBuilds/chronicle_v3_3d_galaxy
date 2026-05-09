import * as THREE from 'three'

import type { SearchMode } from '@/store/galaxyInteractionStore'
import type { Movie } from '@/types/galaxy'

import { NEAR_CULL_WORLD_Z } from './nearCullWorldZ'

/**
 * P12.6+ / P13.2 — CPU pick/hover must match shader `inFocus`.
 * Focus (`selectedMovieId`) wins over person/genre search mask (D1).
 */
export function getSelectionMaskPickSet(
  selectedMovieId: number | null,
  focusNeighborIds: number[] | null,
  searchMode: SearchMode,
  selectionIds: number[] | null,
): Set<number> | null {
  // P13.6 — mask mode whenever focus ids are committed (incl. empty Set); avoids vis-slab fallback during focus.
  if (selectedMovieId !== null && focusNeighborIds !== null) {
    return new Set(focusNeighborIds)
  }
  if (searchMode !== 'person' && searchMode !== 'genre') return null
  if (!selectionIds?.length) return null
  return new Set(selectionIds)
}

/** GLSL `smoothstep` replica for CPU gates (P8.4 pick: `inFocus > 0.5`). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Matches `galaxyIdle.vert` / `galaxyActive.vert` `inFocus` (0…1). */
export function movieZInFocusFactor(aZ: number, zCurrent: number, zVisWindow: number): number {
  const zHi = zCurrent + zVisWindow
  const W = zVisWindow * 0.2
  return smoothstep(zCurrent - W, zCurrent, aZ) * (1 - smoothstep(zHi, zHi + W, aZ))
}

const _mv = new THREE.Vector3()
/** Ray `origin + t * direction` vs sphere `(cx,cy,cz), R` — smallest positive `t`, or null (P11.6 focus Perlin pick). */
export function rayPositiveSphereFirstT(
  ray: THREE.Ray,
  cx: number,
  cy: number,
  cz: number,
  R: number,
): number | null {
  return rayFirstPositiveSphereT(ray, cx, cy, cz, R)
}

/** Ray `origin + t * direction` vs sphere `(cx,cy,cz), R` — smallest positive `t`, or null. */
function rayFirstPositiveSphereT(
  ray: THREE.Ray,
  cx: number,
  cy: number,
  cz: number,
  R: number,
): number | null {
  const ox = ray.origin.x - cx
  const oy = ray.origin.y - cy
  const oz = ray.origin.z - cz
  const dx = ray.direction.x
  const dy = ray.direction.y
  const dz = ray.direction.z
  const a = dx * dx + dy * dy + dz * dz
  if (a < 1e-18) return null
  const b = 2 * (ox * dx + oy * dy + oz * dz)
  const c = ox * ox + oy * oy + oz * oz - R * R
  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  const s = Math.sqrt(disc)
  const t0 = (-b - s) / (2 * a)
  const t1 = (-b + s) / (2 * a)
  const eps = 1e-4
  let tMin: number | null = null
  if (t0 >= eps) tMin = t0
  if (t1 >= eps) tMin = tMin === null ? t1 : Math.min(tMin, t1)
  return tMin
}

/** World-space active icosphere radius (matches `galaxyActive.vert`: `inFocus * uSizeScale * uActiveSizeMul * aSize`). */
export function computeActiveWorldRadius(
  movie: Pick<Movie, 'id' | 'z' | 'size'>,
  zCurrent: number,
  zVisWindow: number,
  activeMaterial: THREE.ShaderMaterial,
  selectionMaskPickSet: Set<number> | null = null,
  /** P23.3 — multiply CPU pick/hover radius when cover boosts `uCoverActiveSizeBoost` in the shader. */
  extraWorldScale = 1,
): number {
  const inF = selectionMaskPickSet
    ? selectionMaskPickSet.has(movie.id)
      ? 1
      : 0
    : movieZInFocusFactor(movie.z, zCurrent, zVisWindow)
  const u = activeMaterial.uniforms
  const uSizeScale = (u.uSizeScale as THREE.Uniform<number>).value
  const uActiveSizeMul = (u.uActiveSizeMul as THREE.Uniform<number>).value
  return inF * uSizeScale * uActiveSizeMul * movie.size * extraWorldScale
}

/**
 * Perlin selection planet world radius: matches `galaxyActive.vert` when the star is in the vis slab.
 * When `inFocus≈0` (idle / off-slab, e.g. search jump), **do not** use `meta` worldSpan here — Z uses decimal
 * years while XY is UMAP; a span-based fallback made `r` O(10) while focus camera standoff is O(1) year,
 * placing the camera **inside** the Perlin sphere. Instead use the same shell as `inFocus=1` active pick.
 */
export function resolveSelectionWorldRadius(
  movie: Pick<Movie, 'id' | 'z' | 'size'>,
  zCurrent: number,
  zVisWindow: number,
  activeMaterial: THREE.ShaderMaterial,
  selectionMaskPickSet: Set<number> | null = null,
): { r: number; rActive: number } {
  const rActive = computeActiveWorldRadius(movie, zCurrent, zVisWindow, activeMaterial, selectionMaskPickSet)
  if (rActive > 1e-6) {
    return { r: rActive, rActive }
  }
  const u = activeMaterial.uniforms
  const uSizeScale = (u.uSizeScale as THREE.Uniform<number>).value
  const uActiveSizeMul = (u.uActiveSizeMul as THREE.Uniform<number>).value
  const rShell = uSizeScale * uActiveSizeMul * movie.size
  const r = Math.max(rShell, 1e-6)
  return { r, rActive }
}

export type ActiveRayPickResult = { index: number; hitPoint: THREE.Vector3; t: number }

/**
 * True mesh pick: ray vs world spheres with the same radius the active vertex shader uses (InstancedMesh
 * built-in raycast ignores per-vertex `sActive` scale).
 * @param requireSlabInteraction — if true, require `movieZInFocusFactor > 0.5` (P8.4 click gate); hover passes false.
 * @param selectionMaskPickSet — if set (person/genre search), only these ids use full active radius; others skipped.
 * @param cameraWorldZ — P22.1 world-Z of the camera (same space as `movie.z`); must match `uCameraWorldPos.z` in galaxy shaders.
 * @param nearCullExemptMovieId — P22.1 focus film id exempt from near-Z cull on pick (matches shader `uFocusedInstanceId` path).
 * @param coverTodayInstanceIndex — P23.3 when set (≥0), only this instance can be picked (matches cover shader cull).
 * @param coverActiveSizeBoost — P23.3 must match `uCoverActiveSizeBoost` when picking the cover instance.
 */
export function pickClosestActiveMovieAlongRay(options: {
  ray: THREE.Ray
  movies: Movie[]
  activeMaterial: THREE.ShaderMaterial
  zCurrent: number
  zVisWindow: number
  requireSlabInteraction: boolean
  selectionMaskPickSet?: Set<number> | null
  cameraWorldZ: number
  nearCullExemptMovieId: number | null
  coverTodayInstanceIndex?: number | null
  coverActiveSizeBoost?: number
}): ActiveRayPickResult | null {
  const {
    ray,
    movies,
    activeMaterial,
    zCurrent,
    zVisWindow,
    requireSlabInteraction,
    selectionMaskPickSet,
    cameraWorldZ,
    nearCullExemptMovieId,
    coverTodayInstanceIndex,
    coverActiveSizeBoost = 1,
  } = options
  const u = activeMaterial.uniforms
  const uSizeScale = (u.uSizeScale as THREE.Uniform<number>).value
  const uActiveSizeMul = (u.uActiveSizeMul as THREE.Uniform<number>).value
  let bestT = Infinity
  let bestIdx = -1
  const slabGate = 0.5
  const covIdx =
    coverTodayInstanceIndex !== undefined && coverTodayInstanceIndex !== null && coverTodayInstanceIndex >= 0
      ? coverTodayInstanceIndex
      : null

  for (let i = 0; i < movies.length; i++) {
    if (covIdx !== null && i !== covIdx) continue
    const m = movies[i]
    if (
      Math.abs(cameraWorldZ - m.z) < NEAR_CULL_WORLD_Z &&
      m.id !== nearCullExemptMovieId
    ) {
      continue
    }
    let inF: number
    if (selectionMaskPickSet && selectionMaskPickSet.size > 0) {
      if (!selectionMaskPickSet.has(m.id)) continue
      inF = 1
    } else {
      inF = movieZInFocusFactor(m.z, zCurrent, zVisWindow)
    }
    if (inF < 1e-6) continue
    if (requireSlabInteraction && inF <= slabGate) continue

    const boost = covIdx !== null && i === covIdx ? coverActiveSizeBoost : 1
    const R = inF * uSizeScale * uActiveSizeMul * m.size * boost
    if (R < 1e-6) continue

    const t = rayFirstPositiveSphereT(ray, m.x, m.y, m.z, R)
    if (t !== null && t < bestT) {
      bestT = t
      bestIdx = i
    }
  }

  if (bestIdx < 0) return null
  const hitPoint = new THREE.Vector3()
  ray.at(bestT, hitPoint)
  return { index: bestIdx, hitPoint, t: bestT }
}

/**
 * Approximate active-mesh sphere radius in **CSS pixels** (for hover ring + tooltip offset).
 * Uses perspective height at `distCam` and the same scale factors as the active vertex shader.
 */
export function computeActiveMeshScreenRadiusCss(options: {
  movie: Pick<Movie, 'id' | 'x' | 'y' | 'z' | 'size'>
  camera: THREE.PerspectiveCamera
  domElement: HTMLElement
  activeMaterial: THREE.ShaderMaterial
  zCurrent: number
  zVisWindow: number
  selectionMaskPickSet?: Set<number> | null
  /** P23.3 — match cover shader size boost for hover ring / tooltip. */
  extraWorldScale?: number
}): number {
  const { movie, camera, domElement, activeMaterial, zCurrent, zVisWindow, selectionMaskPickSet, extraWorldScale = 1 } =
    options
  const rWorld = computeActiveWorldRadius(
    movie,
    zCurrent,
    zVisWindow,
    activeMaterial,
    selectionMaskPickSet ?? null,
    extraWorldScale,
  )
  if (rWorld <= 1e-6) return 0

  _mv.set(movie.x, movie.y, movie.z)
  _mv.applyMatrix4(camera.matrixWorldInverse)
  if (_mv.z >= 0) return 0
  const distCam = Math.max(0.001, -_mv.z)

  const rect = domElement.getBoundingClientRect()
  const h = Math.max(1, rect.height)
  const vFov = THREE.MathUtils.degToRad(camera.fov)
  const worldPerPx = (2 * Math.tan(vFov / 2) * distCam) / h
  return rWorld / Math.max(1e-6, worldPerPx)
}

/** CSS px radius for an arbitrary world sphere (P11.6 focus Perlin `lastRadius` tooltip ring). */
export function computeWorldSphereScreenRadiusCss(options: {
  cx: number
  cy: number
  cz: number
  rWorld: number
  camera: THREE.PerspectiveCamera
  domElement: HTMLElement
}): number {
  const { cx, cy, cz, rWorld, camera, domElement } = options
  if (rWorld <= 1e-6) return 0
  _mv.set(cx, cy, cz)
  _mv.applyMatrix4(camera.matrixWorldInverse)
  if (_mv.z >= 0) return 0
  const distCam = Math.max(0.001, -_mv.z)
  const rect = domElement.getBoundingClientRect()
  const h = Math.max(1, rect.height)
  const vFov = THREE.MathUtils.degToRad(camera.fov)
  const worldPerPx = (2 * Math.tan(vFov / 2) * distCam) / h
  return rWorld / Math.max(1e-6, worldPerPx)
}
