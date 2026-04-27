/** Clearance from planet silhouette (CSS px) to the inner edge of the ring stroke. */
export const HOVER_RING_GAP_PX = 2

/** Ring stroke width in CSS px (fixed). */
export const HOVER_RING_STROKE_PX = 1

/** Extra gap (CSS px) beyond ring outer edge along top/bottom for tooltip placement. */
export const HOVER_TOOLTIP_CLEAR_PX = 10

/** Outer radius of the ring widget (center → outside of stroke). */
export function hoverRingOuterRadiusPx(planetRadiusCss: number): number {
  return planetRadiusCss + HOVER_RING_GAP_PX + HOVER_RING_STROKE_PX
}

/** `TooltipContent` `sideOffset`: distance from planet center along top/bottom past ring + margin. */
export function hoverTooltipSideOffsetPx(planetRadiusCss: number): number {
  return hoverRingOuterRadiusPx(planetRadiusCss) + HOVER_TOOLTIP_CLEAR_PX
}
