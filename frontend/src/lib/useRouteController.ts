import { useCallback, useEffect, useRef } from 'react'

import { pushMovieRoute, replaceHomeRoute } from '@/lib/routeActions'
import {
  applyParsedRouteToStores,
  normalizeUnknownRoute,
  runInitialRouteBoot,
} from '@/lib/routeControllerSync'
import { routeSyncGuard } from '@/lib/routeSyncGuard'
import { parseRoute, type ParsedRoute } from '@/lib/routes'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import type { Movie } from '@/types/galaxy'

export type InitialRouteBootKind = 'pending' | 'movie' | 'cover'

export interface UseRouteControllerOptions {
  /** `galaxyData` ready and search index hydration terminal. */
  routeReady: boolean
  movies: Movie[] | null
  coverBootReady: boolean
  setCoverBootReady: (ready: boolean) => void
  onInitialRouteBootKind: (kind: Exclude<InitialRouteBootKind, 'pending'>) => void
}

function withStoreToUrlSuppressed<T>(fn: () => T): T {
  routeSyncGuard.suppressStoreToUrl = true
  try {
    return fn()
  } finally {
    routeSyncGuard.suppressStoreToUrl = false
  }
}

async function withStoreToUrlSuppressedAsync<T>(fn: () => Promise<T>): Promise<T> {
  routeSyncGuard.suppressStoreToUrl = true
  try {
    return await fn()
  } finally {
    routeSyncGuard.suppressStoreToUrl = false
  }
}

/**
 * URL → Zustand (30.3) + store → URL (30.4 B1–B6) via `selectedMovieId` subscription.
 */
export function useRouteController(options: UseRouteControllerOptions): void {
  const { routeReady, movies, coverBootReady, setCoverBootReady, onInitialRouteBootKind } = options

  const pendingRouteRef = useRef<ParsedRoute | null>(null)
  const initialBootHandledRef = useRef(false)

  useEffect(() => {
    if (pendingRouteRef.current !== null) return
    const cached = parseRoute(window.location)
    pendingRouteRef.current = cached
    routeSyncGuard.lastAppliedPath = `${window.location.pathname}${window.location.search}`
    console.log('[route] pendingRoute cached', cached)
  }, [])

  const applyRouteToStore = useCallback(async (rawRoute: ParsedRoute, ctx: { movies: Movie[] }) => {
    routeSyncGuard.lastAppliedPath = `${window.location.pathname}${window.location.search}`
    await applyParsedRouteToStores(rawRoute, { movies: ctx.movies })
  }, [])

  /** Initial boot: R4 movie deep link skips App `resolveToday → setCover`. */
  useEffect(() => {
    if (!routeReady || !movies?.length || initialBootHandledRef.current) return

    initialBootHandledRef.current = true
    const search = window.location.search
    const raw = pendingRouteRef.current ?? parseRoute(window.location)
    const route = normalizeUnknownRoute(raw, search)
    pendingRouteRef.current = route
    routeSyncGuard.lastAppliedPath = `${window.location.pathname}${window.location.search}`

    const bootKind = withStoreToUrlSuppressed(() => runInitialRouteBoot(route, movies, search))
    onInitialRouteBootKind(bootKind)
    if (bootKind === 'movie') {
      setCoverBootReady(true)
    }
  }, [routeReady, movies, onInitialRouteBootKind, setCoverBootReady])

  /** `popstate` — URL → store only; no push (R7/R8). */
  useEffect(() => {
    if (!routeReady || !movies?.length || !coverBootReady) return

    const onPopstate = () => {
      const route = parseRoute(window.location)
      console.log('[route] popstate', route)
      routeSyncGuard.isPopstate = true
      void withStoreToUrlSuppressedAsync(async () => {
        await applyRouteToStore(route, { movies })
      }).finally(() => {
        routeSyncGuard.isPopstate = false
      })
    }

    window.addEventListener('popstate', onPopstate)
    return () => window.removeEventListener('popstate', onPopstate)
  }, [routeReady, movies, coverBootReady, applyRouteToStore])

  /** Store → URL (B1–B6): focus changes from user actions, not URL→store or popstate. */
  useEffect(() => {
    if (!routeReady || !coverBootReady) return

    return useGalaxyInteractionStore.subscribe((state, prev) => {
      const next = state.selectedMovieId
      const prevId = prev.selectedMovieId
      if (next === prevId) return

      if (next !== null) {
        pushMovieRoute(next)
        return
      }

      if (prevId !== null) {
        replaceHomeRoute()
      }
    })
  }, [routeReady, coverBootReady])
}
