import * as THREE from 'three'
import { createNoise3D, type NoiseFunction3D } from 'simplex-noise'

import type { Meta, Movie } from '@/types/galaxy'

import {
  createPlanetRandom,
  planetNoiseSeed,
  resolvePlanetAppearance,
  type PlanetAppearance,
} from './planetAppearance'
import { computePlanetOuterRadius } from './planetSizing'
import {
  remapFocusEmissionIntensity,
  type FocusEmissionRuntimeTuning,
  validateFocusEmissionRuntimeTuning,
} from './focusEmissionTuning'
import { PLANET_MAX_BANDS, PLANET_VISUAL_DEFAULTS } from './planetVisualDefaults'
import perlinFragmentShader from './shaders/perlin.frag.glsl'
import perlinVertexShader from './shaders/perlin.vert.glsl'

export { PLANET_MAX_BANDS, PERLIN_LIGHTING_ENABLED_DEFAULT } from './planetVisualDefaults'

/** Largest-remainder allocation so band sizes sum to N. */
function bandCountsLrm(N: number, proportions: number[]): number[] {
  const K = proportions.length
  console.assert(
    K >= 1 && Math.abs(proportions.reduce((a, b) => a + b, 0) - 1) < 1e-4,
    '[Planet] proportions sum to 1',
    proportions,
  )
  const parts = proportions.map((p) => p * N)
  const n = parts.map((p) => Math.floor(p))
  const sum = n.reduce((a, b) => a + b, 0)
  const rem = N - sum
  const order = [...Array(K).keys()].sort(
    (a, b) => parts[b]! - Math.floor(parts[b]!) - (parts[a]! - Math.floor(parts[a]!)),
  )
  for (let k = 0; k < rem; k++) n[order[k % K]!]!++

  for (let i = 0; i < K; i++) {
    if (n[i]! < 1) {
      const donor = n.indexOf(Math.max(...n))
      if (n[donor]! > 1) {
        n[donor]!--
        n[i]!++
      }
    }
  }
  console.assert(n.reduce((a, b) => a + b, 0) === N, '[Planet] band counts sum', n, N)
  return n
}

/** Mid-thresholds between sorted quantile runs (cuts between adjacent bands). */
function thresholdsFromSortedBands(sorted: Float32Array, counts: number[]): { thresholds: number[] } {
  const N = sorted.length
  const K = counts.length
  if (K === 1) {
    return { thresholds: [] }
  }
  console.assert(counts.every((c) => c >= 1), '[Planet] each band >= 1 vertex', counts)
  console.assert(counts.reduce((a, b) => a + b, 0) === N, '[Planet] counts sum', counts, N)

  const thresholds: number[] = []
  let cum = 0
  for (let k = 0; k < K - 1; k++) {
    cum += counts[k]!
    const mid = 0.5 * (sorted[cum - 1]! + sorted[cum]!)
    thresholds.push(mid)
  }
  const eps = 1e-5
  for (let i = 1; i < thresholds.length; i++) {
    if (thresholds[i]! <= thresholds[i - 1]!) {
      thresholds[i] = thresholds[i - 1]! + eps
    }
  }
  console.assert(thresholds.every((t, i) => i === 0 || t > thresholds[i - 1]!), '[Planet] thresh strictly increasing', thresholds)
  return { thresholds }
}

/** Target area proportions ∝ [1, x, x², …, x^(K−1)], normalized. */
function areaProportionsK(K: number, x: number): number[] {
  const xx = Math.max(1e-6, x)
  const raw: number[] = []
  for (let k = 0; k < K; k++) raw.push(Math.pow(xx, k))
  const D = raw.reduce((a, b) => a + b, 0)
  return raw.map((w) => w / D)
}

function sampleFbm01(
  noise3D: NoiseFunction3D,
  px: number,
  py: number,
  pz: number,
  scale: number,
  octaves: number,
  persistence: number,
): number {
  const shift = [100.0, 37.0, 19.0] as const
  let sum = 0
  let amp = 0.5
  let norm = 0
  let x = px * scale
  let y = py * scale
  let z = pz * scale
  const o = Math.max(1, Math.min(8, Math.round(octaves)))
  const pers = Math.max(0.08, Math.min(0.98, persistence))
  for (let i = 0; i < o; i++) {
    const raw = noise3D(x, y, z)
    const n01 = THREE.MathUtils.clamp(raw * 0.5 + 0.5, 0, 1)
    sum += amp * n01
    norm += amp
    x = x * 2.02 + shift[0]
    y = y * 2.02 + shift[1]
    z = z * 2.02 + shift[2]
    amp *= pers
  }
  return norm > 1e-5 ? sum / norm : 0
}

export interface SelectionPlanetHandle {
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  lastRadius: number
  lastAppearance: PlanetAppearance | null
  setFromMovie: (
    movie: Movie,
    palette: Meta['genre_palette'],
    worldRadius: number,
  ) => void
  /** Reapplies deterministic CPU noise + quantile thresholds after noise uniform changes. */
  syncCpuNoiseFromUniforms: () => void
  /** Runtime-only focus emission remap, reapplied to the current and later selected movies. */
  setFocusEmissionTuning: (tuning: FocusEmissionRuntimeTuning) => void
  /** Runtime focus L/key overrides, reapplied to the current and later selected movies. */
  setFocusVisualTuning: (tuning: { lightness: number; keyLightIntensity: number }) => void
  setOpacity: (alpha: number) => void
  dispose: () => void
}

function assertFocusUniformValues(
  lightness: number,
  chroma: number,
  emissionIntensity: number,
  keyLightIntensity: number,
): void {
  const { focus, lighting } = PLANET_VISUAL_DEFAULTS
  const { emission } = focus
  const values = { lightness, chroma, emissionIntensity, keyLightIntensity }
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isFinite(value)) {
      throw new Error(`[Planet] ${name} uniform must be finite; received ${value}`)
    }
  }
  if (lightness !== focus.lightness || chroma !== focus.chroma) {
    throw new Error('[Planet] Focus lightness and chroma must match shared visual defaults')
  }
  if (emissionIntensity < emission.intensityMin || emissionIntensity > emission.intensityMax) {
    throw new Error(
      `[Planet] emission intensity must be within configured endpoints; received ${emissionIntensity}`,
    )
  }
  if (keyLightIntensity !== lighting.keyLightIntensity) {
    throw new Error('[Planet] key light intensity must match shared visual defaults')
  }
}

/**
 * Focus Perlin sphere: Icosahedron detail=8, CPU simplex FBM + sorted-quantile K-band partition (K = genre count),
 * deterministic seed from `movie.id`. Lowest-noise band (genre0, largest area) is lowest terrace; highest band tallest.
 *
 * Color path matches galaxy shaders: OKLCH semantics (L, C, hue rad) → OKLab (L,a,b) in fragment → display sRGB
 * (gamma encode unavoidable for the framebuffer).
 */
export function createSelectionPlanet(): SelectionPlanetHandle {
  const defaults = PLANET_VISUAL_DEFAULTS
  const geometry = new THREE.IcosahedronGeometry(1, defaults.geometry.detail)
  const posAttr = geometry.attributes.position as THREE.BufferAttribute
  posAttr.usage = THREE.StaticDrawUsage
  const normAttr = geometry.attributes.normal as THREE.BufferAttribute
  normAttr.usage = THREE.StaticDrawUsage

  const vCount = posAttr.count
  const noiseAttr = new THREE.BufferAttribute(new Float32Array(vCount), 1)
  noiseAttr.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('aNoise', noiseAttr)

  const uHueArray = new Float32Array(PLANET_MAX_BANDS)
  const uMeshWorldPos = new THREE.Vector3()
  /** P11.4 定稿：世界空间主光方向（归一化）。调试用 `window.__planetTerrace.perlinLightDir`。 */
  const uLightDir = new THREE.Vector3(...defaults.lighting.direction).normalize()

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHue: { value: uHueArray },
      uPerlinL: { value: defaults.focus.lightness },
      uPerlinChroma: { value: defaults.focus.chroma },
      /** P17.2 — fixed Focus Hunt reference L; it does not follow macro runtime uniforms. */
      uLMax: { value: defaults.color.lMax },
      uHuntGamma: { value: defaults.color.huntGamma },
      uHuntApplyMask: { value: defaults.color.huntApplyMask },
      uMeshWorldPos: { value: uMeshWorldPos },
      uLightDir: { value: uLightDir },
      /** P11.4 — Lambert shading can be disabled for a flat diagnostic. */
      uLightingEnabled: { value: defaults.lighting.enabled ? 1 : 0 },
      uEmissionIntensity: { value: defaults.focus.emission.intensityMin },
      uKeyLightIntensity: { value: defaults.lighting.keyLightIntensity },
      /** 导数法线与几何法线混合；1 = 纯屏幕导数法线。 */
      uFlatShadingMix: { value: defaults.lighting.flatShadingMix },
      uAlpha: { value: defaults.material.alpha },
      uScale: { value: defaults.noise.scale },
      uOctaves: { value: defaults.noise.octaves },
      uPersistence: { value: defaults.noise.persistence },
      /** Geometric weight ratio for K-band target areas: weights ∝ [1, x, …, x^(K−1)]. Default 1/φ. */
      uAreaRatio: { value: defaults.bands.areaRatio },
      uThresh: { value: new Float32Array(PLANET_MAX_BANDS - 1).fill(defaults.bands.thresholdPad) },
      uBandCount: { value: 1 },
      uCutCount: { value: 0 },
      uStepHeight: { value: defaults.bands.stepHeight },
      uStepSmoothness: { value: defaults.bands.stepSmoothness },
    },
    vertexShader: perlinVertexShader,
    fragmentShader: perlinFragmentShader,
    transparent: defaults.material.transparent,
    depthWrite: defaults.material.depthWrite,
    depthTest: defaults.material.depthTest,
    alphaTest: defaults.material.alphaTest,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.visible = false
  mesh.frustumCulled = false
  mesh.renderOrder = 1

  let lastMovie: Movie | null = null
  let emissionTuning: FocusEmissionRuntimeTuning = validateFocusEmissionRuntimeTuning(defaults.focus.emissionTuning)
  let focusVisualTuning: { lightness: number; keyLightIntensity: number } = {
    lightness: defaults.focus.lightness,
    keyLightIntensity: defaults.lighting.keyLightIntensity,
  }

  const scratchNoise = new Float32Array(vCount)
  const sortedScratch = new Float32Array(vCount)

  const recomputeNoiseAndThresholds = (movieId: number) => {
    const pos = posAttr.array as Float32Array
    const noiseArr = noiseAttr.array as Float32Array
    const rng = createPlanetRandom(planetNoiseSeed(movieId))
    const noise3D = createNoise3D(rng)

    const u = material.uniforms
    const scale = u.uScale.value as number
    const octaves = u.uOctaves.value as number
    const persistence = u.uPersistence.value as number

    for (let i = 0; i < vCount; i++) {
      const ix = i * 3
      const px = pos[ix]!
      const py = pos[ix + 1]!
      const pz = pos[ix + 2]!
      scratchNoise[i] = sampleFbm01(noise3D, px, py, pz, scale, octaves, persistence)
    }

    sortedScratch.set(scratchNoise)
    sortedScratch.sort()

    const K = Math.max(1, Math.min(PLANET_MAX_BANDS, Math.round(u.uBandCount.value as number)))
    const x = u.uAreaRatio.value as number
    const proportions = areaProportionsK(K, x)
    const counts = bandCountsLrm(vCount, proportions)
    const { thresholds } = thresholdsFromSortedBands(sortedScratch, counts)

    const threshArr = u.uThresh.value as Float32Array
    console.assert(threshArr.length === 7, '[Planet] uThresh length')
    for (let i = 0; i < 7; i++) {
      threshArr[i] = i < thresholds.length ? thresholds[i]! : defaults.bands.thresholdPad
    }

    console.assert(
      thresholds.length === Math.max(0, K - 1),
      '[Planet] threshold count',
      K,
      thresholds.length,
    )

    const eps = 1e-5
    for (let i = 1; i < thresholds.length; i++) {
      if (thresholds[i]! <= thresholds[i - 1]!) {
        thresholds[i] = thresholds[i - 1]! + eps
        threshArr[i] = thresholds[i]!
      }
    }

    for (let i = 0; i < vCount; i++) {
      noiseArr[i] = scratchNoise[i]!
    }
    noiseAttr.needsUpdate = true

    const allocErr = proportions.reduce((acc, p, k) => acc + Math.abs(counts[k]! / vCount - p), 0)
    const bandHard = new Array(K).fill(0)
    if (K === 1) {
      bandHard[0] = vCount
    } else {
      for (let i = 0; i < vCount; i++) {
        const v = scratchNoise[i]!
        let b = 0
        for (let t = 0; t < thresholds.length; t++) {
          if (v >= thresholds[t]!) b++
        }
        bandHard[b]!++
      }
    }
    const errHard = counts.reduce((acc, _, k) => acc + Math.abs(bandHard[k]! / vCount - counts[k]! / vCount), 0)

    console.log(
      `[Planet] K=${K} id=${movieId} n=${vCount} allocErr(L1)=${allocErr.toFixed(5)} hardVsAlloc(L1)=${errHard.toFixed(5)} cuts=${thresholds.length}`,
    )
    console.assert(allocErr < 0.02, '[Planet] alloc vs target proportions', { allocErr, movieId, K })
    console.assert(errHard < 0.02, '[Planet] hard band counts vs LRM', { errHard, movieId, K })
  }

  const handle: SelectionPlanetHandle = {
    mesh,
    material,
    lastRadius: 0.1,
    lastAppearance: null,
    setFromMovie: () => { },
    syncCpuNoiseFromUniforms: () => { },
    setFocusEmissionTuning: () => { },
    setFocusVisualTuning: () => { },
    setOpacity: () => { },
    dispose: () => { },
  }

  const setFromMovie = (movie: Movie, palette: Meta['genre_palette'], worldRadius: number) => {
    const stepH = material.uniforms.uStepHeight.value as number
    const appearance = resolvePlanetAppearance(movie, palette)
    const {
      genres,
      hues,
      lightness,
      chroma,
      emissionIntensity,
      keyLightIntensity,
      bandCount,
      cutCount,
      baseQuaternion,
    } = appearance
    assertFocusUniformValues(lightness, chroma, emissionIntensity, keyLightIntensity)
    handle.lastAppearance = appearance
    handle.lastRadius = computePlanetOuterRadius(worldRadius, bandCount, stepH)
    const radiusMul = handle.lastRadius / worldRadius
    console.assert(handle.lastRadius >= worldRadius, '[Planet] lastRadius covers base sphere', handle.lastRadius, worldRadius)
    lastMovie = movie

    const padHue = hues[hues.length - 1]!
    const fallbackColor = new THREE.Color(movie.genre_color[0], movie.genre_color[1], movie.genre_color[2])
    const u = material.uniforms
    const hueArr = u.uHue.value as Float32Array
    console.assert(hueArr.length === PLANET_MAX_BANDS, '[Planet] uHue length')
    for (let i = 0; i < PLANET_MAX_BANDS; i++) {
      hueArr[i] = i < hues.length ? hues[i]! : padHue
    }

    u.uPerlinL.value = focusVisualTuning.lightness
    u.uPerlinChroma.value = chroma
    u.uEmissionIntensity.value = remapFocusEmissionIntensity(
      emissionIntensity,
      appearance.emissionProfile,
      emissionTuning,
    )
    u.uKeyLightIntensity.value = focusVisualTuning.keyLightIntensity
    u.uBandCount.value = bandCount
    u.uCutCount.value = cutCount

    mesh.position.set(movie.x, movie.y, movie.z)
    uMeshWorldPos.copy(mesh.position)
    mesh.scale.setScalar(worldRadius)
    mesh.quaternion.copy(baseQuaternion)
    mesh.updateMatrixWorld(true)

    recomputeNoiseAndThresholds(movie.id)

    const hexList = genres.map((genre) => palette[genre] ?? `#${fallbackColor.getHexString()}`)
    console.log(
      `[Planet] K=${bandCount} genres=${JSON.stringify(genres)} colors=${JSON.stringify(hexList)} | vote_average=${movie.vote_average.toFixed(2)} fixedL=${lightness.toFixed(4)} fixedC=${chroma.toFixed(4)} emission=${emissionIntensity.toFixed(4)} fixedKey=${keyLightIntensity.toFixed(4)} | lastRadius=${handle.lastRadius.toFixed(4)} worldR=${worldRadius.toFixed(4)} stepH=${stepH.toFixed(3)} radiusMul=${radiusMul.toFixed(3)}`,
    )
  }

  const syncCpuNoiseFromUniforms = () => {
    if (lastMovie == null) return
    recomputeNoiseAndThresholds(lastMovie.id)
  }

  const setFocusEmissionTuning = (next: FocusEmissionRuntimeTuning): void => {
    emissionTuning = validateFocusEmissionRuntimeTuning(next)
    if (handle.lastAppearance === null) return
    material.uniforms.uEmissionIntensity.value = remapFocusEmissionIntensity(
      handle.lastAppearance.emissionIntensity,
      handle.lastAppearance.emissionProfile,
      emissionTuning,
    )
  }

  const setFocusVisualTuning = (next: { lightness: number; keyLightIntensity: number }): void => {
    const lightness = next.lightness
    const keyLightIntensity = next.keyLightIntensity
    if (!Number.isFinite(lightness) || !Number.isFinite(keyLightIntensity)) {
      throw new Error('[Planet] runtime focus lightness and key light intensity must be finite')
    }
    focusVisualTuning = { lightness, keyLightIntensity }
    material.uniforms.uPerlinL.value = lightness
    material.uniforms.uKeyLightIntensity.value = keyLightIntensity
  }

  const setOpacity = (alpha: number) => {
    const a = THREE.MathUtils.clamp(alpha, 0, 1)
    material.uniforms.uAlpha.value = a > 0.001 ? 1 : 0
    mesh.visible = a > 0.001
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }

  handle.setFromMovie = setFromMovie
  handle.syncCpuNoiseFromUniforms = syncCpuNoiseFromUniforms
  handle.setFocusEmissionTuning = setFocusEmissionTuning
  handle.setFocusVisualTuning = setFocusVisualTuning
  handle.setOpacity = setOpacity
  handle.dispose = dispose
  return handle
}
