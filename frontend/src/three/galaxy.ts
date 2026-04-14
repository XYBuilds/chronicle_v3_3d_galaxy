import * as THREE from 'three'

import type { Movie } from '@/types/galaxy'

import pointFragmentShader from './shaders/point.frag.glsl'
import pointVertexShader from './shaders/point.vert.glsl'

/** Multiplies `gl_PointSize` after JSON `size` and perspective; override at runtime via `window.__galaxyPointScale`. */
export const DEFAULT_POINT_SIZE_SCALE = 0.3

export interface GalaxyPointsHandle {
  points: THREE.Points
  material: THREE.ShaderMaterial
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

  console.log(`[Galaxy] Points count: ${n} | draw calls: 1 (single Points mesh)`)

  return geometry
}

/**
 * One `THREE.Points` draw call: position, per-point size, genre RGB, emissive (HDR-ish for Bloom).
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
    },
    vertexShader: pointVertexShader,
    fragmentShader: pointFragmentShader,
    // Opaque hard discs + stroke (fragment alpha always 1).
    transparent: false,
    depthTest: true,
    // Must write depth so farther points fail the depth test; depthWrite:false lets later
    // fragments (often farther in buffer order) composite on top of nearer ones incorrectly.
    depthWrite: true,
    blending: THREE.NormalBlending,
  })

  const points = new THREE.Points(geometry, material)

  console.log(
    `[Galaxy] uSizeScale=${sizeScale} (default ${DEFAULT_POINT_SIZE_SCALE}) — runtime: window.__galaxyPointScale`,
  )

  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }

  return { points, material, dispose }
}
