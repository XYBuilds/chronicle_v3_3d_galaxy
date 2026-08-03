import { describe, expect, it } from 'vitest'

import {
  buildGenreRelationKey,
  buildGenreSelectSession,
  buildPersonSelectSession,
  formatGenreSessionQuery,
  sortMovieIdsByRelease,
} from '@/lib/exploration'
import type { Movie } from '@/types/galaxy'
import type { SearchIndex } from '@/types/searchIndex'

function movie(id: number, releaseDate: string): Movie {
  return {
    id,
    title: `Movie ${id}`,
    original_title: `Movie ${id}`,
    overview: 'Overview',
    tagline: null,
    release_date: releaseDate,
    genres: ['Drama'],
    original_language: 'en',
    vote_count: 10,
    vote_average: 7,
    popularity: 1,
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
    x: 0,
    y: 0,
    z: Number(releaseDate.slice(0, 4)),
    size: 1,
    emissive: 1,
    genre_color: [0, 0, 0],
  }
}

describe('exploration Select session builders', () => {
  const movieById = new Map<number, Movie>([
    [10, movie(10, '2020-01-01')],
    [20, movie(20, '1990-01-01')],
    [30, movie(30, '2000-01-01')],
  ])

  it('builds one complete person session including identity, member IDs, and metadata', () => {
    const searchIndex: SearchIndex = {
      version: 'test',
      people: {
        'pat example': {
          full: 'Pat Example',
          role_mask: 3,
          movie_ids: [10, 20],
          movie_roles: { '10': 1, '20': 2 },
        },
      },
      genres: {},
    }

    expect(
      buildPersonSelectSession({
        personKey: 'pat example',
        searchIndex,
        movieById,
      }),
    ).toEqual({
      relation: { kind: 'person', key: 'pat example' },
      movieIds: [20, 10],
      metadata: {
        fullName: 'Pat Example',
        roleMask: 3,
        movieRoles: { '10': 1, '20': 2 },
      },
    })
  })

  it('builds genre identity, ordered conditions, and stable ordered intersection together', () => {
    const searchIndex: SearchIndex = {
      version: 'test',
      people: {},
      genres: {
        Drama: { count: 3, movie_ids: [10, 20, 30] },
        History: { count: 2, movie_ids: [30, 10] },
      },
    }

    const genreNames = ['Drama', 'History'] as const
    const session = buildGenreSelectSession({
      genreNames,
      searchIndex,
      movieById,
    })

    expect(buildGenreRelationKey(genreNames)).toBe('genre:drama+history')
    expect(formatGenreSessionQuery(genreNames)).toBe('Drama + History')
    expect(session).toEqual({
      relation: { kind: 'genre', key: 'genre:drama+history' },
      movieIds: [30, 10],
      conditions: { operator: 'and', genres: ['Drama', 'History'] },
    })
    expect(session?.relation.key).toBe(
      buildGenreRelationKey(session?.conditions.genres ?? []),
    )
    expect(formatGenreSessionQuery(session?.conditions.genres ?? [])).toBe('Drama + History')
  })

  it('uses movie ID as deterministic tie-breaker for equal release dates', () => {
    const sameDate = new Map<number, Movie>([
      [20, movie(20, '2000-01-01')],
      [10, movie(10, '2000-01-01')],
    ])

    expect(sortMovieIdsByRelease([20, 10], sameDate)).toEqual([10, 20])
  })
})