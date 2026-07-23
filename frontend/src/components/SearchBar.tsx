import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { HighlightedText } from '@/components/HighlightedText'
import {
  beginIdTabQueryEdit,
  clearIdTabInput,
  enterIdTabFocusEcho,
  getIdTabInputValue,
  INITIAL_ID_TAB_INPUT_STATE,
  isIdQueryEvaluationCurrent,
  isIdTabFocusEcho,
  reconcileIdTabFocus,
  resolveEnterSuggestionIndex,
} from '@/components/idTabInputState'
import { MovieSuggestionRow } from '@/components/MovieSuggestionRow'
import { GenreBadge } from '@/components/GenreBadge'
import { getSearchBarTextPlaceholder } from '@/components/searchBarPlaceholder'
import { buttonVariants } from '@/components/ui/button-variants'
import { CloseButton } from '@/components/ui/close-button'
import { HUD_GALAXY_GLASS_SURFACE_CLASSNAME } from '@/hud/hudTopToolButtonChrome'
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
import { enterPersonSearchSession, sortIdsByRelease } from '@/utils/personSearchSession'
import type { MovieSearchHit, TextHighlightRange } from '@/utils/searchScore'
import {
  SEARCH_QUERY_DEBOUNCE_MS,
  formatMovieSuggestionLabel,
  movieSuggestionDisplay,
  scoreMoviesForQuery,
  scorePeopleForQuery,
  searchMinQueryLengthForTrim,
} from '@/utils/searchScore'
import { buildTmdbIdSearchIndex, searchTmdbId } from '@/utils/tmdbIdSearch'

export type SearchHudTab = 'movie' | 'person' | 'genre' | 'id'

export interface SearchBarProps {
  hasSearchIndex: boolean
  movies: readonly Movie[]
  /** P16.2 — scene-owned eased timeline drift when selecting a person (earliest `movie.z` in selection). */
  animateZCurrentTo?: (z: number, durationMs?: number) => void
}

type ResultRow = {
  suggestion: SearchSuggestion
  ranges: TextHighlightRange[]
  movieDisplay?: Pick<
    MovieSearchHit,
    | 'displayTitle'
    | 'originalTitle'
    | 'releaseYear'
    | 'tmdbId'
    | 'displayTitleHighlightRanges'
    | 'originalTitleHighlightRanges'
  >
}

function suggestionKey(s: SearchSuggestion): string {
  if (s.kind === 'movie') return `m:${s.movieId}`
  if (s.kind === 'person') return `p:${s.personKey}`
  return `g:${s.genreName}`
}

export function SearchBar({ hasSearchIndex, movies, animateZCurrentTo }: SearchBarProps) {
  const ui = useStrings()
  const searchQuery = useGalaxyInteractionStore((s) => s.searchQuery)
  const selectedMovieId = useGalaxyInteractionStore((s) => s.selectedMovieId)
  const searchMode = useGalaxyInteractionStore((s) => s.searchMode)
  const indexStatus = useSearchIndexStore((s) => s.status)
  const searchIndex = useSearchIndexStore((s) => s.data)
  const indexError = useSearchIndexStore((s) => s.errorMessage)
  const genrePalette = useGalaxyDataStore((s) => s.data?.meta.genre_palette) ?? null

  const [hudTab, setHudTab] = useState<SearchHudTab>('movie')
  const [idInputState, setIdInputState] = useState(INITIAL_ID_TAB_INPUT_STATE)
  const [debouncedIdQuery, setDebouncedIdQuery] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  /** P21.4 — container idle/active: outline-only vs solid panel (hover | focus | suggestions open). */
  const [hoverInside, setHoverInside] = useState(false)
  const [focusInside, setFocusInside] = useState(false)
  const panelRootRef = useRef<HTMLDivElement>(null)

  /** P21.3 — Genre tab AND multi-select (badges); orthogonal to movie/person query text. */
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [prevSearchModeForGenres, setPrevSearchModeForGenres] = useState(searchMode)
  if (searchMode !== prevSearchModeForGenres) {
    const prev = prevSearchModeForGenres
    setPrevSearchModeForGenres(searchMode)
    if (prev === 'genre' && searchMode === 'idle' && selectedGenres.length > 0) {
      setSelectedGenres([])
    }
  }

  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery)
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(searchQuery), SEARCH_QUERY_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [searchQuery])

  const deferredQuery = useDeferredValue(debouncedQuery)

  const idInputValue = getIdTabInputValue(idInputState, selectedMovieId)
  const idFocusEcho = isIdTabFocusEcho(idInputState, selectedMovieId)

  useEffect(() =>
    useGalaxyInteractionStore.subscribe((state) => {
      setIdInputState((current) => reconcileIdTabFocus(current, state.selectedMovieId))
    }),
  [])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedIdQuery(idInputState.query), SEARCH_QUERY_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [idInputState.query])

  const deferredIdQuery = useDeferredValue(debouncedIdQuery)

  const movieById = useMemo(() => {
    const m = new Map<number, Movie>()
    for (const mv of movies) m.set(mv.id, mv)
    return m
  }, [movies])

  const tmdbIdSearchIndex = useMemo(() => buildTmdbIdSearchIndex(movies), [movies])

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
    prevSearchModeRef.current = searchMode

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

  const idSearchResult = useMemo(
    () => searchTmdbId(tmdbIdSearchIndex, deferredIdQuery),
    [deferredIdQuery, tmdbIdSearchIndex],
  )

  const resultRows = useMemo((): ResultRow[] => {
    if (hudTab === 'genre') return []

    if (hudTab === 'id') {
      return idSearchResult.movies.map((movie) => {
        const display = movieSuggestionDisplay(movie)
        return {
          suggestion: { kind: 'movie' as const, movieId: movie.id, label: formatMovieSuggestionLabel(movie) },
          ranges: [],
          movieDisplay: {
            ...display,
            displayTitleHighlightRanges: [],
            originalTitleHighlightRanges: [],
          },
        }
      })
    }

    const q = deferredQuery
    const trimmed = q.trim()
    if (trimmed.length < searchMinQueryLengthForTrim(trimmed)) return []
    if (!searchIndex) return []

    if (hudTab === 'movie') {
      const hits = scoreMoviesForQuery(movies, q)
      return hits.map((h) => ({
        suggestion: { kind: 'movie' as const, movieId: h.movie.id, label: h.label },
        ranges: h.displayTitleHighlightRanges,
        movieDisplay: {
          displayTitle: h.displayTitle,
          originalTitle: h.originalTitle,
          releaseYear: h.releaseYear,
          tmdbId: h.tmdbId,
          displayTitleHighlightRanges: h.displayTitleHighlightRanges,
          originalTitleHighlightRanges: h.originalTitleHighlightRanges,
        },
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
  }, [deferredQuery, hudTab, idSearchResult, movies, searchIndex])

  useEffect(() => {
    if (hudTab === 'id') return
    if (hudTab === 'genre') {
      setSearchResults([])
      return
    }
    setSearchResults(resultRows.map((r) => r.suggestion))
  }, [resultRows, hudTab])

  const debouncedTrimmed = debouncedQuery.trim()
  const debouncedMinLen = searchMinQueryLengthForTrim(debouncedTrimmed)
  const hasCurrentIdEvaluation = isIdQueryEvaluationCurrent(idInputState.query, deferredIdQuery)
  const idSearchStatus =
    hudTab === 'id' && hasCurrentIdEvaluation ? idSearchResult.status : null
  const hasEligibleQuery =
    hudTab === 'id'
      ? hasCurrentIdEvaluation && deferredIdQuery.length > 0
      : debouncedTrimmed.length >= debouncedMinLen
  const canShowList = !idFocusEcho && hasEligibleQuery && resultRows.length > 0
  const panelVisible = hudTab !== 'genre' && listOpen && canShowList

  const isActive = hoverInside || focusInside || panelVisible

  const activeRowIndex =
    !panelVisible || resultRows.length === 0
      ? -1
      : highlightIndex < 0
        ? -1
        : Math.min(highlightIndex, resultRows.length - 1)

  useEffect(() => {
    if (activeRowIndex < 0) return
    document
      .getElementById(`galaxy-search-suggestion-${activeRowIndex}`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeRowIndex])

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
    } else if (hudTab !== 'id' && next !== 'id') {
      // Preserve the established Title ↔ Person reset without coupling ID-local state to it.
      setSearchQuery('')
      setDebouncedQuery('')
    }
    // ID candidates are local-only; discard stale global suggestions when entering or leaving it.
    setSearchResults([])
    setHudTab(next)
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
      if (hudTab === 'id' && s.kind === 'movie') {
        console.log('[Search] TMDB ID select', {
          query: idInputState.query,
          candidateCount: resultRows.length,
          selectedTmdbId: s.movieId,
        })
        useGalaxyInteractionStore.setState({ selectedMovieId: s.movieId })
        setIdInputState((state) => enterIdTabFocusEcho(state, s.movieId))
      } else if (s.kind === 'movie') {
        const m = movieById.get(s.movieId)
        const q = m ? formatMovieSuggestionLabel(m) : s.label
        useGalaxyInteractionStore.setState({ selectedMovieId: s.movieId, searchQuery: q })
        setDebouncedQuery(q)
      } else if (s.kind === 'person' && searchIndex) {
        const { applied, searchQuery: q } = enterPersonSearchSession({
          personKey: s.personKey,
          searchIndex,
          movieById,
          animateZCurrentTo,
        })
        if (applied) setDebouncedQuery(q)
      }
      setListOpen(false)
      setHighlightIndex(-1)
    },
    [
      animateZCurrentTo,
      hudTab,
      idInputState.query,
      movieById,
      resultRows.length,
      searchIndex,
    ],
  )

  const onClear = useCallback(() => {
    if (hudTab === 'id') {
      // ID query and focus echo are local; only the shared focus key must be cleared.
      useGalaxyInteractionStore.setState({ selectedMovieId: null })
      setIdInputState((state) => clearIdTabInput(state))
    } else {
      clearSearch()
      // P13.6 — align with ESC §4.6: exit focus in one action (no second ESC).
      useGalaxyInteractionStore.setState({ selectedMovieId: null })
      setSelectedGenres([])
    }
    setListOpen(false)
    setHighlightIndex(-1)
  }, [hudTab])

  const disabledReason =
    hudTab === 'id'
      ? movies.length === 0
        ? ui.searchBar.noIndexInBundle
        : null
      : !hasSearchIndex
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

  const searchPlaceholder =
    hudTab === 'id' ? (isBlocked ? ui.searchBar.placeholderDisabled : ui.searchBar.placeholderId) : getSearchBarTextPlaceholder(isBlocked, hudTab, ui.searchBar)

  return (
    <div
      className={cn(
        'pointer-events-auto fixed left-1/2 z-[var(--z-hud-search)] w-[var(--hud-search-width)] max-w-[var(--hud-search-max-w)] -translate-x-1/2 px-2',
        'top-[calc(max(var(--hud-inset-sm),env(safe-area-inset-top,0px))+var(--hud-top-tools-row-h)+var(--hud-gap-stack))] xl:top-[max(var(--hud-inset-md),env(safe-area-inset-top,0px))]',
      )}
      role="search"
    >
      <div
        ref={panelRootRef}
        data-state={isActive ? 'active' : 'idle'}
        onMouseEnter={() => setHoverInside(true)}
        onMouseLeave={() => setHoverInside(false)}
        onFocusCapture={() => setFocusInside(true)}
        onBlurCapture={(e) => {
          if (!panelRootRef.current?.contains(e.relatedTarget as Node | null)) {
            setFocusInside(false)
          }
        }}
        className={cn(
          'group rounded-xl p-2 transition-[background-color,backdrop-filter,box-shadow,border-color] duration-150',
          isActive
            ? 'border border-border/80 bg-popover/95 backdrop-blur-md shadow-lg'
            : HUD_GALAXY_GLASS_SURFACE_CLASSNAME,
        )}
      >
        <div
          className={cn(
            'mb-2 flex gap-1 rounded-lg p-0.5 transition-colors duration-150',
            'group-data-[state=idle]:bg-muted/20 group-data-[state=active]:bg-muted/40',
          )}
        >
          {(['movie', 'person', 'genre', 'id'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'xs' }),
                'min-w-0 flex-1 justify-center truncate capitalize',
                hudTab === tab
                  ? 'bg-foreground text-background shadow-sm hover:bg-foreground/90 hover:text-background dark:bg-secondary dark:text-secondary-foreground dark:hover:bg-secondary/80 dark:hover:text-secondary-foreground'
                  : 'bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-muted-foreground dark:hover:bg-muted/50',
              )}
              aria-pressed={hudTab === tab}
              onClick={() => onTabChange(tab)}
            >
              {tab === 'movie'
                ? ui.searchBar.tabMovie
                : tab === 'person'
                  ? ui.searchBar.tabPerson
                  : tab === 'genre'
                    ? ui.searchBar.tabGenre
                    : ui.searchBar.tabId}
            </button>
          ))}
        </div>

        <div
          aria-disabled={isBlocked || undefined}
          className={cn(isBlocked && 'pointer-events-none opacity-60')}
          title={isBlocked ? disabledReason ?? undefined : undefined}
        >
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
              <div className="border-b border-border/40 pb-2">
                {selectedGenres.length > 0 ? (
                  <div className="flex min-h-8 flex-wrap items-start gap-1.5">
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
                    <span className="shrink-0 self-start pt-0.5 text-xs tabular-nums text-muted-foreground">
                      {currentIntersection?.size ?? 0} {ui.searchBar.genreMultiMatches}
                    </span>
                  </div>
                ) : (
                  <div className="flex min-h-8 items-center">
                    <p className="px-1 text-xs leading-snug text-muted-foreground">
                      {ui.searchBar.genreMultiEmptyHint}
                    </p>
                  </div>
                )}
              </div>
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
                dir={hudTab === 'id' ? 'ltr' : undefined}
                aria-autocomplete="list"
                aria-expanded={panelVisible}
                aria-controls="galaxy-search-suggestions"
                aria-activedescendant={
                  activeRowIndex >= 0 ? `galaxy-search-suggestion-${activeRowIndex}` : undefined
                }
                disabled={isBlocked}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className={cn(
                  'h-9 w-full min-w-0 rounded-lg border px-3 text-sm text-foreground outline-none',
                  idFocusEcho ? 'pe-20' : 'pe-9',
                  'transition-[background-color,border-color,box-shadow,color] duration-150',
                  // Light HUD (no .dark): faint glass on black canvas — idle stays quiet
                  'group-data-[state=idle]:border-white/10 group-data-[state=idle]:bg-white/[0.05] group-data-[state=idle]:shadow-none',
                  'group-data-[state=idle]:text-white group-data-[state=idle]:placeholder:text-white/50',
                  'group-data-[state=active]:border-white/22 group-data-[state=active]:bg-white/[0.14] group-data-[state=active]:shadow-sm',
                  'group-data-[state=active]:text-foreground group-data-[state=active]:placeholder:text-muted-foreground',
                  // Dark: keep prior input weight on slate chrome
                  'dark:border-input',
                  'dark:group-data-[state=idle]:border-input dark:group-data-[state=idle]:bg-background/30',
                  'dark:group-data-[state=idle]:text-foreground dark:group-data-[state=idle]:placeholder:text-muted-foreground',
                  'dark:group-data-[state=active]:border-input dark:group-data-[state=active]:bg-background/80',
                  'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
                )}
                value={hudTab === 'id' ? idInputValue : searchQuery}
                inputMode={hudTab === 'id' ? 'numeric' : undefined}
                onChange={(e) => {
                  if (hudTab === 'id') {
                    const query = e.target.value
                    setIdInputState((state) => beginIdTabQueryEdit(state, query))
                    setListOpen(query.length > 0)
                    setHighlightIndex(-1)
                    return
                  }
                  setSearchQuery(e.target.value)
                  const t = e.target.value.trim()
                  setListOpen(t.length >= searchMinQueryLengthForTrim(t))
                }}
                onFocus={() => {
                  const query = hudTab === 'id' ? idInputState.query : searchQuery
                  const t = query.trim()
                  if (
                    !idFocusEcho &&
                    (hudTab === 'id'
                      ? t.length > 0 && resultRows.length > 0
                      : t.length >= searchMinQueryLengthForTrim(t) && resultRows.length > 0)
                  ) {
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
                    const selectionIndex = resolveEnterSuggestionIndex(
                      panelVisible,
                      resultRows.length,
                      highlightIndex,
                    )
                    if (selectionIndex === null) return
                    e.preventDefault()
                    applySuggestion(resultRows[selectionIndex]!)
                    return
                  }
                }}
              />
              {hudTab === 'id' && idFocusEcho && (
                <span
                  className="pointer-events-none absolute end-10 top-1/2 -translate-y-1/2 rounded border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[0.6875rem] font-medium leading-none text-muted-foreground"
                  dir="ltr"
                >
                  {ui.searchBar.tmdbIdTag}
                </span>
              )}
              {(hudTab === 'id' ? idInputValue.length > 0 : searchQuery.length > 0) && !isBlocked && (
                <CloseButton
                  variant="ghostSm"
                  label={ui.searchBar.clear}
                  className="absolute end-1 top-1/2 -translate-y-1/2"
                  onClick={onClear}
                />
              )}
            </div>

            {hudTab === 'id' &&
              !idFocusEcho &&
              hasCurrentIdEvaluation &&
              idInputState.query.length > 0 &&
              idSearchStatus !== 'results' && (
              <p className="mt-2 px-1 text-xs leading-snug text-muted-foreground" role="status">
                {idSearchStatus === 'invalid' ? ui.searchBar.idInvalid : ui.searchBar.idNoResults}
              </p>
            )}

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
                      {row.suggestion.kind === 'movie' && row.movieDisplay ? (
                        <MovieSuggestionRow
                          {...row.movieDisplay}
                          optionId={`galaxy-search-suggestion-${idx}`}
                          tmdbIdTag={ui.searchBar.tmdbIdTag}
                          ariaLabel={ui.searchBar.idSuggestionAriaLabel(
                            row.movieDisplay.displayTitle,
                            row.movieDisplay.tmdbId,
                          )}
                          active={active}
                          onPointerEnter={() => setHighlightIndex(idx)}
                          onMouseDown={(ev) => ev.preventDefault()}
                          onSelect={() => applySuggestion(row)}
                        />
                      ) : (
                        <button
                          type="button"
                          id={`galaxy-search-suggestion-${idx}`}
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
                          <span className="min-w-0 flex-1 truncate">
                            <HighlightedText text={row.suggestion.label} ranges={row.ranges} />
                          </span>
                          {row.suggestion.kind === 'person' && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {row.suggestion.movieCount}
                            </span>
                          )}
                        </button>
                      )}
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
    </div>
  )
}
