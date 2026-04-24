import { create } from 'zustand'

import type { GalaxyGzipProgress } from '@/data/loadGalaxyGzip'
import type { GalaxyData } from '@/types/galaxy'
import { loadGalaxyData } from '@/utils/loadGalaxyData'

export type GalaxyLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface GalaxyDataStoreState {
  status: GalaxyLoadStatus
  data: GalaxyData | null
  errorMessage: string | null
  /** Latest gzip download / decompress / parse progress while loading. */
  loadProgress: GalaxyGzipProgress | null
  /** Fetches and validates JSON; updates status / data / errorMessage. */
  fetchGalaxyData: (url?: string) => Promise<void>
}

export const useGalaxyDataStore = create<GalaxyDataStoreState>((set) => ({
  status: 'idle',
  data: null,
  errorMessage: null,
  loadProgress: null,
  fetchGalaxyData: async (url) => {
    set({ status: 'loading', errorMessage: null, loadProgress: null })
    try {
      const data = await loadGalaxyData(
        url !== undefined
          ? { url, onProgress: (p) => set({ loadProgress: p }) }
          : { onProgress: (p) => set({ loadProgress: p }) },
      )
      set({ status: 'ready', data, errorMessage: null, loadProgress: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[GalaxyData] Failed to load or validate galaxy JSON:', err)
      set({ status: 'error', data: null, errorMessage: message, loadProgress: null })
    }
  },
}))
