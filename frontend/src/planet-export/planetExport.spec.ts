import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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
import { capturePlanetRenderDiagnostics, positionExportCamera, prepareExportPlanet } from './renderPlanetImage'
import { assertP3911CheckpointAKeyLightIntensity, parseP3911CheckpointARequest } from './p3911CheckpointADiagnostics'
import {
  P3911_CHECKPOINT_B,
  p3911CheckpointBEmissionForRating,
  p3911CheckpointBVisualConfigInput,
  parseP3911CheckpointBRequest,
} from './p3911CheckpointBDiagnostics'
import {
  P3911_CHECKPOINT_C_THRESHOLD,
  assertP3911CheckpointCThresholdProductionContract,
  p3911CheckpointCThresholdBloomParams,
  p3911CheckpointCThresholdVisualConfigInput,
  parseP3911CheckpointCThresholdRequest,
} from './p3911CheckpointCThresholdDiagnostics'
import {
  P3911_CHECKPOINT_C_RADIUS,
  assertP3911CheckpointCRadiusProductionContract,
  p3911CheckpointCRadiusBloomParams,
  p3911CheckpointCRadiusVisualConfigInput,
  parseP3911CheckpointCRadiusRequest,
} from './p3911CheckpointCRadiusDiagnostics'
import {
  P3911_CHECKPOINT_C_STRENGTH,
  assertP3911CheckpointCStrengthProductionContract,
  p3911CheckpointCStrengthBloomParams,
  p3911CheckpointCStrengthVisualConfigInput,
  parseP3911CheckpointCStrengthRequest,
} from './p3911CheckpointCStrengthDiagnostics'
import { planetNoiseSeed } from '@/three/planetAppearance'
import { PLANET_VISUAL_DEFAULTS } from '@/three/planetVisualDefaults'
import type { GalaxyData, Movie } from '@/types/galaxy'

const sceneSource = readFileSync(fileURLToPath(new URL('../three/scene.ts', import.meta.url)), 'utf8')
const exportRendererSource = readFileSync(fileURLToPath(new URL('./renderPlanetImage.ts', import.meta.url)), 'utf8')
const exportPageSource = readFileSync(fileURLToPath(new URL('./main.ts', import.meta.url)), 'utf8')

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

describe('planet export request and sizing', () => {
  it('keeps Key overrides out of normal export requests and rejects invalid offline values', () => {
    expect(() => parsePlanetExportRequest(request('&p3911KeyLightIntensity=0.5'))).toThrow(/unknown request parameter/)
    expect(parseP3911CheckpointARequest(request('&p3911KeyLightIntensity=0.5').replace('movieId=7', 'movieId=157336'))).toMatchObject({ keyLightIntensity: 0.5, bloom: false, renderMode: 'shader' })
    expect(() => parseP3911CheckpointARequest(request('&p3911KeyLightIntensity=0.6').replace('movieId=7', 'movieId=157336'))).toThrow(/not a Checkpoint A candidate/)
    expect(() => assertP3911CheckpointAKeyLightIntensity(Number.NaN)).toThrow(/finite and non-negative/)
    expect(() => assertP3911CheckpointAKeyLightIntensity(-0.01)).toThrow(/finite and non-negative/)
  })

  it('keeps B exponent overrides exclusively at the strict offline boundary', () => {
    const bRequest = request('&p3911EmissionExponent=2.5').replace('movieId=7', 'movieId=157336')
    expect(() => parsePlanetExportRequest(bRequest)).toThrow(/unknown request parameter/)
    expect(parseP3911CheckpointBRequest(bRequest)).toMatchObject({ emissionExponent: 2.5, bloom: false, renderMode: 'shader' })
    for (const invalid of ['', 'null', 'NaN', 'Infinity', '0', '-1', '2.6', '3.4']) {
      expect(() => parseP3911CheckpointBRequest(request(`&p3911EmissionExponent=${invalid}`).replace('movieId=7', 'movieId=157336'))).toThrow(/p3911EmissionExponent|not a Checkpoint B candidate/)
    }
    expect(() => parseP3911CheckpointBRequest(request('&p3911EmissionExponent=2&p3911EmissionExponent=2.5').replace('movieId=7', 'movieId=157336'))).toThrow(/exactly once/)
  })

  it('models B candidates offline while retaining the selected production exponent', () => {
    expect(P3911_CHECKPOINT_B.emissionExponentCandidates).toEqual([3, 2.5, 2])
    expect(p3911CheckpointBEmissionForRating(0, 3)).toBe(0.06)
    expect(p3911CheckpointBEmissionForRating(0, 2.5)).toBe(0.06)
    expect(p3911CheckpointBEmissionForRating(0, 2)).toBe(0.06)
    expect(p3911CheckpointBEmissionForRating(5, 3)).toBeCloseTo(0.1275, 12)
    expect(p3911CheckpointBEmissionForRating(5, 2.5)).toBeCloseTo(0.15545941546, 10)
    expect(p3911CheckpointBEmissionForRating(5, 2)).toBeCloseTo(0.195, 12)
    const production = JSON.stringify(PLANET_VISUAL_DEFAULTS)
    const hashes = P3911_CHECKPOINT_B.emissionExponentCandidates.map((exponent) => p3911CheckpointBVisualConfigInput(production, exponent))
    expect(new Set(hashes).size).toBe(3)
    expect(PLANET_VISUAL_DEFAULTS.focus.emission.modelVersion).toBe('vote-average-anchored-smoothstep-v1')
  })

  it('keeps C1 threshold overrides at a strict Bloom-ON-only offline boundary', () => {
    const cRequest = request('&p3911BloomThreshold=0.05').replace('bloom=off', 'bloom=on').replace('movieId=7', 'movieId=157336')
    expect(() => parsePlanetExportRequest(cRequest)).toThrow(/unknown request parameter/)
    expect(parseP3911CheckpointCThresholdRequest(cRequest)).toMatchObject({ bloom: true, renderMode: 'shader', bloomThreshold: 0.05 })
    for (const invalid of ['', 'null', 'NaN', 'Infinity', '-1', '0.01', '0.2']) {
      expect(() => parseP3911CheckpointCThresholdRequest(request(`&p3911BloomThreshold=${invalid}`).replace('bloom=off', 'bloom=on').replace('movieId=7', 'movieId=157336'))).toThrow(/p3911BloomThreshold|not a Checkpoint C1 candidate/)
    }
    expect(() => parseP3911CheckpointCThresholdRequest(cRequest.replace('p3911BloomThreshold=0.05', 'p3911BloomThreshold=0&p3911BloomThreshold=0.05'))).toThrow(/exactly once/)
    expect(P3911_CHECKPOINT_C_THRESHOLD.thresholdCandidates).toEqual([0, 0.05, 0.1])
    expect(() => assertP3911CheckpointCThresholdProductionContract()).not.toThrow()
    expect(p3911CheckpointCThresholdBloomParams(0.1)).toEqual({ enabled: true, strength: 0.005, radius: 1, threshold: 0.1 })
    const production = JSON.stringify(PLANET_VISUAL_DEFAULTS)
    const hashes = P3911_CHECKPOINT_C_THRESHOLD.thresholdCandidates.map((threshold) => p3911CheckpointCThresholdVisualConfigInput(production, threshold))
    expect(new Set(hashes).size).toBe(3)
  })

  it('keeps C2 radius overrides at a strict Bloom-ON-only offline boundary', () => {
    const cRequest = request('&p3911BloomRadius=0.5').replace('bloom=off', 'bloom=on').replace('movieId=7', 'movieId=157336')
    expect(() => parsePlanetExportRequest(cRequest)).toThrow(/unknown request parameter/)
    expect(parseP3911CheckpointCRadiusRequest(cRequest)).toMatchObject({ bloom: true, renderMode: 'shader', bloomRadius: 0.5 })
    expect(parseP3911CheckpointCRadiusRequest(cRequest.replace('p3911BloomRadius=0.5', 'p3911BloomRadius=1'))).toMatchObject({ bloomRadius: 1 })
    for (const invalid of ['', 'null', 'NaN', 'Infinity', '-1', '0.01', '0.2', '0.6', '2']) {
      expect(() => parseP3911CheckpointCRadiusRequest(request(`&p3911BloomRadius=${invalid}`).replace('bloom=off', 'bloom=on').replace('movieId=7', 'movieId=157336'))).toThrow(/p3911BloomRadius|not a Checkpoint C2 candidate/)
    }
    expect(() => parseP3911CheckpointCRadiusRequest(cRequest.replace('p3911BloomRadius=0.5', 'p3911BloomRadius=0&p3911BloomRadius=0.5'))).toThrow(/exactly once/)
    expect(P3911_CHECKPOINT_C_RADIUS.radiusCandidates).toEqual([0, 0.5, 1])
    expect(() => assertP3911CheckpointCRadiusProductionContract()).not.toThrow()
    expect(p3911CheckpointCRadiusBloomParams(0.5)).toEqual({ enabled: true, strength: 0.005, radius: 0.5, threshold: 0 })
    const production = JSON.stringify(PLANET_VISUAL_DEFAULTS)
    const hashes = P3911_CHECKPOINT_C_RADIUS.radiusCandidates.map((radius) => p3911CheckpointCRadiusVisualConfigInput(production, radius))
    expect(new Set(hashes).size).toBe(3)
  })

  it('keeps C3 strength overrides at a strict Bloom-ON-only offline boundary', () => {
    const cRequest = request('&p3911BloomStrength=0.005').replace('bloom=off', 'bloom=on').replace('movieId=7', 'movieId=157336')
    expect(() => parsePlanetExportRequest(cRequest)).toThrow(/unknown request parameter/)
    expect(parseP3911CheckpointCStrengthRequest(cRequest)).toMatchObject({ bloom: true, renderMode: 'shader', bloomStrength: 0.005 })
    expect(parseP3911CheckpointCStrengthRequest(cRequest.replace('p3911BloomStrength=0.005', 'p3911BloomStrength=0.01'))).toMatchObject({ bloomStrength: 0.01 })
    for (const invalid of ['', 'null', 'NaN', 'Infinity', '-1', '0', '0.001', '0.003', '0.02']) {
      expect(() => parseP3911CheckpointCStrengthRequest(request(`&p3911BloomStrength=${invalid}`).replace('bloom=off', 'bloom=on').replace('movieId=7', 'movieId=157336'))).toThrow(/p3911BloomStrength|not a Checkpoint C3 candidate/)
    }
    expect(() => parseP3911CheckpointCStrengthRequest(cRequest.replace('p3911BloomStrength=0.005', 'p3911BloomStrength=0.0025&p3911BloomStrength=0.005'))).toThrow(/exactly once/)
    expect(P3911_CHECKPOINT_C_STRENGTH.strengthCandidates).toEqual([0.0025, 0.005, 0.01])
    expect(() => assertP3911CheckpointCStrengthProductionContract()).not.toThrow()
    expect(p3911CheckpointCStrengthBloomParams(0.005)).toEqual({ enabled: true, strength: 0.005, radius: 1, threshold: 0 })
    expect(p3911CheckpointCStrengthBloomParams(0.01)).toEqual({ enabled: true, strength: 0.01, radius: 1, threshold: 0 })
    const production = JSON.stringify(PLANET_VISUAL_DEFAULTS)
    const hashes = P3911_CHECKPOINT_C_STRENGTH.strengthCandidates.map((strength) => p3911CheckpointCStrengthVisualConfigInput(production, strength))
    expect(new Set(hashes).size).toBe(3)
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
    expect(() => parsePlanetExportRequest(request().replace('bloom=off', 'bloom=on').replace('renderMode=shader', 'renderMode=basic'))).toThrow(/basic renderMode requires bloom=off/)
  })

  it('indexes once and rejects duplicate or absent movie IDs', () => {
    const first = movie(1, 2, ['Drama'])
    const index = indexGalaxyMovies(galaxy([first]))
    expect(findExportMovie(index, 1)).toBe(first)
    expect(() => findExportMovie(index, 2)).toThrow(/not found/)
    expect(() => indexGalaxyMovies(galaxy([first, movie(1, 3, ['Action'])]))).toThrow(/duplicate movieId 1/)
  })

  it('selects an explicitly visible basic or shader material path', () => {
    const target = movie(7, 2, ['Drama'])
    const data = galaxy([target])
    const shader = prepareExportPlanet(target, data.meta, 'shader', 2)
    const basic = prepareExportPlanet(target, data.meta, 'basic', 2)
    expect(shader.mesh.visible).toBe(true)
    expect(shader.mesh.material).toBe(shader.material)
    expect(basic.mesh.visible).toBe(true)
    expect(basic.mesh.material).toBeInstanceOf(THREE.MeshBasicMaterial)
    shader.dispose()
    basic.dispose()
  })

  it('captures renderer-owned P39 diagnostics while rating changes only emission', () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.01, 40)
    positionExportCamera(camera, 10)
    const snapshots = [0, 4, 5, 10].map((vote_average) => {
      const target = { ...movie(157336, 2, ['Drama']), vote_average }
      const handle = prepareExportPlanet(target, galaxy([target]).meta, 'shader', 3)
      const diagnostics = capturePlanetRenderDiagnostics(target, handle, camera, { sizeRoot: 3, padding: 0.08 })
      handle.dispose()
      return diagnostics
    })

    expect(snapshots.map((snapshot) => snapshot.rating)).toEqual([0, 4, 5, 10])
    expect(snapshots[0]!.emission).toBeCloseTo(0.005, 12)
    expect(snapshots[3]!.emission).toBeCloseTo(0.65, 12)
    expect(snapshots[1]!.emission).toBe(0.005)
    expect(snapshots[2]!.emission).toBeGreaterThan(snapshots[1]!.emission)
    for (const snapshot of snapshots) {
      expect(snapshot.emission_curve).toEqual({
        model_version: PLANET_VISUAL_DEFAULTS.focus.emission.modelVersion,
        rating_low_anchor: PLANET_VISUAL_DEFAULTS.focus.emission.ratingLowAnchor,
        rating_high_anchor: PLANET_VISUAL_DEFAULTS.focus.emission.ratingHighAnchor,
        intensity_min: PLANET_VISUAL_DEFAULTS.focus.emission.intensityMin,
        intensity_max: PLANET_VISUAL_DEFAULTS.focus.emission.intensityMax,
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
    const handle = prepareExportPlanet(target, galaxy([target]).meta, 'shader', 3)
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.01, 40)
    positionExportCamera(camera, 10)
    const diagnostics = capturePlanetRenderDiagnostics(target, handle, camera, {
      sizeRoot: 3,
      padding: 0.08,
      bloom: true,
      bloomParamsOverride: {
        enabled: true,
        strength: 0,
        radius: 1,
        threshold: 0,
      },
    })
    expect(diagnostics.bloom).toEqual({
      enabled: true,
      composition: 'pure-bloom-delta-v1',
      strength: 0,
      radius: 1,
      threshold: 0,
    })
    handle.dispose()
  })

  it('fails fast when renderer-owned diagnostics contain invalid state', () => {
    const target = movie(157336, 2, ['Drama'])
    const handle = prepareExportPlanet(target, galaxy([target]).meta, 'shader', 3)
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.01, 40)
    positionExportCamera(camera, 10)

    handle.material.uniforms.uLightingEnabled.value = 2
    expect(() => capturePlanetRenderDiagnostics(
      target,
      handle,
      camera,
      { sizeRoot: 3, padding: 0.08 },
    )).toThrow('lighting enabled must be 0 or 1')

    handle.material.uniforms.uLightingEnabled.value = 1
    handle.material.uniforms.uOctaves.value = 0
    expect(() => capturePlanetRenderDiagnostics(
      target,
      handle,
      camera,
      { sizeRoot: 3, padding: 0.08 },
    )).toThrow('noise octaves must be a positive integer')

    handle.material.uniforms.uOctaves.value = PLANET_VISUAL_DEFAULTS.noise.octaves
    handle.lastRadius = handle.mesh.scale.x / 2
    expect(() => capturePlanetRenderDiagnostics(
      target,
      handle,
      camera,
      { sizeRoot: 3, padding: 0.08 },
    )).toThrow('outer radius must cover world radius')

    handle.dispose()
  })

  it('routes website focus and static export through the shared three-argument planet setter', () => {
    expect(sceneSource.match(/planet\.setFromMovie\(movie, meta\.genre_palette, r\)/g)).toHaveLength(1)
    expect(sceneSource).toMatch(/perlinBloom\.renderFrame\(\{/)
    expect(sceneSource).not.toContain('perlinBloom.renderFrame(renderer, scene, camera')
    expect(exportRendererSource).toContain("from '@/three/perlinBloomContract'")
    expect(exportRendererSource).toContain('withCameraLayer(camera, PERLIN_BLOOM_LAYER')
    expect(exportRendererSource).toContain('const delta = createPerlinBloomDeltaCompositor(renderer, scene, camera)')
    expect(exportRendererSource).toContain('delta.renderDelta()')
    expect(exportRendererSource).toContain('delta.compositeDelta()')
    expect(exportRendererSource).not.toMatch(/new (EffectComposer|RenderPass|UnrealBloomPass)\(/)
    expect(exportRendererSource).toContain('composition: PERLIN_BLOOM_COMPOSITION')

    expect(exportRendererSource).toContain('export function renderPlanetImage(options: PlanetRenderOptions): PlanetRenderResult')
    expect(exportRendererSource).toContain('export function renderPhase41DiagnosticPlanetImage(options: Phase41DiagnosticPlanetRenderOptions)')
    expect(exportRendererSource).toContain('diagnostic_only !== PHASE41_DIAGNOSTIC_MARKER')
  })

  it('delegates page visual-hash construction to the shared production helper', () => {
    expect(exportPageSource).toContain("import { planetExportVisualConfigInput } from './visualConfig'")
    expect(exportPageSource).toMatch(
      /planetExportVisualConfigInput\(\s*planetVisualConfigHashInput\(\),\s*request\.sizeRoot\s*\)/,
    )
    expect(exportPageSource).toContain('document.body.dataset.visualDiagnostics = JSON.stringify(result.diagnostics)')
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
