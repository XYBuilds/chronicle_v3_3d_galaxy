import { useMemo } from 'react'

import { srgb01FromHueAndVoteNorm, srgb01ToCss } from '@/lib/colorMath'
import { STRINGS } from '@/lib/strings'
import { useGalaxyDataStore } from '@/store/galaxyDataStore'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import type { Movie } from '@/types/galaxy'
import { genreHueForGenreName, hueFromGenreColor } from '@/utils/genreHue'
import { cn } from '@/lib/utils'

function primaryHueRad(movie: Movie, palette: Record<string, string>): number {
  const primary = movie.genres.filter(Boolean)[0] ?? ''
  const fbHue =
    movie.genre_hue ??
    hueFromGenreColor([movie.genre_color[0], movie.genre_color[1], movie.genre_color[2]] as [
      number,
      number,
      number,
    ])
  return genreHueForGenreName(primary, palette, fbHue)
}

/**
 * P13.5 — Focus-only OKLab L legend: primary-genre hue spectrum + pointer from `vote_average`.
 * P14.7.1 — Vertical spectrum to the left of the on-screen planet (horizontal Timeline 视觉评审后).
 */
export function FocusLReference() {
  const selectedMovieId = useGalaxyInteractionStore((s) => s.selectedMovieId)
  const snap = useGalaxyInteractionStore((s) => s.focusLightnessSnap)
  const data = useGalaxyDataStore((s) => s.data)

  const movie = useMemo(() => {
    if (!data || selectedMovieId === null) return null
    return data.movies.find((m) => m.id === selectedMovieId) ?? null
  }, [data, selectedMovieId])

  const style = useMemo(() => {
    if (!movie || !snap || !data) return null
    const hue = primaryHueRad(movie, data.meta.genre_palette)
    /** 10 档：rating 0.5, 1.5, …, 9.5 → `voteNorm` = (k+0.5)/10（与 shader `voteNorm` 一致）。 */
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

  const ratingLine = STRINGS.focusLReference.ratingLine(movie.vote_average.toFixed(1))

  return (
    <div
      className={cn(
        'pointer-events-none fixed top-[min(46vh,44%)] z-[35] flex -translate-y-1/2 flex-row items-center gap-2 select-none',
        'left-[max(0.75rem,calc(50vw-19rem))]',
      )}
      role="img"
      aria-label={STRINGS.focusLReference.ariaLabel(ratingLine, movie.title)}
    >
      <div className="relative flex h-44 w-2.5 shrink-0 flex-col-reverse overflow-hidden rounded-sm">
        {style.stripeColors.map((bg, k) => (
          <div
            key={k}
            className="min-h-0 min-w-0 flex-1"
            style={{ backgroundColor: bg }}
            aria-hidden
          />
        ))}
        <div
          className="pointer-events-none absolute left-1/2 h-px w-5 -translate-x-1/2 bg-white"
          style={{ bottom: `${style.pointerAlongPct}%` }}
        />
      </div>
      <div className="max-w-[9rem] text-left text-[0.72rem] font-semibold leading-tight tracking-wide text-white/88 tabular-nums">
        {ratingLine}
      </div>
    </div>
  )
}
