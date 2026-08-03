import { describe, expect, it } from 'vitest'

import { decideExploration, type ExplorationContext, type SelectSession } from '@/lib/exploration'

import { decideThreeClick } from './interactionAdapter'

const session = {
  relation: { kind: 'genre', key: 'genre:interaction' },
  movieIds: [11, 22],
  conditions: { operator: 'and', genres: ['Drama'] },
} satisfies SelectSession

const contexts = {
  idle: { kind: 'idle' },
  select: { kind: 'select', session },
  nested: { kind: 'focus', movieId: 11, parent: session },
  replacing: { kind: 'focus', movieId: 33 },
} satisfies Record<string, ExplorationContext>

function movieClick(context: ExplorationContext, movieId: number) {
  return decideThreeClick({ context, target: { type: 'active-movie', movieId } })
}

function contextAfterMovieClick(
  context: ExplorationContext,
  movieId: number,
): ExplorationContext {
  const action = movieClick(context, movieId)
  if (action.type !== 'lifecycle-intent') throw new Error('expected lifecycle intent')
  return decideExploration(context, action.intent)
}

describe('Three interaction lifecycle adapter', () => {
  it.each([
    ['idle macro', contexts.idle],
    ['select macro', contexts.select],
    ['nested focus neighborhood', contexts.nested],
    ['replacing focus neighborhood', contexts.replacing],
  ])('requests membership-aware focus for an active movie click in %s', (_label, context) => {
    expect(movieClick(context, 22)).toEqual({
      type: 'lifecycle-intent',
      intent: {
        type: 'focus/requested',
        movieId: 22,
        policy: 'preserve-if-member',
      },
    })
  })

  it('lets the exploration core preserve a nested parent for a member switch', () => {
    expect(contextAfterMovieClick(contexts.nested, 22)).toEqual({
      kind: 'focus',
      movieId: 22,
      parent: session,
    })
  })

  it('lets the exploration core replace nested focus for a non-member switch', () => {
    expect(contextAfterMovieClick(contexts.nested, 44)).toEqual({
      kind: 'focus',
      movieId: 44,
    })
  })

  it('keeps replacing focus parentless when another movie is clicked', () => {
    expect(contextAfterMovieClick(contexts.replacing, 44)).toEqual({
      kind: 'focus',
      movieId: 44,
    })
  })

  it('ignores a click on the current focus planet', () => {
    expect(decideThreeClick({ context: contexts.nested, target: { type: 'focus-planet' } })).toEqual({
      type: 'ignored',
      reason: 'focus-planet',
    })
  })

  it.each([
    ['nested focus', contexts.nested],
    ['replacing focus', contexts.replacing],
  ])('ignores a blank click in %s', (_label, context) => {
    expect(decideThreeClick({ context, target: { type: 'blank' } })).toEqual({
      type: 'ignored',
      reason: 'focus-blank',
    })
  })

  it.each([
    ['idle macro', contexts.idle],
    ['select macro', contexts.select],
  ])('makes macro blank click an explicit ignored decision in %s', (_label, context) => {
    expect(decideThreeClick({ context, target: { type: 'blank' } })).toEqual({
      type: 'ignored',
      reason: 'macro-blank',
    })
  })
})