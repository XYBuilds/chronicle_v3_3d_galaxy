import type { Movie } from '@/types/galaxy'

/** Maximum number of TMDB ID candidates exposed to the UI. */
export const TMDB_ID_SEARCH_RESULT_LIMIT = 8

/** A numeric query begins offering ID-prefix candidates at this length. */
export const TMDB_ID_PREFIX_MIN_LENGTH = 4

export interface TmdbIdPrefixEntry {
  readonly id: number
  readonly idText: string
  readonly movie: Movie
}

/**
 * Read-only lookup data derived from the loaded movie bundle.
 * `prefixEntries` is sorted by numeric TMDB ID, independent of source order.
 */
export interface TmdbIdSearchIndex {
  readonly exactById: ReadonlyMap<number, Movie>
  readonly prefixEntries: readonly TmdbIdPrefixEntry[]
}

export type TmdbIdInputParseResult =
  | {
      readonly status: 'valid'
      readonly digits: string
      /** Null only for a decimal string outside JavaScript's safe integer range. */
      readonly numericId: number | null
    }
  | {
      readonly status: 'invalid'
    }

export type TmdbIdSearchResult =
  | {
      readonly status: 'invalid'
      readonly movies: readonly Movie[]
    }
  | {
      readonly status: 'no-results'
      readonly movies: readonly Movie[]
    }
  | {
      readonly status: 'results'
      readonly movies: readonly Movie[]
    }

const EMPTY_MOVIES: readonly Movie[] = Object.freeze([])

function failInvalidMovieId(id: number): never {
  throw new Error(`[tmdbIdSearch] Movie.id must be a positive safe integer; received ${String(id)}`)
}

function freezeMovies(movies: Movie[]): readonly Movie[] {
  return Object.freeze(movies)
}

/**
 * Builds deterministic TMDB ID lookup structures from loaded movies.
 * Duplicate and malformed IDs deliberately fail before any lookup is exposed.
 */
export function buildTmdbIdSearchIndex(movies: readonly Movie[]): TmdbIdSearchIndex {
  const exactById = new Map<number, Movie>()

  for (const movie of movies) {
    if (!Number.isSafeInteger(movie.id) || movie.id <= 0) failInvalidMovieId(movie.id)
    if (exactById.has(movie.id)) {
      throw new Error(`[tmdbIdSearch] Duplicate Movie.id: ${movie.id}`)
    }
    exactById.set(movie.id, movie)
  }

  const prefixEntries = Object.freeze(
    Array.from(exactById, ([id, movie]) =>
      Object.freeze({
        id,
        idText: String(id),
        movie,
      }),
    ).sort((a, b) => a.id - b.id),
  )

  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    console.log('[tmdbIdSearch] built index', {
      movieCount: movies.length,
      indexCount: exactById.size,
      firstId: prefixEntries[0]?.id ?? null,
      lastId: prefixEntries.at(-1)?.id ?? null,
    })
  }

  return Object.freeze({ exactById, prefixEntries })
}

/**
 * Parses an ID query without trimming or coercing user input. Only ASCII decimal digits are valid.
 */
export function parseTmdbIdQuery(input: string): TmdbIdInputParseResult {
  if (!/^[0-9]+$/.test(input)) return Object.freeze({ status: 'invalid' as const })

  const numericId = Number(input)
  return Object.freeze({
    status: 'valid' as const,
    digits: input,
    numericId: Number.isSafeInteger(numericId) ? numericId : null,
  })
}

/**
 * Looks up one exact ID at any length and, from four digits, ascending numeric ID-prefix candidates.
 * Format errors and valid queries without a match deliberately have distinct statuses.
 */
export function searchTmdbId(index: TmdbIdSearchIndex, input: string): TmdbIdSearchResult {
  const parsed = parseTmdbIdQuery(input)
  if (parsed.status === 'invalid') return Object.freeze({ status: 'invalid' as const, movies: EMPTY_MOVIES })

  const exactMovie = parsed.numericId === null ? undefined : index.exactById.get(parsed.numericId)
  if (parsed.digits.length < TMDB_ID_PREFIX_MIN_LENGTH) {
    return exactMovie
      ? Object.freeze({ status: 'results' as const, movies: freezeMovies([exactMovie]) })
      : Object.freeze({ status: 'no-results' as const, movies: EMPTY_MOVIES })
  }

  const prefixMovies = index.prefixEntries
    .filter((entry) => entry.idText.startsWith(parsed.digits) && entry.id !== exactMovie?.id)
    .map((entry) => entry.movie)
  const movies = exactMovie ? [exactMovie, ...prefixMovies] : prefixMovies
  const limitedMovies = freezeMovies(movies.slice(0, TMDB_ID_SEARCH_RESULT_LIMIT))

  return limitedMovies.length > 0
    ? Object.freeze({ status: 'results' as const, movies: limitedMovies })
    : Object.freeze({ status: 'no-results' as const, movies: EMPTY_MOVIES })
}

/** Alias for callers that describe this operation as a query rather than a search. */
export const queryTmdbId = searchTmdbId