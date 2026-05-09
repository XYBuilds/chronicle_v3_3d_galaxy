import { create } from 'zustand'

import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'

export interface CoverModeState {
  coverMode: boolean
  todayMovieId: number | null
  /** When true, next `beginSelect` from idle must keep `focusOrbit` (cover → focus). */
  exitCoverPreserveOrbit: boolean
  setCover: (movieId: number) => void
  exitCoverIntoFocus: () => void
}

export const useCoverModeStore = create<CoverModeState>((set, get) => ({
  coverMode: false,
  todayMovieId: null,
  exitCoverPreserveOrbit: false,

  setCover: (movieId: number) => {
    console.log('[CoverMode] setCover', { movieId })
    set({ coverMode: true, todayMovieId: movieId })
  },

  exitCoverIntoFocus: () => {
    const id = get().todayMovieId
    if (id === null) return
    console.log('[CoverMode] exitCoverIntoFocus', { movieId: id })
    set({ coverMode: false, todayMovieId: null, exitCoverPreserveOrbit: true })
    useGalaxyInteractionStore.setState({ selectedMovieId: id })
  },
}))
