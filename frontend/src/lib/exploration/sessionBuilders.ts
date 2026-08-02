import { normalizeForSearch } from '@/utils/searchScore'
import type { Movie } from '@/types/galaxy'
import type { SearchIndex } from '@/types/searchIndex'
import type { GenreSelectSession, PersonSelectSession } from './types'

/** Stable movie ordering shared by all Select session builders. */
export function sortMovieIdsByRelease(
  ids: readonly number[],
  movieById: ReadonlyMap<number, Movie>,
): number[] {
  const uniqueIds = [...new Set(ids)]
  return uniqueIds.sort((left, right) => {
    const leftDate = movieById.get(left)?.release_date ?? ''
    const rightDate = movieById.get(right)?.release_date ?? ''
    const dateOrder = leftDate.localeCompare(rightDate)
    return dateOrder !== 0 ? dateOrder : left - right
  })
}

/** Build the complete canonical payload for a person Select session. */
export function buildPersonSelectSession(args: {
  personKey: string
  searchIndex: SearchIndex
  movieById: ReadonlyMap<number, Movie>
}): PersonSelectSession | null {
  const { personKey, searchIndex, movieById } = args
  const entry = searchIndex.people[personKey]
  if (!entry) return null

  return {
    relation: { kind: 'person', key: personKey },
    movieIds: sortMovieIdsByRelease(entry.movie_ids, movieById),
    metadata: {
      fullName: entry.full,
      roleMask: entry.role_mask,
      ...(entry.movie_roles === undefined ? {} : { movieRoles: { ...entry.movie_roles } }),
    },
  }
}

/** Canonical identity for an ordered Genre condition list. */
export function buildGenreRelationKey(genreNames: readonly string[]): string {
  return `genre:${genreNames.map((name) => normalizeForSearch(name)).join('+')}`
}

/** UI query/label for the same ordered Genre condition list. */
export function formatGenreSessionQuery(genreNames: readonly string[]): string {
  return genreNames.join(' + ')
}

/** Build one complete Genre session from the index, including its stable intersection. */
export function buildGenreSelectSession(args: {
  genreNames: readonly string[]
  searchIndex: SearchIndex
  movieById: ReadonlyMap<number, Movie>
}): GenreSelectSession | null {
  const { genreNames, searchIndex, movieById } = args
  if (genreNames.length === 0) return null

  const entries = genreNames.map((name) => searchIndex.genres[name])
  if (entries.some((entry) => entry === undefined)) return null

  const firstIds = entries[0]!.movie_ids
  const otherIdSets = entries.slice(1).map((entry) => new Set(entry!.movie_ids))
  const intersection = [...new Set(firstIds)].filter((movieId) =>
    otherIdSets.every((ids) => ids.has(movieId)),
  )
  const movieIds = sortMovieIdsByRelease(intersection, movieById)
  if (movieIds.length === 0) return null

  return {
    relation: { kind: 'genre', key: buildGenreRelationKey(genreNames) },
    movieIds,
    conditions: {
      operator: 'and',
      genres: [...genreNames],
    },
  }
}