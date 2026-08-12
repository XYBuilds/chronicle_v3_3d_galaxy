import { describe, expect, it, vi } from 'vitest'

vi.mock('../shaders/perlin.frag.glsl', () => ({ default: '' }))
vi.mock('../shaders/perlin.vert.glsl', () => ({ default: '' }))

import type { GalaxyData, Movie } from '@/types/galaxy'
import { LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE } from '../focusEmission'
import {
  createFocusPlanetRuntimeVisualAdapter,
  resolveRuntimePlanetVisualState,
} from '../focusPlanetRuntimeVisual'
import { createSelectionPlanet } from '../planet'
import { PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE } from '../productionFocusEmissionProfile'
import { prepareProductionExportPlanet } from '@/planet-export/renderPlanetImage'
import { resolvePlanetVisualConfig } from '@/planet-export/visualConfig'
import {
  createPlanetVisualRendererHandle,
  P39_LEGACY_COMPATIBILITY_PROOF,
  PHASE41_DIAGNOSTIC_MARKER,
  renderPlanetVisualState,
  resolvePlanetVisualState,
  type PlanetVisualAppliedSnapshot,
  type PlanetVisualBloomHandle,
} from './index'

const activeProvenance = {
  ...LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
  profile_id: 'rating-emission-2026-08-cross-entry',
}

const palette = { Drama: '#ff0000', Adventure: '#00ff00', Comedy: '#0000ff' }

const movie = (voteAverage: number, id = 157336): Movie => ({
  id,
  imdb_id: null,
  x: 1,
  y: 2,
  z: 2020,
  size: 4,
  emissive: 0.5,
  genre_color: [0.2, 0.4, 0.8],
  genre_hue: 1.2,
  title: 'Cross-entry fixture',
  original_title: 'Cross-entry fixture',
  overview: 'Parity fixture movie.',
  tagline: null,
  release_date: '2020-01-01',
  genres: ['Drama', 'Adventure'],
  original_language: 'en',
  vote_count: 100,
  vote_average: voteAverage,
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
})

const galaxy = (target: Movie): GalaxyData => ({
  meta: {
    version: 'fixture',
    generated_at: '1970-01-01T00:00:00Z',
    count: 1,
    embedding_model: 'fixture',
    umap_params: { n_neighbors: 1, min_dist: 0, metric: 'cosine', random_state: 42 },
    genre_weight_ratio: 1,
    genre_palette: palette,
    feature_weights: { text: 1, genre: 1, lang: 1 },
    z_range: [0, 1],
    xy_range: { x: [0, 1], y: [0, 1] },
  },
  movies: [target],
})

function createBloomHandle(enabled: boolean): PlanetVisualBloomHandle {
  let params = { enabled, strength: 1, radius: 1, threshold: 10 }
  return {
    applyParams(next) {
      params = { ...next }
    },
    get params() {
      return { ...params }
    },
  }
}

function productionConfig(bloomEnabled: boolean) {
  return resolvePlanetVisualConfig({
    curve: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
    emissionProvenance: activeProvenance,
    emissionSource: 'active',
    bloomEnabled,
  })
}

function parityFields(snapshot: PlanetVisualAppliedSnapshot) {
  return {
    canonicalHashInput: snapshot.canonicalHashInput,
    profileProvenance: snapshot.profileProvenance,
    profileSource: snapshot.profileSource,
    overrideProvenance: snapshot.overrideProvenance,
    emission: snapshot.emission,
    profileEmission: snapshot.profileEmission,
    focus: snapshot.focus,
    lighting: snapshot.lighting,
    noise: snapshot.noise,
    bands: {
      max: snapshot.bands.max,
      areaRatio: snapshot.bands.areaRatio,
      stepHeight: snapshot.bands.stepHeight,
      stepSmoothness: snapshot.bands.stepSmoothness,
      bandCount: snapshot.bands.bandCount,
      cutCount: snapshot.bands.cutCount,
    },
    bloom: snapshot.bloom,
  }
}

function applyRuntimeSnapshot(target: Movie, bloomEnabled: boolean): PlanetVisualAppliedSnapshot {
  const canonicalState = resolveRuntimePlanetVisualState(
    {
      lut: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
      provenance: activeProvenance,
      source: 'active',
    },
    { bloomEnabled },
  )
  const planet = createSelectionPlanet(canonicalState.curve)
  try {
    const adapter = createFocusPlanetRuntimeVisualAdapter({
      canonicalState,
      planet,
      bloom: createBloomHandle(bloomEnabled),
    })
    return adapter.applyMovie(target, palette, 2).appliedSnapshot
  } finally {
    planet.dispose()
  }
}

function applyExporterSnapshot(target: Movie, bloomEnabled: boolean): PlanetVisualAppliedSnapshot {
  const prepared = prepareProductionExportPlanet(
    target,
    galaxy(target).meta,
    'shader',
    2,
    productionConfig(bloomEnabled),
  )
  try {
    return prepared.visualState.appliedSnapshot
  } finally {
    prepared.planet.dispose()
  }
}

describe('cross-entry visual-state parity', () => {
  it('matches runtime and ordinary exporter applied snapshots for one production fixture', () => {
    const target = movie(7.5)
    const runtime = applyRuntimeSnapshot(target, true)
    const exporter = applyExporterSnapshot(target, true)

    expect(parityFields(runtime)).toEqual(parityFields(exporter))
    expect(runtime.emission).not.toBe(runtime.profileEmission)
    expect(runtime.overrideProvenance).toBe('none')
    expect(runtime.diagnosticMarker).toBeUndefined()
  })

  it.each([
    { label: 'low', rating: 4 },
    { label: 'mid', rating: 6 },
    { label: 'high', rating: 10 },
  ] as const)(
    'keeps canonical remapped emission for $label rating across runtime and exporter',
    ({ rating }) => {
      const target = movie(rating)
      const runtime = applyRuntimeSnapshot(target, false)
      const exporter = applyExporterSnapshot(target, false)

      expect(runtime.emission).toBeCloseTo(exporter.emission, 12)
      expect(runtime.profileEmission).toBeCloseTo(exporter.profileEmission, 12)
      expect(runtime.emission).not.toBeCloseTo(runtime.profileEmission, 12)
      expect(runtime.canonicalHashInput).toBe(exporter.canonicalHashInput)
      expect(runtime.profileProvenance).toEqual(exporter.profileProvenance)
    },
  )

  it('shares Bloom on/off composition and parameters across runtime, exporter, and identity', () => {
    const target = movie(8)
    for (const bloomEnabled of [false, true] as const) {
      const runtime = applyRuntimeSnapshot(target, bloomEnabled)
      const exporter = applyExporterSnapshot(target, bloomEnabled)
      const config = productionConfig(bloomEnabled)

      expect(runtime.bloom).toEqual(exporter.bloom)
      expect(runtime.bloom.enabled).toBe(bloomEnabled)
      expect(config.focus.bloom.composition).toBe('pure-bloom-delta-v1')
      expect(runtime.bloom).toEqual({
        enabled: config.bloom.enabled,
        strength: config.bloom.strength,
        radius: config.bloom.radius,
        threshold: config.bloom.threshold,
      })
      expect(runtime.canonicalHashInput).toBe(config.hashInput)
    }

    expect(productionConfig(true).hashInput).not.toBe(productionConfig(false).hashInput)
  })

  it('keeps diagnostic override identity separate from production hash/provenance', () => {
    const production = productionConfig(false)
    const diagnostic = resolvePlanetVisualState({
      curve: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
      emissionProvenance: activeProvenance,
      emissionSource: 'diagnostic-override',
      bloomEnabled: false,
      lightness: 0.4,
      keyLightIntensity: 3,
      flatShadingMix: 0.25,
      direction: [0, 1, 0],
      bloom: { enabled: false, strength: 1, radius: 1, threshold: 10 },
      overrideProvenance: 'phase41-diagnostic-override',
      diagnosticMarker: PHASE41_DIAGNOSTIC_MARKER,
    })

    expect(diagnostic.diagnosticMarker).toBe(PHASE41_DIAGNOSTIC_MARKER)
    expect(diagnostic.overrideProvenance).toBe('phase41-diagnostic-override')
    expect(diagnostic.hashInput).not.toBe(production.hashInput)
    expect(diagnostic.emissionProvenance).toEqual(production.emissionProvenance)

    const target = movie(6.5)
    const planet = createSelectionPlanet(diagnostic.curve)
    try {
      const result = renderPlanetVisualState(
        diagnostic,
        { movie: target, palette, worldRadius: 2 },
        createPlanetVisualRendererHandle(planet, createBloomHandle(false)),
      )
      expect(result.appliedSnapshot.diagnosticMarker).toBe(PHASE41_DIAGNOSTIC_MARKER)
      expect(result.appliedSnapshot.overrideProvenance).toBe('phase41-diagnostic-override')
      expect(result.appliedSnapshot.canonicalHashInput).toBe(diagnostic.hashInput)
      expect(result.appliedSnapshot.canonicalHashInput).not.toBe(production.hashInput)
      expect(result.appliedSnapshot.focus.lightness).toBe(0.4)
      expect(result.appliedSnapshot.lighting.keyLightIntensity).toBe(3)
    } finally {
      planet.dispose()
    }
  })

  it('fails proven legacy identity without the compatibility marker and still applies it through the canonical seam', () => {
    expect(() => resolvePlanetVisualConfig({
      curve: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
      emissionProvenance: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
      emissionSource: 'legacy-fallback',
      bloomEnabled: false,
      emissionDerivation: {
        kind: 'legacy-power',
        modelVersion: 'vote-average-power-clamped-v1',
        exponent: 2,
        intensityMin: 0.06,
        intensityMax: 0.6,
      },
    })).toThrow(/legacy compatibility proof/)

    const legacy = resolvePlanetVisualState({
      curve: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
      emissionProvenance: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
      emissionSource: 'legacy-fallback',
      bloomEnabled: false,
      bloom: { enabled: false, strength: 1, radius: 1, threshold: 10 },
      keyLightIntensity: 0.35,
      emissionDerivation: {
        kind: 'legacy-power',
        modelVersion: 'vote-average-power-clamped-v1',
        exponent: 2,
        intensityMin: 0.06,
        intensityMax: 0.6,
      },
      legacyCompatibility: {
        proof: P39_LEGACY_COMPATIBILITY_PROOF,
        evidenceIdentity: 'p39.11-cross-entry-fixture',
        historicalVisualHash: '{"diagnostic":"p39-cross-entry-v1"}',
      },
    })
    expect(legacy.legacyCompatibility?.proof).toBe(P39_LEGACY_COMPATIBILITY_PROOF)

    const target = movie(5)
    const planet = createSelectionPlanet(legacy.curve)
    try {
      const result = renderPlanetVisualState(
        legacy,
        { movie: target, palette, worldRadius: 2 },
        createPlanetVisualRendererHandle(planet, createBloomHandle(false)),
      )
      expect(result.appliedSnapshot.legacyCompatibility?.proof).toBe(P39_LEGACY_COMPATIBILITY_PROOF)
      expect(result.appliedSnapshot.legacyCompatibility?.evidenceIdentity).toBe('p39.11-cross-entry-fixture')
      expect(result.appliedSnapshot.lighting.keyLightIntensity).toBe(0.35)
    } finally {
      planet.dispose()
    }
  })
})
