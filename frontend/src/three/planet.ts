import * as THREE from 'three'
import { createNoise3D, type NoiseFunction3D } from 'simplex-noise'

import type { Meta, Movie } from '@/types/galaxy'
import { hueFromGenreColor, pipelineRingSrgb01 } from '@/utils/genreHue'

import perlinFragmentShader from './shaders/perlin.frag.glsl'
import perlinVertexShader from './shaders/perlin.vert.glsl'

const PHI = (1 + Math.sqrt(5)) / 2

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

/** Largest-remainder allocation so band sizes sum to N and track target proportions. */
function bandCountsLrm(N: number, p0: number, p1: number, p2: number, p3: number): [number, number, number, number] {
  const parts = [p0 * N, p1 * N, p2 * N, p3 * N]
  const n = [Math.floor(parts[0]!), Math.floor(parts[1]!), Math.floor(parts[2]!), Math.floor(parts[3]!)]
  let sum = n[0]! + n[1]! + n[2]! + n[3]!
  let rem = N - sum
  const order = [0, 1, 2, 3].sort(
    (a, b) => parts[b]! - Math.floor(parts[b]!) - (parts[a]! - Math.floor(parts[a]!)),
  )
  for (let k = 0; k < rem; k++) n[order[k % 4]!]!++
  const m = (i: number) => {
    if (n[i]! < 1) {
      const donor = n.indexOf(Math.max(...n))
      if (n[donor]! > 1) {
        n[donor]!--
        n[i]!++
      }
    }
  }
  m(0)
  m(1)
  m(2)
  m(3)
  console.assert(n[0]! + n[1]! + n[2]! + n[3]! === N, '[Planet] band counts sum', n, N)
  return [n[0]!, n[1]!, n[2]!, n[3]!]
}

/** Mid-thresholds between sorted runs so hard `< t` counts match LRM band sizes (no duplicates at cuts). */
function thresholdsFromSortedBands(
  sorted: Float32Array,
  n0: number,
  n1: number,
  n2: number,
  n3: number,
): { t1: number; t2: number; t3: number; t4: number } {
  const N = sorted.length
  console.assert(n0 + n1 + n2 + n3 === N && n0 >= 1 && n1 >= 1 && n2 >= 1 && n3 >= 1, '[Planet] band sizes', {
    n0,
    n1,
    n2,
    n3,
    N,
  })
  const mid = (a: number, b: number) => 0.5 * (a + b)
  const t1 = mid(sorted[n0 - 1]!, sorted[n0]!)
  const t2 = mid(sorted[n0 + n1 - 1]!, sorted[n0 + n1]!)
  const t3 = mid(sorted[n0 + n1 + n2 - 1]!, sorted[n0 + n1 + n2]!)
  const t4 = sorted[N - 1]!
  return { t1, t2, t3, t4 }
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

function resolveGenreHue(name: string, palette: Meta['genre_palette'], fallbackHue: number): number {
  const hex = palette[name]
  if (!hex || typeof hex !== 'string') return fallbackHue
  const order = Object.keys(palette).sort((a, b) => a.localeCompare(b))
  const idx = order.indexOf(name)
  if (idx < 0) return fallbackHue
  return (2 * Math.PI * idx) / order.length
}

function vec3FromHue(hue: number, target: THREE.Vector3): THREE.Vector3 {
  const [r, g, b] = pipelineRingSrgb01(hue)
  return target.set(r, g, b)
}

export interface SelectionPlanetHandle {
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  lastRadius: number
  setFromMovie: (movie: Movie, palette: Meta['genre_palette'], worldRadius: number) => void
  /** P8.3 — Recompute CPU noise + quantile thresholds after Leva changes uScale / octaves / persistence / uAreaRatio. */
  syncCpuNoiseFromUniforms: () => void
  setOpacity: (alpha: number) => void
  dispose: () => void
}

/**
 * Phase 4.5 / P8.3 — Focus Perlin sphere: Icosahedron detail=6, CPU simplex FBM + sorted-quantile 4-band partition,
 * deterministic seed from `movie.id`.
 */
export function createSelectionPlanet(): SelectionPlanetHandle {
  const detail = 6
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

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor0: { value: new THREE.Vector3(0.2, 0.6, 1) },
      uColor1: { value: new THREE.Vector3(0.2, 0.6, 1) },
      uColor2: { value: new THREE.Vector3(0.2, 0.6, 1) },
      uColor3: { value: new THREE.Vector3(0.2, 0.6, 1) },
      uAlpha: { value: 0 },
      /** Object-space frequency multiplier (CPU FBM input). */
      uScale: { value: 2.35 },
      uOctaves: { value: 4 },
      uPersistence: { value: 0.52 },
      /** Geometric weight ratio for 4-band target areas: weights ∝ [1, x, x², x³]. Default 1/φ. */
      uAreaRatio: { value: defaultAreaRatio },
      uThresh1: { value: 0.25 },
      uThresh2: { value: 0.5 },
      uThresh3: { value: 0.75 },
      uThresh4: { value: 1 },
    },
    vertexShader: perlinVertexShader,
    fragmentShader: perlinFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
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

    const x = Math.max(1e-6, u.uAreaRatio.value as number)
    const w0 = 1
    const w1 = x
    const w2 = x * x
    const w3 = x * x * x
    const D = w0 + w1 + w2 + w3
    const p0 = w0 / D
    const p1 = w1 / D
    const p2 = w2 / D
    const p3 = w3 / D

    const [n0, n1, n2, n3] = bandCountsLrm(vCount, p0, p1, p2, p3)
    let { t1, t2, t3, t4 } = thresholdsFromSortedBands(sortedScratch, n0, n1, n2, n3)
    const eps = 1e-5
    if (t2 <= t1) t2 = t1 + eps
    if (t3 <= t2) t3 = t2 + eps
    if (t4 <= t3) t4 = t3 + eps

    console.assert(t1 < t2 && t2 < t3 && t3 <= t4, '[Planet] P8.3 thresh order', { t1, t2, t3, t4 })

    u.uThresh1.value = t1
    u.uThresh2.value = t2
    u.uThresh3.value = t3
    u.uThresh4.value = t4

    for (let i = 0; i < vCount; i++) {
      noiseArr[i] = scratchNoise[i]!
    }
    noiseAttr.needsUpdate = true

    let c0 = 0
    let c1 = 0
    let c2 = 0
    let c3 = 0
    for (let i = 0; i < vCount; i++) {
      const v = scratchNoise[i]!
      if (v < t1) c0++
      else if (v < t2) c1++
      else if (v < t3) c2++
      else c3++
    }
    const n = vCount
    const a0 = c0 / n
    const a1 = c1 / n
    const a2 = c2 / n
    const a3 = c3 / n
    const e0 = n0 / n
    const e1 = n1 / n
    const e2 = n2 / n
    const e3 = n3 / n
    const errAlloc =
      Math.abs(n0 / n - p0) + Math.abs(n1 / n - p1) + Math.abs(n2 / n - p2) + Math.abs(n3 / n - p3)
    const errHard =
      Math.abs(a0 - n0 / n) + Math.abs(a1 - n1 / n) + Math.abs(a2 - n2 / n) + Math.abs(a3 - n3 / n)
    console.log(
      `[Planet] P8.3 id=${movieId} n=${n} target p=[${p0.toFixed(4)},${p1.toFixed(4)},${p2.toFixed(4)},${p3.toFixed(4)}] alloc=[${e0.toFixed(4)},${e1.toFixed(4)},${e2.toFixed(4)},${e3.toFixed(4)}] hard<[t1,t2,t3]=[${a0.toFixed(4)},${a1.toFixed(4)},${a2.toFixed(4)},${a3.toFixed(4)}] L1(alloc−p)=${errAlloc.toFixed(5)} L1(hard−alloc)=${errHard.toFixed(5)}`,
    )
    console.assert(errAlloc < 0.005, '[Planet] P8.3 alloc vs target <0.5%', { errAlloc, movieId })
    console.assert(errHard < 0.005, '[Planet] P8.3 hard cuts vs alloc <0.5%', { errHard, movieId })
  }

  const handle: SelectionPlanetHandle = {
    mesh,
    material,
    lastRadius: 0.1,
    setFromMovie: () => {},
    syncCpuNoiseFromUniforms: () => {},
    setOpacity: () => {},
    dispose: () => {},
  }

  const setFromMovie = (movie: Movie, palette: Meta['genre_palette'], worldRadius: number) => {
    handle.lastRadius = worldRadius
    lastMovie = movie

    const { genres } = genreDisplayWeights(movie.genres, 4)
    const fbHue =
      movie.genre_hue ??
      hueFromGenreColor([movie.genre_color[0], movie.genre_color[1], movie.genre_color[2]] as [
        number,
        number,
        number,
      ])
    const fbColor = new THREE.Color(movie.genre_color[0], movie.genre_color[1], movie.genre_color[2])
    const cols = genres.map((g) => vec3FromHue(resolveGenreHue(g, palette, fbHue), new THREE.Vector3()))
    while (cols.length < 4) cols.push(vec3FromHue(fbHue, new THREE.Vector3()))

    const u = material.uniforms
    ;(u.uColor0.value as THREE.Vector3).copy(cols[0]!)
    ;(u.uColor1.value as THREE.Vector3).copy(cols[1]!)
    ;(u.uColor2.value as THREE.Vector3).copy(cols[2]!)
    ;(u.uColor3.value as THREE.Vector3).copy(cols[3]!)

    mesh.position.set(movie.x, movie.y, movie.z)
    mesh.scale.setScalar(worldRadius)
    mesh.updateMatrixWorld(true)

    recomputeNoiseAndThresholds(movie.id)

    const hexList = genres.map((g) => palette[g] ?? `#${fbColor.getHexString()}`)
    console.log(`[Planet] genres=${JSON.stringify(genres)} colors=${JSON.stringify(hexList)}`)
  }

  const syncCpuNoiseFromUniforms = () => {
    if (lastMovie == null) return
    recomputeNoiseAndThresholds(lastMovie.id)
  }

  const setOpacity = (alpha: number) => {
    const a = THREE.MathUtils.clamp(alpha, 0, 1)
    material.uniforms.uAlpha.value = a
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
