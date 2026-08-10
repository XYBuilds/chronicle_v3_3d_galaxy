import { describe, expect, it, vi } from 'vitest'

vi.mock('../shaders/perlin.frag.glsl', () => ({ default: '' }))
vi.mock('../shaders/perlin.vert.glsl', () => ({ default: '' }))

import { LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE } from '@/three/focusEmission'
import { PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE } from '@/three/productionFocusEmissionProfile'
import { createSelectionPlanet } from '@/three/planet'
import type { Movie } from '@/types/galaxy'
import type {
  PlanetVisualAppliedSnapshot,
  PlanetVisualBloomHandle,
  PlanetVisualRendererHandle,
} from './index'
import {
  createPlanetVisualRendererHandle,
  renderPlanetVisualState,
  resolvePlanetVisualState,
} from './index'

const activeProvenance = {
  ...LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
  profile_id: 'rating-emission-2026-08-a',
}

const baseInput = {
  curve: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
  emissionProvenance: activeProvenance,
  emissionSource: 'active' as const,
  bloomEnabled: true,
}

const movie: Movie = {
  id: 42,
  imdb_id: null,
  x: 1,
  y: 2,
  z: 2020,
  size: 4,
  emissive: 0.5,
  genre_color: [0.2, 0.4, 0.8],
  genre_hue: 1.2,
  title: 'Fixture',
  original_title: 'Fixture',
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

const palette = { Drama: '#ff0000', Adventure: '#00ff00' }

type MutableSnapshot = PlanetVisualAppliedSnapshot | null

function createInMemoryRenderer(): PlanetVisualRendererHandle {
  let applied: MutableSnapshot = null

  return {
    apply(application) {
      applied = {
        canonicalHashInput: application.state.hashInput,
        profileProvenance: application.state.emissionProvenance,
        profileSource: application.state.emissionSource,
        overrideProvenance: application.state.overrideProvenance,
        ...(application.state.diagnosticMarker === undefined
          ? {}
          : { diagnosticMarker: application.state.diagnosticMarker }),
        ...(application.state.legacyCompatibility === undefined
          ? {}
          : { legacyCompatibility: application.state.legacyCompatibility }),
        ...(application.state.emissionDerivation === undefined
          ? {}
          : { emissionDerivation: application.state.emissionDerivation }),
        movieId: application.movie.id,
        worldRadius: application.worldRadius,
        outerRadius: application.appearance.outerRadius,
        emission: application.emission.finalIntensity,
        profileEmission: application.emission.profileIntensity,
        focus: {
          lightness: application.state.focus.lightness,
          chroma: application.state.focus.chroma,
        },
        lighting: {
          enabled: application.state.lighting.enabled,
          direction: [...application.state.lighting.direction],
          keyLightIntensity: application.state.lighting.keyLightIntensity,
          flatShadingMix: application.state.lighting.flatShadingMix,
        },
        geometryDetail: application.state.geometry.detail,
        size: { ...application.state.size },
        noise: { ...application.state.noise },
        bands: {
          ...application.state.bands,
          bandCount: application.appearance.bandCount,
          cutCount: application.appearance.cutCount,
        },
        hues: [...application.appearance.hues],
        color: { ...application.state.color },
        material: { ...application.state.material, alpha: 1 },
        bloom: { ...application.state.bloom },
      }
    },
    readAppliedState() {
      if (applied === null) throw new Error('renderer has not been applied')
      return applied
    },
  }
}

function createInMemoryBloom(): PlanetVisualBloomHandle {
  let params = { enabled: false, strength: 0, radius: 0, threshold: 0 }
  return {
    applyParams(next) {
      params = { ...next }
    },
    get params() {
      return { ...params }
    },
  }
}

describe('canonical Planet visual state', () => {
  it('normalizes identity inputs and excludes non-Focus galaxy-only fields', () => {
    const normalized = resolvePlanetVisualState({
      ...baseInput,
      direction: [10, 0, 0],
    })
    const equivalent = resolvePlanetVisualState({
      ...baseInput,
      direction: [1, 0, 0],
    })

    expect(normalized.hashInput).toBe(equivalent.hashInput)
    expect(normalized.direction).toEqual([1, 0, 0])
    expect(normalized.payload.visual).not.toHaveProperty('galaxyColor')
    expect(normalized.payload.visual.bands).not.toHaveProperty('thresholdPad')
    expect(normalized.payload.visual.material).not.toHaveProperty('alpha')
    expect(normalized.payload.visual).toMatchObject({
      geometry: { detail: 8 },
      size: { sizeScale: 0.5, activeSizeMultiplier: 0.012 },
      focus: {
        emissionTuning: { exponent: 3, intensityMin: 0.005, intensityMax: 0.66 },
        bloom: { enabled: true, composition: 'pure-bloom-delta-v1' },
      },
    })
  })

  it('deep-freezes the canonical payload and serializes it as the stable hash input', () => {
    const state = resolvePlanetVisualState(baseInput)

    expect(JSON.parse(state.hashInput)).toEqual(state.payload)
    expect(Object.isFrozen(state)).toBe(true)
    expect(Object.isFrozen(state.payload)).toBe(true)
    expect(Object.isFrozen(state.payload.visual.focus.emission)).toBe(true)
    const emission = state.payload.visual.focus.emission
    if (!('samples' in emission)) throw new Error('expected LUT emission fixture')
    expect(Object.isFrozen(emission.samples)).toBe(true)
    expect(Object.isFrozen(state.direction)).toBe(true)
    expect(Object.isFrozen(state.bloom)).toBe(true)
  })

  it.each([
    ['geometry', { geometry: { detail: 7 } }],
    ['size', { size: { sizeScale: 0.6, activeSizeMultiplier: 0.012 } }],
    ['noise', { noise: { scale: 1.5, octaves: 4, persistence: 0.52 } }],
    ['bands', { bands: { max: 8, areaRatio: 0.5, stepHeight: 0.03, stepSmoothness: 0.01 } }],
    ['color', { color: { pipelineVersion: 'test-pipeline-v2', lMax: 1, huntGamma: 0.3, huntApplyMask: 7 } }],
    ['emission tuning', { emissionTuning: { exponent: 2, intensityMin: 0.005, intensityMax: 0.66 } }],
    ['material', { material: { alphaTest: 0.02, transparent: false, depthWrite: true, depthTest: true } }],
    ['Bloom', { bloomEnabled: false }],
  ])('changes visual identity when canonical %s changes', (_label, override) => {
    const baseline = resolvePlanetVisualState(baseInput)
    const changed = resolvePlanetVisualState({ ...baseInput, ...override } as never)

    expect(changed.hashInput).not.toBe(baseline.hashInput)
  })

  it('ignores fields outside the canonical production input contract', () => {
    const baseline = resolvePlanetVisualState(baseInput)
    const withDebugOverlay = resolvePlanetVisualState({
      ...baseInput,
      runtimeDebugOverlay: { emission: 999 },
    } as typeof baseInput)

    expect(withDebugOverlay.hashInput).toBe(baseline.hashInput)
  })

  it.each([
    ['direction', { direction: [0, 0, 0] }],
    ['lightness', { lightness: Number.NaN }],
    ['emission tuning', { emissionTuning: { exponent: 0, intensityMin: 0, intensityMax: 1 } }],
    ['Bloom state', { bloom: { enabled: false, strength: 1, radius: 1, threshold: 10 } }],
  ])('fails fast for invalid %s', (_label, override) => {
    expect(() => resolvePlanetVisualState({ ...baseInput, ...override } as never)).toThrow()
  })

  it('derives production emission by profile lookup followed by canonical tuning', () => {
    const state = resolvePlanetVisualState({ ...baseInput, bloomEnabled: false })
    const renderer = createInMemoryRenderer()
    const result = renderPlanetVisualState(state, { movie, palette, worldRadius: 2 }, renderer)
    const snapshot = result.appliedSnapshot

    expect(result.application.state.hashInput).toBe(state.hashInput)
    expect(snapshot.canonicalHashInput).toBe(state.hashInput)
    expect(snapshot.profileProvenance).toEqual(activeProvenance)
    expect(snapshot.profileSource).toBe('active')
    expect(snapshot.movieId).toBe(movie.id)
    expect(snapshot.profileEmission).toBeCloseTo(0.640062570086623, 12)
    expect(snapshot.emission).toBeCloseTo(0.6301895439451736, 12)
    expect(snapshot.bloom.enabled).toBe(false)
    expect(snapshot.lighting.direction).toEqual(state.direction)
  })

  it.each([
    [0, 0.005, 0.005],
    [4, 0.01762619655133185, 0.005004913373658098],
    [6, 0.2543529684224212, 0.04284476249218143],
    [8, 0.640062570086623, 0.6301895439451736],
    [10, 0.65, 0.66],
  ])('keeps the production emission chain fixed at rating %s', (rating, profileEmission, finalEmission) => {
    const state = resolvePlanetVisualState(baseInput)
    const result = renderPlanetVisualState(
      state,
      { movie: { ...movie, vote_average: rating }, palette, worldRadius: 2 },
      createInMemoryRenderer(),
    )

    expect(result.appliedSnapshot.profileEmission).toBeCloseTo(profileEmission, 12)
    expect(result.appliedSnapshot.emission).toBeCloseTo(finalEmission, 12)
  })

  it('applies the complete state to a SelectionPlanet renderer and reads it back', () => {
    const state = resolvePlanetVisualState({
      ...baseInput,
      bloomEnabled: false,
      direction: [0, 3, 0],
      lightness: 0.5,
      chroma: 0.2,
      keyLightIntensity: 3,
      flatShadingMix: 0.25,
      noise: { scale: 1.5, octaves: 3, persistence: 0.4 },
      bands: {
        max: 8,
        areaRatio: 0.5,
        stepHeight: 0.05,
        stepSmoothness: 0.02,
      },
    })
    const planet = createSelectionPlanet(state.curve)
    const bloom = createInMemoryBloom()
    try {
      const result = renderPlanetVisualState(
        state,
        { movie, palette, worldRadius: 2 },
        createPlanetVisualRendererHandle(planet, bloom),
      )

      expect(result.appliedSnapshot).toMatchObject({
        canonicalHashInput: state.hashInput,
        movieId: movie.id,
        worldRadius: 2,
        outerRadius: 2.1,
        focus: { lightness: 0.5, chroma: 0.2 },
        lighting: {
          enabled: true,
          direction: [0, 1, 0],
          keyLightIntensity: 3,
          flatShadingMix: 0.25,
        },
        geometryDetail: 8,
        noise: { scale: 1.5, octaves: 3, persistence: 0.4 },
        bands: {
          max: 8,
          areaRatio: 0.5,
          stepHeight: 0.05,
          stepSmoothness: 0.02,
          bandCount: 2,
          cutCount: 1,
        },
        color: {
          pipelineVersion: 'oklch-local-base-linear-emission-fixed-key-single-srgb-v1',
          lMax: 1,
          huntGamma: 0.3,
          huntApplyMask: 7,
        },
        material: {
          alpha: 1,
          alphaTest: 0.01,
          transparent: false,
          depthWrite: true,
          depthTest: true,
        },
        bloom: { enabled: false, strength: 1, radius: 1, threshold: 10 },
      })
      expect(result.appliedSnapshot.hues).toHaveLength(2)
      expect(bloom.params).toEqual(state.bloom)
      expect(planet.material.uniforms.uAreaRatio.value).toBe(0.5)
      expect(planet.material.uniforms.uStepHeight.value).toBe(0.05)
      expect(planet.material.uniforms.uStepSmoothness.value).toBe(0.02)
    } finally {
      planet.dispose()
    }
  })

  it('keeps diagnostic identity explicit and isolated from production', () => {
    const production = resolvePlanetVisualState(baseInput)
    const diagnostic = resolvePlanetVisualState({
      ...baseInput,
      emissionSource: 'diagnostic-override',
      diagnosticMarker: 'phase41-visual-diagnostic-v1',
      overrideProvenance: 'phase41-diagnostic-override',
    })

    expect(diagnostic.overrideProvenance).toBe('phase41-diagnostic-override')
    expect(diagnostic.diagnosticMarker).toBe('phase41-visual-diagnostic-v1')
    expect(diagnostic.payload.diagnostic_marker).toBe('phase41-visual-diagnostic-v1')
    expect(diagnostic.hashInput).not.toBe(production.hashInput)
  })

  it('requires explicit adapter identity for diagnostic and legacy states', () => {
    expect(() => resolvePlanetVisualState({
      ...baseInput,
      emissionSource: 'diagnostic-override',
      overrideProvenance: 'phase41-diagnostic-override',
    })).toThrow(/diagnostic marker/)
    expect(() => resolvePlanetVisualState({
      ...baseInput,
      emissionProvenance: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
      emissionSource: 'legacy-fallback',
      emissionDerivation: {
        kind: 'legacy-power',
        modelVersion: 'p39.11-checkpoint-b-emission-exponent-v1',
        exponent: 3,
        intensityMin: 0.06,
        intensityMax: 0.6,
      },
    })).toThrow(/legacy compatibility proof/)
    const softLegacy = resolvePlanetVisualState({
      ...baseInput,
      emissionProvenance: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
      emissionSource: 'legacy-fallback',
    })
    expect(softLegacy.emissionSource).toBe('legacy-fallback')
    expect(softLegacy.legacyCompatibility).toBeUndefined()
  })

  it('applies a proven P39 legacy power profile through the canonical renderer seam', () => {
    const legacy = resolvePlanetVisualState({
      ...baseInput,
      emissionProvenance: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
      emissionSource: 'legacy-fallback',
      bloomEnabled: false,
      keyLightIntensity: 0.45,
      legacyCompatibility: {
        proof: 'p39.11-frozen-profile-fixture',
        evidenceIdentity: 'p39.11-checkpoint-b',
        historicalVisualHash: '{"diagnostic":"p39.11-checkpoint-b-fixed-key-emission-exponent-v1"}',
      },
      emissionDerivation: {
        kind: 'legacy-power',
        modelVersion: 'p39.11-checkpoint-b-emission-exponent-v1',
        exponent: 3,
        intensityMin: 0.06,
        intensityMax: 0.6,
      },
    })
    const result = renderPlanetVisualState(
      legacy,
      { movie, palette, worldRadius: 2 },
      createInMemoryRenderer(),
    )

    expect(legacy.payload.legacy_compatibility).toEqual(legacy.legacyCompatibility)
    expect(result.appliedSnapshot).toMatchObject({
      profileSource: 'legacy-fallback',
      overrideProvenance: 'none',
      legacyCompatibility: legacy.legacyCompatibility,
      emissionDerivation: legacy.emissionDerivation,
      lighting: { keyLightIntensity: 0.45 },
    })
    expect(result.appliedSnapshot.profileEmission).toBeCloseTo(0.33648, 12)
    expect(result.appliedSnapshot.emission).toBeCloseTo(0.33648, 12)
  })

  it('rejects inconsistent production provenance and non-explicit diagnostic state', () => {
    expect(() => resolvePlanetVisualState({
      ...baseInput,
      emissionProvenance: { ...activeProvenance, model_version: 'wrong-model' },
    })).toThrow(/model versions must match/)
    expect(() => resolvePlanetVisualState({
      ...baseInput,
      emissionSource: 'diagnostic-override',
      diagnosticMarker: 'phase41-visual-diagnostic-v1',
    })).toThrow(/explicit diagnostic override provenance/)
  })
})