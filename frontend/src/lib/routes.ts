/**
 * Lightweight client-side route parser/builder (Phase 30.2).
 * SSOT: Phase 29 spec §5 — no React Router; paths respect `import.meta.env.BASE_URL`.
 */

export type RouteKind = 'home' | 'movie' | 'unknown'

export interface ParsedRoute {
  kind: RouteKind
  /** Set when `kind === 'movie'` and `:id` is a positive safe integer. */
  movieId?: number
}

export interface ParseRouteOptions {
  /** Override for tests; defaults to `import.meta.env.BASE_URL`. */
  basePath?: string
}

export interface BuildPathOptions {
  basePath?: string
}

/** Normalize Vite `BASE_URL` to a trailing-slash prefix (or `/` at site root). */
export function normalizeAppBasePath(base: string = import.meta.env.BASE_URL): string {
  const trimmed = base.trim()
  if (!trimmed || trimmed === '/') return '/'
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

/** Strip deploy base prefix so `/repo/movie/1` → `/movie/1`. */
export function stripAppBasePath(pathname: string, basePath?: string): string {
  const base = normalizeAppBasePath(basePath)
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`

  if (base === '/') {
    return path || '/'
  }

  const baseNoSlash = base.endsWith('/') ? base.slice(0, -1) : base
  if (path === baseNoSlash || path === base || path === `${baseNoSlash}/`) {
    return '/'
  }

  if (path.startsWith(base)) {
    const rest = path.slice(base.length)
    return rest.startsWith('/') ? rest : `/${rest}`
  }

  return path
}

/** Prefix a logical app path (`/movie/1`) with deploy base (`/repo/movie/1`). */
export function withAppBasePath(logicalPath: string, basePath?: string): string {
  const base = normalizeAppBasePath(basePath)
  const logical = logicalPath === '/' ? '/' : logicalPath.startsWith('/') ? logicalPath : `/${logicalPath}`

  if (base === '/') {
    return logical
  }

  if (logical === '/') {
    return baseNoTrailingSlash(base)
  }

  const segment = logical.startsWith('/') ? logical.slice(1) : logical
  return `${base}${segment}`
}

function baseNoTrailingSlash(base: string): string {
  return base.endsWith('/') ? base.slice(0, -1) : base
}

/** TMDB movie id: positive integer within `Number.isSafeInteger`. */
export function parseMovieIdSegment(segment: string): number | null {
  if (!/^\d+$/.test(segment)) return null
  const id = Number(segment)
  if (!Number.isSafeInteger(id) || id <= 0) return null
  return id
}

function normalizeLogicalPath(path: string): string {
  if (path === '/' || path === '') return '/'
  const trimmed = path.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/** Parse logical pathname (no deploy base): `/`, `/movie/:id`, or `unknown`. */
export function parseLogicalPath(logicalPathname: string): ParsedRoute {
  const path = normalizeLogicalPath(logicalPathname)

  if (path === '/') {
    return { kind: 'home' }
  }

  const movieMatch = /^\/movie\/([^/]+)$/.exec(path)
  if (movieMatch) {
    const movieId = parseMovieIdSegment(movieMatch[1]!)
    if (movieId === null) {
      return { kind: 'unknown' }
    }
    return { kind: 'movie', movieId }
  }

  return { kind: 'unknown' }
}

export function parseRoute(
  location: Pick<Location, 'pathname' | 'search'>,
  options?: ParseRouteOptions,
): ParsedRoute {
  const logical = stripAppBasePath(location.pathname, options?.basePath)
  return parseLogicalPath(logical)
}

function mergePathAndSearch(pathname: string, currentSearch: string): string {
  if (!currentSearch) return pathname
  const search = currentSearch.startsWith('?') ? currentSearch : `?${currentSearch}`
  return `${pathname}${search}`
}

function assertBuildMovieId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new RangeError(`[routes] buildMoviePath requires a positive integer id, got ${id}`)
  }
}

/** `/movie/:id` with full query string preserved (R5). */
export function buildMoviePath(
  id: number,
  currentSearch = '',
  options?: BuildPathOptions,
): string {
  assertBuildMovieId(id)
  const pathname = withAppBasePath(`/movie/${id}`, options?.basePath)
  return mergePathAndSearch(pathname, currentSearch)
}

/** `/` (home) with query preserved. */
export function buildHomePath(currentSearch = '', options?: BuildPathOptions): string {
  const pathname = withAppBasePath('/', options?.basePath)
  return mergePathAndSearch(pathname, currentSearch)
}
