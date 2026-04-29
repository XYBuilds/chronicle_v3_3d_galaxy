/**
 * Companion file `galaxy_search_index.json.gz` (Tech Spec §4.5).
 * Loaded only when `GalaxyData.meta.has_search_index === true`.
 */

/** Bitfield: cast=1, director=2, dop=4, writers=8, producers=16, music_composer=32 (max 63). */
export type RoleMask = number

export interface PersonEntry {
  full: string
  role_mask: RoleMask
  movie_ids: number[]
  /**
   * Per-film role bits for this person (same bit meanings as `role_mask`).
   * Keys are decimal TMDB id strings; values ⊆ `role_mask`. Emitted by P12.7+ pipeline for role-split constellation lines.
   */
  movie_roles?: Record<string, RoleMask>
}

export interface GenreEntry {
  count: number
  movie_ids: number[]
}

export interface SearchIndex {
  version: string
  people: Record<string, PersonEntry>
  genres: Record<string, GenreEntry>
}
