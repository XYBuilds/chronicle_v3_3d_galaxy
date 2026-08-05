import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  dispatchExplorationIntent,
  readExplorationContext,
  subscribeExplorationContext,
  type SelectSession,
} from '@/lib/exploration'
import { replaceRoutePath } from '@/lib/routeActions'
import { resetExplorationContext } from './exploration/testHelpers'
import { galaxyMinimalFixture } from '@/types/galaxyMinimalFixture'

import {
  applyParsedRouteToStores,
  decideRouteExploration,
  runInitialRouteBoot,
} from './routeControllerSync'

vi.mock('@/lib/exploration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/exploration')>()
  return {
    ...actual,
    dispatchExplorationIntent: vi.fn(actual.dispatchExplorationIntent),
  }
})

vi.mock('@/lib/routeActions', () => ({
  replaceRoutePath: vi.fn(),
}))

const movies = [
  ...galaxyMinimalFixture.movies,
  { ...galaxyMinimalFixture.movies[0], id: 2, title: 'Second Fixture' },
]

const personSession = {
  relation: { kind: 'person', key: 'route-session' },
  movieIds: [1],
  metadata: { fullName: 'Route Session', roleMask: 1 },
} satisfies SelectSession

function resetStore(): void {
  resetExplorationContext()
}

describe('decideRouteExploration', () => {
  it('maps a valid movie route to a membership-aware focus request', () => {
    expect(decideRouteExploration({ kind: 'movie', movieId: 1 }, movies)).toEqual({
      intent: { type: 'focus/requested', movieId: 1, policy: 'preserve-if-member' },
      canonicalRoute: null,
      missingMovieId: null,
    })
  })

  it.each([
    ['home', { kind: 'home' } as const, null],
    ['unknown', { kind: 'unknown' } as const, 'home'],
    ['missing movie', { kind: 'movie', movieId: 999_999_999 } as const, 'home'],
  ])('maps %s to focus exit with the existing canonicalization', (_label, route, canonicalRoute) => {
    expect(decideRouteExploration(route, movies)).toMatchObject({
      intent: { type: 'focus/exited' },
      canonicalRoute,
    })
  })
})

describe('routeControllerSync home idle and movie focus', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { pathname: '/', search: '' } })
    resetStore()
    vi.mocked(dispatchExplorationIntent).mockClear()
    vi.mocked(replaceRoutePath).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetStore()
  })

  it('focuses an in-galaxy movie without a fallback request', () => {
    applyParsedRouteToStores({ kind: 'movie', movieId: 1 }, { movies, search: '' })
    expect(readExplorationContext()).toEqual({ kind: 'focus', movieId: 1 })
    expect(replaceRoutePath).not.toHaveBeenCalled()
  })

  it('keeps the in-memory select session for a member movie route', () => {
    dispatchExplorationIntent({ type: 'select/entered', session: personSession })

    applyParsedRouteToStores({ kind: 'movie', movieId: 1 }, { movies, search: '' })

    expect(readExplorationContext()).toEqual({
      kind: 'focus',
      movieId: 1,
      parent: personSession,
    })
  })

  it('replaces the in-memory select session for a non-member movie route', () => {
    dispatchExplorationIntent({ type: 'select/entered', session: personSession })

    applyParsedRouteToStores({ kind: 'movie', movieId: 2 }, { movies, search: '' })

    expect(readExplorationContext()).toEqual({ kind: 'focus', movieId: 2 })
  })

  it('re-dispatches the same movie ID after Nested becomes Replacing in memory', () => {
    dispatchExplorationIntent({ type: 'select/entered', session: personSession })
    applyParsedRouteToStores({ kind: 'movie', movieId: 1 }, { movies, search: '' })
    const observedContexts: ReturnType<typeof readExplorationContext>[] = []
    const unsubscribe = subscribeExplorationContext((context) => {
      observedContexts.push(context)
    })

    dispatchExplorationIntent({
      type: 'focus/requested',
      movieId: 1,
      policy: 'replace',
    })
    expect(readExplorationContext()).toEqual({ kind: 'focus', movieId: 1 })
    vi.mocked(dispatchExplorationIntent).mockClear()

    applyParsedRouteToStores({ kind: 'movie', movieId: 1 }, { movies, search: '' })
    unsubscribe()

    expect(observedContexts).toEqual([{ kind: 'focus', movieId: 1 }])
    expect(dispatchExplorationIntent).toHaveBeenCalledOnce()
    expect(dispatchExplorationIntent).toHaveBeenCalledWith({
      type: 'focus/requested',
      movieId: 1,
      policy: 'preserve-if-member',
    })
    expect(readExplorationContext()).toEqual({ kind: 'focus', movieId: 1 })
  })

  it('canonicalizes a missing movie to home and leaves the galaxy idle', () => {
    applyParsedRouteToStores({ kind: 'movie', movieId: 999_999_999 }, { movies, search: '' })
    expect(replaceRoutePath).toHaveBeenCalledWith('/')
    expect(readExplorationContext()).toEqual({ kind: 'idle' })
  })

  it('treats home and Back as focus exit, restoring a nested parent', () => {
    dispatchExplorationIntent({ type: 'select/entered', session: personSession })
    applyParsedRouteToStores({ kind: 'movie', movieId: 1 }, { movies, search: '' })

    applyParsedRouteToStores({ kind: 'home' }, { movies, search: '' })

    expect(readExplorationContext()).toEqual({ kind: 'select', session: personSession })
  })

  it('treats home and Back as focus exit from replacing focus to idle', () => {
    applyParsedRouteToStores({ kind: 'movie', movieId: 2 }, { movies, search: '' })

    applyParsedRouteToStores({ kind: 'home' }, { movies, search: '' })

    expect(readExplorationContext()).toEqual({ kind: 'idle' })
  })

  it('reinterprets Forward against the select session that remains in memory', () => {
    dispatchExplorationIntent({ type: 'select/entered', session: personSession })
    applyParsedRouteToStores({ kind: 'movie', movieId: 1 }, { movies, search: '' })
    applyParsedRouteToStores({ kind: 'home' }, { movies, search: '' })

    applyParsedRouteToStores({ kind: 'movie', movieId: 1 }, { movies, search: '' })

    expect(readExplorationContext()).toEqual({
      kind: 'focus',
      movieId: 1,
      parent: personSession,
    })
  })

  it('canonicalizes an unknown route through focus exit to a legal parent context', () => {
    dispatchExplorationIntent({ type: 'select/entered', session: personSession })
    applyParsedRouteToStores({ kind: 'movie', movieId: 1 }, { movies, search: '' })

    applyParsedRouteToStores({ kind: 'unknown' }, { movies, search: '?lang=zh' })

    expect(replaceRoutePath).toHaveBeenCalledWith('/?lang=zh')
    expect(readExplorationContext()).toEqual({ kind: 'select', session: personSession })
  })

  it('canonicalizes a missing nested target through focus exit to a legal parent context', () => {
    dispatchExplorationIntent({ type: 'select/entered', session: personSession })
    applyParsedRouteToStores({ kind: 'movie', movieId: 1 }, { movies, search: '' })

    applyParsedRouteToStores(
      { kind: 'movie', movieId: 999_999_999 },
      { movies, search: '?lang=ja' },
    )

    expect(replaceRoutePath).toHaveBeenCalledWith('/?lang=ja')
    expect(readExplorationContext()).toEqual({ kind: 'select', session: personSession })
  })

  it('clears a prior selection for home', () => {
    dispatchExplorationIntent({ type: 'focus/requested', movieId: 1, policy: 'replace' })
    applyParsedRouteToStores({ kind: 'home' }, { movies })
    expect(readExplorationContext()).toEqual({ kind: 'idle' })
  })

})

describe('runInitialRouteBoot', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { pathname: '/', search: '' } })
    resetStore()
    vi.mocked(dispatchExplorationIntent).mockClear()
    vi.mocked(replaceRoutePath).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetStore()
  })

  it('initially focuses a known movie deep link', () => {
    runInitialRouteBoot({ kind: 'movie', movieId: 1 }, movies)
    expect(readExplorationContext()).toEqual({ kind: 'focus', movieId: 1 })
  })

  it('forms replacing focus on a refreshed movie URL without restoring history state', () => {
    vi.stubGlobal('history', {
      state: {
        explorationContext: { kind: 'select', session: personSession },
      },
    })

    runInitialRouteBoot({ kind: 'movie', movieId: 1 }, movies)

    expect(readExplorationContext()).toEqual({ kind: 'focus', movieId: 1 })
  })

  it('initially enters idle for home and never resolves today.json', () => {
    runInitialRouteBoot({ kind: 'home' }, movies)
    expect(readExplorationContext()).toEqual({ kind: 'idle' })
  })

  it('initially canonicalizes a missing deep link to idle', () => {
    runInitialRouteBoot({ kind: 'movie', movieId: 999_999_999 }, movies, '')
    expect(replaceRoutePath).toHaveBeenCalledWith('/')
    expect(readExplorationContext()).toEqual({ kind: 'idle' })
  })
})