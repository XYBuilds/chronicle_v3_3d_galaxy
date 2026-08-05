import { useEffect, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  dispatchExplorationIntent,
  readExplorationContext,
  type SelectSession,
} from '@/lib/exploration'
import { pushMovieRoute, replaceHomeRoute } from '@/lib/routeActions'
import { routeSyncGuard } from '@/lib/routeSyncGuard'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import { galaxyMinimalFixture } from '@/types/galaxyMinimalFixture'

import { decideRouteHistoryWrite, useRouteController } from './useRouteController'

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useEffect: vi.fn(),
    useRef: vi.fn(),
  }
})

vi.mock('@/lib/routeActions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/routeActions')>()
  return {
    ...actual,
    pushMovieRoute: vi.fn(actual.pushMovieRoute),
    replaceHomeRoute: vi.fn(actual.replaceHomeRoute),
  }
})

describe('decideRouteHistoryWrite', () => {
  it('pushes only when the user focus target changes to a movie', () => {
    expect(decideRouteHistoryWrite({ previousMovieId: null, movieId: 1 })).toEqual({
      kind: 'push-movie',
      movieId: 1,
    })
    expect(decideRouteHistoryWrite({ previousMovieId: 1, movieId: 2 })).toEqual({
      kind: 'push-movie',
      movieId: 2,
    })
  })

  it('replaces home when a movie focus target exits', () => {
    expect(decideRouteHistoryWrite({ previousMovieId: 1, movieId: null })).toEqual({
      kind: 'replace-home',
    })
  })

  it('does not write history when the focus target is unchanged', () => {
    expect(decideRouteHistoryWrite({ previousMovieId: null, movieId: null })).toBeNull()
    expect(decideRouteHistoryWrite({ previousMovieId: 1, movieId: 1 })).toBeNull()
  })
})

interface RouteWindowHarness {
  window: Window & typeof globalThis
  setPath(pathname: string): void
  pushState: ReturnType<typeof vi.fn>
  replaceState: ReturnType<typeof vi.fn>
}

const routeSession = {
  relation: { kind: 'person', key: 'popstate-session' },
  movieIds: [1],
  metadata: { fullName: 'Popstate Session', roleMask: 1 },
} satisfies SelectSession

function resetLifecycle(): void {
  useGalaxyInteractionStore.setState({
    explorationContext: { kind: 'idle' },
  })
}

function createRouteWindowHarness(initialPathname: string): RouteWindowHarness {
  let pathname = initialPathname
  const target = new EventTarget()
  const location = {
    get pathname() {
      return pathname
    },
    search: '',
  }
  const pushState = vi.fn()
  const replaceState = vi.fn()
  const windowStub = {
    location,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  } as unknown as Window & typeof globalThis

  vi.stubGlobal('window', windowStub)
  vi.stubGlobal('location', location)
  vi.stubGlobal('history', { state: null, pushState, replaceState })

  return {
    window: windowStub,
    setPath(nextPathname: string) {
      pathname = nextPathname
    },
    pushState,
    replaceState,
  }
}

describe('useRouteController popstate integration', () => {
  const cleanups: Array<() => void> = []

  beforeEach(() => {
    cleanups.length = 0
    resetLifecycle()
    Object.assign(routeSyncGuard, {
      active: false,
      isPopstate: false,
      suppressStoreToUrl: false,
      lastAppliedPath: null,
    })
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.mocked(useEffect).mockImplementation((effect) => {
      const cleanup = effect()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
    })
    vi.mocked(useRef).mockImplementation((initial) => ({ current: initial }))
    vi.mocked(pushMovieRoute).mockClear()
    vi.mocked(replaceHomeRoute).mockClear()
  })

  afterEach(() => {
    for (const cleanup of cleanups.reverse()) cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    resetLifecycle()
  })

  it('applies real Back and Forward popstate without store-to-URL loops', () => {
    const harness = createRouteWindowHarness('/movie/1')
    dispatchExplorationIntent({ type: 'select/entered', session: routeSession })
    dispatchExplorationIntent({
      type: 'focus/requested',
      movieId: 1,
      policy: 'preserve-if-member',
    })

    useRouteController({ routeReady: true, movies: [...galaxyMinimalFixture.movies] })
    harness.pushState.mockClear()
    harness.replaceState.mockClear()

    harness.setPath('/')
    harness.window.dispatchEvent(new Event('popstate'))
    expect(readExplorationContext()).toEqual({ kind: 'select', session: routeSession })
    expect(replaceHomeRoute).toHaveBeenCalledOnce()
    expect(pushMovieRoute).not.toHaveBeenCalled()
    expect(harness.pushState).not.toHaveBeenCalled()
    expect(harness.replaceState).not.toHaveBeenCalled()

    vi.mocked(pushMovieRoute).mockClear()
    vi.mocked(replaceHomeRoute).mockClear()
    harness.setPath('/movie/1')
    harness.window.dispatchEvent(new Event('popstate'))
    expect(readExplorationContext()).toEqual({
      kind: 'focus',
      movieId: 1,
      parent: routeSession,
    })
    expect(pushMovieRoute).toHaveBeenCalledWith(1)
    expect(replaceHomeRoute).not.toHaveBeenCalled()
    expect(harness.pushState).not.toHaveBeenCalled()
    expect(harness.replaceState).not.toHaveBeenCalled()
  })
})