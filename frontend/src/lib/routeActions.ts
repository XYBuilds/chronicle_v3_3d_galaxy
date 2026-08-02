import { buildHomePath, buildMoviePath } from '@/lib/routes'
import { routeSyncGuard } from '@/lib/routeSyncGuard'

const EMPTY_ROUTE_HISTORY_STATE = null

function currentPathWithSearch(): string {
  return `${window.location.pathname}${window.location.search}`
}

function canMutateHistoryFromStore(): boolean {
  return !routeSyncGuard.active && !routeSyncGuard.isPopstate && !routeSyncGuard.suppressStoreToUrl
}

/** B1/B2 — user enters movie focus: `pushState` `/movie/:id` (R6). */
export function pushMovieRoute(id: number): void {
  if (!canMutateHistoryFromStore()) return
  const path = buildMoviePath(id, window.location.search)
  if (routeSyncGuard.lastAppliedPath === path) return
  routeSyncGuard.active = true
  try {
    history.pushState(EMPTY_ROUTE_HISTORY_STATE, '', path)
    routeSyncGuard.lastAppliedPath = path
    console.log('[route] push movie (B1/B2)', { id, path })
  } finally {
    routeSyncGuard.active = false
  }
}

/** B3–B6 — clear focus / close drawer: `replaceState` `/` (R8). */
export function replaceHomeRoute(): void {
  if (!canMutateHistoryFromStore()) return
  const path = buildHomePath(window.location.search)
  const current = currentPathWithSearch()
  if (routeSyncGuard.lastAppliedPath === path || current === path) {
    routeSyncGuard.lastAppliedPath = path
    return
  }
  routeSyncGuard.active = true
  try {
    history.replaceState(EMPTY_ROUTE_HISTORY_STATE, '', path)
    routeSyncGuard.lastAppliedPath = path
    console.log('[route] replace home (B3–B6)', { path })
  } finally {
    routeSyncGuard.active = false
  }
}

/** Program / R1 / R2 corrections — same as home replace without B-log. */
export function replaceRoutePath(pathWithSearch: string): void {
  if (routeSyncGuard.active) return
  routeSyncGuard.active = true
  try {
    history.replaceState(EMPTY_ROUTE_HISTORY_STATE, '', pathWithSearch)
    routeSyncGuard.lastAppliedPath = pathWithSearch
  } finally {
    routeSyncGuard.active = false
  }
}
