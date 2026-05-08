import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Movie } from '@/types/galaxy'

import {
  fallbackTodayMovieId,
  isTodayDateStale,
  parseTodayPayload,
  resolveTodayMovieId,
  utcCalendarDaysApart,
} from './loadToday'

vi.mock('@/lib/galaxyAssetUrls', () => ({
  resolveTodayJsonUrl: vi.fn().mockResolvedValue('http://fixture/today.json'),
}))

const mkMovie = (id: number, vote_count: number): Movie =>
  ({
    id,
    vote_count,
    vote_average: 7,
    title: `M${id}`,
    original_title: '',
    overview: '',
    tagline: null,
    release_date: '2000-01-01',
    genres: ['Drama'],
    original_language: 'en',
    popularity: 1,
    x: 0,
    y: 0,
    z: 2000,
    size: 1,
    emissive: 0.5,
    genre_color: [0.5, 0.5, 0.5],
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
  }) as Movie

describe('parseTodayPayload', () => {
  it('accepts a valid object', () => {
    const p = parseTodayPayload({
      date: '2026-05-08',
      movie_id: 42,
      selected_at: '2026-05-08T20:00:00Z',
      selection_strategy: 'deterministic_by_utc_date',
      min_vote_count: 0,
    })
    expect(p).toEqual({
      date: '2026-05-08',
      movie_id: 42,
      selected_at: '2026-05-08T20:00:00Z',
      selection_strategy: 'deterministic_by_utc_date',
      min_vote_count: 0,
    })
  })

  it('rejects bad date or movie_id', () => {
    expect(parseTodayPayload({ date: '08-05-2026', movie_id: 1 })).toBeNull()
    expect(parseTodayPayload({ date: '2026-05-08', movie_id: 1.5 })).toBeNull()
    expect(parseTodayPayload(null)).toBeNull()
  })
})

describe('utcCalendarDaysApart / isTodayDateStale', () => {
  it('computes day distance', () => {
    expect(utcCalendarDaysApart('2026-05-08', '2026-05-08')).toBe(0)
    expect(utcCalendarDaysApart('2026-05-07', '2026-05-08')).toBe(1)
    expect(utcCalendarDaysApart('2026-05-05', '2026-05-08')).toBe(3)
  })

  it('marks stale only when distance > 1', () => {
    expect(isTodayDateStale('2026-05-07', '2026-05-08')).toBe(false)
    expect(isTodayDateStale('2026-05-05', '2026-05-08')).toBe(true)
  })
})

describe('fallbackTodayMovieId', () => {
  it('picks from top vote_count slice with mocked random', () => {
    const movies = [mkMovie(1, 10), mkMovie(2, 100), mkMovie(3, 50)]
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(fallbackTodayMovieId(movies)).toBe(2)
    vi.restoreAllMocks()
  })
})

describe('resolveTodayMovieId', () => {
  const movies = [mkMovie(1, 10), mkMovie(2, 100)]

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-08T15:00:00.000Z'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses payload when id exists and date is fresh', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ date: '2026-05-08', movie_id: 2 }),
      }),
    )
    const r = await resolveTodayMovieId(movies)
    expect(r.movieId).toBe(2)
    expect(r.usedFallback).toBe(false)
    expect(r.payload?.movie_id).toBe(2)
  })

  it('falls back when movie_id missing from galaxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ date: '2026-05-08', movie_id: 999 }),
      }),
    )
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const r = await resolveTodayMovieId(movies)
    expect(r.usedFallback).toBe(true)
    expect(r.movieId).toBe(2)
  })

  it('falls back when date is stale', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ date: '2026-05-01', movie_id: 1 }),
      }),
    )
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const r = await resolveTodayMovieId(movies)
    expect(r.usedFallback).toBe(true)
    expect(r.movieId).toBe(2)
  })

  it('falls back on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const r = await resolveTodayMovieId(movies)
    expect(r.usedFallback).toBe(true)
    expect(r.movieId).toBe(2)
  })
})
