import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/three/shaders/perlin.frag.glsl', () => ({ default: '' }))
vi.mock('@/three/shaders/perlin.vert.glsl', () => ({ default: '' }))

import { computeGlobalPlanetRadius, computeOrthographicHalfExtent } from './sizing'
import { findExportMovie, indexGalaxyMovies, parsePlanetExportRequest } from './request'
import { prepareExportPlanet } from './renderPlanetImage'
import { PLANET_VISUAL_DEFAULTS } from '@/three/planetVisualDefaults'
import type { GalaxyData, Movie } from '@/types/galaxy'

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
      movieId: 7, dataUrl: 'https://example.test/galaxy_data.json.gz', resolution: 300, padding: 0.08, bloom: false, renderMode: 'shader',
    })
    expect(parsePlanetExportRequest(request('&renderMode=basic').replace('renderMode=shader&renderMode=basic', 'renderMode=basic'))).toMatchObject({ renderMode: 'basic' })
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
    const shader = prepareExportPlanet(target, data.meta, 'shader')
    const basic = prepareExportPlanet(target, data.meta, 'basic')
    expect(shader.mesh.visible).toBe(true)
    expect(shader.mesh.material).toBe(shader.material)
    expect(basic.mesh.visible).toBe(true)
    expect(basic.mesh.material).toBeInstanceOf(THREE.MeshBasicMaterial)
    shader.dispose()
    basic.dispose()
  })

  it('uses shared sizing defaults for the largest actual radius and fixed padding', () => {
    const movies = [movie(1, 2, ['Drama']), movie(2, 5, ['Drama', 'Action'])]
    expect(computeGlobalPlanetRadius(movies)).toBeCloseTo(5 * PLANET_VISUAL_DEFAULTS.activeShell.sizeScale * PLANET_VISUAL_DEFAULTS.activeShell.activeSizeMultiplier * 1.03)
    expect(computeOrthographicHalfExtent(10, 0.08)).toBeCloseTo(10 / 0.92)
    expect(() => computeGlobalPlanetRadius([])).toThrow(/empty movie list/)
  })
})
