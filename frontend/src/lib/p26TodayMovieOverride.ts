/**
 * P26.1 — optional query override so HDR / color matrix runs on the same TMDB row across devices.
 * `?todayMovieId=<tmdb>` or alias `?p26Today=<tmdb>` (must exist in the loaded galaxy bundle).
 */
export function parseP26ForcedTodayMovieId(search: string, validIds: ReadonlySet<number>): number | null {
  const q = new URLSearchParams(search)
  const raw = q.get('todayMovieId') ?? q.get('p26Today')
  if (raw == null || raw.trim() === '') return null
  const n = Number.parseInt(raw.trim(), 10)
  if (!Number.isFinite(n) || n <= 0 || String(n) !== raw.trim()) {
    console.warn('[P26.1] invalid today override (expected positive integer TMDB id)', { raw })
    return null
  }
  if (!validIds.has(n)) {
    console.warn('[P26.1] today override id not in current galaxy_data bundle', { movieId: n })
    return null
  }
  return n
}

export function isP26ColorAuditEnabled(search: string): boolean {
  const v = new URLSearchParams(search).get('p26ColorAudit')
  if (v == null) return false
  const t = v.trim().toLowerCase()
  return t === '1' || t === 'true' || t === 'yes'
}
