import { useMemo } from 'react'

import {
  normalizedLBlendTFromVoteNorm,
  srgb01FromHueAndVoteNorm,
  srgb01ToCss,
} from '@/lib/colorMath'
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
    const left = srgb01ToCss(srgb01FromHueAndVoteNorm(hue, 0, snap))
    const right = srgb01ToCss(srgb01FromHueAndVoteNorm(hue, 1, snap))
    const voteNorm = Math.max(0, Math.min(1, movie.vote_average / 10))
    const t = normalizedLBlendTFromVoteNorm(voteNorm, snap)
    const grad = `linear-gradient(to right, ${left}, ${right})`
    return { grad, pointerLeftPct: t * 100 }
  }, [movie, snap, data])

  if (!movie || !snap || !style) return null

  return (
    <div
      className={cn(
        'pointer-events-none fixed left-1/2 z-[35] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 select-none',
        'top-[min(58vh,calc(50%+6.5rem))] sm:top-[56vh]',
      )}
      role="img"
      aria-label={`Rating spectrum for ${movie.title}; pointer near ${movie.vote_average.toFixed(1)} of 10`}
    >
      <div className="mb-1.5 text-center text-[0.72rem] font-semibold tracking-[0.12em] text-white/88">
        Rating
      </div>
      <div className="flex items-center gap-2">
        <span className="w-5 shrink-0 text-right font-mono text-[0.68rem] tabular-nums text-white/75">0</span>
        <div className="relative min-w-0 flex-1">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-white/[0.12] shadow-[0_0_20px_rgba(0,0,0,0.45)]">
            <div className="absolute inset-0" style={{ background: style.grad }} />
            <div
              className="absolute top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.65)]"
              style={{ left: `${style.pointerLeftPct}%` }}
            />
          </div>
        </div>
        <span className="w-5 shrink-0 font-mono text-[0.68rem] tabular-nums text-white/75">10</span>
      </div>
    </div>
  )
}
