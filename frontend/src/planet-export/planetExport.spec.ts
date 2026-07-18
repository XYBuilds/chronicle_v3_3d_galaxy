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
    expect(snapshots[0]!.emission).toBeCloseTo(0.06, 12)
    expect(snapshots[1]!.emission).toBeCloseTo(0.09456, 12)
    expect(snapshots[2]!.emission).toBeCloseTo(0.1275, 12)
    expect(snapshots[3]!.emission).toBeCloseTo(0.6, 12)
    for (const snapshot of snapshots) {
      expect(snapshot.emission_curve).toEqual({
        model_version: PLANET_VISUAL_DEFAULTS.focus.emission.modelVersion,
        exponent: PLANET_VISUAL_DEFAULTS.focus.emission.exponent,
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

  it('routes website Focus, Cover today, and static export through the shared three-argument planet setter', () => {
    expect(sceneSource.match(/planet\.setFromMovie\(movie, meta\.genre_palette, r\)/g)).toHaveLength(1)
    expect(sceneSource.match(/planet\.setFromMovie\(tm, meta\.genre_palette, r\)/g)).toHaveLength(1)
    expect(exportRendererSource).toContain('const planet = createSelectionPlanet()')
    expect(exportRendererSource).toContain('planet.setFromMovie(movie, meta.genre_palette, worldRadius)')

    for (const source of [sceneSource, exportRendererSource]) {
      expect(source).not.toMatch(
        /PLANET_VISUAL_DEFAULTS|focusEmissionIntensityFromVoteAverage|intensity(?:Min|Max)|pipelineVersion|linear_to_srgb/,
      )
      expect(source).not.toMatch(/u(?:EmissionIntensity|KeyLightIntensity|PerlinL|PerlinChroma)\.value\s*=/)
    }
  })

  it('delegates page visual-hash construction to the shared production helper', () => {
    expect(exportPageSource).toContain("import { planetExportVisualConfigInput } from './visualConfig'")
    expect(exportPageSource).toMatch(
      /planetExportVisualConfigInput\(\s*planetVisualConfigHashInput\(\),\s*request\.sizeRoot,\s*\)/,
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
