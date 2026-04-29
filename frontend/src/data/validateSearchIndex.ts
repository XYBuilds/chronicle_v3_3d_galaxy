import type { GenreEntry, PersonEntry, SearchIndex } from '@/types/searchIndex'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function validatePersonEntry(key: string, v: unknown): asserts v is PersonEntry {
  if (!isRecord(v)) {
    throw new Error(`[SearchIndex] people[${JSON.stringify(key)}] must be an object`)
  }
  if (typeof v.full !== 'string') {
    throw new Error(`[SearchIndex] people[${JSON.stringify(key)}].full must be a string`)
  }
  const rm = v.role_mask
  if (typeof rm !== 'number' || !Number.isInteger(rm) || rm < 0 || rm > 63) {
    throw new Error(
      `[SearchIndex] people[${JSON.stringify(key)}].role_mask must be an integer in [0, 63], got ${String(rm)}`,
    )
  }
  const ids = v.movie_ids
  if (!Array.isArray(ids)) {
    throw new Error(`[SearchIndex] people[${JSON.stringify(key)}].movie_ids must be an array`)
  }
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    if (typeof id !== 'number' || !Number.isInteger(id)) {
      throw new Error(`[SearchIndex] people[${JSON.stringify(key)}].movie_ids[${i}] must be an integer`)
    }
  }
  const mr = v.movie_roles
  if (mr !== undefined) {
    if (!isRecord(mr)) {
      throw new Error(`[SearchIndex] people[${JSON.stringify(key)}].movie_roles must be an object when present`)
    }
    const idSet = new Set(ids)
    for (const sk of Object.keys(mr)) {
      const mid = Number(sk)
      if (!Number.isInteger(mid) || !idSet.has(mid)) {
        throw new Error(
          `[SearchIndex] people[${JSON.stringify(key)}].movie_roles has unknown movie key ${JSON.stringify(sk)}`,
        )
      }
      const mrm = mr[sk]
      if (typeof mrm !== 'number' || !Number.isInteger(mrm) || mrm < 1 || mrm > 63) {
        throw new Error(
          `[SearchIndex] people[${JSON.stringify(key)}].movie_roles[${JSON.stringify(sk)}] must be integer in [1,63]`,
        )
      }
      if ((mrm & ~rm) !== 0) {
        throw new Error(
          `[SearchIndex] people[${JSON.stringify(key)}].movie_roles[${JSON.stringify(sk)}]=${mrm} exceeds role_mask=${rm}`,
        )
      }
    }
    for (const id of ids) {
      if (mr[String(id)] === undefined) {
        throw new Error(
          `[SearchIndex] people[${JSON.stringify(key)}].movie_roles missing entry for movie id=${id}`,
        )
      }
    }
  }
}

function validateGenreEntry(name: string, v: unknown): asserts v is GenreEntry {
  if (!isRecord(v)) {
    throw new Error(`[SearchIndex] genres[${JSON.stringify(name)}] must be an object`)
  }
  const c = v.count
  if (typeof c !== 'number' || !Number.isInteger(c) || c < 1) {
    throw new Error(
      `[SearchIndex] genres[${JSON.stringify(name)}].count must be an integer >= 1, got ${String(c)}`,
    )
  }
  const ids = v.movie_ids
  if (!Array.isArray(ids) || ids.length < 1) {
    throw new Error(`[SearchIndex] genres[${JSON.stringify(name)}].movie_ids must be a non-empty array`)
  }
  if (c !== ids.length) {
    throw new Error(
      `[SearchIndex] genres[${JSON.stringify(name)}]: count (${c}) must equal len(movie_ids) (${ids.length})`,
    )
  }
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    if (typeof id !== 'number' || !Number.isInteger(id)) {
      throw new Error(`[SearchIndex] genres[${JSON.stringify(name)}].movie_ids[${i}] must be an integer`)
    }
  }
}

/**
 * Runtime validation for fetched search index JSON.
 * When `genrePaletteKeys` is set, enforces `Object.keys(genres)` equals that set (same keys as `meta.genre_palette`).
 */
export function parseAndValidateSearchIndex(
  raw: unknown,
  genrePaletteKeys: readonly string[] | null,
): SearchIndex {
  if (!isRecord(raw)) {
    throw new Error('[SearchIndex] root must be an object')
  }
  if (typeof raw.version !== 'string' || raw.version.length === 0) {
    throw new Error('[SearchIndex] version must be a non-empty string')
  }
  const peopleRaw = raw.people
  const genresRaw = raw.genres
  if (!isRecord(peopleRaw)) {
    throw new Error('[SearchIndex] people must be an object')
  }
  if (!isRecord(genresRaw)) {
    throw new Error('[SearchIndex] genres must be an object')
  }

  for (const key of Object.keys(peopleRaw)) {
    validatePersonEntry(key, peopleRaw[key])
  }
  for (const name of Object.keys(genresRaw)) {
    validateGenreEntry(name, genresRaw[name])
  }

  if (genrePaletteKeys !== null && genrePaletteKeys.length > 0) {
    const paletteSet = new Set(genrePaletteKeys)
    const genreKeys = Object.keys(genresRaw)
    const genreSet = new Set(genreKeys)
    if (paletteSet.size !== genreSet.size || ![...paletteSet].every((k) => genreSet.has(k))) {
      throw new Error(
        `[SearchIndex] genres keys must match meta.genre_palette keys; palette=${genrePaletteKeys.length} genres=${genreKeys.length}`,
      )
    }
  }

  return raw as unknown as SearchIndex
}
