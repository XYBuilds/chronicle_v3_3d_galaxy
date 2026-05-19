import { resolveTodayMovieId } from '@/data/loadToday'
import { replaceRoutePath } from '@/lib/routeActions'
import { buildHomePath, type ParsedRoute } from '@/lib/routes'
import { useCoverModeStore } from '@/store/coverModeStore'
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

export function clearCoverAndFocus(): void {
  useCoverModeStore.setState({
    coverMode: false,
    todayMovieId: null,
    exitCoverPreserveOrbit: false,
  })
  useGalaxyInteractionStore.setState({ selectedMovieId: null })
}

export function applyMovieFocusToStores(movieId: number): void {
  useCoverModeStore.setState({
    coverMode: false,
    todayMovieId: null,
    exitCoverPreserveOrbit: false,
  })
  useGalaxyInteractionStore.setState({ selectedMovieId: movieId })
}

export async function applyCoverRouteFromToday(movies: Movie[]): Promise<number> {
  useGalaxyInteractionStore.setState({ selectedMovieId: null })
  const { movieId } = await resolveTodayMovieId(movies)
  useCoverModeStore.getState().setCover(movieId)
  return movieId
}

export interface ApplyParsedRouteOptions {
  movies: Movie[]
  /** Defaults to `window.location.search`. */
  search?: string
}

/** URL → store (§5.8 T1–T3, popstate, R2). Caller sets `routeSyncGuard.suppressStoreToUrl` when needed. */
export async function applyParsedRouteToStores(
  rawRoute: ParsedRoute,
  options: ApplyParsedRouteOptions,
): Promise<void> {
  const { movies } = options
  const search = options.search ?? window.location.search
  const route = normalizeUnknownRoute(rawRoute, search)

  if (route.kind === 'movie' && route.movieId != null) {
    const id = route.movieId
    if (!movieExistsInGalaxy(movies, id)) {
      console.warn('[route] movie not in galaxy (R2)', { id })
      replaceRoutePath(buildHomePath(search))
      clearCoverAndFocus()
      await applyCoverRouteFromToday(movies)
      return
    }
    applyMovieFocusToStores(id)
    return
  }

  await applyCoverRouteFromToday(movies)
}

export type InitialRouteBootResult = 'movie' | 'cover'

/** R4 initial boot — movie deep link skips cover when id exists in galaxy (§5.8 T1/T2). */
export function runInitialRouteBoot(
  rawRoute: ParsedRoute,
  movies: Movie[],
  search = window.location.search,
): InitialRouteBootResult {
  const route = normalizeUnknownRoute(rawRoute, search)

  if (route.kind === 'movie' && route.movieId != null && movieExistsInGalaxy(movies, route.movieId)) {
    applyMovieFocusToStores(route.movieId)
    return 'movie'
  }

  if (route.kind === 'movie' && route.movieId != null) {
    console.warn('[route] initial movie missing in galaxy (R2) → cover boot', { id: route.movieId })
    replaceRoutePath(buildHomePath(search))
  }

  useGalaxyInteractionStore.setState({ selectedMovieId: null })
  return 'cover'
}
