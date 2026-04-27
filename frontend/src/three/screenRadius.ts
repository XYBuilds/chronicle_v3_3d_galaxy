import * as THREE from 'three'

import type { Movie } from '@/types/galaxy'

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
  movie: Pick<Movie, 'z' | 'size'>,
  zCurrent: number,
  zVisWindow: number,
  activeMaterial: THREE.ShaderMaterial,
): number {
  const inF = movieZInFocusFactor(movie.z, zCurrent, zVisWindow)
  const u = activeMaterial.uniforms
  const uSizeScale = (u.uSizeScale as THREE.Uniform<number>).value
  const uActiveSizeMul = (u.uActiveSizeMul as THREE.Uniform<number>).value
  return inF * uSizeScale * uActiveSizeMul * movie.size
}

/**
 * Single source of truth for Perlin selection planet world radius (must match `galaxyActive.vert` scale
 * and `computeActiveWorldRadius`). Uses span-based fallback when the movie is outside the Z slab.
 */
export function resolveSelectionWorldRadius(
  movie: Pick<Movie, 'z' | 'size'>,
  zCurrent: number,
  zVisWindow: number,
  activeMaterial: THREE.ShaderMaterial,
  worldSpan: number,
): { r: number; rActive: number } {
  const rActive = computeActiveWorldRadius(movie, zCurrent, zVisWindow, activeMaterial)
  const rFallback = THREE.MathUtils.clamp(worldSpan * 0.014, 0.07, worldSpan * 0.05)
  const r = rActive > 1e-6 ? rActive : rFallback
  console.assert(
    rActive <= 0 || Math.abs(r - rActive) < 1e-9,
    '[Selection] Perlin radius must match active mesh when inFocus>0',
  )
  return { r, rActive }
}

export type ActiveRayPickResult = { index: number; hitPoint: THREE.Vector3; t: number }

/**
 * True mesh pick: ray vs world spheres with the same radius the active vertex shader uses (InstancedMesh
 * built-in raycast ignores per-vertex `sActive` scale).
 * @param requireSlabInteraction — if true, require `movieZInFocusFactor > 0.5` (P8.4 click gate); hover passes false.
 */
export function pickClosestActiveMovieAlongRay(options: {
  ray: THREE.Ray
  movies: Movie[]
  activeMaterial: THREE.ShaderMaterial
  zCurrent: number
  zVisWindow: number
  requireSlabInteraction: boolean
}): ActiveRayPickResult | null {
  const { ray, movies, activeMaterial, zCurrent, zVisWindow, requireSlabInteraction } = options
  const u = activeMaterial.uniforms
  const uSizeScale = (u.uSizeScale as THREE.Uniform<number>).value
  const uActiveSizeMul = (u.uActiveSizeMul as THREE.Uniform<number>).value
  let bestT = Infinity
  let bestIdx = -1
  const slabGate = 0.5

  for (let i = 0; i < movies.length; i++) {
    const m = movies[i]
    const inF = movieZInFocusFactor(m.z, zCurrent, zVisWindow)
    if (inF < 1e-6) continue
    if (requireSlabInteraction && inF <= slabGate) continue

    const R = inF * uSizeScale * uActiveSizeMul * m.size
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
  movie: Pick<Movie, 'x' | 'y' | 'z' | 'size'>
  camera: THREE.PerspectiveCamera
  domElement: HTMLElement
  activeMaterial: THREE.ShaderMaterial
  zCurrent: number
  zVisWindow: number
}): number {
  const { movie, camera, domElement, activeMaterial, zCurrent, zVisWindow } = options
  const rWorld = computeActiveWorldRadius(movie, zCurrent, zVisWindow, activeMaterial)
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
