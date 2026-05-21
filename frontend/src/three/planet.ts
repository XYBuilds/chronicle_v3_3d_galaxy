import * as THREE from 'three'
import { createNoise3D, type NoiseFunction3D } from 'simplex-noise'

import { lightnessFromVoteAverage } from '@/lib/colorMath'
import type { Meta, Movie } from '@/types/galaxy'
import { genreHueForGenreName, hueFromGenreColor, primaryGenreHueRad } from '@/utils/genreHue'

import perlinFragmentShader from './shaders/perlin.frag.glsl'
import perlinVertexShader from './shaders/perlin.vert.glsl'
import { selectionPlanetBaseQuaternion } from './selectionPlanetRotation'

const PHI = (1 + Math.sqrt(5)) / 2

/** Shader-side max genre bands (weights + thresholds + colors). */
export const PLANET_MAX_BANDS = 8

/** xmur3 string hash → 32-bit seed (deterministic). */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

/** Mulberry32 PRNG in [0, 1). */
function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

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
  let sum = n.reduce((a, b) => a + b, 0)
  let rem = N - sum
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

/** Golden-ratio decay weights (genre display order). */
function genreDisplayWeights(genres: string[], maxSlots: number): { genres: string[]; weights: number[] } {
  const list = genres.filter(Boolean).slice(0, maxSlots)
  if (list.length === 0) {
    return { genres: ['Unknown'], weights: [1] }
  }
  const raw = list.map((_, k) => Math.pow(1 / PHI, k))
  const s = raw.reduce((a, b) => a + b, 0)
  const weights = raw.map((w) => w / s)
  return { genres: list, weights }
}

/** Snapshot of galaxy OKLCH uniforms at focus entry — matches `galaxyIdle.vert.glsl` P10.1 L remap. */
export interface PlanetGalaxyColorSnap {
  uLMin: number
  uLMax: number
  uHighRatingT: number
  uHighTierTRangeScale: number
  uLightnessRatingExponent: number
  uChroma: number
}

export interface SelectionPlanetHandle {
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  lastRadius: number
  setFromMovie: (
    movie: Movie,
    palette: Meta['genre_palette'],
    worldRadius: number,
    galaxyColor: PlanetGalaxyColorSnap,
  ) => void
  /** P8.3 — Recompute CPU noise + quantile thresholds after Leva changes uScale / octaves / persistence / uAreaRatio. */
  syncCpuNoiseFromUniforms: () => void
  setOpacity: (alpha: number) => void
  dispose: () => void
}

/**
 * Focus Perlin sphere: Icosahedron detail=8, CPU simplex FBM + sorted-quantile K-band partition (K = genre count),
 * deterministic seed from `movie.id`. Lowest-noise band (genre0, largest area) is lowest terrace; highest band tallest.
 *
 * Color path matches galaxy shaders: OKLCH semantics (L, C, hue rad) → OKLab (L,a,b) in fragment → display sRGB
 * (gamma encode unavoidable for the framebuffer).
 */
export function createSelectionPlanet(): SelectionPlanetHandle {
  const detail = 8
  const geometry = new THREE.IcosahedronGeometry(1, detail)
  const posAttr = geometry.attributes.position as THREE.BufferAttribute
  posAttr.usage = THREE.StaticDrawUsage
  const normAttr = geometry.attributes.normal as THREE.BufferAttribute
  normAttr.usage = THREE.StaticDrawUsage

  const vCount = posAttr.count
  const noiseAttr = new THREE.BufferAttribute(new Float32Array(vCount), 1)
  noiseAttr.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('aNoise', noiseAttr)

  const defaultAreaRatio = 1 / PHI
  const PAD_THRESH = 2.0

  const uHueArray = new Float32Array(PLANET_MAX_BANDS)
  const uMeshWorldPos = new THREE.Vector3()
  /** P11.4 定稿：世界空间主光方向（归一化）。调试用 `window.__planetTerrace.perlinLightDir`。 */
  const uLightDir = new THREE.Vector3(0.5, 0.5, -0.1).normalize()

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHue: { value: uHueArray },
      uPerlinL: { value: 0.55 },
      uPerlinChroma: { value: 0.15 },
      /** P17.2 — Hunt reference L (same as galaxy `uLMax`); synced from dual-mesh uniforms each frame. */
      uLMax: { value: 1.0 },
      uHuntGamma: { value: 0.3 },
      uHuntApplyMask: { value: 7 },
      uMeshWorldPos: { value: uMeshWorldPos },
      uLightDir: { value: uLightDir },
      /** P11.4 定稿：`lit = baseCol × (uAmbient + uDiffuse × lambert)` */
      uAmbient: { value: 0.95 },
      uDiffuse: { value: 0.55 },
      /** 导数法线与几何法线混合；1 = 纯屏幕导数法线。 */
      uFlatShadingMix: { value: 0.8 },
      uAlpha: { value: 0 },
      uScale: { value: 2.35 },
      uOctaves: { value: 4 },
      uPersistence: { value: 0.52 },
      /** Geometric weight ratio for K-band target areas: weights ∝ [1, x, …, x^(K−1)]. Default 1/φ. */
      uAreaRatio: { value: defaultAreaRatio },
      uThresh: { value: new Float32Array(7).fill(PAD_THRESH) },
      uBandCount: { value: 1 },
      uCutCount: { value: 0 },
      uStepHeight: { value: 0.03 },
      uStepSmoothness: { value: 0.01 },
    },
    vertexShader: perlinVertexShader,
    fragmentShader: perlinFragmentShader,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    alphaTest: 0.01,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.visible = false
  mesh.frustumCulled = false
  mesh.renderOrder = 1

  let lastMovie: Movie | null = null

  const scratchNoise = new Float32Array(vCount)
  const sortedScratch = new Float32Array(vCount)

  const recomputeNoiseAndThresholds = (movieId: number) => {
    const pos = posAttr.array as Float32Array
    const noiseArr = noiseAttr.array as Float32Array
    const seedFn = xmur3(String(movieId))
    const rng = mulberry32(seedFn())
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
      threshArr[i] = i < thresholds.length ? thresholds[i]! : PAD_THRESH
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
    setFromMovie: () => { },
    syncCpuNoiseFromUniforms: () => { },
    setOpacity: () => { },
    dispose: () => { },
  }

  const setFromMovie = (movie: Movie, palette: Meta['genre_palette'], worldRadius: number, galaxyColor: PlanetGalaxyColorSnap) => {
    const stepH = material.uniforms.uStepHeight.value as number

    const { genres } = genreDisplayWeights(movie.genres, PLANET_MAX_BANDS)
    const K = genres.length
    const cuts = Math.max(0, K - 1)
    const radiusMul = 1 + cuts * stepH
    handle.lastRadius = worldRadius * radiusMul
    console.assert(handle.lastRadius >= worldRadius, '[Planet] lastRadius covers base sphere', handle.lastRadius, worldRadius)
    lastMovie = movie

    const fbHue =
      movie.genre_hue ??
      hueFromGenreColor([movie.genre_color[0], movie.genre_color[1], movie.genre_color[2]] as [
        number,
        number,
        number,
      ])
    const primaryHue = primaryGenreHueRad(movie, palette)
    const fbColor = new THREE.Color(movie.genre_color[0], movie.genre_color[1], movie.genre_color[2])
    /** Pipeline primary genre (first non-empty in TMDB order); matches export `genre_hue` when in sync with palette. */
    const primaryGenreName = movie.genres.filter(Boolean)[0] ?? ''
    const hues = genres.map((g) =>
      g === primaryGenreName ? primaryHue : genreHueForGenreName(g, palette, fbHue),
    )
    const padHue = hues.length > 0 ? hues[hues.length - 1]! : fbHue

    const u = material.uniforms
    const hueArr = u.uHue.value as Float32Array
    console.assert(hueArr.length === PLANET_MAX_BANDS, '[Planet] uHue length')
    for (let i = 0; i < PLANET_MAX_BANDS; i++) {
      hueArr[i] = i < hues.length ? hues[i]! : padHue
    }

    const perlinL = lightnessFromVoteAverage(movie.vote_average, galaxyColor)
    u.uPerlinL.value = perlinL
    u.uPerlinChroma.value = galaxyColor.uChroma

    u.uBandCount.value = K
    u.uCutCount.value = cuts

    mesh.position.set(movie.x, movie.y, movie.z)
    uMeshWorldPos.copy(mesh.position)
    mesh.scale.setScalar(worldRadius)
    // P32.5 — visual baseline aligned with FocusSizeReferenceRings plane (spin applied in 32.6).
    mesh.quaternion.copy(selectionPlanetBaseQuaternion(movie.id))
    mesh.updateMatrixWorld(true)

    recomputeNoiseAndThresholds(movie.id)

    const hexList = genres.map((g) => palette[g] ?? `#${fbColor.getHexString()}`)
    console.log(
      `[Planet] K=${K} genres=${JSON.stringify(genres)} colors=${JSON.stringify(hexList)} | uPerlinL=${perlinL.toFixed(4)} uPerlinChroma=${galaxyColor.uChroma.toFixed(4)} vote_avg=${movie.vote_average.toFixed(2)} | lastRadius=${handle.lastRadius.toFixed(4)} worldR=${worldRadius.toFixed(4)} stepH=${stepH.toFixed(3)} radiusMul=${radiusMul.toFixed(3)}`,
    )
  }

  const syncCpuNoiseFromUniforms = () => {
    if (lastMovie == null) return
    recomputeNoiseAndThresholds(lastMovie.id)
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
  handle.setOpacity = setOpacity
  handle.dispose = dispose
  return handle
}
