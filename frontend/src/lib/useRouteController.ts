import { useEffect, useRef } from 'react'

import { pushMovieRoute, replaceHomeRoute } from '@/lib/routeActions'
import {
  applyParsedRouteToStores,
  runInitialRouteBoot,
} from '@/lib/routeControllerSync'
import { routeSyncGuard } from '@/lib/routeSyncGuard'
import { parseRoute } from '@/lib/routes'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import type { Movie } from '@/types/galaxy'

export interface UseRouteControllerOptions {
  /** `galaxyData` ready and search index hydration terminal. */
  routeReady: boolean
  movies: Movie[] | null
}

function withStoreToUrlSuppressed<T>(fn: () => T): T {
  routeSyncGuard.suppressStoreToUrl = true
  try {
    return fn()
  } finally {
    routeSyncGuard.suppressStoreToUrl = false
  }
}

export interface RouteStoreWrite {
  previousMovieId: number | null
  movieId: number | null
}

export function decideRouteHistoryWrite(change: RouteStoreWrite):
  | { kind: 'push-movie'; movieId: number }
  | { kind: 'replace-home' }
  | null {
  if (change.movieId === change.previousMovieId) return null
  if (change.movieId !== null) return { kind: 'push-movie', movieId: change.movieId }
  return change.previousMovieId === null ? null : { kind: 'replace-home' }
}

/**
 * URL → Zustand (30.3) + store → URL (30.4 B1–B6) via `selectedMovieId` subscription.
 */
export function useRouteController(options: UseRouteControllerOptions): void {
  const { routeReady, movies } = options

  const initialBootHandledRef = useRef(false)

  useEffect(() => {
    routeSyncGuard.lastAppliedPath = `${window.location.pathname}${window.location.search}`
    console.log('[route] initial target cached', parseRoute(window.location))
  }, [])

  /** Initial boot applies home idle or a valid movie focus after data and index readiness. */
  useEffect(() => {
    if (!routeReady || !movies?.length || initialBootHandledRef.current) return

    initialBootHandledRef.current = true
    const search = window.location.search
    // Read again after readiness so a traversal during data hydration cannot apply a stale boot route.
    const route = parseRoute(window.location)
    routeSyncGuard.lastAppliedPath = `${window.location.pathname}${window.location.search}`

    withStoreToUrlSuppressed(() => runInitialRouteBoot(route, movies, search))
  }, [routeReady, movies])

  /** `popstate` — URL → store only; no push (R7/R8). */
  useEffect(() => {
    if (!routeReady || !movies?.length) return

    const onPopstate = () => {
      const route = parseRoute(window.location)
      console.log('[route] popstate', route)
      routeSyncGuard.isPopstate = true
      try {
        withStoreToUrlSuppressed(() => {
          routeSyncGuard.lastAppliedPath = `${window.location.pathname}${window.location.search}`
          applyParsedRouteToStores(route, { movies })
        })
      } finally {
        routeSyncGuard.isPopstate = false
      }
    }

    window.addEventListener('popstate', onPopstate)
    return () => window.removeEventListener('popstate', onPopstate)
  }, [routeReady, movies])

  /** Store → URL (B1–B6): focus changes from user actions, not URL→store or popstate. */
  useEffect(() => {
    if (!routeReady) return

    return useGalaxyInteractionStore.subscribe((state, prev) => {
      const write = decideRouteHistoryWrite({
        previousMovieId: prev.selectedMovieId,
        movieId: state.selectedMovieId,
      })
      if (write?.kind === 'push-movie') {
        pushMovieRoute(write.movieId)
      } else if (write?.kind === 'replace-home') {
        replaceHomeRoute()
      }
    })
  }, [routeReady])
}
