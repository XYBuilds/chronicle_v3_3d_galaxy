import {
  dispatchExplorationIntent,
  type ExplorationIntent,
} from '@/lib/exploration'
import { replaceRoutePath } from '@/lib/routeActions'
import { buildHomePath, type ParsedRoute } from '@/lib/routes'
import type { Movie } from '@/types/galaxy'

export function movieExistsInGalaxy(movies: Movie[], id: number): boolean {
  return movies.some((m) => m.id === id)
}

export interface RouteExplorationDecision {
  intent: Extract<ExplorationIntent, { type: 'focus/requested' | 'focus/exited' }>
  canonicalRoute: 'home' | null
  missingMovieId: number | null
}

/**
 * Pure route boundary: URLs express only a focus target. Select sessions stay in memory and
 * are interpreted later by the exploration decision module.
 */
export function decideRouteExploration(
  rawRoute: ParsedRoute,
  movies: Movie[],
): RouteExplorationDecision {
  if (rawRoute.kind === 'unknown') {
    return {
      intent: { type: 'focus/exited' },
      canonicalRoute: 'home',
      missingMovieId: null,
    }
  }
  if (rawRoute.kind === 'movie' && rawRoute.movieId != null) {
    if (movieExistsInGalaxy(movies, rawRoute.movieId)) {
      return {
        intent: {
          type: 'focus/requested',
          movieId: rawRoute.movieId,
          policy: 'preserve-if-member',
        },
        canonicalRoute: null,
        missingMovieId: null,
      }
    }
    return {
      intent: { type: 'focus/exited' },
      canonicalRoute: 'home',
      missingMovieId: rawRoute.movieId,
    }
  }
  return {
    intent: { type: 'focus/exited' },
    canonicalRoute: null,
    missingMovieId: null,
  }
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
  const decision = decideRouteExploration(rawRoute, movies)

  if (rawRoute.kind === 'unknown') {
    console.warn('[route] unknown path → home (R1)', { pathname: window.location.pathname })
  }
  if (decision.missingMovieId !== null) {
    console.warn('[route] movie not in galaxy (R2)', { id: decision.missingMovieId })
  }
  if (decision.canonicalRoute === 'home') {
    replaceRoutePath(buildHomePath(search))
  }

  dispatchExplorationIntent(decision.intent)
}

/** Initial boot applies the parsed home/movie state without any Today fallback. */
export function runInitialRouteBoot(
  rawRoute: ParsedRoute,
  movies: Movie[],
  search = window.location.search,
): void {
  applyParsedRouteToStores(rawRoute, { movies, search })
}
