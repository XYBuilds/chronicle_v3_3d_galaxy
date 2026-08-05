import { create } from 'zustand'

import type { ExplorationContext } from '@/lib/exploration'

/** One row in the autocomplete list (P12.3 fills scoring; store only holds the payload). */
export type SearchSuggestion =
  | { kind: 'movie'; movieId: number; label: string }
  | { kind: 'person'; personKey: string; label: string; movieCount: number }
  | { kind: 'genre'; genreName: string; label: string; count: number }

/** Interaction, camera, local search draft, and canonical exploration state. */
export interface GalaxyInteractionState {
  hoveredMovieId: number | null
  /** Sole writable Focus/Select lifecycle state. */
  explorationContext: ExplorationContext
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

  searchQuery: string
  searchResults: SearchSuggestion[]
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
  explorationContext: { kind: 'idle' },
  hoverAnchorCss: null,
  hoverPlanetRadiusCss: null,
  zCurrent: 0,
  zVisWindow: 1,
  zCamDistance: 30,

  searchQuery: '',
  searchResults: [],
  constellationEnabled: true,

  focusNeighborRadius: 5,
  focusNeighborIds: null,
  focusOrbit: { yaw: 0, pitch: 0 },
}))

function logSearchDraft(
  label: string,
  draft: Pick<GalaxyInteractionState, 'searchResults' | 'searchQuery'>,
): void {
  console.log('[Search]', label, {
    resultsLen: draft.searchResults.length,
    queryTrimLen: draft.searchQuery.trim().length,
  })
}

export function setSearchQuery(query: string): void {
  useGalaxyInteractionStore.setState({ searchQuery: query })
}

export function setSearchResults(results: SearchSuggestion[]): void {
  const state = useGalaxyInteractionStore.getState()
  useGalaxyInteractionStore.setState({ searchResults: results })
  if (state.searchResults.length !== results.length) {
    logSearchDraft('results', {
      searchResults: results,
      searchQuery: state.searchQuery,
    })
  }
}

/** Clear only local query/results after exploration has cleared its Select session. */
export function clearSearchDraft(): void {
  useGalaxyInteractionStore.setState({ searchQuery: '', searchResults: [] })
  logSearchDraft('clearSearchDraft', {
    searchResults: [],
    searchQuery: '',
  })
}
