import { useEffect, useMemo } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { hoverTooltipSideOffsetPx } from '@/hud/hoverRingLayout'
import { normalizeGenreHex } from '@/lib/genreColor'
import { useGalaxyDataStore } from '@/store/galaxyDataStore'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import { cn } from '@/lib/utils'

export type MovieTooltipAnchor = { x: number; y: number }

export interface MovieTooltipHudProps {
  open: boolean
  anchor: MovieTooltipAnchor | null
  title: string
  /** `genres[0]` only; plain text, no Badge (P9.2+). */
  primaryGenreLabel: string | null
  /** sRGB hex from `meta.genre_palette[primary]`; `null` when unknown → muted text. */
  primaryGenreColorHex: string | null
  /** Gap along `side` (top/bottom) from planet center to tooltip; clears ring + silhouette. */
  sideOffsetPx?: number
}

/**
 * Hover HUD: shadcn (Base UI) Tooltip anchored at projected world position.
 * Use {@link MovieTooltip} in the app; use this in Storybook with mock props.
 */
export function MovieTooltipHud({
  open,
  anchor,
  title,
  primaryGenreLabel,
  primaryGenreColorHex,
  sideOffsetPx = 12,
}: MovieTooltipHudProps) {
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
        <div className="flex max-w-sm flex-col gap-0.5 text-left">
          <span className="font-medium leading-snug">{title}</span>
          {primaryGenreLabel ? (
            <span
              className={cn('text-[0.7rem] font-normal uppercase tracking-wide', !primaryGenreColorHex && 'text-muted-foreground')}
              style={primaryGenreColorHex ? { color: primaryGenreColorHex } : undefined}
            >
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
  const hoverPlanetRadiusCss = useGalaxyInteractionStore((s) => s.hoverPlanetRadiusCss)
  const movies = useGalaxyDataStore((s) => s.data?.movies)

  const movie = useMemo(() => {
    if (hoveredMovieId === null || !movies) return null
    return movies.find((m) => m.id === hoveredMovieId) ?? null
  }, [hoveredMovieId, movies])

  const open = hoveredMovieId !== null && movie !== null && hoverAnchorCss !== null
  const title = movie?.title ?? ''
  const genrePalette = useGalaxyDataStore((s) => s.data?.meta.genre_palette) ?? null
  const primaryGenreLabel = movie?.genres?.[0] ?? null
  const primaryGenreColorHex = useMemo(() => {
    if (!primaryGenreLabel || !genrePalette) return null
    const raw = genrePalette[primaryGenreLabel]?.trim()
    if (!raw) return null
    return normalizeGenreHex(raw)
  }, [primaryGenreLabel, genrePalette])
  const sideOffsetPx =
    hoverPlanetRadiusCss != null && hoverPlanetRadiusCss > 0
      ? hoverTooltipSideOffsetPx(hoverPlanetRadiusCss)
      : 12

  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (!open || !movie) return
    console.log(
      `[MovieTooltip] id=${movie.id} primaryGenre=${primaryGenreLabel ? JSON.stringify(primaryGenreLabel) : 'none'} color=${primaryGenreColorHex ?? 'muted'}`,
    )
  }, [open, movie, primaryGenreLabel, primaryGenreColorHex])

  return (
    <MovieTooltipHud
      open={open}
      anchor={hoverAnchorCss}
      title={title}
      primaryGenreLabel={primaryGenreLabel}
      primaryGenreColorHex={primaryGenreColorHex}
      sideOffsetPx={sideOffsetPx}
    />
  )
}
