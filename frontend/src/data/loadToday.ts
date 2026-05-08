import { resolveTodayJsonUrl } from '@/lib/galaxyAssetUrls'
import type { Movie } from '@/types/galaxy'

export interface TodayPayload {
  date: string
  movie_id: number
  selected_at?: string
  selection_strategy?: string
  min_vote_count?: number
}

export interface ResolveTodayResult {
  movieId: number
  payload: TodayPayload | null
  usedFallback: boolean
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Parse ``today.json`` body; returns ``null`` if shape is invalid. */
export function parseTodayPayload(raw: unknown): TodayPayload | null {
  if (!isRecord(raw)) return null
  const date = raw.date
  const movie_id = raw.movie_id
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return null
  if (typeof movie_id !== 'number' || !Number.isInteger(movie_id)) return null
  const out: TodayPayload = { date: date.trim(), movie_id }
  if (typeof raw.selected_at === 'string' && raw.selected_at.trim()) out.selected_at = raw.selected_at.trim()
  if (typeof raw.selection_strategy === 'string' && raw.selection_strategy.trim()) {
    out.selection_strategy = raw.selection_strategy.trim()
  }
  if (typeof raw.min_vote_count === 'number' && Number.isInteger(raw.min_vote_count)) {
    out.min_vote_count = raw.min_vote_count
  }
  return out
}

/** Current calendar date in UTC as ``YYYY-MM-DD``. */
export function utcTodayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Absolute calendar-day distance between two ``YYYY-MM-DD`` strings (UTC noon anchor).
 * Returns a non-negative integer.
 */
export function utcCalendarDaysApart(a: string, b: string): number {
  const da = Date.parse(`${a.trim()}T12:00:00.000Z`)
  const db = Date.parse(`${b.trim()}T12:00:00.000Z`)
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 999
  return Math.round(Math.abs(db - da) / 86400000)
}

/** ``true`` when ``payload.date`` is more than one calendar day away from browser UTC date (stale feed). */
export function isTodayDateStale(payloadDate: string, browserUtcDate: string): boolean {
  return utcCalendarDaysApart(payloadDate, browserUtcDate) > 1
}

export function fallbackTodayMovieId(movies: readonly Movie[]): number {
  const top = [...movies].sort((a, b) => b.vote_count - a.vote_count).slice(0, 1000)
  if (top.length === 0) {
    throw new Error('[Today] fallback: empty movies')
  }
  const idx = Math.floor(Math.random() * top.length)
  const picked = top[idx]!.id
  console.warn('[Today] fallback random Top-1000', { picked, idx, pool: top.length })
  return picked
}

/**
 * Fetch ``today.json`` from manifest ``today_url`` or bundled ``/data/today.json``.
 * Does not validate against galaxy movies (use ``resolveTodayMovieId`` for full resolution).
 */
export async function loadTodayPayload(signal?: AbortSignal): Promise<TodayPayload | null> {
  const url = await resolveTodayJsonUrl()
  try {
    const res = await fetch(url, { cache: 'no-cache', signal })
    if (!res.ok) {
      console.warn('[Today] fetch failed', { url, status: res.status })
      return null
    }
    const raw: unknown = await res.json()
    const parsed = parseTodayPayload(raw)
    if (!parsed) {
      console.warn('[Today] JSON shape invalid', { url })
      return null
    }
    console.log('[Today] loaded payload', { date: parsed.date, movie_id: parsed.movie_id })
    return parsed
  } catch (e) {
    console.warn('[Today] load error', e)
    return null
  }
}

/**
 * Resolve today's TMDB id: remote ``today.json`` when valid; else Top-1000 random (user-visible no error).
 */
export async function resolveTodayMovieId(movies: readonly Movie[]): Promise<ResolveTodayResult> {
  const n = movies.length
  console.log('[Today] resolve with galaxy movies', { n })
  const browserUtc = utcTodayDateString()
  const ids = new Set(movies.map((m) => m.id))

  const payload = await loadTodayPayload()
  if (payload === null) {
    return { movieId: fallbackTodayMovieId(movies), payload: null, usedFallback: true }
  }
  if (!ids.has(payload.movie_id)) {
    console.warn('[Today] movie_id not in galaxy', { movie_id: payload.movie_id })
    return { movieId: fallbackTodayMovieId(movies), payload, usedFallback: true }
  }
  if (isTodayDateStale(payload.date, browserUtc)) {
    console.warn('[Today] stale date vs browser UTC', { payloadDate: payload.date, browserUtc })
    return { movieId: fallbackTodayMovieId(movies), payload, usedFallback: true }
  }
  return { movieId: payload.movie_id, payload, usedFallback: false }
}
