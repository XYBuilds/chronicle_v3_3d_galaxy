import { replaceRoutePath } from '@/lib/routeActions'
import { buildHomePath, type ParsedRoute } from '@/lib/routes'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import type { Movie } from '@/types/galaxy'

export function movieExistsInGalaxy(movies: Movie[], id: number): boolean {
  return movies.some((m) => m.id === id)
}

/** R1 — unknown logical path → replace `/` and treat as home. */
export function normalizeUnknownRoute(route: ParsedRoute, search: string): ParsedRoute {
  if (route.kind !== 'unknown') return route
  console.warn('[route] unknown path → home (R1)', { pathname: window.location.pathname })
  replaceRoutePath(buildHomePath(search))
  return { kind: 'home' }
}

export function clearSelection(): void {
  useGalaxyInteractionStore.setState({ selectedMovieId: null })
}

export function applyMovieFocusToStores(movieId: number): void {
  useGalaxyInteractionStore.setState({ selectedMovieId: movieId })
}

export interface ApplyParsedRouteOptions {
  movies: Movie[]
  /** Defaults to `window.location.search`. */
  search?: string
}

/** URL → store (§5.8 T1–T3, popstate, R2). Caller sets `routeSyncGuard.suppressStoreToUrl` when needed. */
export function applyParsedRouteToStores(
  rawRoute: ParsedRoute,
  options: ApplyParsedRouteOptions,
): void {
  const { movies } = options
  const search = options.search ?? window.location.search
  const route = normalizeUnknownRoute(rawRoute, search)

  if (route.kind === 'movie' && route.movieId != null) {
    const id = route.movieId
    if (!movieExistsInGalaxy(movies, id)) {
      console.warn('[route] movie not in galaxy (R2)', { id })
      replaceRoutePath(buildHomePath(search))
      clearSelection()
      return
    }
    applyMovieFocusToStores(id)
    return
  }

  clearSelection()
}

/** Initial boot applies the parsed home/movie state without any Today fallback. */
export function runInitialRouteBoot(
  rawRoute: ParsedRoute,
  movies: Movie[],
  search = window.location.search,
): void {
  applyParsedRouteToStores(rawRoute, { movies, search })
}
