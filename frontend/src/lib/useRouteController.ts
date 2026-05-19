import { useCallback, useEffect, useRef } from 'react'

import { resolveTodayMovieId } from '@/data/loadToday'
import { buildHomePath, parseRoute, type ParsedRoute } from '@/lib/routes'
import { useCoverModeStore } from '@/store/coverModeStore'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import type { Movie } from '@/types/galaxy'

/** Phase 30.3 — guard URL↔store sync loops (R7); extended in 30.4 for push/replace. */
export const routeSyncGuard = {
  active: false,
  isPopstate: false,
  lastAppliedPath: null as string | null,
}

export type InitialRouteBootKind = 'pending' | 'movie' | 'cover'

export interface UseRouteControllerOptions {
  /** `galaxyData` ready and search index hydration terminal. */
  routeReady: boolean
  movies: Movie[] | null
  coverBootReady: boolean
  setCoverBootReady: (ready: boolean) => void
  onInitialRouteBootKind: (kind: Exclude<InitialRouteBootKind, 'pending'>) => void
}

function movieExists(movies: Movie[], id: number): boolean {
  return movies.some((m) => m.id === id)
}

function replaceUrlPath(pathWithSearch: string): void {
  if (routeSyncGuard.active) return
  routeSyncGuard.active = true
  try {
    history.replaceState(history.state, '', pathWithSearch)
    routeSyncGuard.lastAppliedPath = pathWithSearch
  } finally {
    routeSyncGuard.active = false
  }
}

function normalizeUnknownRoute(route: ParsedRoute, search: string): ParsedRoute {
  if (route.kind !== 'unknown') return route
  console.warn('[route] unknown path → home (R1)', { pathname: window.location.pathname })
  replaceUrlPath(buildHomePath(search))
  return { kind: 'home' }
}

/**
 * URL → Zustand (Phase 30.3): cold start, `pendingRoute`, R4 cover-boot skip, `popstate`.
 * Store → URL (B1–B6) lands in 30.4.
 */
export function useRouteController(options: UseRouteControllerOptions): void {
  const { routeReady, movies, coverBootReady, setCoverBootReady, onInitialRouteBootKind } = options

  const pendingRouteRef = useRef<ParsedRoute | null>(null)
  const initialBootHandledRef = useRef(false)

  useEffect(() => {
    if (pendingRouteRef.current !== null) return
    const cached = parseRoute(window.location)
    pendingRouteRef.current = cached
    console.log('[route] pendingRoute cached', cached)
  }, [])

  const applyCoverRoute = useCallback(async (list: Movie[]) => {
    useGalaxyInteractionStore.setState({ selectedMovieId: null })
    const { movieId } = await resolveTodayMovieId(list)
    useCoverModeStore.getState().setCover(movieId)
    console.log('[route] apply cover (home/today)', { movieId })
  }, [])

  const applyRouteToStore = useCallback(
    async (rawRoute: ParsedRoute, ctx: { isPopstate: boolean; movies: Movie[] }) => {
      const { isPopstate, movies: list } = ctx
      const search = window.location.search
      const route = normalizeUnknownRoute(rawRoute, search)

      if (route.kind === 'movie' && route.movieId != null) {
        const id = route.movieId
        if (!movieExists(list, id)) {
          console.warn('[route] movie not in galaxy (R2)', { id })
          replaceUrlPath(buildHomePath(search))
          useCoverModeStore.setState({
            coverMode: false,
            todayMovieId: null,
            exitCoverPreserveOrbit: false,
          })
          useGalaxyInteractionStore.setState({ selectedMovieId: null })
          await applyCoverRoute(list)
          return
        }

        console.log('[route] apply movie', { id, isPopstate })
        useCoverModeStore.setState({
          coverMode: false,
          todayMovieId: null,
          exitCoverPreserveOrbit: false,
        })
        useGalaxyInteractionStore.setState({ selectedMovieId: id })
        return
      }

      await applyCoverRoute(list)
    },
    [applyCoverRoute],
  )

  /** Initial boot: R4 movie deep link skips App `resolveToday → setCover`. */
  useEffect(() => {
    if (!routeReady || !movies?.length || initialBootHandledRef.current) return

    initialBootHandledRef.current = true
    const search = window.location.search
    const raw = pendingRouteRef.current ?? parseRoute(window.location)
    const route = normalizeUnknownRoute(raw, search)
    pendingRouteRef.current = route

    if (route.kind === 'movie' && route.movieId != null && movieExists(movies, route.movieId)) {
      console.log('[route] initial movie boot (R4 skip setCover)', { id: route.movieId })
      useCoverModeStore.setState({
        coverMode: false,
        todayMovieId: null,
        exitCoverPreserveOrbit: false,
      })
      useGalaxyInteractionStore.setState({ selectedMovieId: route.movieId })
      onInitialRouteBootKind('movie')
      setCoverBootReady(true)
      return
    }

    if (route.kind === 'movie' && route.movieId != null) {
      console.warn('[route] initial movie missing in galaxy (R2) → cover boot', { id: route.movieId })
      replaceUrlPath(buildHomePath(search))
      pendingRouteRef.current = { kind: 'home' }
    }

    useGalaxyInteractionStore.setState({ selectedMovieId: null })
    onInitialRouteBootKind('cover')
  }, [routeReady, movies, onInitialRouteBootKind, setCoverBootReady])

  /** `popstate` — URL → store only; no push (R7/R8). */
  useEffect(() => {
    if (!routeReady || !movies?.length || !coverBootReady) return

    const onPopstate = () => {
      const route = parseRoute(window.location)
      console.log('[route] popstate', route)
      routeSyncGuard.isPopstate = true
      void applyRouteToStore(route, { isPopstate: true, movies }).finally(() => {
        routeSyncGuard.isPopstate = false
      })
    }

    window.addEventListener('popstate', onPopstate)
    return () => window.removeEventListener('popstate', onPopstate)
  }, [routeReady, movies, coverBootReady, applyRouteToStore])
}
