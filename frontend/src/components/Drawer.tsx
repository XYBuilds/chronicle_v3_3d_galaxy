import { useEffect, useMemo, useRef, useState } from 'react'
import { Clapperboard } from 'lucide-react'

import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useGalaxyDataStore } from '@/store/galaxyDataStore'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import type { Movie } from '@/types/galaxy'
import { cn } from '@/lib/utils'

/** easeOutCubic — open ~300ms, close ~450ms (Phase 4.3). */
const SHEET_OPEN_EASE = 'cubic-bezier(0.215, 0.61, 0.355, 1)'

function formatReleaseDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(d)
}

function formatVoteCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

/** Isolated poster + error state so remounting via `key` resets without an effect. */
function DrawerPoster({ posterUrl, title }: { posterUrl: string; title: string }) {
  const [failed, setFailed] = useState(false)
  const trimmed = posterUrl.trim()
  const show = Boolean(trimmed) && !failed
  return show ? (
    <img
      src={trimmed}
      alt={`Poster for ${title}`}
      className="absolute inset-0 size-full object-cover"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted text-muted-foreground">
      <Clapperboard className="size-10 opacity-60" aria-hidden />
      <span className="text-xs">No poster</span>
    </div>
  )
}

export interface MovieDetailDrawerHudProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  movie: Movie | null
}

/**
 * Click HUD: shadcn Sheet with poster, scores, overview, scrollable cast.
 * Use {@link MovieDetailDrawer} in the app; use this in Storybook with mock props.
 */
export function MovieDetailDrawerHud({ open, onOpenChange, movie }: MovieDetailDrawerHudProps) {
  const title = movie?.title ?? 'Film'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton
        className={cn(
          'w-full gap-0 border-l border-border bg-popover p-0 sm:max-w-lg',
          'transition-[transform,opacity] duration-[300ms] ease-[var(--sheet-ease)] data-ending-style:duration-[450ms]',
        )}
        style={{ ['--sheet-ease' as string]: SHEET_OPEN_EASE }}
      >
        <SheetHeader className="gap-3 border-b border-border p-4 text-left">
          <SheetTitle className="pr-10 text-lg leading-snug">{title}</SheetTitle>
          <SheetDescription className="sr-only">
            {movie ? `${movie.title}, released ${movie.release_date}.` : 'No film selected.'}
          </SheetDescription>
          {movie && movie.original_title && movie.original_title !== movie.title ? (
            <p className="text-xs text-muted-foreground">{movie.original_title}</p>
          ) : null}
          {movie ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="font-mono tabular-nums">
                ★ {movie.vote_average.toFixed(1)}
              </Badge>
              <Badge variant="outline">{formatVoteCount(movie.vote_count)} votes</Badge>
              <Badge variant="outline">{formatReleaseDate(movie.release_date)}</Badge>
              {movie.genres.slice(0, 4).map((g) => (
                <Badge key={g} variant="outline">
                  {g}
                </Badge>
              ))}
            </div>
          ) : null}
        </SheetHeader>

        {movie ? (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            <AspectRatio ratio={2 / 3} className="w-full max-w-[220px] overflow-hidden rounded-md border border-border bg-muted">
              <DrawerPoster key={`${movie.id}|${movie.poster_url}`} posterUrl={movie.poster_url} title={movie.title} />
            </AspectRatio>

            {movie.tagline ? (
              <p className="text-sm italic text-muted-foreground leading-snug">&ldquo;{movie.tagline}&rdquo;</p>
            ) : null}

            <div className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Overview</h3>
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{movie.overview || '—'}</p>
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-muted-foreground">
              <div>
                <dt className="font-medium text-foreground/80">Runtime</dt>
                <dd>{movie.runtime != null ? `${movie.runtime} min` : '—'}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground/80">Language</dt>
                <dd className="uppercase">{movie.original_language || '—'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="font-medium text-foreground/80">Director</dt>
                <dd>{movie.director.length ? movie.director.join(', ') : '—'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="font-medium text-foreground/80">Writers</dt>
                <dd>{movie.writers.length ? movie.writers.join(', ') : '—'}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground/80">Budget</dt>
                <dd>{formatUsd(movie.budget)}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground/80">Revenue</dt>
                <dd>{formatUsd(movie.revenue)}</dd>
              </div>
            </dl>

            <div className="min-h-0 flex-1 space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cast</h3>
              <ScrollArea className="h-48 rounded-md border border-border pr-2">
                <ol className="list-decimal space-y-1.5 py-2 pl-5 text-sm leading-snug">
                  {movie.cast.length === 0 ? (
                    <li className="text-muted-foreground">—</li>
                  ) : (
                    movie.cast.map((name, i) => (
                      <li key={`${name}-${i}`} className="marker:text-muted-foreground">
                        {name}
                      </li>
                    ))
                  )}
                </ol>
              </ScrollArea>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

/** Wires raycaster selection from Zustand to {@link MovieDetailDrawerHud}. */
export function MovieDetailDrawer() {
  const selectedMovieId = useGalaxyInteractionStore((s) => s.selectedMovieId)
  const movies = useGalaxyDataStore((s) => s.data?.movies)
  const prevSelectedRef = useRef<number | null>(null)
  const [sheetDelayedOpen, setSheetDelayedOpen] = useState(false)

  const movie = useMemo(() => {
    if (selectedMovieId === null || !movies) return null
    return movies.find((m) => m.id === selectedMovieId) ?? null
  }, [selectedMovieId, movies])

  useEffect(() => {
    if (selectedMovieId === null || !movies) return
    if (!movies.some((m) => m.id === selectedMovieId)) {
      useGalaxyInteractionStore.setState({ selectedMovieId: null })
    }
  }, [selectedMovieId, movies])

  useEffect(() => {
    if (selectedMovieId === null) {
      setSheetDelayedOpen(false)
      prevSelectedRef.current = null
      return
    }
    const wasNull = prevSelectedRef.current === null
    prevSelectedRef.current = selectedMovieId
    if (wasNull) {
      setSheetDelayedOpen(false)
      const t = window.setTimeout(() => setSheetDelayedOpen(true), 420)
      return () => window.clearTimeout(t)
    }
    setSheetDelayedOpen(true)
  }, [selectedMovieId])

  const open = sheetDelayedOpen && selectedMovieId !== null && movie !== null

  useEffect(() => {
    if (open && movie) {
      console.log(
        `[MovieDetailDrawer] open id=${movie.id} title=${JSON.stringify(movie.title)} | cast=${movie.cast.length}`,
      )
    }
  }, [open, movie])

  return (
    <MovieDetailDrawerHud
      open={open}
      movie={movie}
      onOpenChange={(next) => {
        if (!next) useGalaxyInteractionStore.setState({ selectedMovieId: null })
      }}
    />
  )
}
