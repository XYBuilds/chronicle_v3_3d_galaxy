import { create } from 'zustand'

import type { GalaxyGzipProgress } from '@/data/loadGalaxyGzip'
import type { TodayPayload } from '@/data/loadToday'
import { resolveTodayMovieId } from '@/data/loadToday'
import { resolveGalaxyDataGzipUrl } from '@/lib/galaxyAssetUrls'
import { getStrings } from '@/lib/strings'
import type { GalaxyData } from '@/types/galaxy'
import { galaxyDataDefaultUrl, loadGalaxyData } from '@/utils/loadGalaxyData'

export type GalaxyLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface GalaxyDataStoreState {
  status: GalaxyLoadStatus
  data: GalaxyData | null
  errorMessage: string | null
  /** Latest gzip download / decompress / parse progress while loading. */
  loadProgress: GalaxyGzipProgress | null
  /** P23.1: resolved TMDB id for The Movie Today (after galaxy data is ready). */
  todayMovieId: number | null
  todayPayload: TodayPayload | null
  todayUsedFallback: boolean
  /** Fetches and validates JSON; updates status / data / errorMessage. */
  fetchGalaxyData: (url?: string) => Promise<void>
}

export const useGalaxyDataStore = create<GalaxyDataStoreState>((set) => ({
  status: 'idle',
  data: null,
  errorMessage: null,
  loadProgress: null,
  todayMovieId: null,
  todayPayload: null,
  todayUsedFallback: false,
  fetchGalaxyData: async (url) => {
    set({
      status: 'loading',
      errorMessage: null,
      loadProgress: {
        phase: 'download',
        downloadedBytes: 0,
        totalBytes: null,
        message: getStrings().galaxyData.preparingDownload,
      },
      todayMovieId: null,
      todayPayload: null,
      todayUsedFallback: false,
    })
    try {
      const resolved =
        url !== undefined ? url : await resolveGalaxyDataGzipUrl(galaxyDataDefaultUrl())
      const data = await loadGalaxyData({
        url: resolved,
        onProgress: (p) => set({ loadProgress: p }),
      })
      const today = await resolveTodayMovieId(data.movies)
      set({
        status: 'ready',
        data,
        errorMessage: null,
        loadProgress: null,
        todayMovieId: today.movieId,
        todayPayload: today.payload,
        todayUsedFallback: today.usedFallback,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[GalaxyData] Failed to load or validate galaxy JSON:', err)
      set({
        status: 'error',
        data: null,
        errorMessage: message,
        loadProgress: null,
        todayMovieId: null,
        todayPayload: null,
        todayUsedFallback: false,
      })
    }
  },
}))
