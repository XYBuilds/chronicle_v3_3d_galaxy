import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  CONTROLLED_VOTE_AVERAGES,
  PHASE39_FIXED_MOVIE_ID,
  createControlledFixtures,
  createRealSampleFixtures,
  parseGalaxyFixture,
} from './phase39Fixtures.js'

const baseline = parseGalaxyFixture(JSON.parse(readFileSync(
  fileURLToPath(new URL('../fixtures/phase39-contract-baseline.json', import.meta.url)),
  'utf8',
)) as unknown)

function canonicalMovie(movie: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...movie }
  delete copy.vote_average
  return copy
}

function canonicalControlledFixture(fixture: Record<string, unknown>): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(fixture)) as Record<string, unknown>
  const [movie] = copy.movies as Record<string, unknown>[]
  delete movie!.vote_average
  return copy
}

describe('P39.7 offline fixture generator', () => {
  it('changes only vote_average for 0/4/5/10 controlled exports', () => {
    const fixtures = createControlledFixtures(baseline)
    const original = baseline.movies[0]!
    const controlledVersion = `${baseline.meta.version}-p39.7-controlled`
    const canonicalFixtures: Record<string, unknown>[] = []

    expect([...fixtures.keys()]).toEqual(CONTROLLED_VOTE_AVERAGES)
    for (const voteAverage of CONTROLLED_VOTE_AVERAGES) {
      const fixture = fixtures.get(voteAverage)!
      const movie = fixture.movies[0]!
      expect(movie.id).toBe(PHASE39_FIXED_MOVIE_ID)
      expect(movie.vote_average).toBe(voteAverage)
      expect(canonicalMovie(movie)).toEqual(canonicalMovie(original))
      expect(fixture.meta).toMatchObject({ version: controlledVersion, count: 1 })
      canonicalFixtures.push(canonicalControlledFixture(fixture))
    }

    expect(canonicalFixtures).toEqual([
      canonicalFixtures[0],
      canonicalFixtures[0],
      canonicalFixtures[0],
      canonicalFixtures[0],
    ])
  })

  it('fails rather than fabricating real-sample source records', () => {
    expect(() => createRealSampleFixtures(baseline, [
      { tier: 'low', tmdb_id: 199647, title: 'The Color of Time', vote_average: 3.9 },
    ])).toThrow('absent from supplied derived data')
  })
})