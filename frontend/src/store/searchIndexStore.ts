import { create } from 'zustand'

import { loadSearchIndex } from '@/data/loadSearchIndex'
import type { Meta } from '@/types/galaxy'
import type { SearchIndex } from '@/types/searchIndex'

export type SearchIndexLoadStatus = 'idle' | 'loading' | 'ready' | 'error' | 'skipped'

export interface SearchIndexStoreState {
  status: SearchIndexLoadStatus
  data: SearchIndex | null
  errorMessage: string | null
  /** Call when galaxy meta + optional palette are known (after galaxy_data ready). */
  hydrateFromGalaxyMeta: (meta: Meta) => Promise<void>
  reset: () => void
}

export const useSearchIndexStore = create<SearchIndexStoreState>((set, get) => ({
  status: 'idle',
  data: null,
  errorMessage: null,

  reset: () => {
    set({ status: 'idle', data: null, errorMessage: null })
  },

  hydrateFromGalaxyMeta: async (meta) => {
    if (meta.has_search_index !== true) {
      console.log('[SearchIndex] skipped: meta.has_search_index !== true')
      set({ status: 'skipped', data: null, errorMessage: null })
      return
    }
    const existing = get().data
    if (get().status === 'ready' && existing !== null && existing.version === meta.version) {
      return
    }
    if (get().status === 'loading') return
    set({ status: 'loading', errorMessage: null })
    try {
      const genrePaletteKeys = Object.keys(meta.genre_palette)
      const data = await loadSearchIndex({ genrePaletteKeys })
      set({ status: 'ready', data, errorMessage: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[SearchIndex] load failed:', err)
      set({ status: 'error', data: null, errorMessage: message })
    }
  },
}))
