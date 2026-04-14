import { create } from 'zustand'

/** Phase 4.1 — Raycaster-driven HUD prep: hover / selection ids (TMDB `Movie.id`). */
export interface GalaxyInteractionState {
  hoveredMovieId: number | null
  selectedMovieId: number | null
  /** Viewport CSS pixels for HUD anchor (world position of hovered point projected). */
  hoverAnchorCss: { x: number; y: number } | null
}

export const useGalaxyInteractionStore = create<GalaxyInteractionState>(() => ({
  hoveredMovieId: null,
  selectedMovieId: null,
  hoverAnchorCss: null,
}))
