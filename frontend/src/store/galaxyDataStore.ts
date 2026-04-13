import { create } from 'zustand'

import type { GalaxyData } from '@/types/galaxy'
import { loadGalaxyData } from '@/utils/loadGalaxyData'

export type GalaxyLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface GalaxyDataStoreState {
  status: GalaxyLoadStatus
  data: GalaxyData | null
  errorMessage: string | null
  /** Fetches and validates JSON; updates status / data / errorMessage. */
  fetchGalaxyData: (url?: string) => Promise<void>
}

export const useGalaxyDataStore = create<GalaxyDataStoreState>((set) => ({
  status: 'idle',
  data: null,
  errorMessage: null,
  fetchGalaxyData: async (url) => {
    set({ status: 'loading', errorMessage: null })
    try {
      const data = await loadGalaxyData(url)
      set({ status: 'ready', data, errorMessage: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[GalaxyData] Failed to load or validate galaxy JSON:', err)
      set({ status: 'error', data: null, errorMessage: message })
    }
  },
}))
