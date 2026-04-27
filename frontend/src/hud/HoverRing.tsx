import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'

import { HOVER_RING_STROKE_PX, hoverRingOuterRadiusPx } from './hoverRingLayout'

/**
 * Annulus at **planet center** (screen px): inner opening follows silhouette radius + gap;
 * stroke width fixed; no transition (instant on/off).
 */
export function HoverRing() {
  const anchor = useGalaxyInteractionStore((s) => s.hoverAnchorCss)
  const planetR = useGalaxyInteractionStore((s) => s.hoverPlanetRadiusCss)

  if (anchor === null || planetR === null || planetR <= 0) return null

  const outerR = hoverRingOuterRadiusPx(planetR)
  const d = outerR * 2
  return (
    <div
      className="pointer-events-none fixed z-[90] box-border rounded-full border-solid border-white/75 bg-transparent"
      style={{
        left: anchor.x - outerR,
        top: anchor.y - outerR,
        width: d,
        height: d,
        borderWidth: HOVER_RING_STROKE_PX,
        // Inner hole radius ≈ planetR + gap (border sits outside silhouette + gap)
        boxSizing: 'border-box',
      }}
      aria-hidden
    />
  )
}
