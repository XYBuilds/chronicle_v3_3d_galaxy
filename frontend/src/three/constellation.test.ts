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

function lineSegmentsAt(group: THREE.Group, index: number): THREE.LineSegments {
  return group.children[index] as THREE.LineSegments
}

describe('createConstellation (P12.7 / P22.6)', () => {
  it('merges director+dop+writers+music into one crew line; cast and producers each one line', () => {
    const h = createConstellation(32)
    const map = new Map<number, Movie>([
      [1, stubMovie({ id: 1, release_date: '2000-01-01', x: 0 })],
      [2, stubMovie({ id: 2, release_date: '2010-01-01', x: 10 })],
      [3, stubMovie({ id: 3, release_date: '2005-01-01', x: 5 })],
    ])
    h.sync({
      visible: true,
      hasFilmFocus: false,
      movieById: map,
      selectionIds: [1, 2, 3],
      movieRoles: {
        '1': 1,
        '2': 2,
        '3': 3,
      },
      surfaceGapWorld: 0,
      getActiveWorldRadius: () => 0,
    })
    expect(h.group.visible).toBe(true)
    const crew = lineSegmentsAt(h.group, 1)
    const cast = lineSegmentsAt(h.group, 2)
    const producers = lineSegmentsAt(h.group, 0)
    const posCrew = (crew.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
    const posCast = (cast.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
    expect(crew.geometry.drawRange.count).toBe(2)
    expect(cast.geometry.drawRange.count).toBe(2)
    expect(producers.geometry.drawRange.count).toBe(0)
    expect(producers.visible).toBe(false)
    // CHAIN_ORDER: producers → crew → cast; only crew + cast emit here
    expect(posCrew[0]).toBe(5)
    expect(posCrew[3]).toBe(10)
    expect(posCast[0]).toBe(0)
    expect(posCast[3]).toBe(5)
    h.dispose()
  })

  it('hides lines while a film is in focus', () => {
    const h = createConstellation(32)
    const map = new Map<number, Movie>([
      [1, stubMovie({ id: 1, release_date: '2000-01-01', x: 0 })],
      [2, stubMovie({ id: 2, release_date: '2010-01-01', x: 10 })],
    ])
    h.sync({
      visible: true,
      hasFilmFocus: true,
      movieById: map,
      selectionIds: [1, 2],
      movieRoles: { '1': 1, '2': 1 },
      surfaceGapWorld: 0,
      getActiveWorldRadius: () => 0,
    })
    expect(h.group.visible).toBe(false)
    h.dispose()
  })

  it('pulls segment ends outward by active radius + gap', () => {
    const h = createConstellation(32)
    const map = new Map<number, Movie>([
      [1, stubMovie({ id: 1, release_date: '2000-01-01', x: 0 })],
      [2, stubMovie({ id: 2, release_date: '2001-01-01', x: 10 })],
    ])
    h.sync({
      visible: true,
      hasFilmFocus: false,
      movieById: map,
      selectionIds: [1, 2],
      movieRoles: { '1': 1, '2': 1 },
      surfaceGapWorld: 0.1,
      getActiveWorldRadius: () => 1,
    })
    expect(h.group.visible).toBe(true)
    const cast = lineSegmentsAt(h.group, 2)
    const pos = (cast.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
    expect(cast.geometry.drawRange.count).toBe(2)
    expect(pos[0]).toBeCloseTo(1.1)
    expect(pos[3]).toBeCloseTo(8.9)
    h.dispose()
  })

  it('P22.6 — updateHoverFromRoleMask highlights matching chains only', () => {
    const h = createConstellation(8)
    const map = new Map<number, Movie>([
      [1, stubMovie({ id: 1, release_date: '2000-01-01', x: 0 })],
      [2, stubMovie({ id: 2, release_date: '2001-01-01', x: 1 })],
    ])
    h.sync({
      visible: true,
      hasFilmFocus: false,
      movieById: map,
      selectionIds: [1, 2],
      movieRoles: { '1': 1 | 16, '2': 2 },
      surfaceGapWorld: 0,
      getActiveWorldRadius: () => 0,
    })
    h.updateHoverFromRoleMask(1 | 16)
    const prodMat = lineSegmentsAt(h.group, 0).material as THREE.LineBasicMaterial
    const crewMat = lineSegmentsAt(h.group, 1).material as THREE.LineBasicMaterial
    const castMat = lineSegmentsAt(h.group, 2).material as THREE.LineBasicMaterial
    expect(prodMat.opacity).toBeGreaterThan(0.1)
    expect(crewMat.opacity).toBeLessThan(0.1)
    expect(castMat.opacity).toBeGreaterThan(0.1)
    h.updateHoverFromRoleMask(2)
    expect(prodMat.opacity).toBeLessThan(0.1)
    expect(crewMat.opacity).toBeGreaterThan(0.1)
    expect(castMat.opacity).toBeLessThan(0.1)
    h.dispose()
  })
})
