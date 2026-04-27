import { useMemo } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useGalaxyDataStore } from '@/store/galaxyDataStore'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'

export type MovieTooltipAnchor = { x: number; y: number }

export interface MovieTooltipHudProps {
  open: boolean
  anchor: MovieTooltipAnchor | null
  title: string
  /** `genres[0]` when present. */
  primaryGenreLabel: string | null
  /** P8.4 — shift trigger right (px) so tooltip clears the planet (`calc(-50% + offset), -50%)`). */
  offsetRightPx?: number | null
}

/**
 * Hover HUD: shadcn (Base UI) Tooltip anchored at projected world position.
 * Use {@link MovieTooltip} in the app; use this in Storybook with mock props.
 */
export function MovieTooltipHud({ open, anchor, title, primaryGenreLabel, offsetRightPx }: MovieTooltipHudProps) {
  const ox = offsetRightPx != null && offsetRightPx > 0 ? offsetRightPx : 0
  const transform = ox > 0 ? `translate(calc(-50% + ${ox}px), -50%)` : 'translate(-50%, -50%)'
  return (
    <Tooltip open={open} onOpenChange={() => undefined}>
      <TooltipTrigger
        type="button"
        tabIndex={-1}
        className="pointer-events-none fixed z-[100] h-px w-px min-h-0 min-w-0 overflow-hidden border-0 bg-transparent p-0"
        style={{
          left: anchor?.x ?? -9999,
          top: anchor?.y ?? -9999,
          transform,
        }}
      />
      <TooltipContent side="top" align="center" className="max-w-sm">
        <div className="flex flex-col gap-0.5 text-left">
          <span className="font-medium leading-snug">{title}</span>
          {primaryGenreLabel ? (
            <span className="text-[0.7rem] font-normal uppercase tracking-wide opacity-90">
              {primaryGenreLabel}
            </span>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

/** Wires raycaster hover + screen anchor from Zustand to {@link MovieTooltipHud}. */
export function MovieTooltip() {
  const hoveredMovieId = useGalaxyInteractionStore((s) => s.hoveredMovieId)
  const hoverAnchorCss = useGalaxyInteractionStore((s) => s.hoverAnchorCss)
  const hoverTooltipOffsetXPx = useGalaxyInteractionStore((s) => s.hoverTooltipOffsetXPx)
  const movies = useGalaxyDataStore((s) => s.data?.movies)

  const movie = useMemo(() => {
    if (hoveredMovieId === null || !movies) return null
    return movies.find((m) => m.id === hoveredMovieId) ?? null
  }, [hoveredMovieId, movies])

  const open = hoveredMovieId !== null && movie !== null && hoverAnchorCss !== null
  const title = movie?.title ?? ''
  const primaryGenreLabel = movie?.genres?.[0] ?? null

  return (
    <MovieTooltipHud
      open={open}
      anchor={hoverAnchorCss}
      title={title}
      primaryGenreLabel={primaryGenreLabel}
      offsetRightPx={hoverTooltipOffsetXPx}
    />
  )
}
