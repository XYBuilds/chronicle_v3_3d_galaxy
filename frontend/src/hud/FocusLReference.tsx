import { useMemo } from 'react'
import { Star } from 'lucide-react'

import { srgb01FromHueAndVoteNorm, srgb01ToCss } from '@/lib/colorMath'
import { useStrings } from '@/lib/strings'
import { useGalaxyDataStore } from '@/store/galaxyDataStore'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import { primaryGenreHueRad } from '@/utils/genreHue'
import { cn } from '@/lib/utils'

/**
 * P13.5 — Focus-only OKLab L legend: primary-genre hue spectrum + pointer from `vote_average`.
 * P14.7.1 — Vertical spectrum to the left of the on-screen planet (after horizontal Timeline layout review).
 * P25.1 — Responsive horizontal offset: laptops stay closer to center; wide screens sit farther left to clear the larger focus planet.
 */
export function FocusLReference() {
  const str = useStrings()
  const selectedMovieId = useGalaxyInteractionStore((s) => s.selectedMovieId)
  const snap = useGalaxyInteractionStore((s) => s.focusLightnessSnap)
  const data = useGalaxyDataStore((s) => s.data)

  const movie = useMemo(() => {
    if (!data || selectedMovieId === null) return null
    return data.movies.find((m) => m.id === selectedMovieId) ?? null
  }, [data, selectedMovieId])

  const style = useMemo(() => {
    if (!movie || !snap || !data) return null
    const hue = primaryGenreHueRad(movie, data.meta.genre_palette)
    /** Ten rating bins: 0.5, 1.5, …, 9.5 → voteNorm = (k+0.5)/10; P17.2 chroma uses Hunt(active) like `galaxyActive.vert.glsl`. */
    const stripeColors: string[] = []
    for (let k = 0; k < 10; k++) {
      const voteNorm = (k + 0.5) / 10
      const rgb = srgb01FromHueAndVoteNorm(hue, voteNorm, snap)
      stripeColors.push(srgb01ToCss(rgb))
    }
    console.assert(stripeColors.length === 10, '[FocusLReference] stripe count', stripeColors.length)
    const ratingNorm = Math.max(0, Math.min(1, movie.vote_average / 10))
    const pointerAlongPct = ratingNorm * 100
    return { stripeColors, pointerAlongPct }
  }, [movie, snap, data])

  if (!movie || !snap || !style) return null

  const ratingStr = movie.vote_average.toFixed(1)
  const pointerTopPct = 100 - style.pointerAlongPct

  return (
    <div
      className={cn(
        'pointer-events-none fixed top-1/2 z-[var(--z-hud-focus-chrome)] flex -translate-y-1/2 flex-row items-stretch gap-4 select-none',
        'left-[max(var(--hud-inset-xs),calc(50vw-var(--hud-focus-ref-clearance)))] lg:left-[max(var(--hud-inset-sm),calc(50vw-var(--hud-focus-ref-clearance-lg)))] 2xl:left-[max(var(--hud-inset-sm),calc(50vw-var(--hud-focus-ref-clearance-2xl)))]',
      )}
      role="img"
      aria-label={str.focusLReference.ariaLabel(ratingStr, movie.title)}
    >
      <div className="relative flex h-[min(70vh,28rem)] w-2.5 shrink-0 flex-col-reverse overflow-hidden">
        {style.stripeColors.map((bg, k) => (
          <div
            key={k}
            className="min-h-0 min-w-0 flex-1"
            style={{ backgroundColor: bg }}
            aria-hidden
          />
        ))}
        <div
          className="pointer-events-none absolute left-1/2 h-1 w-5 -translate-x-1/2 -translate-y-1/2 bg-white"
          style={{ top: `${pointerTopPct}%` }}
          aria-hidden
        />
      </div>
      <div className="relative h-[min(70vh,28rem)] min-w-[4.5rem] shrink-0">
        <div
          className="pointer-events-none absolute left-0 flex flex-row items-center"
          style={{ top: `${pointerTopPct}%`, transform: 'translateY(-50%)' }}
        >
          <span className="inline-flex items-center gap-0.5 text-[0.72rem] font-semibold tabular-nums text-white/88">
            {ratingStr}
            <Star className="size-3 fill-current" aria-hidden />
          </span>
        </div>
      </div>
    </div>
  )
}
