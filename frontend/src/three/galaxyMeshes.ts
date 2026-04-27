import * as THREE from 'three'

import type { Movie } from '@/types/galaxy'
import { hueFromGenreColor } from '@/utils/genreHue'

import galaxyActiveFragmentShader from './shaders/galaxyActive.frag.glsl'
import galaxyActiveVertexShader from './shaders/galaxyActive.vert.glsl'
import galaxyIdleFragmentShader from './shaders/galaxyIdle.frag.glsl'
import galaxyIdleVertexShader from './shaders/galaxyIdle.vert.glsl'

/**
 * Default `uSizeScale` for dual InstancedMesh (= former `0.3 × uMeshCalib` with mesh calib **38** baked in).
 * Tune live via `window.__galaxyPointScale.scale` or Storybook / Leva.
 */
export const DEFAULT_GALAXY_U_SIZE_SCALE = 0.3 * 38

const _dummy = new THREE.Object3D()

function buildInstanceAttributes(movies: Movie[]): {
  hues: Float32Array
  voteNorms: Float32Array
  sizes: Float32Array
} {
  const n = movies.length
  console.assert(n >= 0, '[GalaxyMeshes] movies length must be non-negative')
  const hues = new Float32Array(n)
  const voteNorms = new Float32Array(n)
  const sizes = new Float32Array(n)

  for (let i = 0; i < n; i++) {
    const m = movies[i]
    hues[i] =
      m.genre_hue ??
      hueFromGenreColor([m.genre_color[0], m.genre_color[1], m.genre_color[2]] as [number, number, number])
    voteNorms[i] = THREE.MathUtils.clamp(m.vote_average / 10, 0, 1)
    sizes[i] = m.size
  }

  console.assert(hues.length === n, '[GalaxyMeshes] hue buffer length must match movie count')
  console.log(`[GalaxyMeshes] InstancedMesh count=${n} | idle detail=0 | active detail=1`)

  return { hues, voteNorms, sizes }
}

export interface GalaxyDualMeshHandle {
  idle: THREE.InstancedMesh
  active: THREE.InstancedMesh
  idleMaterial: THREE.ShaderMaterial
  activeMaterial: THREE.ShaderMaterial
  dispose: () => void
}

function makeSharedUniforms(pixelRatio: number): { [uniform: string]: THREE.IUniform } {
  return {
    uPixelRatio: { value: pixelRatio },
    uZCurrent: { value: 0 },
    uZVisWindow: { value: 1 },
    uSizeScale: { value: DEFAULT_GALAXY_U_SIZE_SCALE },
    uFocusSizeMul: { value: 0.2 },
    uBgSizeMul: { value: 0.001 },
    uLMin: { value: 0.4 },
    uLMax: { value: 0.85 },
    uChroma: { value: 0.15 },
    uFocusedInstanceId: { value: -1 },
  }
}

/**
 * P8.4 — dual `InstancedMesh` (idle icosa d0 + active d1), shared per-instance hue / vote / size;
 * Z slab + focus use uniforms (`uZCurrent`, `uFocusedInstanceId`).
 */
export function createGalaxyDualMeshes(movies: Movie[], pixelRatio: number): GalaxyDualMeshHandle {
  const n = movies.length
  const { hues, voteNorms, sizes } = buildInstanceAttributes(movies)

  const idleGeom = new THREE.IcosahedronGeometry(1, 0)
  const activeGeom = new THREE.IcosahedronGeometry(1, 1)

  const hueIdle = new THREE.InstancedBufferAttribute(new Float32Array(hues), 1)
  const hueActive = new THREE.InstancedBufferAttribute(new Float32Array(hues), 1)
  const voteIdle = new THREE.InstancedBufferAttribute(new Float32Array(voteNorms), 1)
  const voteActive = new THREE.InstancedBufferAttribute(new Float32Array(voteNorms), 1)
  const sizeIdle = new THREE.InstancedBufferAttribute(new Float32Array(sizes), 1)
  const sizeActive = new THREE.InstancedBufferAttribute(new Float32Array(sizes), 1)

  for (let i = 0; i < n; i++) {
    console.assert(hueIdle.array[i] === hueActive.array[i], '[GalaxyMeshes] hue idle/active must match')
    console.assert(voteIdle.array[i] === voteActive.array[i], '[GalaxyMeshes] voteNorm idle/active must match')
    console.assert(sizeIdle.array[i] === sizeActive.array[i], '[GalaxyMeshes] size idle/active must match')
  }

  idleGeom.setAttribute('hue', hueIdle)
  idleGeom.setAttribute('voteNorm', voteIdle)
  idleGeom.setAttribute('aSize', sizeIdle)
  activeGeom.setAttribute('hue', hueActive)
  activeGeom.setAttribute('voteNorm', voteActive)
  activeGeom.setAttribute('aSize', sizeActive)

  /** Single uniform bag — both materials read the same values each frame (P8.4). */
  const sharedUniforms = makeSharedUniforms(pixelRatio)

  const idleMaterial = new THREE.ShaderMaterial({
    uniforms: sharedUniforms,
    vertexShader: galaxyIdleVertexShader,
    fragmentShader: galaxyIdleFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  })
  const activeMaterial = new THREE.ShaderMaterial({
    uniforms: sharedUniforms,
    vertexShader: galaxyActiveVertexShader,
    fragmentShader: galaxyActiveFragmentShader,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    alphaTest: 0.01,
    blending: THREE.NormalBlending,
  })
  const idle = new THREE.InstancedMesh(idleGeom, idleMaterial, n)
  const active = new THREE.InstancedMesh(activeGeom, activeMaterial, n)
  idle.count = n
  active.count = n
  idle.frustumCulled = false
  active.frustumCulled = false
  idle.renderOrder = 0
  active.renderOrder = 1

  for (let i = 0; i < n; i++) {
    const m = movies[i]
    _dummy.position.set(m.x, m.y, m.z)
    _dummy.quaternion.identity()
    _dummy.scale.set(1, 1, 1)
    _dummy.updateMatrix()
    idle.setMatrixAt(i, _dummy.matrix)
    active.setMatrixAt(i, _dummy.matrix)
  }
  idle.instanceMatrix.needsUpdate = true
  active.instanceMatrix.needsUpdate = true

  console.assert(idle.count === movies.length && active.count === movies.length, '[GalaxyMeshes] instance count')

  const dispose = () => {
    idleGeom.dispose()
    activeGeom.dispose()
    idleMaterial.dispose()
    activeMaterial.dispose()
  }

  return { idle, active, idleMaterial, activeMaterial, dispose }
}
