import { create } from 'zustand'

/** Phase 12 — Search HUD tab + select session (Design Spec §4 / 状态机 §3.6). */
export type SearchMode = 'idle' | 'movie' | 'person' | 'genre'

/** One row in the autocomplete list (P12.3 fills scoring; store only holds the payload). */
export type SearchSuggestion =
  | { kind: 'movie'; movieId: number; label: string }
  | { kind: 'person'; personKey: string; label: string; movieCount: number }
  | { kind: 'genre'; genreName: string; label: string; count: number }

/** Phase 4.1 — Raycaster-driven HUD prep: hover / selection ids (TMDB `Movie.id`). */
/** Phase 5.1.5 — Macro view: time focus + visible Z span + camera standoff (Design Spec 方案 1). */
/** Phase 12.2 — Search + multi-film select (`selectionIds`) for person/genre sessions. */
export interface GalaxyInteractionState {
  hoveredMovieId: number | null
  selectedMovieId: number | null
  /** Viewport CSS pixels — planet center `(x,y,z)` projected (fixed ring / tooltip anchor). */
  hoverAnchorCss: { x: number; y: number } | null
  /** Active-mesh silhouette radius in CSS px (drives ring inner opening + tooltip `sideOffset`). */
  hoverPlanetRadiusCss: number | null
  /** User focus on the release-year axis (decimal year); camera uses `zCurrent - zCamDistance`. */
  zCurrent: number
  /** Observable Z span width in world years `[zCurrent, zCurrent + zVisWindow]`. */
  zVisWindow: number
  /** Camera sits at world `z = zCurrent - zCamDistance` (looking +Z). */
  zCamDistance: number

  /** `'idle'` = no active search select session (movie tab still uses this until P12.3 wires tabs). */
  searchMode: SearchMode
  searchQuery: string
  searchResults: SearchSuggestion[]
  /**
   * Person/genre hit: stable `Movie.id[]` ordered ascending by `release_date` (pipeline / P12.3).
   * `null` when not in a multi-select session.
   */
  selectionIds: number[] | null
  /**
   * Normalized search-index key for the selected person (`searchIndex.people[key]`); drives per-film `movie_roles` for constellation.
   * `null` when not in a person select session.
   */
  selectionPersonKey: string | null
  /** Person-mode constellation lines; product HUD has no toggle — use `window.__galaxy.constellationEnabled` in dev (P12.7). Default on. */
  constellationEnabled: boolean

  /** P13.2 — world-space radius for focus spherical neighborhood (decimal-year Z + UMAP XY). */
  focusNeighborRadius: number
  /** P13.2 — cached `Movie.id[]` within `focusNeighborRadius` of pivot; `null` when not in film focus. */
  focusNeighborIds: number[] | null
  /** P13.3 — orbit camera around focus pivot (r fixed); reset when returning to macro idle. */
  focusOrbit: { yaw: number; pitch: number }
}

export const useGalaxyInteractionStore = create<GalaxyInteractionState>(() => ({
  hoveredMovieId: null,
  selectedMovieId: null,
  hoverAnchorCss: null,
  hoverPlanetRadiusCss: null,
  zCurrent: 0,
  zVisWindow: 1,
  zCamDistance: 30,

  searchMode: 'idle',
  searchQuery: '',
  searchResults: [],
  selectionIds: null,
  selectionPersonKey: null,
  constellationEnabled: true,

  focusNeighborRadius: 5,
  focusNeighborIds: null,
  focusOrbit: { yaw: 0, pitch: 0 },
}))

/** Derived: timeline vis-window must not drive `inFocus` when in person/genre select (Tech Spec §4.5). */
export function selectViswindowDisabled(state: GalaxyInteractionState): boolean {
  return state.searchMode === 'person' || state.searchMode === 'genre'
}

function logSearchTransition(
  label: string,
  partial: Pick<GalaxyInteractionState, 'searchMode' | 'selectionIds' | 'searchResults' | 'searchQuery'>,
): void {
  const selLen = partial.selectionIds === undefined ? '…' : partial.selectionIds?.length ?? 0
  const resLen = partial.searchResults === undefined ? '…' : partial.searchResults.length
  const qLen =
    partial.searchQuery === undefined ? '…' : partial.searchQuery.trim().length
  console.log('[Search]', label, {
    mode: partial.searchMode,
    selectionLen: selLen,
    resultsLen: resLen,
    queryTrimLen: qLen,
  })
}

export function setSearchMode(mode: SearchMode): void {
  const prev = useGalaxyInteractionStore.getState().searchMode
  const next: Partial<GalaxyInteractionState> = { searchMode: mode }
  if (mode === 'idle') {
    next.searchQuery = ''
    next.searchResults = []
    next.selectionIds = null
    next.selectionPersonKey = null
  } else if (mode === 'movie') {
    next.selectionIds = null
    next.selectionPersonKey = null
  }
  useGalaxyInteractionStore.setState(next)
  if (prev !== mode) {
    const s = useGalaxyInteractionStore.getState()
    logSearchTransition('setSearchMode', {
      searchMode: s.searchMode,
      selectionIds: s.selectionIds,
      searchResults: s.searchResults,
      searchQuery: s.searchQuery,
    })
  }
}

export function setSearchQuery(query: string): void {
  useGalaxyInteractionStore.setState({ searchQuery: query })
}

export function setSearchResults(results: SearchSuggestion[]): void {
  const prevLen = useGalaxyInteractionStore.getState().searchResults.length
  useGalaxyInteractionStore.setState({ searchResults: results })
  const nextLen = results.length
  if (prevLen !== nextLen) {
    logSearchTransition('results', {
      searchMode: useGalaxyInteractionStore.getState().searchMode,
      selectionIds: useGalaxyInteractionStore.getState().selectionIds,
      searchResults: results,
      searchQuery: useGalaxyInteractionStore.getState().searchQuery,
    })
  }
}

export function setSelectionIds(ids: number[] | null): void {
  const prev = useGalaxyInteractionStore.getState().selectionIds
  const prevLen = prev?.length ?? 0
  const nextLen = ids?.length ?? 0
  useGalaxyInteractionStore.setState({ selectionIds: ids })
  if (prevLen !== nextLen || (ids === null) !== (prev === null)) {
    logSearchTransition('selectionIds', {
      searchMode: useGalaxyInteractionStore.getState().searchMode,
      selectionIds: ids,
      searchResults: useGalaxyInteractionStore.getState().searchResults,
      searchQuery: useGalaxyInteractionStore.getState().searchQuery,
    })
  }
}

/** Full exit from search select session: `selectionIds` cleared (P12.8 stack level 4). */
export function clearSearch(): void {
  useGalaxyInteractionStore.setState({
    searchMode: 'idle',
    searchQuery: '',
    searchResults: [],
    selectionIds: null,
    selectionPersonKey: null,
  })
  logSearchTransition('clearSearch', {
    searchMode: 'idle',
    selectionIds: null,
    searchResults: [],
    searchQuery: '',
  })
}
