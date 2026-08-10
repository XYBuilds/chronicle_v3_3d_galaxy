import { describe, expect, it, vi } from 'vitest'

vi.mock('./shaders/perlin.frag.glsl', () => ({ default: '' }))
vi.mock('./shaders/perlin.vert.glsl', () => ({ default: '' }))

import type { Movie } from '@/types/galaxy'
import type { ResolvedFocusEmissionProfile } from '@/lib/focusEmissionProfileLoader'

import { LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE } from './focusEmission'
import { focusEmissionIntensityFromProfile } from './focusEmission'
import { remapFocusEmissionIntensity } from './focusEmissionTuning'
import { createSelectionPlanet } from './planet'
import { PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE } from './productionFocusEmissionProfile'
import type { PlanetVisualBloomHandle } from './planetVisualState'
import { resolvePlanetVisualState } from './planetVisualState'
import {
  createFocusPlanetRuntimeVisualAdapter,
  resolveRuntimePlanetVisualState,
} from './focusPlanetRuntimeVisual'

const activeProvenance = {
  ...LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
  profile_id: 'rating-emission-2026-08-a',
}

const activeProfile: ResolvedFocusEmissionProfile = {
  lut: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
  provenance: activeProvenance,
  source: 'active',
}

const movieA: Movie = {
  id: 42,
  imdb_id: null,
  x: 1,
  y: 2,
  z: 2020,
  size: 4,
  emissive: 0.5,
  genre_color: [0.2, 0.4, 0.8],
  genre_hue: 1.2,
  title: 'Fixture A',
  original_title: 'Fixture A',
  overview: 'A fixture movie.',
  tagline: null,
  release_date: '2020-01-01',
  genres: ['Drama', 'Adventure'],
  original_language: 'en',
  vote_count: 100,
  vote_average: 8,
  popularity: 1,
  imdb_rating: null,
  imdb_votes: null,
  runtime: 100,
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

const movieB: Movie = {
  ...movieA,
  id: 99,
  title: 'Fixture B',
  original_title: 'Fixture B',
  vote_average: 4.5,
  genres: ['Comedy'],
}

const palette = { Drama: '#ff0000', Adventure: '#00ff00', Comedy: '#0000ff' }

function createBloomHandle(): PlanetVisualBloomHandle {
  let params = { enabled: true, strength: 1, radius: 1, threshold: 10 }
  return {
    applyParams(next) {
      params = { ...next }
    },
    get params() {
      return { ...params }
    },
  }
}

describe('resolveRuntimePlanetVisualState', () => {
  it('resolves one canonical production state from a validated active profile', () => {
    const state = resolveRuntimePlanetVisualState(activeProfile, { bloomEnabled: true })
    const expected = resolvePlanetVisualState({
      curve: activeProfile.lut,
      emissionProvenance: activeProfile.provenance,
      emissionSource: 'active',
      bloomEnabled: true,
    })

    expect(state.hashInput).toBe(expected.hashInput)
    expect(state.emissionSource).toBe('active')
    expect(state.overrideProvenance).toBe('none')
    expect(state.bloom.enabled).toBe(true)
  })

  it('allows soft DEV legacy-fallback without P39 historical proof', () => {
    const legacyProfile: ResolvedFocusEmissionProfile = {
      lut: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
      provenance: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
      source: 'legacy-fallback',
    }
    const state = resolveRuntimePlanetVisualState(legacyProfile, { bloomEnabled: false })
    expect(state.emissionSource).toBe('legacy-fallback')
    expect(state.legacyCompatibility).toBeUndefined()
    expect(state.bloom.enabled).toBe(false)
  })
})

describe('createFocusPlanetRuntimeVisualAdapter', () => {
  it('applies canonical static visuals at create before any movie is selected', () => {
    const canonicalState = resolveRuntimePlanetVisualState(activeProfile, { bloomEnabled: false })
    const planet = createSelectionPlanet(canonicalState.curve)
    const bloom = createBloomHandle()
    try {
      createFocusPlanetRuntimeVisualAdapter({ canonicalState, planet, bloom })
      expect(planet.material.uniforms.uPerlinL.value).toBe(canonicalState.focus.lightness)
      expect(planet.material.uniforms.uPerlinChroma.value).toBe(canonicalState.focus.chroma)
      expect(planet.material.uniforms.uKeyLightIntensity.value).toBe(canonicalState.lighting.keyLightIntensity)
      expect(planet.material.uniforms.uFlatShadingMix.value).toBe(canonicalState.lighting.flatShadingMix)
      expect(planet.material.uniforms.uScale.value).toBe(canonicalState.noise.scale)
      expect(bloom.params).toEqual(canonicalState.bloom)
    } finally {
      planet.dispose()
    }
  })

  it('applies canonical production visual state through the shared render seam', () => {
    const canonicalState = resolveRuntimePlanetVisualState(activeProfile, { bloomEnabled: false })
    const planet = createSelectionPlanet(canonicalState.curve)
    const bloom = createBloomHandle()
    try {
      const adapter = createFocusPlanetRuntimeVisualAdapter({ canonicalState, planet, bloom })
      const result = adapter.applyMovie(movieA, palette, 2)
      const profileEmission = focusEmissionIntensityFromProfile(movieA.vote_average, canonicalState.curve)
      const finalEmission = remapFocusEmissionIntensity(
        profileEmission,
        canonicalState.curve,
        canonicalState.focus.emissionTuning,
      )

      expect(result.appliedSnapshot).toMatchObject({
        canonicalHashInput: canonicalState.hashInput,
        movieId: movieA.id,
        profileSource: 'active',
        overrideProvenance: 'none',
        emission: finalEmission,
        profileEmission,
        focus: {
          lightness: canonicalState.focus.lightness,
          chroma: canonicalState.focus.chroma,
        },
        lighting: {
          keyLightIntensity: canonicalState.lighting.keyLightIntensity,
          flatShadingMix: canonicalState.lighting.flatShadingMix,
          direction: canonicalState.lighting.direction,
        },
      })
      expect(planet.material.uniforms.uEmissionIntensity.value).toBeCloseTo(finalEmission, 12)
      expect(adapter.productionIdentity().hashInput).toBe(canonicalState.hashInput)
    } finally {
      planet.dispose()
    }
  })

  it('keeps debug overlay out of production identity and restores canonical values on reset', () => {
    const canonicalState = resolveRuntimePlanetVisualState(activeProfile, { bloomEnabled: true })
    const planet = createSelectionPlanet(canonicalState.curve)
    const bloom = createBloomHandle()
    try {
      const adapter = createFocusPlanetRuntimeVisualAdapter({ canonicalState, planet, bloom })
      adapter.applyMovie(movieA, palette, 2)
      const before = adapter.productionIdentity()
      const debug = adapter.createDebugControls()

      debug.exponent = 2
      debug.intensityMax = 0.4
      debug.focus.lightness = 0.4
      debug.lighting.keyLightIntensity = 3
      debug.lighting.flatShadingMix = 0.25
      debug.lighting.direction = [0, 2, 0]
      debug.bloom.strength = 0.5

      expect(adapter.productionIdentity()).toEqual(before)
      expect(planet.material.uniforms.uPerlinL.value).toBe(0.4)
      expect(planet.material.uniforms.uKeyLightIntensity.value).toBe(3)
      expect(planet.material.uniforms.uFlatShadingMix.value).toBe(0.25)
      expect(planet.material.uniforms.uLightDir.value).toMatchObject({ x: 0, y: 1, z: 0 })
      expect(bloom.params.strength).toBe(0.5)
      expect(planet.material.uniforms.uEmissionIntensity.value).not.toBe(
        remapFocusEmissionIntensity(
          focusEmissionIntensityFromProfile(movieA.vote_average, canonicalState.curve),
          canonicalState.curve,
          canonicalState.focus.emissionTuning,
        ),
      )

      debug.reset()

      expect(adapter.productionIdentity()).toEqual(before)
      expect(planet.material.uniforms.uPerlinL.value).toBe(canonicalState.focus.lightness)
      expect(planet.material.uniforms.uKeyLightIntensity.value).toBe(canonicalState.lighting.keyLightIntensity)
      expect(planet.material.uniforms.uFlatShadingMix.value).toBe(canonicalState.lighting.flatShadingMix)
      expect(planet.material.uniforms.uLightDir.value).toMatchObject({
        x: canonicalState.lighting.direction[0],
        y: canonicalState.lighting.direction[1],
        z: canonicalState.lighting.direction[2],
      })
      expect(bloom.params).toEqual(canonicalState.bloom)
      expect(planet.material.uniforms.uEmissionIntensity.value).toBeCloseTo(
        remapFocusEmissionIntensity(
          focusEmissionIntensityFromProfile(movieA.vote_average, canonicalState.curve),
          canonicalState.curve,
          canonicalState.focus.emissionTuning,
        ),
        12,
      )
    } finally {
      planet.dispose()
    }
  })

  it('reapplies the current overlay onto a newly selected movie and rejects a zero direction', () => {
    const canonicalState = resolveRuntimePlanetVisualState(activeProfile, { bloomEnabled: false })
    const planet = createSelectionPlanet(canonicalState.curve)
    const bloom = createBloomHandle()
    try {
      const adapter = createFocusPlanetRuntimeVisualAdapter({ canonicalState, planet, bloom })
      const debug = adapter.createDebugControls()
      adapter.applyMovie(movieA, palette, 2)
      debug.focus.lightness = 0.33
      debug.exponent = 2

      const identity = adapter.productionIdentity()
      adapter.applyMovie(movieB, palette, 3)

      expect(adapter.productionIdentity()).toEqual(identity)
      expect(planet.material.uniforms.uPerlinL.value).toBe(0.33)
      expect(planet.material.uniforms.uEmissionIntensity.value).toBeCloseTo(
        remapFocusEmissionIntensity(
          focusEmissionIntensityFromProfile(movieB.vote_average, canonicalState.curve),
          canonicalState.curve,
          { exponent: 2, intensityMin: canonicalState.focus.emissionTuning.intensityMin, intensityMax: canonicalState.focus.emissionTuning.intensityMax },
        ),
        12,
      )
      expect(() => {
        debug.lighting.direction = [0, 0, 0]
      }).toThrow(/zero vector/)
    } finally {
      planet.dispose()
    }
  })
})
