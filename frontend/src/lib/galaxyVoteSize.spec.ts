import { describe, expect, it } from 'vitest'

import type { Movie } from '@/types/galaxy'

import {
  FOCUS_VOTE_REFERENCE_TIERS,
  computeLogVoteRangeFromMovies,
  focusShellRadiiForVoteTiers,
  linearMapInRange,
  pipelineParticleSizeForVoteCount,
} from '@/lib/galaxyVoteSize'
import { DEFAULT_GALAXY_U_ACTIVE_SIZE_MUL, DEFAULT_GALAXY_U_SIZE_SCALE } from '@/three/galaxyUniformDefaults'

function fakeMovie(voteCount: number, id: number): Movie {
  return {
    id,
    x: 0,
    y: 0,
    z: 2000,
    size: 5,
    emissive: 0.5,
    genre_color: [0.5, 0.5, 0.5],
    title: 't',
    original_title: 't',
    overview: 'o',
    tagline: null,
    release_date: '2000-01-01',
    genres: ['Drama'],
    original_language: 'en',
    vote_count: voteCount,
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
  }
}

describe('galaxyVoteSize', () => {
  it('linearMapInRange clamps to [outMin,outMax]', () => {
    expect(linearMapInRange(0, 1, 2, 10, 20)).toBe(10)
    expect(linearMapInRange(3, 1, 2, 10, 20)).toBe(20)
    expect(linearMapInRange(1.5, 1, 2, 10, 20)).toBe(15)
  })

  it('FOCUS_VOTE_REFERENCE_TIERS radii strictly increase for typical uniforms', () => {
    const movies = [fakeMovie(1, 1), fakeMovie(500_000, 2)]
    const { logMin, logMax } = computeLogVoteRangeFromMovies(movies)
    const radii = focusShellRadiiForVoteTiers(
      logMin,
      logMax,
      DEFAULT_GALAXY_U_SIZE_SCALE,
      DEFAULT_GALAXY_U_ACTIVE_SIZE_MUL,
    )
    expect(radii.length).toBe(FOCUS_VOTE_REFERENCE_TIERS.length)
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]).toBeGreaterThan(radii[i - 1]!)
    }
  })

  it('pipelineParticleSizeForVoteCount increases with vote_count', () => {
    const movies = [fakeMovie(5, 1), fakeMovie(900_000, 2)]
    const { logMin, logMax } = computeLogVoteRangeFromMovies(movies)
    const s10 = pipelineParticleSizeForVoteCount(10, logMin, logMax)
    const s100 = pipelineParticleSizeForVoteCount(100, logMin, logMax)
    expect(s100).toBeGreaterThan(s10)
  })
})
