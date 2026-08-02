/**
 * Person Select entry adapter shared by Search HUD and Drawer person links.
 */

import {
  buildPersonSelectSession,
  dispatchExplorationIntent,
  sortMovieIdsByRelease,
} from '@/lib/exploration'
import { setSearchQuery } from '@/store/galaxyInteractionStore'
import type { Movie } from '@/types/galaxy'
import type { SearchIndex } from '@/types/searchIndex'
import { normalizeForSearch } from '@/utils/searchScore'

export { sortMovieIdsByRelease as sortIdsByRelease }

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
  const session = buildPersonSelectSession({ personKey, searchIndex, movieById })
  if (session === null) {
    console.warn('[personSearch] enterPersonSearchSession: missing entry', { personKey })
    return { applied: false, searchQuery: '' }
  }

  dispatchExplorationIntent({ type: 'select/entered', session })

  const ids = session.movieIds
  const q = session.metadata.fullName
  console.log('[personSearch] enter session', {
    key: personKey,
    full: q,
    selectionLen: ids.length,
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

/** Drawer raw-name adapter: enter once, then project the resolved full name into Search UI state. */
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
  const result = enterPersonSearchSession({ personKey, searchIndex, movieById, animateZCurrentTo })
  if (!result.applied) return false
  setSearchQuery(result.searchQuery)
  return true
}
