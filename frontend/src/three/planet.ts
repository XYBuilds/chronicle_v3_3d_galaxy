import * as THREE from 'three'

import type { Meta, Movie } from '@/types/galaxy'
import { hueFromGenreColor, pipelineRingSrgb01 } from '@/utils/genreHue'

import perlinFragmentShader from './shaders/perlin.frag.glsl'
import perlinVertexShader from './shaders/perlin.vert.glsl'

const PHI = (1 + Math.sqrt(5)) / 2

/** Golden-ratio decay weights (same spirit as pipeline genre encoding). */
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

/** Sorted-vocabulary hue (P8.1); matches pipeline `2π·i/N`. */
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
  /** Updated in {@link SelectionPlanetHandle.setFromMovie}. */
  lastRadius: number
  setFromMovie: (movie: Movie, palette: Meta['genre_palette'], worldRadius: number) => void
  setOpacity: (alpha: number) => void
  dispose: () => void
}

/**
 * Phase 4.5 — “微观层”选中态：细分二十面体近似球体 + 3D 噪声着色，按流派顺位权重混色。
 */
export function createSelectionPlanet(): SelectionPlanetHandle {
  const detail = 4
  const geometry = new THREE.IcosahedronGeometry(1, detail)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor0: { value: new THREE.Vector3(0.2, 0.6, 1) },
      uColor1: { value: new THREE.Vector3(0.2, 0.6, 1) },
      uColor2: { value: new THREE.Vector3(0.2, 0.6, 1) },
      uColor3: { value: new THREE.Vector3(0.2, 0.6, 1) },
      uWeight0: { value: 1 },
      uWeight1: { value: 0 },
      uWeight2: { value: 0 },
      uWeight3: { value: 0 },
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      /** Phase 5.1.6 — Perlin partition tuning (area-weighted genre zones). */
      uScale: { value: 2.35 },
      uOctaves: { value: 4 },
      uPersistence: { value: 0.52 },
      uThreshold: { value: 0.048 },
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

  const handle: SelectionPlanetHandle = {
    mesh,
    material,
    lastRadius: 0.1,
    setFromMovie: () => {},
    setOpacity: () => {},
    dispose: () => {},
  }

  const setFromMovie = (movie: Movie, palette: Meta['genre_palette'], worldRadius: number) => {
    handle.lastRadius = worldRadius
    const { genres, weights } = genreDisplayWeights(movie.genres, 4)
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
    while (weights.length < 4) weights.push(0)

    const u = material.uniforms
    ;(u.uColor0.value as THREE.Vector3).copy(cols[0])
    ;(u.uColor1.value as THREE.Vector3).copy(cols[1])
    ;(u.uColor2.value as THREE.Vector3).copy(cols[2])
    ;(u.uColor3.value as THREE.Vector3).copy(cols[3])
    u.uWeight0.value = weights[0] ?? 0
    u.uWeight1.value = weights[1] ?? 0
    u.uWeight2.value = weights[2] ?? 0
    u.uWeight3.value = weights[3] ?? 0

    mesh.position.set(movie.x, movie.y, movie.z)
    mesh.scale.setScalar(worldRadius)
    mesh.updateMatrixWorld(true)

    const hexList = genres.map((g) => palette[g] ?? `#${fbColor.getHexString()}`)
    console.log(
      `[Planet] genres=${JSON.stringify(genres)} weights=${JSON.stringify(weights)} colors=${JSON.stringify(hexList)}`,
    )
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
  handle.setOpacity = setOpacity
  handle.dispose = dispose
  return handle
}
