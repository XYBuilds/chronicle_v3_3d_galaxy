import {
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { GenreBadge } from '@/components/GenreBadge'
import { buttonVariants } from '@/components/ui/button-variants'
import { CloseButton } from '@/components/ui/close-button'
import { useStrings } from '@/lib/strings'
import { cn } from '@/lib/utils'
import {
  clearSearch,
  setSearchQuery,
  setSearchResults,
  useGalaxyInteractionStore,
  type SearchSuggestion,
} from '@/store/galaxyInteractionStore'
import { useGalaxyDataStore } from '@/store/galaxyDataStore'
import { useSearchIndexStore } from '@/store/searchIndexStore'
import type { Movie } from '@/types/galaxy'
import type { TextHighlightRange } from '@/utils/searchScore'
import {
  SEARCH_QUERY_DEBOUNCE_MS,
  formatMovieSuggestionLabel,
  scoreMoviesForQuery,
  scorePeopleForQuery,
  searchMinQueryLengthForTrim,
} from '@/utils/searchScore'

export type SearchHudTab = 'movie' | 'person' | 'genre'

export interface SearchBarProps {
  hasSearchIndex: boolean
  movies: readonly Movie[]
  /** P16.2 — scene-owned eased timeline drift when selecting a person (earliest `movie.z` in selection). */
  animateZCurrentTo?: (z: number, durationMs?: number) => void
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

export function SearchBar({ hasSearchIndex, movies, animateZCurrentTo }: SearchBarProps) {
  const ui = useStrings()
  const searchQuery = useGalaxyInteractionStore((s) => s.searchQuery)
  const searchMode = useGalaxyInteractionStore((s) => s.searchMode)
  const indexStatus = useSearchIndexStore((s) => s.status)
  const searchIndex = useSearchIndexStore((s) => s.data)
  const indexError = useSearchIndexStore((s) => s.errorMessage)
  const genrePalette = useGalaxyDataStore((s) => s.data?.meta.genre_palette) ?? null

  const [hudTab, setHudTab] = useState<SearchHudTab>('movie')
  const [listOpen, setListOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const panelRootRef = useRef<HTMLDivElement>(null)

  /** P21.3 — Genre tab AND multi-select (badges); orthogonal to movie/person query text. */
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])

  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery)
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(searchQuery), SEARCH_QUERY_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [searchQuery])

  const deferredQuery = useDeferredValue(debouncedQuery)

  const movieById = useMemo(() => {
    const m = new Map<number, Movie>()
    for (const mv of movies) m.set(mv.id, mv)
    return m
  }, [movies])

  const allGenreNames = useMemo(() => {
    const fromPalette =
      genrePalette && Object.keys(genrePalette).length > 0 ? Object.keys(genrePalette).sort() : []
    if (fromPalette.length > 0) return fromPalette
    return Object.keys(searchIndex?.genres ?? {}).sort()
  }, [genrePalette, searchIndex])

  const movieIdsByGenre = useMemo(() => {
    const m = new Map<string, Set<number>>()
    for (const [name, g] of Object.entries(searchIndex?.genres ?? {})) {
      m.set(name, new Set(g.movie_ids))
    }
    return m
  }, [searchIndex])

  const currentIntersection = useMemo(() => {
    if (selectedGenres.length === 0) return null
    let acc: Set<number> | null = null
    for (const g of selectedGenres) {
      const ids = movieIdsByGenre.get(g) ?? new Set<number>()
      if (acc === null) {
        acc = new Set(ids)
      } else {
        const next = new Set<number>()
        for (const id of acc) {
          if (ids.has(id)) next.add(id)
        }
        acc = next
      }
    }
    return acc
  }, [selectedGenres, movieIdsByGenre])

  const previewCountIfAdded = useMemo(() => {
    const map = new Map<string, number>()
    for (const g of allGenreNames) {
      if (selectedGenres.includes(g)) continue
      const ids = movieIdsByGenre.get(g) ?? new Set<number>()
      if (currentIntersection === null) {
        map.set(g, ids.size)
      } else {
        let n = 0
        for (const x of currentIntersection) {
          if (ids.has(x)) n++
        }
        map.set(g, n)
      }
    }
    return map
  }, [allGenreNames, selectedGenres, movieIdsByGenre, currentIntersection])

  /** Grid hides badges already shown in the selected strip above. */
  const candidateGenreNames = useMemo(
    () => allGenreNames.filter((g) => !selectedGenres.includes(g)),
    [allGenreNames, selectedGenres],
  )

  /** Genre ↔ store: layout-only so ESC (`clearSearch`) cannot race a late `useEffect` re-applying `searchMode: 'genre'`. */
  const prevSearchModeRef = useRef(searchMode)
  useLayoutEffect(() => {
    const prev = prevSearchModeRef.current
    prevSearchModeRef.current = searchMode

    if (prev === 'genre' && searchMode === 'idle') {
      setSelectedGenres([])
      return
    }

    if (hudTab !== 'genre') return

    if (selectedGenres.length === 0) {
      if (useGalaxyInteractionStore.getState().searchMode === 'genre') {
        clearSearch()
      }
      return
    }

    const intersectionSet = currentIntersection ?? new Set<number>()
    const ids = sortIdsByRelease([...intersectionSet], movieById)
    console.log('[Search] genre AND filter', {
      genres: selectedGenres.join(' + '),
      selectionLen: ids.length,
    })
    useGalaxyInteractionStore.setState({
      searchMode: 'genre',
      selectionIds: ids,
      selectionPersonKey: null,
      selectedMovieId: null,
      searchQuery: selectedGenres.join(' + '),
    })
  }, [searchMode, hudTab, selectedGenres, currentIntersection, movieById])

  useEffect(() => {
    if (hudTab !== 'genre') {
      setSelectedGenres([])
    }
  }, [hudTab])

  const resultRows = useMemo((): ResultRow[] => {
    const q = deferredQuery
    const trimmed = q.trim()
    if (hudTab === 'genre') return []
    if (trimmed.length < searchMinQueryLengthForTrim(trimmed)) return []
    if (!searchIndex) return []

    if (hudTab === 'movie') {
      const hits = scoreMoviesForQuery(movies, q)
      return hits.map((h) => ({
        suggestion: { kind: 'movie' as const, movieId: h.movie.id, label: h.label },
        ranges: h.highlightRanges,
      }))
    }
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
  }, [deferredQuery, hudTab, movies, searchIndex])

  useEffect(() => {
    if (hudTab === 'genre') {
      setSearchResults([])
      return
    }
    const suggestions = resultRows.map((r) => r.suggestion)
    setSearchResults(suggestions)
  }, [resultRows, hudTab])

  const debouncedTrimmed = debouncedQuery.trim()
  const debouncedMinLen = searchMinQueryLengthForTrim(debouncedTrimmed)
  const canShowList = debouncedTrimmed.length >= debouncedMinLen && resultRows.length > 0
  const panelVisible = hudTab !== 'genre' && listOpen && canShowList

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
    if (hudTab === 'genre' && next !== 'genre') {
      setSelectedGenres([])
      clearSearch()
    }
    setHudTab(next)
    setSearchQuery('')
    setSearchResults([])
    setDebouncedQuery('')
    setListOpen(false)
    setHighlightIndex(-1)
  }, [hudTab])

  const toggleGenre = useCallback((name: string) => {
    setSelectedGenres((prev) => {
      if (prev.includes(name)) return prev.filter((g) => g !== name)
      return [...prev, name]
    })
  }, [])

  const applySuggestion = useCallback(
    (row: ResultRow) => {
      const s = row.suggestion
      if (s.kind === 'movie') {
        const m = movieById.get(s.movieId)
        const q = m ? formatMovieSuggestionLabel(m) : s.label
        useGalaxyInteractionStore.setState({ selectedMovieId: s.movieId, searchQuery: q })
        setDebouncedQuery(q)
      } else if (s.kind === 'person' && searchIndex) {
        const entry = searchIndex.people[s.personKey]
        if (entry) {
          const ids = sortIdsByRelease(entry.movie_ids, movieById)
          const q = entry.full
          console.log('[Search] person select', { key: s.personKey, full: entry.full, selectionLen: ids.length })
          useGalaxyInteractionStore.setState({
            searchMode: 'person',
            selectionIds: ids,
            selectionPersonKey: s.personKey,
            selectedMovieId: null,
            searchQuery: q,
          })
          setDebouncedQuery(q)
          const zs = ids
            .map((id) => movieById.get(id)?.z)
            .filter((z): z is number => typeof z === 'number' && Number.isFinite(z))
          if (zs.length === 0) {
            console.warn('[Search] person select: no finite z for selectionIds', {
              key: s.personKey,
              idsLen: ids.length,
            })
          } else {
            const zMin = Math.min(...zs)
            animateZCurrentTo?.(zMin, 700)
          }
        }
      }
      setListOpen(false)
      setHighlightIndex(-1)
    },
    [animateZCurrentTo, movieById, searchIndex],
  )

  const onClear = useCallback(() => {
    clearSearch()
    // P13.6 — align with ESC §4.6: exit focus in one action (no second ESC).
    useGalaxyInteractionStore.setState({ selectedMovieId: null })
    setSelectedGenres([])
    setListOpen(false)
    setHighlightIndex(-1)
  }, [])

  const disabledReason =
    !hasSearchIndex
      ? ui.searchBar.noIndexInBundle
      : indexStatus === 'skipped'
        ? ui.searchBar.indexNotExported
        : indexStatus === 'loading'
          ? ui.searchBar.indexLoading
          : indexStatus === 'error'
            ? (indexError ?? ui.searchBar.indexLoadFailed)
            : indexStatus !== 'ready'
              ? ui.searchBar.indexNotReady
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
              {tab === 'movie'
                ? ui.searchBar.tabMovie
                : tab === 'person'
                  ? ui.searchBar.tabPerson
                  : ui.searchBar.tabGenre}
            </button>
          ))}
        </div>

        {hudTab === 'genre' ? (
          <>
            {/*
              Preserve `data-galaxy-search-input` for App.tsx Cmd/Ctrl+K while the visible field is not shown.
            */}
            <input
              type="text"
              data-galaxy-search-input
              className="sr-only"
              readOnly
              tabIndex={-1}
              aria-hidden
              value={searchQuery}
            />
            <div className="flex flex-col gap-2 p-1">
            {selectedGenres.length > 0 && (
              <div className="flex flex-wrap items-start gap-1.5 border-b border-border/40 pb-2">
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {selectedGenres.map((g) => (
                    <GenreBadge
                      key={`sel-${g}`}
                      name={g}
                      paletteHex={genrePalette?.[g]}
                      selected
                      onRemove={() => toggleGenre(g)}
                      removeAriaLabel={`${ui.searchBar.genreMultiRemove} ${g}`}
                    />
                  ))}
                </div>
                <span className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                  {currentIntersection?.size ?? 0} {ui.searchBar.genreMultiMatches}
                </span>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {candidateGenreNames.map((g) => {
                const previewN = previewCountIfAdded.get(g) ?? 0
                const disabled = previewN === 0
                return (
                  <GenreBadge
                    key={g}
                    name={g}
                    size="sm"
                    paletteHex={genrePalette?.[g]}
                    disabled={disabled}
                    previewCount={previewN}
                    onClick={() => {
                      if (disabled) return
                      toggleGenre(g)
                    }}
                  />
                )
              })}
            </div>
            <p className="px-1 text-xs text-muted-foreground">{ui.searchBar.genreMultiHelp}</p>
          </div>
          </>
        ) : (
          <>
            <div className="relative flex items-center gap-1">
              <input
                type="text"
                data-galaxy-search-input
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
                    ? ui.searchBar.placeholderDisabled
                    : hudTab === 'movie'
                      ? ui.searchBar.placeholderMovie
                      : ui.searchBar.placeholderPerson
                }
                className={cn(
                  'h-9 w-full min-w-0 rounded-lg border border-input bg-background/80 px-3 pr-9 text-sm text-foreground outline-none',
                  'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
                )}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  const t = e.target.value.trim()
                  setListOpen(t.length >= searchMinQueryLengthForTrim(t))
                }}
                onFocus={() => {
                  const t = searchQuery.trim()
                  if (t.length >= searchMinQueryLengthForTrim(t) && resultRows.length > 0) {
                    setListOpen(true)
                  }
                }}
                onKeyDown={(e) => {
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
                <CloseButton
                  variant="ghostSm"
                  label={ui.searchBar.clear}
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={onClear}
                />
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
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}

        {isBlocked && (
          <p className="mt-2 px-1 text-xs leading-snug text-muted-foreground">{disabledReason}</p>
        )}
      </div>
    </div>
  )
}
