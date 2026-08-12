import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/three/shaders/perlin.frag.glsl', () => ({ default: '' }))
vi.mock('@/three/shaders/perlin.vert.glsl', () => ({ default: '' }))

import {
  computeExportWorldRadius,
  computeGlobalPlanetRadius,
  computeOrthographicHalfExtent,
  mapMovieSizeForExport,
} from './sizing'
import { findExportMovie, indexGalaxyMovies, parsePlanetExportRequest } from './request'
import {
  capturePlanetRenderDiagnostics,
  positionExportCamera,
  prepareProductionExportPlanet,
} from './renderPlanetImage'
import { planetNoiseSeed } from '@/three/planetAppearance'
import {
  focusEmissionIntensityFromProfile,
  LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
} from '@/three/focusEmission'
import { remapFocusEmissionIntensity } from '@/three/focusEmissionTuning'
import { PLANET_VISUAL_DEFAULTS } from '@/three/planetVisualDefaults'
import { PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE } from '@/three/productionFocusEmissionProfile'
import type { GalaxyData, Movie } from '@/types/galaxy'
import { resolvePlanetVisualConfig } from './visualConfig'

const activeProvenance = {
  ...LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
  profile_id: 'rating-emission-2026-08-exporter-test',
}

const movie = (id: number, size: number, genres: string[]): Movie => ({
  id, size, genres, x: 0, y: 0, z: 0, emissive: 0, genre_color: [1, 1, 1], title: `Movie ${id}`,
  original_title: '', overview: '', tagline: null, release_date: '2000-01-01', original_language: 'en',
  vote_count: 1, vote_average: 5, popularity: 0, imdb_rating: null, imdb_votes: null, runtime: null,
  revenue: 0, budget: 0, production_countries: [], production_companies: [], spoken_languages: [],
  cast: [], director: [], writers: [], producers: [], director_of_photography: [], music_composer: [], poster_url: '', imdb_id: null,
})

const request = (overrides = ''): string =>
  `?movieId=7&dataUrl=https%3A%2F%2Fexample.test%2Fgalaxy_data.json.gz&resolution=300&padding=0.08&bloom=off&renderMode=shader${overrides}`

const galaxy = (movies: Movie[]): GalaxyData => ({
  meta: {
    version: 'fixture', generated_at: '1970-01-01T00:00:00Z', count: movies.length, embedding_model: 'fixture',
    umap_params: { n_neighbors: 1, min_dist: 0, metric: 'cosine', random_state: 42 }, genre_weight_ratio: 1,
    genre_palette: { Drama: '#ffffff', Action: '#ff0000' }, feature_weights: { text: 1, genre: 1, lang: 1 },
    z_range: [0, 1], xy_range: { x: [0, 1], y: [0, 1] },
  }, movies,
})

const productionVisualConfig = (bloomEnabled = false) => resolvePlanetVisualConfig({
  curve: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
  emissionProvenance: activeProvenance,
  emissionSource: 'active',
  bloomEnabled,
})

describe('planet export request and sizing', () => {
  it('rejects diagnostic and historical override parameters on the production request boundary', () => {
    for (const extra of [
      '&p3911KeyLightIntensity=0.5',
      '&p3911EmissionExponent=2.5',
      '&p3911BloomThreshold=0.05',
      '&p3911BloomRadius=0.5',
      '&p3911BloomStrength=0.005',
      '&p3910BloomStrengthZero=1',
      '&diagnostic_only=phase41-visual-diagnostic-v1',
      '&allowLegacyProfile=1',
    ]) {
      expect(() => parsePlanetExportRequest(request(extra))).toThrow(/unknown request parameter/)
    }
  })

  it('strictly validates the explicit shader and basic smoke requests', () => {
    expect(parsePlanetExportRequest(request())).toEqual({
      movieId: 7, dataUrl: 'https://example.test/galaxy_data.json.gz', resolution: 300, padding: 0.08, bloom: false, sizeRoot: 3, renderMode: 'shader',
    })
    expect(parsePlanetExportRequest(request('&sizeRoot=2'))).toMatchObject({ sizeRoot: 2 })
    const basic3000 = parsePlanetExportRequest(
      request('&renderMode=basic')
        .replace('renderMode=shader&renderMode=basic', 'renderMode=basic')
        .replace('resolution=300', 'resolution=3000'),
    )
    expect(basic3000).toMatchObject({ resolution: 3000, bloom: false, renderMode: 'basic' })
    expect(() => parsePlanetExportRequest(request('&bloomStrength=0').replace('bloom=off', 'bloom=on'))).toThrow(/unknown request parameter/)
    expect(() => parsePlanetExportRequest(request('&bloomStrength=-1'))).toThrow(/unknown request parameter/)
    expect(() => parsePlanetExportRequest(request('&bloomStrength=0'))).toThrow(/unknown request parameter/)
    expect(() => parsePlanetExportRequest(request('&bloomStrength=0&bloomStrength=0').replace('bloom=off', 'bloom=on'))).toThrow(/unknown request parameter/)
    expect(() => parsePlanetExportRequest(request('&movieId=8'))).toThrow(/movieId must appear exactly once/)
    expect(() => parsePlanetExportRequest(request('&unknown=x'))).toThrow(/unknown request parameter/)
    expect(() => parsePlanetExportRequest(request().replace('https%3A%2F%2Fexample.test%2Fgalaxy_data.json.gz', 'file%3A%2F%2F%2Fc%3A%2Fdata.json.gz'))).toThrow(/http or https/)
    expect(() => parsePlanetExportRequest(request().replace('galaxy_data.json.gz', 'galaxy.csv'))).toThrow(/\.json/)
    expect(() => parsePlanetExportRequest(request().replace('padding=0.08', 'padding=.1'))).toThrow(/padding/)
    const pointer = encodeURIComponent(JSON.stringify({ profile_id: 'rating-emission-2026-07-a', period: '2026-07', model_version: 'rating-midrank-cdf-lut-v1', curve_sha256: 'a'.repeat(64), source_data_version: 'v1', source_movie_count: 1, status: 'active', activated_at: '2026-07-22T00:00:00.000Z' }))
    const profileRequest = `${request()}&profilePointer=${pointer}&profileUrl=https%3A%2F%2Fexample.test%2Fdata%2Ffocus-emission-profiles%2Frating-emission-2026-07-a.json`
    expect(parsePlanetExportRequest(profileRequest).profilePointer?.profile_id).toBe('rating-emission-2026-07-a')
    for (const invalid of [
      `${request()}&allowLegacyProfile=1`,
      `${request()}&allowLegacyProfile=0`,
      `${request()}&allowLegacyProfile=1&allowLegacyProfile=1`,
    ]) expect(() => parsePlanetExportRequest(invalid)).toThrow(/unknown request parameter allowLegacyProfile/)
    for (const invalid of [
      `${request()}&profilePointer=${pointer}`,
      `${request()}&profileUrl=https%3A%2F%2Fexample.test%2Fdata%2Ffocus-emission-profiles%2Frating-emission-2026-07-a.json`,
      `${request()}&profilePointer=${pointer}&profileUrl=https%3A%2F%2Fuser%3Apass%40example.test%2Fdata%2Ffocus-emission-profiles%2Frating-emission-2026-07-a.json`,
    ]) expect(() => parsePlanetExportRequest(invalid)).toThrow(/profile/)
  })

  it('indexes once and rejects duplicate or absent movie IDs', () => {
    const first = movie(1, 2, ['Drama'])
    const index = indexGalaxyMovies(galaxy([first]))
    expect(findExportMovie(index, 1)).toBe(first)
    expect(() => findExportMovie(index, 2)).toThrow(/not found/)
    expect(() => indexGalaxyMovies(galaxy([first, movie(1, 3, ['Action'])]))).toThrow(/duplicate movieId 1/)
  })

  it('validates shader state before exposing the basic-material fallback', () => {
    const target = movie(7, 2, ['Drama'])
    const data = galaxy([target])
    const shader = prepareProductionExportPlanet(target, data.meta, 'shader', 2, productionVisualConfig())
    const basic = prepareProductionExportPlanet(target, data.meta, 'basic', 2, productionVisualConfig())
    expect(shader.planet.mesh.visible).toBe(true)
    expect(shader.planet.mesh.material).toBe(shader.planet.material)
    expect(basic.planet.mesh.visible).toBe(true)
    expect(basic.planet.mesh.material).toBeInstanceOf(THREE.MeshBasicMaterial)
    expect(basic.visualState.appliedSnapshot.emission).toBe(
      basic.visualState.application.emission.finalIntensity,
    )
    shader.planet.dispose()
    basic.planet.dispose()
  })

  it('keeps the controlled same-profile rating sample monotonic on the production export seam', () => {
    const ratings = [4, 4.5, 5.5, 6.5, 7.5, 8.2, 9.5]
    const emissions = ratings.map((vote_average) => {
      const target = { ...movie(157336, 2, ['Drama']), vote_average }
      const prepared = prepareProductionExportPlanet(
        target,
        galaxy([target]).meta,
        'shader',
        3,
        productionVisualConfig(false),
      )
      const emission = prepared.visualState.appliedSnapshot.emission
      prepared.planet.dispose()
      return emission
    })
    expect(emissions).toEqual(ratings.map((rating) =>
      remapFocusEmissionIntensity(
        focusEmissionIntensityFromProfile(rating, PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE),
        PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
        PLANET_VISUAL_DEFAULTS.focus.emissionTuning,
      ),
    ))
    emissions.slice(1).forEach((value, index) => expect(value).toBeGreaterThan(emissions[index]!))
  })

  it('captures renderer-owned diagnostics while rating changes only emission', () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.01, 40)
    positionExportCamera(camera, 10)
    const snapshots = [0, 4, 5, 10].map((vote_average) => {
      const target = { ...movie(157336, 2, ['Drama']), vote_average }
      const prepared = prepareProductionExportPlanet(
        target,
        galaxy([target]).meta,
        'shader',
        3,
        productionVisualConfig(false),
      )
      const diagnostics = capturePlanetRenderDiagnostics(target, prepared.planet, camera, {
        sizeRoot: 3,
        padding: 0.08,
        visualConfig: productionVisualConfig(false),
        appliedVisualState: prepared.visualState,
      })
      prepared.planet.dispose()
      return diagnostics
    })

    expect(snapshots.map((snapshot) => snapshot.rating)).toEqual([0, 4, 5, 10])
    expect(snapshots.map((snapshot) => snapshot.emission)).toEqual([0, 4, 5, 10].map((rating) =>
      remapFocusEmissionIntensity(
        focusEmissionIntensityFromProfile(rating, PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE),
        PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
        PLANET_VISUAL_DEFAULTS.focus.emissionTuning,
      ),
    ))
    expect(snapshots[0]!.emission).toBe(0.005)
    expect(snapshots[3]!.emission).toBe(0.66)
    expect(snapshots[2]!.emission).toBeGreaterThan(snapshots[1]!.emission)
    for (const snapshot of snapshots) {
      expect(snapshot.emission_curve).toEqual({
        model_version: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE.modelVersion,
        rating_min: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE.ratingMin,
        rating_max: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE.ratingMax,
        sample_step: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE.sampleStep,
        sample_count: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE.samples.length,
        intensity_min: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE.intensityMin,
        intensity_max: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE.intensityMax,
      })
      expect(snapshot.fixed_lightness).toBe(PLANET_VISUAL_DEFAULTS.focus.lightness)
      expect(snapshot.fixed_chroma).toBe(PLANET_VISUAL_DEFAULTS.focus.chroma)
      expect(snapshot.key_light).toMatchObject({
        enabled: PLANET_VISUAL_DEFAULTS.lighting.enabled,
        intensity: PLANET_VISUAL_DEFAULTS.lighting.keyLightIntensity,
        flat_shading_mix: PLANET_VISUAL_DEFAULTS.lighting.flatShadingMix,
      })
      for (const [index, value] of snapshot.key_light.direction.entries()) {
        expect(value).toBeCloseTo(PLANET_VISUAL_DEFAULTS.lighting.direction[index]!, 3)
      }
      expect(snapshot.noise).toEqual({
        seed: planetNoiseSeed(157336),
        scale: PLANET_VISUAL_DEFAULTS.noise.scale,
        octaves: PLANET_VISUAL_DEFAULTS.noise.octaves,
        persistence: PLANET_VISUAL_DEFAULTS.noise.persistence,
      })
      expect(snapshot.camera).toMatchObject({
        projection: 'orthographic', position: [0, 0, -20], direction: [0, 0, 1],
        left: -10, right: 10, top: 10, bottom: -10, near: 0.01, far: 40,
      })
    }
    expect(snapshots.map((snapshot) => snapshot.rotation)).toEqual([
      snapshots[0]!.rotation,
      snapshots[0]!.rotation,
      snapshots[0]!.rotation,
      snapshots[0]!.rotation,
    ])
  })

  it('records the actual offline Bloom override without changing production defaults', () => {
    const target = movie(157336, 2, ['Drama'])
    const config = resolvePlanetVisualConfig({
      curve: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
      emissionProvenance: activeProvenance,
      emissionSource: 'active',
      bloomEnabled: true,
      bloom: {
        enabled: true,
        strength: 0,
        radius: 1,
        threshold: 0,
      },
    })
    const prepared = prepareProductionExportPlanet(target, galaxy([target]).meta, 'shader', 3, config)
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.01, 40)
    positionExportCamera(camera, 10)
    const diagnostics = capturePlanetRenderDiagnostics(target, prepared.planet, camera, {
      sizeRoot: 3,
      padding: 0.08,
      bloom: true,
      visualConfig: config,
      appliedVisualState: prepared.visualState,
    })
    expect(diagnostics.bloom).toEqual({
      enabled: true,
      composition: 'pure-bloom-delta-v1',
      strength: 0,
      radius: 1,
      threshold: 0,
    })
    prepared.planet.dispose()
  })

  it('fails fast when renderer-owned diagnostics contain invalid state', () => {
    const target = movie(157336, 2, ['Drama'])
    const config = productionVisualConfig(false)
    const prepared = prepareProductionExportPlanet(target, galaxy([target]).meta, 'shader', 3, config)
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.01, 40)
    positionExportCamera(camera, 10)

    prepared.planet.material.uniforms.uLightingEnabled.value = 2
    expect(() => capturePlanetRenderDiagnostics(
      target,
      prepared.planet,
      camera,
      { sizeRoot: 3, padding: 0.08, visualConfig: config, appliedVisualState: prepared.visualState },
    )).toThrow(/changed after canonical visual application|lighting enabled must be 0 or 1/)

    prepared.planet.material.uniforms.uLightingEnabled.value = 1
    prepared.planet.material.uniforms.uOctaves.value = 0
    expect(() => capturePlanetRenderDiagnostics(
      target,
      prepared.planet,
      camera,
      { sizeRoot: 3, padding: 0.08 },
    )).toThrow('noise octaves must be a positive integer')

    prepared.planet.material.uniforms.uOctaves.value = PLANET_VISUAL_DEFAULTS.noise.octaves
    prepared.planet.lastRadius = prepared.planet.mesh.scale.x / 2
    expect(() => capturePlanetRenderDiagnostics(
      target,
      prepared.planet,
      camera,
      { sizeRoot: 3, padding: 0.08 },
    )).toThrow('outer radius must cover world radius')

    prepared.planet.dispose()
  })

  it.each([4, 6, 10])(
    'applies profile lookup followed by production tuning at rating %s',
    (vote_average) => {
      const target = { ...movie(157336, 2, ['Drama']), vote_average }
      const config = productionVisualConfig(false)
      const prepared = prepareProductionExportPlanet(target, galaxy([target]).meta, 'shader', 3, config)
      try {
        const profileEmission = focusEmissionIntensityFromProfile(vote_average, config.curve)
        const expectedEmission = remapFocusEmissionIntensity(
          profileEmission,
          config.curve,
          config.focus.emissionTuning,
        )
        const snapshot = prepared.rendererHandle.readAppliedState()

        expect(snapshot.profileEmission).toBeCloseTo(profileEmission, 12)
        expect(snapshot.emission).toBeCloseTo(expectedEmission, 12)
        expect(snapshot.emission).not.toBeCloseTo(profileEmission, 12)
        expect(snapshot).toMatchObject({
          canonicalHashInput: config.hashInput,
          profileProvenance: activeProvenance,
          profileSource: 'active',
          movieId: target.id,
          focus: {
            lightness: config.focus.lightness,
            chroma: config.focus.chroma,
          },
          lighting: {
            enabled: config.lighting.enabled,
            keyLightIntensity: config.lighting.keyLightIntensity,
            flatShadingMix: config.lighting.flatShadingMix,
          },
          noise: config.noise,
          bloom: config.bloom,
        })
      } finally {
        prepared.planet.dispose()
      }
    },
  )

  it('builds diagnostics from the final canonical renderer snapshot and rejects later overrides', () => {
    const target = { ...movie(157336, 2, ['Drama']), vote_average: 6 }
    const config = productionVisualConfig(true)
    const prepared = prepareProductionExportPlanet(target, galaxy([target]).meta, 'shader', 3, config)
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.01, 40)
    positionExportCamera(camera, 10)
    try {
      const diagnostics = capturePlanetRenderDiagnostics(target, prepared.planet, camera, {
        sizeRoot: 3,
        padding: 0.08,
        bloom: true,
        visualConfig: config,
        appliedVisualState: prepared.visualState,
      })

      expect(diagnostics.visual_config_payload).toBe(config.payload)
      expect(diagnostics.visual_config_hash_input).toBe(config.hashInput)
      expect(diagnostics.profile_provenance).toEqual({ ...activeProvenance, source: 'active' })
      expect(diagnostics.renderer_snapshot).toBe(prepared.visualState.appliedSnapshot)
      expect(diagnostics.emission).toBe(prepared.visualState.appliedSnapshot.emission)
      expect(diagnostics.bloom).toEqual({
        ...prepared.visualState.appliedSnapshot.bloom,
        composition: 'pure-bloom-delta-v1',
      })
      expect(diagnostics.key_light).toMatchObject({
        enabled: prepared.visualState.appliedSnapshot.lighting.enabled,
        direction: prepared.visualState.appliedSnapshot.lighting.direction,
        intensity: prepared.visualState.appliedSnapshot.lighting.keyLightIntensity,
        flat_shading_mix: prepared.visualState.appliedSnapshot.lighting.flatShadingMix,
      })

      prepared.planet.material.uniforms.uEmissionIntensity.value =
        focusEmissionIntensityFromProfile(target.vote_average, config.curve)
      expect(() => capturePlanetRenderDiagnostics(target, prepared.planet, camera, {
        sizeRoot: 3,
        padding: 0.08,
        bloom: true,
        visualConfig: config,
        appliedVisualState: prepared.visualState,
      })).toThrow(/changed after canonical visual application/)
    } finally {
      prepared.planet.dispose()
    }
  })

  it('uses the in-app default focus view from world -Z', () => {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100)
    positionExportCamera(camera, 10)

    expect(camera.position.toArray()).toEqual([0, 0, -20])
    const direction = camera.getWorldDirection(new THREE.Vector3())
    expect(direction.x).toBeCloseTo(0, 10)
    expect(direction.y).toBeCloseTo(0, 10)
    expect(direction.z).toBeCloseTo(1, 10)
  })

  it('supports square, cube, and fourth-root export mappings while reserving terrace growth in the camera extent', () => {
    const movies = [movie(1, 4, ['Drama']), movie(2, 81, ['Drama', 'Action'])]
    const scale = PLANET_VISUAL_DEFAULTS.activeShell.sizeScale * PLANET_VISUAL_DEFAULTS.activeShell.activeSizeMultiplier
    expect(mapMovieSizeForExport(81, 2)).toBe(9)
    expect(mapMovieSizeForExport(81, 3)).toBeCloseTo(4.3267487109, 10)
    expect(mapMovieSizeForExport(81, 4)).toBe(3)
    expect(computeExportWorldRadius(movies[1]!, 4)).toBeCloseTo(3 * scale, 10)
    expect(computeGlobalPlanetRadius(movies, 4)).toBeCloseTo(3 * scale * 1.03)
    expect(computeOrthographicHalfExtent(10, 0.08)).toBeCloseTo(10 / 0.92)
    expect(() => mapMovieSizeForExport(-1, 2)).toThrow(/movie\.size/)
    expect(() => computeGlobalPlanetRadius([], 2)).toThrow(/empty movie list/)
  })
})
