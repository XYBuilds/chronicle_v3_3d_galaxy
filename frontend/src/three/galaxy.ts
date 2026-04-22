import * as THREE from 'three'

import type { Movie } from '@/types/galaxy'

import pointDepthFragmentShader from './shaders/point.depth.frag.glsl'
import pointFragmentShader from './shaders/point.frag.glsl'
import pointVertexShader from './shaders/point.vert.glsl'

/** Multiplies `gl_PointSize` after JSON `size` and perspective; override at runtime via `window.__galaxyPointScale`. */
export const DEFAULT_POINT_SIZE_SCALE = 0.3

/**
 * I4 P6.2.1: depth-prepass core radius in point UV space (same r as `point.frag.glsl`).
 * Only r ≤ R writes depth; soft halo in Pass 2 remains alpha-blended without `alphaTest`.
 * Tune 0.55–0.70: lower → more bleed-through; higher → harsher halo/depth disc edges.
 */
export const GALAXY_DEPTH_PREPASS_RADIUS = 0.65

export interface GalaxyPointsHandle {
  points: THREE.Points
  material: THREE.ShaderMaterial
  depthPoints: THREE.Points
  depthMaterial: THREE.ShaderMaterial
  dispose: () => void
}

function fillMovieBuffers(movies: Movie[]): THREE.BufferGeometry {
  const n = movies.length
  console.assert(n >= 0, '[Galaxy] movies length must be non-negative')
  const positions = new Float32Array(n * 3)
  const colors = new Float32Array(n * 3)
  const sizes = new Float32Array(n)
  const emissives = new Float32Array(n)

  for (let i = 0; i < n; i++) {
    const m = movies[i]
    const o = i * 3
    positions[o] = m.x
    positions[o + 1] = m.y
    positions[o + 2] = m.z

    colors[o] = m.genre_color[0]
    colors[o + 1] = m.genre_color[1]
    colors[o + 2] = m.genre_color[2]

    sizes[i] = m.size
    emissives[i] = m.emissive
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('emissive', new THREE.BufferAttribute(emissives, 1))

  console.log(`[Galaxy] Points count: ${n} | draw calls: 2 (depth + color, shared BufferGeometry)`)

  return geometry
}

/**
 * Two `THREE.Points` passes on shared `BufferGeometry`: (1) depth core only, (2) color + soft halo.
 */
export function createGalaxyPoints(
  movies: Movie[],
  pixelRatio: number,
  sizeScale: number = DEFAULT_POINT_SIZE_SCALE,
): GalaxyPointsHandle {
  const geometry = fillMovieBuffers(movies)

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uSizeScale: { value: sizeScale },
      uPointsOpacity: { value: 1 },
      /** Phase 5.1.6 — Z slab for macro A/B layer split (world decimal years). */
      uZCurrent: { value: 0 },
      uZVisWindow: { value: 1 },
      uBgPointSizePx: { value: 2.25 },
    },
    vertexShader: pointVertexShader,
    fragmentShader: pointFragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  })

  const points = new THREE.Points(geometry, material)

  const depthMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: material.uniforms.uPixelRatio,
      uSizeScale: material.uniforms.uSizeScale,
      uZCurrent: material.uniforms.uZCurrent,
      uZVisWindow: material.uniforms.uZVisWindow,
      uBgPointSizePx: material.uniforms.uBgPointSizePx,
      uPointsOpacity: material.uniforms.uPointsOpacity,
      uDepthPrepassRadius: { value: GALAXY_DEPTH_PREPASS_RADIUS },
    },
    vertexShader: pointVertexShader,
    fragmentShader: pointDepthFragmentShader,
    transparent: false,
    depthTest: true,
    depthWrite: true,
    colorWrite: false,
    blending: THREE.NoBlending,
  })

  const depthPoints = new THREE.Points(geometry, depthMaterial)
  depthPoints.renderOrder = -1
  /** Avoid doubling hover / raycast hits; interaction uses the color `points` only. */
  depthPoints.raycast = () => {}

  console.log(
    `[Galaxy] uSizeScale=${sizeScale} (default ${DEFAULT_POINT_SIZE_SCALE}) — runtime: window.__galaxyPointScale`,
  )

  const dispose = () => {
    geometry.dispose()
    material.dispose()
    depthMaterial.dispose()
  }

  return { points, material, depthPoints, depthMaterial, dispose }
}
