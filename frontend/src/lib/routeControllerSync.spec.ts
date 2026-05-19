import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { replaceRoutePath } from '@/lib/routeActions'
import { galaxyMinimalFixture } from '@/types/galaxyMinimalFixture'
import { useCoverModeStore } from '@/store/coverModeStore'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'

import {
  applyParsedRouteToStores,
  normalizeUnknownRoute,
  runInitialRouteBoot,
} from './routeControllerSync'

vi.mock('@/lib/routeActions', () => ({
  replaceRoutePath: vi.fn(),
}))

vi.mock('@/data/loadToday', () => ({
  resolveTodayMovieId: vi.fn(async () => ({
    movieId: 42,
    payload: null,
    usedFallback: true,
  })),
}))

const movies = [...galaxyMinimalFixture.movies]

function resetStores(): void {
  useGalaxyInteractionStore.setState({ selectedMovieId: null })
  useCoverModeStore.setState({
    coverMode: false,
    todayMovieId: null,
    exitCoverPreserveOrbit: false,
  })
}

describe('routeControllerSync (§5.8 T1–T3)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { pathname: '/', search: '' } })
    resetStores()
    vi.mocked(replaceRoutePath).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('T1: /movie/:id (exists) → focus, cover off', async () => {
    await applyParsedRouteToStores({ kind: 'movie', movieId: 1 }, { movies, search: '' })
    expect(useGalaxyInteractionStore.getState().selectedMovieId).toBe(1)
    expect(useCoverModeStore.getState().coverMode).toBe(false)
    expect(replaceRoutePath).not.toHaveBeenCalled()
  })

  it('T2: /movie/:id (missing) → replace home + cover boot', async () => {
    await applyParsedRouteToStores({ kind: 'movie', movieId: 999_999_999 }, { movies, search: '' })
    expect(replaceRoutePath).toHaveBeenCalledWith('/')
    expect(useGalaxyInteractionStore.getState().selectedMovieId).toBeNull()
    expect(useCoverModeStore.getState().coverMode).toBe(true)
    expect(useCoverModeStore.getState().todayMovieId).toBe(42)
  })

  it('T3: /today → cover + todayId, no focus', async () => {
    await applyParsedRouteToStores({ kind: 'today' }, { movies })
    expect(useGalaxyInteractionStore.getState().selectedMovieId).toBeNull()
    expect(useCoverModeStore.getState().coverMode).toBe(true)
    expect(useCoverModeStore.getState().todayMovieId).toBe(42)
  })

  it('R1: unknown path normalizes to home route apply', () => {
    const normalized = normalizeUnknownRoute({ kind: 'unknown' }, '?lang=zh')
    expect(normalized).toEqual({ kind: 'home' })
    expect(replaceRoutePath).toHaveBeenCalledWith('/?lang=zh')
  })
})

describe('runInitialRouteBoot (R4)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { pathname: '/', search: '' } })
    resetStores()
    vi.mocked(replaceRoutePath).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetStores()
  })

  it('returns movie when deep-link id exists (T1 boot)', () => {
    expect(runInitialRouteBoot({ kind: 'movie', movieId: 1 }, movies)).toBe('movie')
    expect(useGalaxyInteractionStore.getState().selectedMovieId).toBe(1)
    expect(useCoverModeStore.getState().coverMode).toBe(false)
  })

  it('returns cover and replaces home when id missing (T2 boot)', () => {
    expect(runInitialRouteBoot({ kind: 'movie', movieId: 999_999_999 }, movies, '')).toBe('cover')
    expect(replaceRoutePath).toHaveBeenCalledWith('/')
    expect(useGalaxyInteractionStore.getState().selectedMovieId).toBeNull()
  })
})
