/**
 * P27.3 — Enter a person search highlight session (same store + Z animation contract as {@link SearchBar}).
 */

import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import type { Movie } from '@/types/galaxy'
import type { SearchIndex } from '@/types/searchIndex'
import { normalizeForSearch } from '@/utils/searchScore'

export function sortIdsByRelease(ids: readonly number[], movieById: ReadonlyMap<number, Movie>): number[] {
  return [...ids].sort((a, b) => {
    const da = movieById.get(a)?.release_date ?? ''
    const db = movieById.get(b)?.release_date ?? ''
    return da.localeCompare(db)
  })
}

/** Resolve pipeline / index person key from a raw credits string (NFKC + strip marks + lowercase). */
export function lookupPersonKeyForRawName(searchIndex: SearchIndex, rawName: string): string | null {
  const key = normalizeForSearch(rawName.trim())
  if (!key) return null
  return searchIndex.people[key] ? key : null
}

export function enterPersonSearchSession(args: {
  personKey: string
  searchIndex: SearchIndex
  movieById: ReadonlyMap<number, Movie>
  animateZCurrentTo?: (z: number, durationMs?: number) => void
}): { applied: boolean; searchQuery: string } {
  const { personKey, searchIndex, movieById, animateZCurrentTo } = args
  const entry = searchIndex.people[personKey]
  if (!entry) {
    console.warn('[personSearch] enterPersonSearchSession: missing entry', { personKey })
    return { applied: false, searchQuery: '' }
  }

  const ids = sortIdsByRelease(entry.movie_ids, movieById)
  const q = entry.full
  console.log('[personSearch] enter session', { key: personKey, full: entry.full, selectionLen: ids.length })

  useGalaxyInteractionStore.setState({
    searchMode: 'person',
    selectionIds: ids,
    selectionPersonKey: personKey,
    selectedMovieId: null,
    searchQuery: q,
  })

  const zs = ids
    .map((id) => movieById.get(id)?.z)
    .filter((z): z is number => typeof z === 'number' && Number.isFinite(z))
  if (zs.length === 0) {
    console.warn('[personSearch] no finite z for selectionIds', { key: personKey, idsLen: ids.length })
  } else {
    const zMin = Math.min(...zs)
    animateZCurrentTo?.(zMin, 700)
  }

  return { applied: true, searchQuery: q }
}

export function tryEnterPersonSearchFromRawName(args: {
  rawName: string
  searchIndex: SearchIndex | null | undefined
  movieById: ReadonlyMap<number, Movie>
  animateZCurrentTo?: (z: number, durationMs?: number) => void
}): boolean {
  const { rawName, searchIndex, movieById, animateZCurrentTo } = args
  if (!searchIndex) return false
  const personKey = lookupPersonKeyForRawName(searchIndex, rawName)
  if (!personKey) {
    console.warn('[personSearch] no index key for raw name', {
      rawName,
      normalized: normalizeForSearch(rawName.trim()),
    })
    return false
  }
  const { applied } = enterPersonSearchSession({ personKey, searchIndex, movieById, animateZCurrentTo })
  return applied
}
