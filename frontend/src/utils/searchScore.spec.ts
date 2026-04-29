import { describe, expect, it } from 'vitest'

import type { Movie } from '@/types/galaxy'
import type { SearchIndex } from '@/types/searchIndex'

import {
  SEARCH_MIN_QUERY_LEN,
  formatMovieSuggestionLabel,
  formatPersonRoleSuffix,
  moviePopularityScore,
  normalizeForSearch,
  scoreGenresForQuery,
  scoreMoviesForQuery,
  scorePeopleForQuery,
} from '@/utils/searchScore'

function baseMovie(over: Partial<Movie> & Pick<Movie, 'id' | 'title'>): Movie {
  const { id, title, ...rest } = over
  return {
    x: 0,
    y: 0,
    z: 2000,
    size: 0.1,
    emissive: 0.5,
    genre_color: [0.2, 0.3, 0.4],
    title,
    original_title: '',
    overview: '',
    tagline: null,
    release_date: '2020-06-01',
    genres: ['Drama'],
    original_language: 'en',
    vote_count: 100,
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
    id,
    imdb_id: null,
    ...rest,
  }
}

describe('normalizeForSearch', () => {
  it('strips accents and lowercases ASCII', () => {
    expect(normalizeForSearch('Café')).toBe('cafe')
  })
})

describe('SEARCH_MIN_QUERY_LEN', () => {
  it('blocks short queries', () => {
    const movies = [baseMovie({ id: 1, title: 'Abcdef', title_normalized: 'abcdef' })]
    expect(scoreMoviesForQuery(movies, 'ab').length).toBe(0)
    expect(SEARCH_MIN_QUERY_LEN).toBe(3)
  })
})

describe('scoreMoviesForQuery', () => {
  it('ranks prefix above contains', () => {
    const movies = [
      baseMovie({
        id: 1,
        title: 'Zeta contains star substring',
        title_normalized: 'zeta contains star substring',
        vote_count: 1_000_000,
        vote_average: 10,
      }),
      baseMovie({
        id: 2,
        title: 'Star Trek',
        title_normalized: 'star trek',
        vote_count: 10,
        vote_average: 5,
      }),
    ]
    const hits = scoreMoviesForQuery(movies, 'star')
    expect(hits[0]!.movie.id).toBe(2)
    expect(hits[0]!.tier).toBe('prefix')
    expect(hits.find((h) => h.movie.id === 1)?.tier).toBe('contains')
  })

  it('sorts same tier by popularity score descending', () => {
    const movies = [
      baseMovie({
        id: 1,
        title: 'Alpha Story',
        title_normalized: 'alpha story',
        vote_count: 100,
        vote_average: 5,
      }),
      baseMovie({
        id: 2,
        title: 'Beta Story',
        title_normalized: 'beta story',
        vote_count: 10_000,
        vote_average: 8,
      }),
    ]
    const hits = scoreMoviesForQuery(movies, 'story')
    expect(hits.length).toBe(2)
    expect(hits[0]!.movie.id).toBe(2)
    expect(hits[1]!.movie.id).toBe(1)
    expect(moviePopularityScore(hits[0]!.movie)).toBeGreaterThan(moviePopularityScore(hits[1]!.movie))
  })

  it('caps at 12 results', () => {
    const movies = Array.from({ length: 30 }, (_, i) =>
      baseMovie({
        id: i + 1,
        title: `Film ${i} Thing`,
        title_normalized: `film ${i} thing`,
        vote_count: i,
        vote_average: 5,
      }),
    )
    expect(scoreMoviesForQuery(movies, 'thing').length).toBe(12)
  })
})

describe('scorePeopleForQuery', () => {
  it('treats query as prefix of any token (nolan → christopher nolan)', () => {
    const index: SearchIndex = {
      version: '1',
      people: {
        'christopher nolan': {
          full: 'Christopher Nolan',
          role_mask: 2,
          movie_ids: [1, 2],
        },
        'al pacino': { full: 'Al Pacino', role_mask: 1, movie_ids: [3] },
      },
      genres: {},
    }
    const hits = scorePeopleForQuery(index, 'nolan')
    expect(hits.length).toBe(1)
    expect(hits[0]!.personKey).toBe('christopher nolan')
    expect(hits[0]!.tier).toBe('prefix')
  })

  it('uses contains when no token prefix', () => {
    const index: SearchIndex = {
      version: '1',
      people: {
        'al pacino': { full: 'Al Pacino', role_mask: 1, movie_ids: [3] },
      },
      genres: {},
    }
    const hits = scorePeopleForQuery(index, 'pac')
    expect(hits.length).toBe(1)
    expect(hits[0]!.tier).toBe('contains')
  })

  it('sorts same tier by movie_ids length', () => {
    const index: SearchIndex = {
      version: '1',
      people: {
        'john a': { full: 'John A', role_mask: 1, movie_ids: [1] },
        'john b': { full: 'John B', role_mask: 1, movie_ids: [2, 3, 4] },
      },
      genres: {},
    }
    const hits = scorePeopleForQuery(index, 'john')
    expect(hits[0]!.personKey).toBe('john b')
  })
})

describe('scoreGenresForQuery', () => {
  it('ranks prefix over contains and sorts by count', () => {
    const index: SearchIndex = {
      version: '1',
      people: {},
      genres: {
        Action: { count: 100, movie_ids: [1] },
        Drama: { count: 500, movie_ids: [2] },
        Reaction: { count: 999, movie_ids: [3] },
      },
    }
    const hits = scoreGenresForQuery(index, 'act')
    expect(hits[0]!.genreName).toBe('Action')
    expect(hits[0]!.tier).toBe('prefix')
    const reaction = hits.find((h) => h.genreName === 'Reaction')
    expect(reaction?.tier).toBe('contains')
  })
})

describe('formatMovieSuggestionLabel', () => {
  it('omits duplicate original title', () => {
    const m = baseMovie({ id: 1, title: 'Alien', original_title: 'Alien', release_date: '1979-05-25' })
    expect(formatMovieSuggestionLabel(m)).toBe('Alien (1979) Drama')
  })

  it('includes distinct original title', () => {
    const m = baseMovie({
      id: 1,
      title: 'Solaris',
      original_title: 'Solyaris',
      release_date: '1972-03-20',
      genres: ['Sci-Fi'],
    })
    expect(formatMovieSuggestionLabel(m)).toContain('Solaris')
    expect(formatMovieSuggestionLabel(m)).toContain('Solyaris')
    expect(formatMovieSuggestionLabel(m)).toContain('(1972)')
  })
})

describe('formatPersonRoleSuffix', () => {
  it('lists role bits', () => {
    const s = formatPersonRoleSuffix(2 | 1)
    expect(s).toContain('Cast')
    expect(s).toContain('Director')
  })
})
