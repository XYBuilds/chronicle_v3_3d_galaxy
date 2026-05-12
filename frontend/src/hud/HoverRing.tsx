import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'

import { hoverRingOuterRadiusPx } from './hoverRingLayout'

/**
 * Annulus at **planet center** (screen px): inner opening follows silhouette radius + gap;
 * Stroke on black canvas: `--ui-edge-canvas-color` + `--ui-edge-stroke-width`; no transition.
 */
export function HoverRing() {
  const anchor = useGalaxyInteractionStore((s) => s.hoverAnchorCss)
  const planetR = useGalaxyInteractionStore((s) => s.hoverPlanetRadiusCss)

  if (anchor === null || planetR === null || planetR <= 0) return null

  const outerR = hoverRingOuterRadiusPx(planetR)
  const d = outerR * 2
  return (
    <div
      className="pointer-events-none fixed z-[var(--z-hud-hover-ring)] box-border rounded-full border-solid bg-transparent"
      style={{
        left: anchor.x - outerR,
        top: anchor.y - outerR,
        width: d,
        height: d,
        borderWidth: 'var(--ui-edge-stroke-width)',
        borderColor: 'var(--ui-edge-canvas-color)',
        // Inner hole radius ≈ planetR + gap (border sits outside silhouette + gap)
        boxSizing: 'border-box',
      }}
      aria-hidden
    />
  )
}
