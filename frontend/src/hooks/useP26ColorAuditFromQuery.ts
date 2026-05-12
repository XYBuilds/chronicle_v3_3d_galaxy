import { useSyncExternalStore } from 'react'

import { isP26ColorAuditEnabled } from '@/lib/p26TodayMovieOverride'

function getSearchSnapshot(): string {
  return typeof window === 'undefined' ? '' : window.location.search
}

function subscribeSearch(cb: () => void): () => void {
  window.addEventListener('popstate', cb)
  return () => window.removeEventListener('popstate', cb)
}

/** P26.1 — `?p26ColorAudit=1|true|yes` shows the floating HDR / color audit panel (QA matrix). */
export function useP26ColorAuditFromQuery(): boolean {
  return useSyncExternalStore(
    subscribeSearch,
    () => isP26ColorAuditEnabled(getSearchSnapshot()),
    () => false,
  )
}
