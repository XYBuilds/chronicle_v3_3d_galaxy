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
  const voteNorms = new Float32Array(n)

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
    voteNorms[i] = THREE.MathUtils.clamp(m.vote_average / 10, 0, 1)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('voteNorm', new THREE.BufferAttribute(voteNorms, 1))

  console.log(`[Galaxy] Points count: ${n} | draw calls: 1 (opaque macro layer)`)

  return geometry
}

/**
 * Macro `THREE.Points`: single opaque pass, OKLCH-style color in the vertex shader, Z-slab size only.
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
      uZCurrent: { value: 0 },
      uZVisWindow: { value: 1 },
      uFocusSizeMul: { value: 1.0 },
      uBgSizeMul: { value: 0.4 },
      uLMin: { value: 0.4 },
      uLMax: { value: 0.85 },
      uChroma: { value: 0.15 },
    },
    vertexShader: pointVertexShader,
    fragmentShader: pointFragmentShader,
    transparent: false,
    depthTest: true,
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
