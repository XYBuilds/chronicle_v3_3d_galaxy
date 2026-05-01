/** Clearance from planet silhouette (CSS px) to the inner edge of the ring stroke. */
export const HOVER_RING_GAP_PX = 2

/** Extra gap (CSS px) beyond ring outer edge along top/bottom for tooltip placement. */
export const HOVER_TOOLTIP_CLEAR_PX = 10

/**
 * Parses `--ui-edge-stroke-width` from `:root` for layout math (outer radius / tooltip offset).
 * Visual stroke uses the same CSS variable on `HoverRing`; keep in sync when token changes.
 */
export function readUiEdgeStrokeWidthPx(): number {
  if (typeof document === 'undefined') return 1
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--ui-edge-stroke-width').trim()
  const n = parseFloat(raw)
  if (!Number.isFinite(n) || n <= 0) {
    console.warn('[hoverRingLayout] invalid --ui-edge-stroke-width, fallback 1px:', raw)
    return 1
  }
  return n
}

/** Outer radius of the ring widget (center → outside of stroke). */
export function hoverRingOuterRadiusPx(planetRadiusCss: number): number {
  return planetRadiusCss + HOVER_RING_GAP_PX + readUiEdgeStrokeWidthPx()
}

/** `TooltipContent` `sideOffset`: distance from planet center along top/bottom past ring + margin. */
export function hoverTooltipSideOffsetPx(planetRadiusCss: number): number {
  return hoverRingOuterRadiusPx(planetRadiusCss) + HOVER_TOOLTIP_CLEAR_PX
}
