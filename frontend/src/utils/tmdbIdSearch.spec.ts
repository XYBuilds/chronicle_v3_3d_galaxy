import { describe, expect, it } from 'vitest'

import type { Movie } from '@/types/galaxy'
import {
  TMDB_ID_PREFIX_MIN_LENGTH,
  TMDB_ID_SEARCH_RESULT_LIMIT,
  buildTmdbIdSearchIndex,
  parseTmdbIdQuery,
  searchTmdbId,
} from '@/utils/tmdbIdSearch'

function movie(id: number): Movie {
  return {
    x: 0,
    y: 0,
    z: 2000,
    size: 0.1,
    emissive: 0.5,
    genre_color: [0.2, 0.3, 0.4],
    title: `Movie ${id}`,
    original_title: '',
    overview: '',
    tagline: null,
    release_date: '2020-01-01',
    genres: [],
    original_language: 'en',
    vote_count: 1,
    vote_average: 1,
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
    id,
    imdb_id: null,
  }
}

describe('parseTmdbIdQuery', () => {
  it.each(['', ' 550', '550 ', '5 50', '-550', '+550', '550.0', '5e2', 'TMDB 550', '５５０'])(
    'rejects non-decimal input %j',
    (input) => {
      expect(parseTmdbIdQuery(input)).toEqual({ status: 'invalid' })
    },
  )

  it('accepts ASCII decimal digits without normalizing the input', () => {
    expect(parseTmdbIdQuery('00550')).toEqual({ status: 'valid', digits: '00550', numericId: 550 })
  })
})

describe('buildTmdbIdSearchIndex', () => {
  it('fails fast for invalid or duplicate Movie.id values', () => {
    expect(() => buildTmdbIdSearchIndex([movie(1), movie(1)])).toThrow('Duplicate Movie.id: 1')
    expect(() => buildTmdbIdSearchIndex([movie(0)])).toThrow('positive safe integer')
    expect(() => buildTmdbIdSearchIndex([movie(1.5)])).toThrow('positive safe integer')
  })
})

describe('searchTmdbId', () => {
  it('keeps one-to-three-digit queries exact only', () => {
    const index = buildTmdbIdSearchIndex([movie(12), movie(123), movie(1234), movie(12345)])

    expect(searchTmdbId(index, '12')).toEqual({ status: 'results', movies: [movie(12)] })
    expect(searchTmdbId(index, '123')).toEqual({ status: 'results', movies: [movie(123)] })
    expect(searchTmdbId(index, '999')).toEqual({ status: 'no-results', movies: [] })
  })

  it('returns exact match first, then numeric ascending prefix matches from four digits', () => {
    const index = buildTmdbIdSearchIndex([movie(12349), movie(1234), movie(12340), movie(12345), movie(123400)])
    const result = searchTmdbId(index, '1234')

    expect(TMDB_ID_PREFIX_MIN_LENGTH).toBe(4)
    expect(result.status).toBe('results')
    expect(result.movies.map((candidate) => candidate.id)).toEqual([1234, 12340, 12345, 12349, 123400])
  })

  it('caps prefix results at eight without displacing an exact match', () => {
    const index = buildTmdbIdSearchIndex([
      movie(1234),
      ...Array.from({ length: 10 }, (_, offset) => movie(12340 + offset)),
    ])
    const result = searchTmdbId(index, '1234')

    expect(result.status).toBe('results')
    expect(result.movies).toHaveLength(TMDB_ID_SEARCH_RESULT_LIMIT)
    expect(result.movies[0]?.id).toBe(1234)
    expect(result.movies.map((candidate) => candidate.id)).toEqual([1234, 12340, 12341, 12342, 12343, 12344, 12345, 12346])
  })

  it('has deterministic output regardless of movie input order', () => {
    const ascending = [movie(5678), movie(56780), movie(56781), movie(56789)]
    const descending = [...ascending].reverse()

    expect(searchTmdbId(buildTmdbIdSearchIndex(ascending), '5678')).toEqual(
      searchTmdbId(buildTmdbIdSearchIndex(descending), '5678'),
    )
  })

  it('distinguishes invalid input from a valid query with no result', () => {
    const index = buildTmdbIdSearchIndex([movie(550)])

    expect(searchTmdbId(index, '55 0').status).toBe('invalid')
    expect(searchTmdbId(index, '9999').status).toBe('no-results')
  })
})