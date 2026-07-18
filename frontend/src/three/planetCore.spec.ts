import { describe, expect, it, vi } from 'vitest'

vi.mock('./shaders/perlin.frag.glsl', () => ({ default: '' }))
vi.mock('./shaders/perlin.vert.glsl', () => ({ default: '' }))

import type { Meta, Movie } from '@/types/galaxy'

import {
  createPlanetRandom,
  planetGenreDisplayWeights,
  planetNoiseSeed,
  resolvePlanetAppearance,
} from './planetAppearance'
import {
  computeActiveShellWorldRadius,
  computeMoviePlanetOuterRadius,
  computePlanetOuterRadius,
  planetBandCount,
  planetTerraceRadiusMultiplier,
  resolveSelectionRadiusValues,
} from './planetSizing'
import { createSelectionPlanet } from './planet'
import { selectionPlanetBaseQuaternion } from './selectionPlanetRotation'
import { PLANET_VISUAL_DEFAULTS, planetVisualConfigHashInput } from './planetVisualDefaults'

const movie: Movie = {
  id: 157336,
  imdb_id: 'tt0816692',
  x: 1,
  y: 2,
  z: 2014,
  size: 10,
  emissive: 0.86,
  genre_color: [0.1, 0.2, 0.3],
  genre_hue: 1.25,
  title: 'Interstellar',
  original_title: 'Interstellar',
  overview: 'Explorers travel through a wormhole.',
  tagline: null,
  release_date: '2014-11-05',
  genres: ['Adventure', 'Drama', 'Science Fiction'],
  original_language: 'en',
  vote_count: 1,
  vote_average: 8.6,
  popularity: 1,
  imdb_rating: null,
  imdb_votes: null,
  runtime: 169,
  revenue: 0,
  budget: 0,
  production_countries: [],
  production_companies: [],
  spoken_languages: [],
  cast: [],
  director: [],
  writers: [],
  producers: [],
  director_of_photography: [],
  music_composer: [],
  poster_url: '',
}

const palette: Meta['genre_palette'] = {
  Adventure: '#ff0000',
  Drama: '#00ff00',
  'Science Fiction': '#0000ff',
}

const galaxyColor = {
  uLMin: 0.3,
  uLMax: 1,
  uHighRatingT: 0.85,
  uHighTierTRangeScale: 0.3,
  uLightnessRatingExponent: 0.8,
  uChroma: 0.15,
}

describe('planet visual defaults', () => {
  it('serializes the versioned Focus visual configuration for metadata hashing', () => {
    expect(PLANET_VISUAL_DEFAULTS).toEqual({
      schemaVersion: 2,
      geometry: { detail: 8 },
      activeShell: { sizeScale: 0.5, activeSizeMultiplier: 0.012 },
      noise: { scale: 2.35, octaves: 4, persistence: 0.52 },
      bands: {
        max: 8,
        areaRatio: 1 / ((1 + Math.sqrt(5)) / 2),
        thresholdPad: 2,
        stepHeight: 0.03,
        stepSmoothness: 0.01,
      },
      color: { lMax: 1, huntGamma: 0.3, huntApplyMask: 7 },
      focus: {
        lightness: 0.55,
        chroma: 0.15,
        emissionIntensityMin: 0.06,
        emissionIntensityMax: 0.6,
      },
      galaxyColor: {
        lMin: 0.3,
        lMax: 1,
        highRatingT: 0.85,
        highTierTRangeScale: 0.4,
        lightnessRatingExponent: 3,
        chroma: 0.18,
      },
      lighting: {
        enabled: true,
        direction: [0.7, 0.7, -0.14],
        keyLightIntensity: 1.0,
        flatShadingMix: 0.8,
      },
      material: {
        alpha: 0,
        alphaTest: 0.01,
        transparent: false,
        depthWrite: true,
        depthTest: true,
      },
    })
    expect(JSON.parse(planetVisualConfigHashInput())).toEqual(PLANET_VISUAL_DEFAULTS)
  })
})

describe('planet appearance', () => {
  it('feeds export color inputs from the shared visual defaults', () => {
    const defaults = PLANET_VISUAL_DEFAULTS.galaxyColor
    const appearance = resolvePlanetAppearance(movie, palette, {
      uLMin: defaults.lMin,
      uLMax: defaults.lMax,
      uHighRatingT: defaults.highRatingT,
      uHighTierTRangeScale: defaults.highTierTRangeScale,
      uLightnessRatingExponent: defaults.lightnessRatingExponent,
      uChroma: defaults.chroma,
    })
    expect(appearance.chroma).toBe(defaults.chroma)
    expect(appearance.lightness).toBeGreaterThan(0)
  })

  it('is deterministic for noise, genres, hues, lightness, and base pose', () => {
    const a = resolvePlanetAppearance(movie, palette, galaxyColor)
    const b = resolvePlanetAppearance(movie, palette, galaxyColor)

    expect(planetNoiseSeed(movie.id)).toBe(planetNoiseSeed(movie.id))
    const randomA = createPlanetRandom(planetNoiseSeed(movie.id))
    const randomB = createPlanetRandom(planetNoiseSeed(movie.id))
    expect([randomA(), randomA(), randomA()]).toEqual([randomB(), randomB(), randomB()])
    expect(a.genres).toEqual(movie.genres)
    expect(a.hues).toEqual(b.hues)
    expect(a.lightness).toBe(b.lightness)
    expect(a.chroma).toBe(galaxyColor.uChroma)
    expect(a.bandCount).toBe(3)
    expect(a.cutCount).toBe(2)
    expect(a.baseQuaternion.equals(b.baseQuaternion)).toBe(true)
  })

  it('keeps facade uniforms, scale, quaternion, and outer radius aligned', () => {
    const handle = createSelectionPlanet()
    try {
      handle.setFromMovie(movie, palette, 2, galaxyColor)

      expect(handle.material.uniforms.uBandCount.value).toBe(3)
      expect(handle.material.uniforms.uCutCount.value).toBe(2)
      expect(handle.material.uniforms.uPerlinL.value).toBeCloseTo(0.916392385291124, 12)
      expect(handle.material.uniforms.uPerlinL.value).toBe(
        resolvePlanetAppearance(movie, palette, galaxyColor).lightness,
      )
      expect(handle.material.uniforms.uPerlinChroma.value).toBe(0.15)
      expect(handle.material.uniforms.uLightingEnabled.value).toBe(1)
      expect(handle.material.uniforms.uAmbient.value).toBe(0.06)
      expect(handle.material.uniforms.uDiffuse.value).toBe(1)
      expect((handle.material.uniforms.uLightDir.value as { toArray: () => number[] }).toArray()).toEqual([
        0.7001400420140049,
        0.7001400420140049,
        -0.14002800840280102,
      ])
      expect(handle.mesh.scale.x).toBe(2)
      expect(handle.mesh.scale.y).toBe(2)
      expect(handle.mesh.scale.z).toBe(2)
      expect(handle.mesh.quaternion.equals(selectionPlanetBaseQuaternion(movie.id))).toBe(true)
      expect(handle.lastRadius).toBeCloseTo(computePlanetOuterRadius(2, 3))
    } finally {
      handle.dispose()
    }
  })

  it('locks current focus uniform values for representative low, mid, and high ratings', () => {
    const handle = createSelectionPlanet()
    try {
      for (const [voteAverage, lightness] of [
        [3.9, 0.6295715584351893],
        [5.3, 0.7212294584249238],
        [8.6, 0.9163923852911244],
      ] as const) {
        handle.setFromMovie({ ...movie, vote_average: voteAverage }, palette, 2, galaxyColor)

        expect(handle.material.uniforms.uPerlinL.value).toBeCloseTo(lightness, 12)
        expect(handle.material.uniforms.uPerlinChroma.value).toBe(0.15)
        expect(handle.material.uniforms.uLightingEnabled.value).toBe(1)
        expect(handle.material.uniforms.uAmbient.value).toBe(0.06)
        expect(handle.material.uniforms.uDiffuse.value).toBe(1)
        expect((handle.material.uniforms.uLightDir.value as { toArray: () => number[] }).toArray()).toEqual([
          0.7001400420140049,
          0.7001400420140049,
          -0.14002800840280102,
        ])
      }
    } finally {
      handle.dispose()
    }
  })

  it('uses one Unknown band for missing genres and normalized display weights', () => {
    const result = planetGenreDisplayWeights([])
    expect(result).toEqual({ genres: ['Unknown'], weights: [1] })

    const weighted = planetGenreDisplayWeights(movie.genres)
    expect(weighted.weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12)
    expect(weighted.weights[0]).toBeGreaterThan(weighted.weights[1]!)
  })
})

describe('planet sizing', () => {
  it('accounts for each terrace in the outer radius', () => {
    expect(planetBandCount([])).toBe(1)
    expect(planetBandCount(movie.genres)).toBe(3)
    expect(planetTerraceRadiusMultiplier(1)).toBe(1)
    expect(planetTerraceRadiusMultiplier(3)).toBeCloseTo(1.06)
    expect(computePlanetOuterRadius(2, 3)).toBeCloseTo(2.12)
  })

  it('uses the shared active-shell defaults for export-wide sizing', () => {
    expect(computeActiveShellWorldRadius(movie.size, 0.5, 0.012)).toBeCloseTo(0.06)
    expect(computeMoviePlanetOuterRadius(movie)).toBeCloseTo(0.0636)
  })

  it('preserves active and off-slab selection radius behavior', () => {
    const active = resolveSelectionRadiusValues(10, 0.5, 0.012, 0.75)
    expect(active.r).toBeCloseTo(0.045)
    expect(active.rActive).toBeCloseTo(0.045)
    expect(resolveSelectionRadiusValues(10, 0.5, 0.012, 0)).toEqual({ r: 0.06, rActive: 0 })
  })

  it('keeps tiny non-zero focus factors on the established shell fallback', () => {
    const nearZero = resolveSelectionRadiusValues(10, 0.5, 0.012, 1e-7)
    expect(nearZero).toEqual({ r: 0.06, rActive: 6e-9 })
  })

  it('fails fast on invalid dimensions', () => {
    expect(() => computePlanetOuterRadius(-1, 2)).toThrow(RangeError)
    expect(() => planetTerraceRadiusMultiplier(0)).toThrow(RangeError)
    expect(() => computeActiveShellWorldRadius(1, -1, 1)).toThrow(RangeError)
  })
})