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
  const inF = movieZInFocusFactor(movie.z, zCurrent, zVisWindow)
  if (inF <= 1e-6) return 0

  _mv.set(movie.x, movie.y, movie.z)
  _mv.applyMatrix4(camera.matrixWorldInverse)
  if (_mv.z >= 0) return 0
  const distCam = Math.max(0.001, -_mv.z)

  const u = activeMaterial.uniforms
  const uSizeScale = (u.uSizeScale as THREE.Uniform<number>).value
  const uActiveSizeMul = (u.uActiveSizeMul as THREE.Uniform<number>).value
  const rWorld = inF * uSizeScale * uActiveSizeMul * movie.size * 1.0

  const rect = domElement.getBoundingClientRect()
  const h = Math.max(1, rect.height)
  const vFov = THREE.MathUtils.degToRad(camera.fov)
  const worldPerPx = (2 * Math.tan(vFov / 2) * distCam) / h
  return rWorld / Math.max(1e-6, worldPerPx)
}
