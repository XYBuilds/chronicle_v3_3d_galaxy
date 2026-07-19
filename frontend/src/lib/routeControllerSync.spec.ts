import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { replaceRoutePath } from '@/lib/routeActions'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import { galaxyMinimalFixture } from '@/types/galaxyMinimalFixture'

import {
  applyParsedRouteToStores,
  normalizeUnknownRoute,
  runInitialRouteBoot,
} from './routeControllerSync'

vi.mock('@/lib/routeActions', () => ({
  replaceRoutePath: vi.fn(),
}))

const movies = [...galaxyMinimalFixture.movies]

function resetStore(): void {
  useGalaxyInteractionStore.setState({ selectedMovieId: null })
}

describe('routeControllerSync home idle and movie focus', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { pathname: '/', search: '' } })
    resetStore()
    vi.mocked(replaceRoutePath).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetStore()
  })

  it('focuses an in-galaxy movie without a fallback request', () => {
    applyParsedRouteToStores({ kind: 'movie', movieId: 1 }, { movies, search: '' })
    expect(useGalaxyInteractionStore.getState().selectedMovieId).toBe(1)
    expect(replaceRoutePath).not.toHaveBeenCalled()
  })

  it('canonicalizes a missing movie to home and leaves the galaxy idle', () => {
    applyParsedRouteToStores({ kind: 'movie', movieId: 999_999_999 }, { movies, search: '' })
    expect(replaceRoutePath).toHaveBeenCalledWith('/')
    expect(useGalaxyInteractionStore.getState().selectedMovieId).toBeNull()
  })

  it('clears a prior selection for home', () => {
    useGalaxyInteractionStore.setState({ selectedMovieId: 1 })
    applyParsedRouteToStores({ kind: 'home' }, { movies })
    expect(useGalaxyInteractionStore.getState().selectedMovieId).toBeNull()
  })

  it('normalizes an unknown path to home idle while retaining query parameters', () => {
    const normalized = normalizeUnknownRoute({ kind: 'unknown' }, '?lang=zh')
    expect(normalized).toEqual({ kind: 'home' })
    expect(replaceRoutePath).toHaveBeenCalledWith('/?lang=zh')
  })
})

describe('runInitialRouteBoot', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { pathname: '/', search: '' } })
    resetStore()
    vi.mocked(replaceRoutePath).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetStore()
  })

  it('initially focuses a known movie deep link', () => {
    runInitialRouteBoot({ kind: 'movie', movieId: 1 }, movies)
    expect(useGalaxyInteractionStore.getState().selectedMovieId).toBe(1)
  })

  it('initially enters idle for home and never resolves today.json', () => {
    runInitialRouteBoot({ kind: 'home' }, movies)
    expect(useGalaxyInteractionStore.getState().selectedMovieId).toBeNull()
  })

  it('initially canonicalizes a missing deep link to idle', () => {
    runInitialRouteBoot({ kind: 'movie', movieId: 999_999_999 }, movies, '')
    expect(replaceRoutePath).toHaveBeenCalledWith('/')
    expect(useGalaxyInteractionStore.getState().selectedMovieId).toBeNull()
  })
})