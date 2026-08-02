import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { pushMovieRoute, replaceHomeRoute, replaceRoutePath } from './routeActions'
import { routeSyncGuard } from './routeSyncGuard'

describe('routeActions', () => {
  let pathname = '/'
  let search = ''

  beforeEach(() => {
    routeSyncGuard.active = false
    routeSyncGuard.isPopstate = false
    routeSyncGuard.suppressStoreToUrl = false
    routeSyncGuard.lastAppliedPath = null
    pathname = '/'
    search = ''

    const locationStub = {
      get pathname() {
        return pathname
      },
      get search() {
        return search
      },
    }

    vi.stubGlobal('window', { location: locationStub })
    vi.stubGlobal('location', locationStub)

    vi.stubGlobal('history', {
      state: { explorationContext: { kind: 'select', session: { relation: 'legacy' } } },
      pushState: vi.fn((_state: unknown, _title: string, url?: string | URL | null) => {
        if (typeof url === 'string') {
          const q = url.indexOf('?')
          pathname = q === -1 ? url : url.slice(0, q)
          search = q === -1 ? '' : url.slice(q)
        }
      }),
      replaceState: vi.fn((_state: unknown, _title: string, url?: string | URL | null) => {
        if (typeof url === 'string') {
          const q = url.indexOf('?')
          pathname = q === -1 ? url : url.slice(0, q)
          search = q === -1 ? '' : url.slice(q)
        }
      }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pushMovieRoute updates pathname (B1)', () => {
    pushMovieRoute(550)
    expect(history.pushState).toHaveBeenCalledOnce()
    expect(pathname).toBe('/movie/550')
    expect(routeSyncGuard.lastAppliedPath).toBe('/movie/550')
  })

  it('replaceHomeRoute uses replaceState (B3–B6)', () => {
    pathname = '/movie/550'
    routeSyncGuard.lastAppliedPath = '/movie/550'
    replaceHomeRoute()
    expect(history.replaceState).toHaveBeenCalledOnce()
    expect(pathname).toBe('/')
  })

  it('does not mutate history during popstate or URL-to-store suppression', () => {
    pathname = '/movie/1'
    routeSyncGuard.lastAppliedPath = '/movie/1'
    routeSyncGuard.isPopstate = true
    pushMovieRoute(1)
    replaceHomeRoute()
    expect(history.pushState).not.toHaveBeenCalled()
    expect(history.replaceState).not.toHaveBeenCalled()

    routeSyncGuard.isPopstate = false
    routeSyncGuard.suppressStoreToUrl = true
    pushMovieRoute(2)
    replaceHomeRoute()
    expect(history.pushState).not.toHaveBeenCalled()
    expect(history.replaceState).not.toHaveBeenCalled()
  })

  it('preserves query on pushMovieRoute (T6)', () => {
    search = '?lang=zh&theme=light'
    pushMovieRoute(550)
    expect(pathname).toBe('/movie/550')
    expect(search).toBe('?lang=zh&theme=light')
  })

  it('skips duplicate push when path unchanged (T8 guard)', () => {
    routeSyncGuard.lastAppliedPath = '/movie/1'
    pathname = '/movie/1'
    pushMovieRoute(1)
    expect(history.pushState).not.toHaveBeenCalled()
  })

  it('does not carry Select snapshots into route history state', () => {
    pushMovieRoute(550)
    expect(history.pushState).toHaveBeenCalledWith(null, '', '/movie/550')

    pathname = '/movie/550'
    routeSyncGuard.lastAppliedPath = '/movie/550'
    replaceHomeRoute()
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/')
  })

  it('clears stale history state during canonical replacement', () => {
    replaceRoutePath('/?lang=ja')
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/?lang=ja')
  })

  it('replaceRoutePath updates location (R1/R2)', () => {
    replaceRoutePath('/?lang=ja')
    expect(history.replaceState).toHaveBeenCalledOnce()
    expect(pathname).toBe('/')
    expect(search).toBe('?lang=ja')
    expect(routeSyncGuard.lastAppliedPath).toBe('/?lang=ja')
  })
})
