/**
 * Phase 12.3 — Autocomplete scoring + highlight ranges (Design Spec §4.3–§4.5).
 */

import type { Movie } from '@/types/galaxy'
import type { PersonEntry, SearchIndex } from '@/types/searchIndex'
import type { SearchSuggestion } from '@/store/galaxyInteractionStore'

/** NFKC + strip Unicode marks + lowercase (mirror Python `normalize_for_search_v2`). */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFKC').replace(/\p{M}/gu, '').toLowerCase()
}

export type MatchTier = 'prefix' | 'contains'

export interface TextHighlightRange {
  start: number
  end: number
}

export interface MovieSearchHit {
  movie: Movie
  tier: MatchTier
  score: number
  /** Legacy store/search-query label; presentation must use the structured fields below. */
  label: string
  displayTitle: string
  /** Present only when it differs from the displayed title. */
  originalTitle: string | null
  /** Valid four-digit release year, or null when the source date is unavailable/malformed. */
  releaseYear: string | null
  tmdbId: number
  /** Ranges within `displayTitle`; TMDB IDs, years, and genres are never highlighted. */
  displayTitleHighlightRanges: TextHighlightRange[]
  /** Ranges within `originalTitle`; empty when no original title is displayed or matches. */
  originalTitleHighlightRanges: TextHighlightRange[]
}

export interface PersonSearchHit {
  personKey: string
  entry: PersonEntry
  tier: MatchTier
  label: string
  highlightRanges: TextHighlightRange[]
}

export interface GenreSearchHit {
  genreName: string
  count: number
  tier: MatchTier
  label: string
  highlightRanges: TextHighlightRange[]
}

const PERSON_RESULT_CAP = 8
const GENRE_RESULT_CAP = 5

/** Min trimmed query length before any search runs (Design §4.2) — Latin / Cyrillic / Arabic etc. */
export const SEARCH_MIN_QUERY_LEN = 3

/** Design Spec §4.2 — debounce before scoring; pairs with `useDeferredValue` in SearchBar. */
export const SEARCH_QUERY_DEBOUNCE_MS = 200

/** Han + Japanese kana + Hangul syllables: one grapheme may trigger search (P21+). */
const RE_IDEOGRAPHIC_CJK_QUERY = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u

/**
 * Minimum trimmed character length before running autocomplete scoring.
 * Ideographic CJK queries: 1; otherwise {@link SEARCH_MIN_QUERY_LEN}.
 */
export function searchMinQueryLengthForTrim(trimmed: string): number {
  if (trimmed.length === 0) return SEARCH_MIN_QUERY_LEN
  if (RE_IDEOGRAPHIC_CJK_QUERY.test(trimmed)) return 1
  return SEARCH_MIN_QUERY_LEN
}

export function moviePopularityScore(m: Movie): number {
  return Math.log10(m.vote_count + 1) * m.vote_average
}

function movieHaystack(m: Movie): string {
  if (m.title_normalized && m.title_normalized.length > 0) {
    return m.title_normalized.toLowerCase()
  }
  const t = normalizeForSearch(m.title)
  const o = normalizeForSearch(m.original_title)
  if (o.length === 0 || o === t) return t
  return `${t} ${o}`
}

function classifyPrefixContains(haystack: string, query: string): MatchTier | null {
  if (query.length === 0) return null
  if (haystack.startsWith(query)) return 'prefix'
  if (haystack.includes(query)) return 'contains'
  return null
}

/** Structured title metadata for movie suggestion rows. */
export function movieSuggestionDisplay(m: Movie): Pick<
  MovieSearchHit,
  'displayTitle' | 'originalTitle' | 'releaseYear' | 'tmdbId'
> {
  const title = m.title.trim()
  const original = m.original_title.trim()
  const displayTitle = title || original || 'Untitled'
  const originalTitle =
    original.length > 0 && original.toLowerCase() !== displayTitle.toLowerCase()
      ? original
      : null
  const yearMatch = m.release_date.trim().match(/^(\d{4})(?:-|$)/)

  return {
    displayTitle,
    originalTitle,
    releaseYear: yearMatch?.[1] ?? null,
    tmdbId: m.id,
  }
}

/** Focus echo contains titles only; metadata remains exclusive to suggestion rows. */
export function formatMovieFocusEchoLabel(m: Movie): string {
  const { displayTitle, originalTitle } = movieSuggestionDisplay(m)
  return originalTitle ? `${displayTitle} / ${originalTitle}` : displayTitle
}

/** Legacy store/query label. Movie rows use {@link movieSuggestionDisplay} instead. */
export function formatMovieSuggestionLabel(m: Movie): string {
  const { displayTitle, originalTitle, releaseYear } = movieSuggestionDisplay(m)
  const g0 = m.genres[0] ?? ''
  let s = displayTitle
  if (originalTitle) s += ` ${originalTitle}`
  s += ` (${releaseYear ?? '????'})`
  if (g0) s += ` ${g0}`
  return s
}

function rangesForCaseInsensitiveSubstring(label: string, queryRaw: string): TextHighlightRange[] {
  const q = queryRaw.trim()
  if (q.length === 0) return []
  const lower = label.toLowerCase()
  const needle = q.toLowerCase()
  const ranges: TextHighlightRange[] = []
  let from = 0
  while (from < lower.length) {
    const idx = lower.indexOf(needle, from)
    if (idx < 0) break
    ranges.push({ start: idx, end: idx + needle.length })
    from = idx + needle.length
  }
  return ranges
}

export function scoreMoviesForQuery(movies: readonly Movie[], queryRaw: string): MovieSearchHit[] {
  const trimmed = queryRaw.trim()
  if (trimmed.length === 0) return []
  const minLen = searchMinQueryLengthForTrim(trimmed)
  const query = normalizeForSearch(trimmed)
  if (query.length < minLen) return []

  const hits: MovieSearchHit[] = []
  for (const m of movies) {
    const hay = movieHaystack(m)
    const tier = classifyPrefixContains(hay, query)
    if (!tier) continue
    const label = formatMovieSuggestionLabel(m)
    const display = movieSuggestionDisplay(m)
    hits.push({
      movie: m,
      tier,
      score: moviePopularityScore(m),
      label,
      ...display,
      displayTitleHighlightRanges: rangesForCaseInsensitiveSubstring(
        display.displayTitle,
        queryRaw.trim(),
      ),
      originalTitleHighlightRanges: display.originalTitle
        ? rangesForCaseInsensitiveSubstring(display.originalTitle, queryRaw.trim())
        : [],
    })
  }

  hits.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === 'prefix' ? -1 : 1
    return b.score - a.score
  })

  if (
    import.meta.env.DEV &&
    import.meta.env.MODE !== 'test' &&
    hits.length > 300
  ) {
    console.warn(
      `[searchScore] scoreMoviesForQuery: ${hits.length} movie hits (>300); list is scrollable.`,
    )
  }

  return hits
}

const ROLE_BITS: { bit: number; short: string }[] = [
  { bit: 1, short: 'Cast' },
  { bit: 2, short: 'Director' },
  { bit: 4, short: 'DoP' },
  { bit: 8, short: 'Writer' },
  { bit: 16, short: 'Producer' },
  { bit: 32, short: 'Composer' },
]

export function formatPersonRoleSuffix(roleMask: number): string {
  const parts = ROLE_BITS.filter((r) => (roleMask & r.bit) !== 0).map((r) => r.short)
  return parts.length ? ` · ${parts.join('/')}` : ''
}

function personMatchTier(normKey: string, query: string): MatchTier | null {
  if (query.length === 0) return null
  const tokens = normKey.split(/\s+/).filter(Boolean)
  for (const tok of tokens) {
    if (tok.startsWith(query)) return 'prefix'
  }
  if (normKey.includes(query)) return 'contains'
  return null
}

export function scorePeopleForQuery(index: SearchIndex, queryRaw: string): PersonSearchHit[] {
  const trimmed = queryRaw.trim()
  if (trimmed.length === 0) return []
  const minLen = searchMinQueryLengthForTrim(trimmed)
  const query = normalizeForSearch(trimmed)
  if (query.length < minLen) return []

  const hits: PersonSearchHit[] = []
  for (const [personKey, entry] of Object.entries(index.people)) {
    const normKey = personKey.toLowerCase()
    const tier = personMatchTier(normKey, query)
    if (!tier) continue
    const roleSuffix = formatPersonRoleSuffix(entry.role_mask)
    const label = `${entry.full}${roleSuffix}`
    hits.push({
      personKey,
      entry,
      tier,
      label,
      highlightRanges: rangesForCaseInsensitiveSubstring(label, queryRaw.trim()),
    })
  }

  hits.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === 'prefix' ? -1 : 1
    return b.entry.movie_ids.length - a.entry.movie_ids.length
  })
  return hits.slice(0, PERSON_RESULT_CAP)
}

export function scoreGenresForQuery(index: SearchIndex, queryRaw: string): GenreSearchHit[] {
  const trimmed = queryRaw.trim()
  if (trimmed.length === 0) return []
  const minLen = searchMinQueryLengthForTrim(trimmed)
  const query = normalizeForSearch(trimmed)
  if (query.length < minLen) return []

  const hits: GenreSearchHit[] = []
  for (const [genreName, g] of Object.entries(index.genres)) {
    const normName = normalizeForSearch(genreName)
    const tier = classifyPrefixContains(normName, query)
    if (!tier) continue
    hits.push({
      genreName,
      count: g.count,
      tier,
      label: genreName,
      highlightRanges: rangesForCaseInsensitiveSubstring(genreName, queryRaw.trim()),
    })
  }

  hits.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === 'prefix' ? -1 : 1
    return b.count - a.count
  })
  return hits.slice(0, GENRE_RESULT_CAP)
}

export function movieHitsToSuggestions(hits: MovieSearchHit[]): SearchSuggestion[] {
  return hits.map((h) => ({
    kind: 'movie' as const,
    movieId: h.movie.id,
    label: h.label,
  }))
}

export function personHitsToSuggestions(hits: PersonSearchHit[]): SearchSuggestion[] {
  return hits.map((h) => ({
    kind: 'person' as const,
    personKey: h.personKey,
    label: h.label,
    movieCount: h.entry.movie_ids.length,
  }))
}

export function genreHitsToSuggestions(hits: GenreSearchHit[]): SearchSuggestion[] {
  return hits.map((h) => ({
    kind: 'genre' as const,
    genreName: h.genreName,
    label: h.label,
    count: h.count,
  }))
}
