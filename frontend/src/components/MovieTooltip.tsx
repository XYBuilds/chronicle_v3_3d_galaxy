import { useEffect, useMemo } from 'react'

import { GenreBadgesList } from '@/components/GenreBadgesList'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { hoverTooltipSideOffsetPx } from '@/hud/hoverRingLayout'
import { useGalaxyDataStore } from '@/store/galaxyDataStore'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'

export type MovieTooltipAnchor = { x: number; y: number }

export interface MovieTooltipHudProps {
  open: boolean
  anchor: MovieTooltipAnchor | null
  title: string
  genres: string[]
  /** From `meta.genre_palette`; outline fallback when a name is missing from the map. */
  genrePalette: Record<string, string> | null
  /** Gap along `side` (top/bottom) from planet center to tooltip; clears ring + silhouette. */
  sideOffsetPx?: number
}

/**
 * Hover HUD: shadcn (Base UI) Tooltip anchored at projected world position.
 * Use {@link MovieTooltip} in the app; use this in Storybook with mock props.
 */
export function MovieTooltipHud({ open, anchor, title, genres, genrePalette, sideOffsetPx = 12 }: MovieTooltipHudProps) {
  return (
    <Tooltip open={open} onOpenChange={() => undefined}>
      <TooltipTrigger
        type="button"
        tabIndex={-1}
        className="pointer-events-none fixed z-[100] h-px w-px min-h-0 min-w-0 overflow-hidden border-0 bg-transparent p-0"
        style={{
          left: anchor?.x ?? -9999,
          top: anchor?.y ?? -9999,
          transform: 'translate(-50%, -50%)',
        }}
      />
      <TooltipContent
        side="top"
        align="center"
        sideOffset={sideOffsetPx}
        className="max-w-sm pointer-events-none"
      >
        <div className="flex max-w-sm flex-col gap-1 text-left">
          <span className="font-medium leading-snug">{title}</span>
          {genres.length > 0 ? <GenreBadgesList size="tooltip" genres={genres} genrePalette={genrePalette} /> : null}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

/** Wires raycaster hover + screen anchor from Zustand to {@link MovieTooltipHud}. */
export function MovieTooltip() {
  const hoveredMovieId = useGalaxyInteractionStore((s) => s.hoveredMovieId)
  const hoverAnchorCss = useGalaxyInteractionStore((s) => s.hoverAnchorCss)
  const hoverPlanetRadiusCss = useGalaxyInteractionStore((s) => s.hoverPlanetRadiusCss)
  const movies = useGalaxyDataStore((s) => s.data?.movies)

  const movie = useMemo(() => {
    if (hoveredMovieId === null || !movies) return null
    return movies.find((m) => m.id === hoveredMovieId) ?? null
  }, [hoveredMovieId, movies])

  const open = hoveredMovieId !== null && movie !== null && hoverAnchorCss !== null
  const title = movie?.title ?? ''
  const genres = movie?.genres ?? []
  const genrePalette = useGalaxyDataStore((s) => s.data?.meta.genre_palette) ?? null
  const sideOffsetPx =
    hoverPlanetRadiusCss != null && hoverPlanetRadiusCss > 0
      ? hoverTooltipSideOffsetPx(hoverPlanetRadiusCss)
      : 12

  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (!open || !movie) return
    console.log(
      `[MovieTooltip] id=${movie.id} genres=${genres.length} paletteKeys=${genrePalette ? Object.keys(genrePalette).length : 0}`,
    )
  }, [open, movie, genres.length, genrePalette])

  return (
    <MovieTooltipHud
      open={open}
      anchor={hoverAnchorCss}
      title={title}
      genres={genres}
      genrePalette={genrePalette}
      sideOffsetPx={sideOffsetPx}
    />
  )
}
