import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import type { Movie } from '@/types/galaxy'

import { createConstellation } from './constellation'

function stubMovie(p: { id: number; release_date: string; x: number; y?: number; z?: number }): Movie {
  return {
    id: p.id,
    release_date: p.release_date,
    x: p.x,
    y: p.y ?? 0,
    z: p.z ?? 0,
    size: 1,
    emissive: 0.5,
    genre_color: [0.5, 0.5, 0.5],
    title: '',
    original_title: '',
    overview: '',
    tagline: null,
    genres: [],
    original_language: 'en',
    vote_count: 1,
    vote_average: 5,
    popularity: 0,
    imdb_rating: null,
    imdb_votes: null,
    runtime: null,
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
    imdb_id: null,
  }
}

describe('createConstellation (P12.7)', () => {
  it('merges director+dop+writers+music into one crew line; cast and producers each one line', () => {
    const h = createConstellation(32)
    const map = new Map<number, Movie>([
      [1, stubMovie({ id: 1, release_date: '2000-01-01', x: 0 })],
      [2, stubMovie({ id: 2, release_date: '2010-01-01', x: 10 })],
      [3, stubMovie({ id: 3, release_date: '2005-01-01', x: 5 })],
    ])
    h.sync({
      visible: true,
      movieById: map,
      selectionIds: [1, 2, 3],
      movieRoles: {
        '1': 1,
        '2': 2,
        '3': 3,
      },
    })
    expect(h.mesh.visible).toBe(true)
    const pos = (h.mesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
    const geom = h.mesh.geometry
    const count = geom.drawRange.count
    expect(count).toBe(4)
    // LINE_GROUPS order: producers → crew → cast; only crew + cast emit here
    expect(pos[0]).toBe(5)
    expect(pos[3]).toBe(10)
    expect(pos[6]).toBe(0)
    expect(pos[9]).toBe(5)
    h.dispose()
  })
})
