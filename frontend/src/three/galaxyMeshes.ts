import * as THREE from 'three'

import type { Movie } from '@/types/galaxy'
import { hueFromGenreColor } from '@/utils/genreHue'

import galaxyActiveFragmentShader from './shaders/galaxyActive.frag.glsl'
import galaxyActiveVertexShader from './shaders/galaxyActive.vert.glsl'
import galaxyIdleFragmentShader from './shaders/galaxyIdle.frag.glsl'
import galaxyIdleVertexShader from './shaders/galaxyIdle.vert.glsl'
import { computeSelectionMaskAtlasDimensions } from './selectionMask'

/**
 * Default world `uSizeScale` for dual InstancedMesh (matches former Points macro knob `0.3` at current focus/bg mul).
 * Tune live via `window.__galaxyPointScale.scale` or Storybook / Leva.
 */
export const DEFAULT_GALAXY_U_SIZE_SCALE = 0.3

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

function makeSharedUniforms(
  pixelRatio: number,
  movieCount: number,
  maxTextureSize: number,
): {
  uniforms: { [uniform: string]: THREE.IUniform }
  disposeSelectionMaskTexture: () => void
} {
  console.assert(movieCount >= 0, '[GalaxyMeshes] movieCount must be non-negative')
  const { width: atlasW, height: atlasH } = computeSelectionMaskAtlasDimensions(
    movieCount,
    maxTextureSize,
  )
  const texelCount = atlasW * atlasH
  const maskData = new Uint8Array(texelCount)
  const selectionMaskTex = new THREE.DataTexture(
    maskData,
    atlasW,
    atlasH,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  )
  selectionMaskTex.magFilter = THREE.NearestFilter
  selectionMaskTex.minFilter = THREE.NearestFilter
  selectionMaskTex.flipY = false
  selectionMaskTex.needsUpdate = true

  const disposeSelectionMaskTexture = () => {
    selectionMaskTex.dispose()
  }

  console.log(
    `[GalaxyMeshes] P12.5 selection mask atlas ${atlasW}×${atlasH} texels | maxTextureSize=${maxTextureSize} | movies=${movieCount}`,
  )

  return {
    disposeSelectionMaskTexture,
    uniforms: {
    uPixelRatio: { value: pixelRatio },
    uZCurrent: { value: 0 },
    uZVisWindow: { value: 1 },
    uSizeScale: { value: DEFAULT_GALAXY_U_SIZE_SCALE },
    uActiveSizeMul: { value: 0.02 },
    uBgSizeMul: { value: 0.002 },
    uLMin: { value: 0.2 },
    uLMax: { value: 1.0 },
    uHighRatingT: { value: 0.85 },
    uHighTierTRangeScale: { value: 0.4 },
    uLightnessRatingExponent: { value: 3.0 },
    /** P17.1 — Z-axis camera standoff (world years); distance-L reference `d0 = max(uZCamDistance, ε)`. */
    uZCamDistance: { value: 30 },
    /** P17.1 — lower clamp on `pow(d0/d, 2/3)` so stars nearer than the reference plane do not blow past vote L. */
    uDistanceLightnessFloor: { value: 0.08 },
    uChroma: { value: 0.15 },
    uFocusedInstanceId: { value: -1 },
    /** P11.1 — focus fly-in/out: same eased progress as camera lerp (scene.ts). */
    uFocusCameraBlend: { value: 0 },
    /** P11.1 — instance id of the movie being focused (-1 = no focus transition). */
    uFocusTargetInstanceId: { value: -1 },
    /** P11.1 / P13.6 — non-target active alpha at focus blend=1 (tuned down from 0.1 for dense neighbor sphere). */
    uFocusNonTargetActiveAlpha: { value: 0.08 },
    /** P11.2 — idle focus dim: chroma × this when dim (OKLab a,b scale with C). Phase 17 default 1 = off (Hunt in P17.2). */
    uFocusDimChroma: { value: 1.0 },
    /** P11.2 — idle focus dim: multiply OKLab L by this (with chroma mult below). */
    uFocusDimL: { value: 1 },
    /** P11.2 — 0 = focus-field dim; 1 = reserved (selectionMask); both behave identically until wired. */
    uFocusDimMode: { value: 0 },
    /** P12.5 — R8 per-instance mask packed in a 2D atlas (each dimension ≤ gl.MAX_TEXTURE_SIZE). */
    uSelectionMask: { value: selectionMaskTex },
    uSelectionCount: { value: 0 },
    /** 0 = timeline vis slab; 1 = search mask (`selectionIds`); 2 = focus spherical neighborhood (`focusNeighborIds`). */
    uSelectionMode: { value: 0 },
    uMovieCount: { value: movieCount },
    uSelectionAtlasWidth: { value: atlasW },
    uSelectionAtlasHeight: { value: atlasH },
    },
  }
}

/**
 * P8.4 — dual `InstancedMesh` (idle icosa d0 + active d1), shared per-instance hue / vote / size;
 * Z slab + focus use uniforms (`uZCurrent`, `uFocusedInstanceId`).
 */
export function createGalaxyDualMeshes(
  movies: Movie[],
  pixelRatio: number,
  maxTextureSize: number,
): GalaxyDualMeshHandle {
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
  const { uniforms: sharedUniforms, disposeSelectionMaskTexture } = makeSharedUniforms(pixelRatio, n, maxTextureSize)
  console.assert(
    sharedUniforms.uHighRatingT.value > 0 &&
    sharedUniforms.uHighRatingT.value < 1 &&
    sharedUniforms.uHighTierTRangeScale.value > 0 &&
    sharedUniforms.uLightnessRatingExponent.value > 0,
    '[GalaxyMeshes] P10.1 rating→L remap uniforms must be positive / HIGH_T in (0,1)',
  )
  console.assert(
    (sharedUniforms.uZCamDistance.value as number) > 0,
    '[GalaxyMeshes] P17.1 uZCamDistance must be positive',
  )
  const dlf = sharedUniforms.uDistanceLightnessFloor.value as number
  console.assert(dlf > 0 && dlf <= 1, '[GalaxyMeshes] P17.1 uDistanceLightnessFloor must be in (0, 1]')
  console.log(
    `[GalaxyMeshes] P10.1 L-remap uLMin=${sharedUniforms.uLMin.value} uLMax=${sharedUniforms.uLMax.value} uHighRatingT=${sharedUniforms.uHighRatingT.value} uHighTierTRangeScale=${sharedUniforms.uHighTierTRangeScale.value} uLightnessRatingExponent=${sharedUniforms.uLightnessRatingExponent.value} | P17.1 uZCamDistance=${sharedUniforms.uZCamDistance.value} uDistanceLightnessFloor=${dlf} | P11.2 uFocusDimChroma=${sharedUniforms.uFocusDimChroma.value} uFocusDimL=${sharedUniforms.uFocusDimL.value} uFocusDimMode=${sharedUniforms.uFocusDimMode.value}`,
  )

  const idleMaterial = new THREE.ShaderMaterial({
    uniforms: sharedUniforms,
    vertexShader: galaxyIdleVertexShader,
    fragmentShader: galaxyIdleFragmentShader,
    /** P17.1 — opaque idle + depth write fixes same-layer transparent sort artifacts. */
    transparent: false,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NormalBlending,
  })
  const activeMaterial = new THREE.ShaderMaterial({
    uniforms: sharedUniforms,
    vertexShader: galaxyActiveVertexShader,
    fragmentShader: galaxyActiveFragmentShader,
    /** P11.1 — non-target actives use alpha; depthWrite off avoids self-occlusion on overlap. */
    transparent: true,
    depthWrite: false,
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
    disposeSelectionMaskTexture()
    idleGeom.dispose()
    activeGeom.dispose()
    idleMaterial.dispose()
    activeMaterial.dispose()
  }

  return { idle, active, idleMaterial, activeMaterial, dispose }
}
