import {
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { X } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import {
  clearSearch,
  setSearchQuery,
  setSearchResults,
  useGalaxyInteractionStore,
  type SearchSuggestion,
} from '@/store/galaxyInteractionStore'
import { useSearchIndexStore } from '@/store/searchIndexStore'
import type { Movie } from '@/types/galaxy'
import type { TextHighlightRange } from '@/utils/searchScore'
import {
  SEARCH_MIN_QUERY_LEN,
  formatMovieSuggestionLabel,
  scoreGenresForQuery,
  scoreMoviesForQuery,
  scorePeopleForQuery,
} from '@/utils/searchScore'

export type SearchHudTab = 'movie' | 'person' | 'genre'

export interface SearchBarProps {
  hasSearchIndex: boolean
  movies: readonly Movie[]
}

type ResultRow = {
  suggestion: SearchSuggestion
  ranges: TextHighlightRange[]
}

function suggestionKey(s: SearchSuggestion): string {
  if (s.kind === 'movie') return `m:${s.movieId}`
  if (s.kind === 'person') return `p:${s.personKey}`
  return `g:${s.genreName}`
}

function HighlightedLabel({ label, ranges }: { label: string; ranges: TextHighlightRange[] }) {
  if (ranges.length === 0) return <span className="truncate">{label}</span>
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const parts: ReactNode[] = []
  let cursor = 0
  let k = 0
  for (const r of sorted) {
    if (r.start > cursor) {
      parts.push(<span key={`t${k++}`}>{label.slice(cursor, r.start)}</span>)
    }
    parts.push(
      <mark key={`m${k++}`} className="rounded-sm bg-primary/30 text-inherit">
        {label.slice(r.start, r.end)}
      </mark>,
    )
    cursor = r.end
  }
  if (cursor < label.length) {
    parts.push(<span key={`t${k++}`}>{label.slice(cursor)}</span>)
  }
  return <span className="truncate">{parts}</span>
}

function sortIdsByRelease(ids: readonly number[], movieById: ReadonlyMap<number, Movie>): number[] {
  return [...ids].sort((a, b) => {
    const da = movieById.get(a)?.release_date ?? ''
    const db = movieById.get(b)?.release_date ?? ''
    return da.localeCompare(db)
  })
}

export function SearchBar({ hasSearchIndex, movies }: SearchBarProps) {
  const searchQuery = useGalaxyInteractionStore((s) => s.searchQuery)
  const searchBannerText = useGalaxyInteractionStore((s) => s.searchBannerText)
  const indexStatus = useSearchIndexStore((s) => s.status)
  const searchIndex = useSearchIndexStore((s) => s.data)
  const indexError = useSearchIndexStore((s) => s.errorMessage)

  const [hudTab, setHudTab] = useState<SearchHudTab>('movie')
  const [listOpen, setListOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const panelRootRef = useRef<HTMLDivElement>(null)
  /** Next `selectedMovieId` change after movie pick from this list should not clear `searchBannerText`. */
  const preserveSearchBannerOnNextMovieIdChange = useRef(false)

  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery)
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(searchQuery), 200)
    return () => window.clearTimeout(t)
  }, [searchQuery])

  const deferredQuery = useDeferredValue(debouncedQuery)

  const movieById = useMemo(() => {
    const m = new Map<number, Movie>()
    for (const mv of movies) m.set(mv.id, mv)
    return m
  }, [movies])

  const resultRows = useMemo((): ResultRow[] => {
    const q = deferredQuery
    if (q.trim().length < SEARCH_MIN_QUERY_LEN) return []
    if (!searchIndex) return []

    if (hudTab === 'movie') {
      const hits = scoreMoviesForQuery(movies, q)
      return hits.map((h) => ({
        suggestion: { kind: 'movie' as const, movieId: h.movie.id, label: h.label },
        ranges: h.highlightRanges,
      }))
    }
    if (hudTab === 'person') {
      const hits = scorePeopleForQuery(searchIndex, q)
      return hits.map((h) => ({
        suggestion: {
          kind: 'person' as const,
          personKey: h.personKey,
          label: h.label,
          movieCount: h.entry.movie_ids.length,
        },
        ranges: h.highlightRanges,
      }))
    }
    const hits = scoreGenresForQuery(searchIndex, q)
    return hits.map((h) => ({
      suggestion: {
        kind: 'genre' as const,
        genreName: h.genreName,
        label: h.label,
        count: h.count,
      },
      ranges: h.highlightRanges,
    }))
  }, [deferredQuery, hudTab, movies, searchIndex])

  useEffect(() => {
    const suggestions = resultRows.map((r) => r.suggestion)
    setSearchResults(suggestions)
  }, [resultRows])

  const debouncedTrimLen = debouncedQuery.trim().length
  const canShowList = debouncedTrimLen >= SEARCH_MIN_QUERY_LEN && resultRows.length > 0
  const panelVisible = listOpen && canShowList

  const activeRowIndex =
    !panelVisible || resultRows.length === 0
      ? -1
      : highlightIndex < 0
        ? -1
        : Math.min(highlightIndex, resultRows.length - 1)

  useEffect(() => {
    if (!panelVisible) return
    const onDocDown = (e: MouseEvent) => {
      const root = panelRootRef.current
      if (root && !root.contains(e.target as Node)) setListOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [panelVisible])

  const onTabChange = useCallback((next: SearchHudTab) => {
    setHudTab(next)
    setSearchQuery('')
    setSearchResults([])
    useGalaxyInteractionStore.setState({ searchBannerText: null })
    setListOpen(false)
    setHighlightIndex(-1)
  }, [])

  useEffect(() => {
    let prevSel = useGalaxyInteractionStore.getState().selectedMovieId
    return useGalaxyInteractionStore.subscribe(() => {
      const s = useGalaxyInteractionStore.getState()
      const nextSel = s.selectedMovieId
      if (nextSel === prevSel) return
      const preserve = preserveSearchBannerOnNextMovieIdChange.current
      preserveSearchBannerOnNextMovieIdChange.current = false
      if (!preserve && s.searchMode === 'idle' && s.searchBannerText !== null) {
        useGalaxyInteractionStore.setState({ searchBannerText: null })
      }
      prevSel = nextSel
    })
  }, [])

  const applySuggestion = useCallback(
    (row: ResultRow) => {
      const s = row.suggestion
      if (s.kind === 'movie') {
        const m = movieById.get(s.movieId)
        const banner = m ? formatMovieSuggestionLabel(m) : s.label
        preserveSearchBannerOnNextMovieIdChange.current = true
        useGalaxyInteractionStore.setState({ selectedMovieId: s.movieId, searchBannerText: banner })
      } else if (s.kind === 'person' && searchIndex) {
        const entry = searchIndex.people[s.personKey]
        if (entry) {
          const ids = sortIdsByRelease(entry.movie_ids, movieById)
          useGalaxyInteractionStore.setState({
            searchMode: 'person',
            selectionIds: ids,
            selectedMovieId: null,
            searchBannerText: entry.full,
          })
        }
      } else if (s.kind === 'genre' && searchIndex) {
        const g = searchIndex.genres[s.genreName]
        if (g) {
          const ids = sortIdsByRelease(g.movie_ids, movieById)
          useGalaxyInteractionStore.setState({
            searchMode: 'genre',
            selectionIds: ids,
            selectedMovieId: null,
            searchBannerText: `${s.genreName} (${s.count})`,
          })
        }
      }
      setListOpen(false)
      setHighlightIndex(-1)
    },
    [movieById, searchIndex],
  )

  const onClear = useCallback(() => {
    clearSearch()
    setListOpen(false)
    setHighlightIndex(-1)
  }, [])

  const disabledReason =
    !hasSearchIndex
      ? '当前数据包未包含搜索索引（meta.has_search_index）'
      : indexStatus === 'skipped'
        ? '未导出 galaxy_search_index.json.gz'
        : indexStatus === 'loading'
          ? '正在加载搜索索引…'
          : indexStatus === 'error'
            ? (indexError ?? '搜索索引加载失败')
            : indexStatus !== 'ready'
              ? '搜索索引未就绪'
              : null

  const isBlocked = disabledReason !== null

  return (
    <div
      className={cn(
        'pointer-events-auto fixed top-4 left-1/2 z-[90] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 px-2',
        isBlocked && 'opacity-60',
      )}
      role="search"
    >
      <div
        ref={panelRootRef}
        className={cn(
          'rounded-xl border border-border/80 bg-popover/95 p-2 shadow-lg backdrop-blur-md',
          isBlocked && 'pointer-events-none',
        )}
        title={isBlocked ? disabledReason ?? undefined : undefined}
      >
        <div className="mb-2 flex gap-1 rounded-lg bg-muted/40 p-0.5">
          {(['movie', 'person', 'genre'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={cn(
                buttonVariants({ variant: hudTab === tab ? 'secondary' : 'ghost', size: 'xs' }),
                'flex-1 capitalize',
              )}
              aria-pressed={hudTab === tab}
              onClick={() => onTabChange(tab)}
            >
              {tab === 'movie' ? '电影' : tab === 'person' ? '影人' : '流派'}
            </button>
          ))}
        </div>

        {searchBannerText !== null && searchBannerText.length > 0 && !isBlocked && (
          <div
            className="mb-1.5 truncate px-0.5 text-xs text-muted-foreground"
            title={searchBannerText}
            role="status"
            aria-live="polite"
          >
            {searchBannerText}
          </div>
        )}

        <div className="relative flex items-center gap-1">
          <input
            type="text"
            role="searchbox"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-expanded={panelVisible}
            aria-controls="galaxy-search-suggestions"
            disabled={isBlocked}
            placeholder={
              isBlocked
                ? disabledReason ?? '搜索不可用'
                : hudTab === 'movie'
                  ? '搜索片名（≥3 字符）…'
                  : hudTab === 'person'
                    ? '搜索演职员（≥3 字符）…'
                    : '搜索流派（≥3 字符）…'
            }
            className={cn(
              'h-9 w-full min-w-0 rounded-lg border border-input bg-background/80 px-3 pr-9 text-sm text-foreground outline-none',
              'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
            )}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setListOpen(e.target.value.trim().length >= SEARCH_MIN_QUERY_LEN)
            }}
            onFocus={() => {
              if (searchQuery.trim().length >= SEARCH_MIN_QUERY_LEN && resultRows.length > 0) {
                setListOpen(true)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                ;(e.target as HTMLInputElement).blur()
                return
              }
              if (e.key === 'ArrowDown') {
                if (!canShowList) return
                e.preventDefault()
                if (!listOpen) {
                  setListOpen(true)
                  setHighlightIndex(0)
                } else {
                  setHighlightIndex((i) => {
                    const base = i < 0 ? 0 : i + 1
                    return Math.min(resultRows.length - 1, base)
                  })
                }
                return
              }
              if (e.key === 'ArrowUp') {
                if (!listOpen || !canShowList) return
                e.preventDefault()
                setHighlightIndex((i) => Math.max(0, i - 1))
                return
              }
              if (e.key === 'Enter') {
                if (!listOpen || activeRowIndex < 0 || activeRowIndex >= resultRows.length) return
                e.preventDefault()
                applySuggestion(resultRows[activeRowIndex]!)
                return
              }
            }}
          />
          {searchQuery.length > 0 && !isBlocked && (
            <button
              type="button"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
                'absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground',
              )}
              aria-label="清除搜索"
              onClick={onClear}
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {panelVisible && (
          <ul
            id="galaxy-search-suggestions"
            role="listbox"
            className={cn(
              'mt-1 max-h-72 min-h-0 overflow-y-auto overflow-x-hidden rounded-lg border border-border/60 bg-background/95 py-1 text-sm shadow-md',
              '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
            )}
          >
            {resultRows.map((row, idx) => {
              const active = idx === activeRowIndex
              return (
                <li key={suggestionKey(row.suggestion)} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                      active ? 'bg-muted text-foreground' : 'hover:bg-muted/60',
                    )}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => applySuggestion(row)}
                  >
                    <span className="min-w-0 flex-1">
                      <HighlightedLabel label={row.suggestion.label} ranges={row.ranges} />
                    </span>
                    {row.suggestion.kind === 'person' && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {row.suggestion.movieCount}
                      </span>
                    )}
                    {row.suggestion.kind === 'genre' && (
                      <span className="shrink-0 text-xs text-muted-foreground">{row.suggestion.count}</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {isBlocked && (
          <p className="mt-2 px-1 text-xs leading-snug text-muted-foreground">{disabledReason}</p>
        )}
      </div>
    </div>
  )
}
