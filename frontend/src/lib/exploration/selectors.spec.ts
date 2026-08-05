import { describe, expect, it } from 'vitest'

import {
  decideExploration,
  selectExploration,
  type ExplorationContext,
  type SelectSession,
} from '@/lib/exploration'

const personSession = {
  relation: { kind: 'person', key: 'greta-gerwig' },
  movieIds: [11, 22, 33],
  metadata: {
    fullName: 'Greta Gerwig',
    roleMask: 3,
    movieRoles: { '11': 1, '22': 2, '33': 3 },
  },
} satisfies SelectSession

const genreSession = {
  relation: { kind: 'genre', key: 'genre:drama+history' },
  movieIds: [44, 55],
  conditions: { operator: 'and', genres: ['Drama', 'History'] },
} satisfies SelectSession

const idle = { kind: 'idle' } satisfies ExplorationContext

function exit(context: ExplorationContext): ExplorationContext {
  return decideExploration(context, { type: 'focus/exited' })
}

describe('selectExploration', () => {
  it('maps idle, Select session, and Focus to mask modes 0, 1, and 2', () => {
    expect(selectExploration(idle)).toEqual({
      focusMovieId: null,
      parentSession: null,
      collectionMovieIds: null,
      personMetadata: null,
      genreConditions: null,
      maskMode: 0,
    })

    expect(selectExploration({ kind: 'select', session: personSession })).toEqual({
      focusMovieId: null,
      parentSession: personSession,
      collectionMovieIds: personSession.movieIds,
      personMetadata: personSession.metadata,
      genreConditions: null,
      maskMode: 1,
    })

    expect(
      selectExploration({ kind: 'focus', movieId: 22, parent: personSession }),
    ).toMatchObject({
      focusMovieId: 22,
      parentSession: personSession,
      collectionMovieIds: personSession.movieIds,
      personMetadata: personSession.metadata,
      genreConditions: null,
      maskMode: 2,
    })
  })

  it('projects Genre conditions from the same parent Select session', () => {
    expect(selectExploration({ kind: 'select', session: genreSession })).toEqual({
      focusMovieId: null,
      parentSession: genreSession,
      collectionMovieIds: genreSession.movieIds,
      personMetadata: null,
      genreConditions: genreSession.conditions,
      maskMode: 1,
    })
  })

  it('restores mode 1 after Nested focus exit and mode 0 after Replacing focus exit', () => {
    const nested = {
      kind: 'focus',
      movieId: 22,
      parent: personSession,
    } satisfies ExplorationContext
    const replacing = { kind: 'focus', movieId: 99 } satisfies ExplorationContext

    expect(selectExploration(exit(nested)).maskMode).toBe(1)
    expect(selectExploration(exit(nested)).collectionMovieIds).toBe(personSession.movieIds)
    expect(selectExploration(exit(replacing)).maskMode).toBe(0)
    expect(selectExploration(exit(replacing)).collectionMovieIds).toBeNull()
  })

  it('does not expose scene-owned focus neighborhood, orbit, or animation phase', () => {
    expect(Object.keys(selectExploration({ kind: 'focus', movieId: 22 }))).toEqual([
      'focusMovieId',
      'parentSession',
      'collectionMovieIds',
      'personMetadata',
      'genreConditions',
      'maskMode',
    ])
  })
})