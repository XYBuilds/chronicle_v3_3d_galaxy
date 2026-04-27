import { create } from 'zustand'

/** Phase 4.1 — Raycaster-driven HUD prep: hover / selection ids (TMDB `Movie.id`). */
/** Phase 5.1.5 — Macro view: time focus + visible Z span + camera standoff (Design Spec 方案 1). */
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
}

export const useGalaxyInteractionStore = create<GalaxyInteractionState>(() => ({
  hoveredMovieId: null,
  selectedMovieId: null,
  hoverAnchorCss: null,
  hoverPlanetRadiusCss: null,
  zCurrent: 0,
  zVisWindow: 1,
  zCamDistance: 30,
}))
