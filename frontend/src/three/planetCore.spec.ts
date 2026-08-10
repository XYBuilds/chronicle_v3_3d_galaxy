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
import { focusEmissionIntensityFromProfile, type RatingMidrankCdfLutProfile } from './focusEmission'
import { remapFocusEmissionIntensity } from './focusEmissionTuning'
import { PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE } from './productionFocusEmissionProfile'
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
import { PLANET_VISUAL_DEFAULTS, p3911LegacyFrozenProfileVisualConfigHashInput } from './planetVisualDefaults'
import {
  createFocusPlanetRuntimeVisualAdapter,
  resolveRuntimePlanetVisualState,
} from './focusPlanetRuntimeVisual'
import { LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE } from './focusEmission'

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

describe('planet visual defaults', () => {
  it('serializes the versioned Focus visual configuration for metadata hashing', () => {
    expect(PLANET_VISUAL_DEFAULTS).toEqual({
      schemaVersion: 10,
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
      color: {
        pipelineVersion: 'oklch-local-base-linear-emission-fixed-key-single-srgb-v1',
        lMax: 1,
        huntGamma: 0.3,
        huntApplyMask: 7,
      },
      focus: {
        lightness: 0.66,
        chroma: 0.15,
        emissionTuning: { exponent: 3, intensityMin: 0.005, intensityMax: 0.66 },
        bloom: {
          composition: 'pure-bloom-delta-v1',
          enabled: true,
          strength: 1,
          radius: 1,
          threshold: 10,
        },
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
        direction: [0.700665949127905, 0.4003805423588029, 0.5905612999792342],
        keyLightIntensity: 10,
        flatShadingMix: 1,
      },
      material: {
        alpha: 0,
        alphaTest: 0.01,
        transparent: false,
        depthWrite: true,
        depthTest: true,
      },
    })
    const legacyHashPayload = JSON.parse(p3911LegacyFrozenProfileVisualConfigHashInput())
    expect(legacyHashPayload.legacyCompatibility).toBe('p39.11-frozen-profile-fixture')
    expect(legacyHashPayload.visual.focus.emission).toEqual(PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE)
  })
})

describe('Focus production CDF/LUT emission', () => {
  const curve = PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE

  it('clamps finite ratings to the exact approved endpoints', () => {
    expect(focusEmissionIntensityFromProfile(0, curve)).toBe(0.005)
    expect(focusEmissionIntensityFromProfile(10, curve)).toBe(0.65)
    expect(focusEmissionIntensityFromProfile(-1, curve)).toBe(0.005)
    expect(focusEmissionIntensityFromProfile(11, curve)).toBe(0.65)
  })

  it('is monotonic across the production LUT domain', () => {
    const values = Array.from({ length: 101 }, (_, index) => focusEmissionIntensityFromProfile(index * 0.1, curve))
    values.slice(1).forEach((value, index) => expect(value).toBeGreaterThanOrEqual(values[index]!))
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('fails fast for rating %s', (invalidRating) => {
    expect(() => focusEmissionIntensityFromProfile(invalidRating, curve)).toThrow(/voteAverage.*finite/)
  })
})

describe('planet appearance', () => {
  it('uses fixed Focus lightness, chroma, and key light from shared defaults', () => {
    const appearance = resolvePlanetAppearance(movie, palette, PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE)

    expect(resolvePlanetAppearance).toHaveLength(3)
    expect(appearance.lightness).toBe(PLANET_VISUAL_DEFAULTS.focus.lightness)
    expect(appearance.chroma).toBe(PLANET_VISUAL_DEFAULTS.focus.chroma)
    expect(appearance.keyLightIntensity).toBe(PLANET_VISUAL_DEFAULTS.lighting.keyLightIntensity)
    expect(appearance.emissionIntensity).toBe(focusEmissionIntensityFromProfile(movie.vote_average, PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE))
  })

  it('is deterministic for noise, genres, hues, fixed appearance, emission, and base pose', () => {
    const a = resolvePlanetAppearance(movie, palette, PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE)
    const b = resolvePlanetAppearance(movie, palette, PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE)

    expect(planetNoiseSeed(movie.id)).toBe(planetNoiseSeed(movie.id))
    const randomA = createPlanetRandom(planetNoiseSeed(movie.id))
    const randomB = createPlanetRandom(planetNoiseSeed(movie.id))
    expect([randomA(), randomA(), randomA()]).toEqual([randomB(), randomB(), randomB()])
    expect(a.genres).toEqual(movie.genres)
    expect(a.hues).toEqual(b.hues)
    expect(a.lightness).toBe(PLANET_VISUAL_DEFAULTS.focus.lightness)
    expect(a.chroma).toBe(PLANET_VISUAL_DEFAULTS.focus.chroma)
    expect(a.emissionIntensity).toBe(b.emissionIntensity)
    expect(a.keyLightIntensity).toBe(PLANET_VISUAL_DEFAULTS.lighting.keyLightIntensity)
    expect(a.bandCount).toBe(3)
    expect(a.cutCount).toBe(2)
    expect(a.baseQuaternion.equals(b.baseQuaternion)).toBe(true)
  })

  it('writes movie geometry/bands through setFromMovie without owning production visual uniforms', () => {
    const handle = createSelectionPlanet(PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE)
    const initialEmission = handle.material.uniforms.uEmissionIntensity.value
    const initialLightness = handle.material.uniforms.uPerlinL.value
    try {
      handle.setFromMovie(movie, palette, 2)

      expect(handle.setFromMovie).toHaveLength(3)
      expect(handle.material.uniforms.uBandCount.value).toBe(3)
      expect(handle.material.uniforms.uCutCount.value).toBe(2)
      expect(handle.material.uniforms.uEmissionIntensity.value).toBe(initialEmission)
      expect(handle.material.uniforms.uPerlinL.value).toBe(initialLightness)
      expect(handle.material.uniforms).not.toHaveProperty('uAmbient')
      expect(handle.material.uniforms).not.toHaveProperty('uDiffuse')
      expect(handle.mesh.scale.x).toBe(2)
      expect(handle.mesh.scale.y).toBe(2)
      expect(handle.mesh.scale.z).toBe(2)
      expect(handle.mesh.quaternion.equals(selectionPlanetBaseQuaternion(movie.id))).toBe(true)
      expect(handle.lastRadius).toBeCloseTo(computePlanetOuterRadius(2, 3))
      expect(handle.lastAppearance?.emissionProfile).toBe(PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE)
    } finally {
      handle.dispose()
    }
  })

  it('keeps the supplied active profile on appearance without introducing LUT state into the material', () => {
    const activeProfile: RatingMidrankCdfLutProfile = {
      ...PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
      samples: Array.from(
        { length: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE.samples.length },
        (_, index) => index === PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE.samples.length - 1 ? 0.65 : 0.005,
      ),
    }
    const handle = createSelectionPlanet(activeProfile)
    try {
      handle.setFromMovie(movie, palette, 2)

      expect(handle.lastAppearance?.emissionProfile).toBe(activeProfile)
      expect(handle.material.uniforms).not.toHaveProperty('uEmissionLut')
    } finally {
      handle.dispose()
    }
  })

  it('keeps fixed Lightness, chroma, Key, direction, flatness, and Bloom stable while emission follows rating', () => {
    const canonicalState = resolveRuntimePlanetVisualState({
      lut: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
      provenance: {
        ...LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
        profile_id: 'rating-emission-2026-08-a',
      },
      source: 'active',
    }, { bloomEnabled: false })
    const planet = createSelectionPlanet(canonicalState.curve)
    const bloom = {
      applyParams() {},
      get params() {
        return { ...canonicalState.bloom }
      },
    }
    try {
      const adapter = createFocusPlanetRuntimeVisualAdapter({ canonicalState, planet, bloom })
      const uniforms = [4, 4.5, 5.5, 6.5, 7.5, 8.2, 9.5].map((voteAverage) => {
        const result = adapter.applyMovie({ ...movie, vote_average: voteAverage }, palette, 2)
        return {
          lightness: result.appliedSnapshot.focus.lightness,
          chroma: result.appliedSnapshot.focus.chroma,
          emission: result.appliedSnapshot.emission,
          key: result.appliedSnapshot.lighting.keyLightIntensity,
          direction: [...result.appliedSnapshot.lighting.direction],
          flat: result.appliedSnapshot.lighting.flatShadingMix,
        }
      })

      expect(uniforms.map(({ lightness }) => lightness)).toEqual(Array(7).fill(0.66))
      expect(uniforms.map(({ chroma }) => chroma)).toEqual(Array(7).fill(0.15))
      expect(uniforms.map(({ key }) => key)).toEqual(Array(7).fill(10))
      expect(uniforms.map(({ direction }) => direction)).toEqual(Array(7).fill(PLANET_VISUAL_DEFAULTS.lighting.direction))
      expect(uniforms.map(({ flat }) => flat)).toEqual(Array(7).fill(1))
      const ratings = [4, 4.5, 5.5, 6.5, 7.5, 8.2, 9.5]
      const emissions = uniforms.map(({ emission }) => emission)
      expect(emissions).toEqual(ratings.map((rating) =>
        remapFocusEmissionIntensity(
          focusEmissionIntensityFromProfile(rating, PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE),
          PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
          PLANET_VISUAL_DEFAULTS.focus.emissionTuning,
        ),
      ))
      emissions.slice(1).forEach((value, index) => expect(value).toBeGreaterThan(emissions[index]!))
    } finally {
      planet.dispose()
    }
  })

  it('matches runtime adapter applied emission to appearance profile intensity plus production remap', () => {
    const canonicalState = resolveRuntimePlanetVisualState({
      lut: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
      provenance: {
        ...LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
        profile_id: 'rating-emission-2026-08-a',
      },
      source: 'active',
    }, { bloomEnabled: false })
    const planet = createSelectionPlanet(canonicalState.curve)
    const bloom = {
      applyParams() {},
      get params() {
        return { ...canonicalState.bloom }
      },
    }
    try {
      const adapter = createFocusPlanetRuntimeVisualAdapter({ canonicalState, planet, bloom })
      for (const voteAverage of [4.5, 6.5, 8.2] as const) {
        const target = { ...movie, vote_average: voteAverage }
        const appearance = resolvePlanetAppearance(target, palette, canonicalState.curve)
        const result = adapter.applyMovie(target, palette, 2)
        expect(result.appliedSnapshot.profileEmission).toBe(appearance.emissionIntensity)
        expect(result.appliedSnapshot.emission).toBeCloseTo(
          remapFocusEmissionIntensity(
            appearance.emissionIntensity,
            appearance.emissionProfile,
            canonicalState.focus.emissionTuning,
          ),
          12,
        )
        expect(result.appliedSnapshot.focus).toEqual({
          lightness: appearance.lightness,
          chroma: appearance.chroma,
        })
        expect(adapter.productionIdentity().hashInput).toBe(canonicalState.hashInput)
      }
    } finally {
      planet.dispose()
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
