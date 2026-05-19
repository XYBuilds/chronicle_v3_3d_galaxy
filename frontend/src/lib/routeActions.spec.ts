import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { pushMovieRoute, replaceHomeRoute } from './routeActions'
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
      state: {},
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

  it('does not push during popstate or suppress guard', () => {
    routeSyncGuard.isPopstate = true
    pushMovieRoute(1)
    expect(history.pushState).not.toHaveBeenCalled()

    routeSyncGuard.isPopstate = false
    routeSyncGuard.suppressStoreToUrl = true
    pushMovieRoute(2)
    expect(history.pushState).not.toHaveBeenCalled()
  })
})
