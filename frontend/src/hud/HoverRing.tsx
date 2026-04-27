import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'

/**
 * P8.4 — HTML/CSS ring at hover anchor; **no** transition (instant on/off, same as tooltip).
 */
export function HoverRing() {
  const anchor = useGalaxyInteractionStore((s) => s.hoverAnchorCss)
  const radius = useGalaxyInteractionStore((s) => s.hoverRingRadiusCss)

  if (anchor === null || radius === null || radius <= 0) return null

  const d = radius * 2
  return (
    <div
      className="pointer-events-none fixed z-[90] box-border rounded-full border border-white/75"
      style={{
        left: anchor.x - radius,
        top: anchor.y - radius,
        width: d,
        height: d,
      }}
      aria-hidden
    />
  )
}
