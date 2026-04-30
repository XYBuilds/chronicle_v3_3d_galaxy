import { useMemo } from 'react'

import { srgb01FromHueAndVoteNorm, srgb01ToCss } from '@/lib/colorMath'
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
 * Placed below the on-screen planet region (upper-mid viewport).
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
    const pointerLeftPct = ratingNorm * 100
    return { stripeColors, pointerLeftPct }
  }, [movie, snap, data])

  if (!movie || !snap || !style) return null

  const ratingTitle = `Rating = ${movie.vote_average.toFixed(1)}`

  return (
    <div
      className={cn(
        'pointer-events-none fixed left-1/2 z-[35] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 select-none',
        'top-[min(70vh,calc(50%+11rem))] sm:top-[68vh]',
      )}
      role="img"
      aria-label={`${ratingTitle} on OKLab L spectrum for ${movie.title}; ten bands at half-step ratings`}
    >
      <div className="mb-1.5 text-center text-[0.72rem] font-semibold tracking-wide text-white/88 tabular-nums">
        {ratingTitle}
      </div>
      <div className="relative flex h-2.5 w-full overflow-hidden">
        <div className="flex min-w-0 flex-1">
          {style.stripeColors.map((bg, k) => (
            <div
              key={k}
              className="min-h-0 min-w-0 flex-1"
              style={{ backgroundColor: bg }}
              aria-hidden
            />
          ))}
        </div>
        <div
          className="pointer-events-none absolute top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-white"
          style={{ left: `${style.pointerLeftPct}%` }}
        />
      </div>
    </div>
  )
}
