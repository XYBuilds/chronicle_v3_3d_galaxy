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

/** Present only when the pipeline has a positive USD amount (H5: hide missing money fields). */
function formatUsdPresent(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null
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

  const budgetStr = movie ? formatUsdPresent(movie.budget) : null
  const revenueStr = movie ? formatUsdPresent(movie.revenue) : null
  const runtimeMin = movie?.runtime ?? null
  const showRuntime = runtimeMin != null
  const showLanguage = movie != null && Boolean(movie.original_language?.trim())
  const showDirector = movie != null && movie.director.length > 0
  const showWriters = movie != null && movie.writers.length > 0
  const showMetaBlock =
    movie != null && (showRuntime || showLanguage || showDirector || showWriters || budgetStr != null || revenueStr != null)
  const overviewText = movie?.overview?.trim() ?? ''
  const showOverview = overviewText.length > 0
  const showCast = movie != null && movie.cast.length > 0

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
        <SheetHeader className="gap-3 border-b border-border/80 bg-muted/25 p-4 text-left">
          <SheetTitle className="pr-10 text-lg font-semibold leading-snug tracking-tight">{title}</SheetTitle>
          <SheetDescription className="sr-only">
            {movie ? `${movie.title}, released ${movie.release_date}.` : 'No film selected.'}
          </SheetDescription>
          {movie && movie.original_title && movie.original_title !== movie.title ? (
            <p className="text-xs text-muted-foreground">{movie.original_title}</p>
          ) : null}
          {movie ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="font-mono tabular-nums transition-colors duration-150">
                ★ {movie.vote_average.toFixed(1)}
              </Badge>
              <Badge variant="outline" className="transition-colors duration-150">
                {formatVoteCount(movie.vote_count)} votes
              </Badge>
              <Badge variant="outline" className="transition-colors duration-150">
                {formatReleaseDate(movie.release_date)}
              </Badge>
              {movie.genres.slice(0, 4).map((g) => (
                <Badge key={g} variant="outline" className="transition-colors duration-150">
                  {g}
                </Badge>
              ))}
            </div>
          ) : null}
        </SheetHeader>

        {movie ? (
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4 motion-safe:scroll-smooth">
            {/*
              H3: width uses min/max against viewport so narrow sheets keep a readable poster;
              height follows 2:3. Center on xs, align start from sm.
            */}
            <div className="group/poster flex justify-center sm:justify-start">
              <AspectRatio
                ratio={2 / 3}
                className={cn(
                  'overflow-hidden rounded-lg border border-border/80 bg-muted shadow-sm',
                  'w-[min(100%,max(8.875rem,min(56vw,15rem)))] sm:w-[min(100%,15rem)]',
                  'motion-safe:transition-[box-shadow,border-color,transform] motion-safe:duration-200',
                  'motion-safe:hover:border-border motion-safe:hover:shadow-md',
                )}
              >
                <DrawerPoster key={`${movie.id}|${movie.poster_url}`} posterUrl={movie.poster_url} title={movie.title} />
              </AspectRatio>
            </div>

            {movie.tagline ? (
              <p className="border-l-2 border-primary/35 pl-3 text-sm italic leading-snug text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-2 motion-safe:duration-300">
                &ldquo;{movie.tagline}&rdquo;
              </p>
            ) : null}

            {showOverview ? (
              <section className="space-y-2 rounded-lg border border-border/60 bg-card/40 p-3 shadow-sm">
                <h3 className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">Overview</h3>
                <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{overviewText}</p>
              </section>
            ) : null}

            {showMetaBlock ? (
              <section className="rounded-lg border border-border/60 bg-muted/20 p-3 shadow-sm">
                <h3 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">Details</h3>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs text-muted-foreground">
                  {showRuntime ? (
                    <div>
                      <dt className="font-medium text-foreground/80">Runtime</dt>
                      <dd>{runtimeMin} min</dd>
                    </div>
                  ) : null}
                  {showLanguage ? (
                    <div>
                      <dt className="font-medium text-foreground/80">Language</dt>
                      <dd className="uppercase">{movie.original_language}</dd>
                    </div>
                  ) : null}
                  {showDirector ? (
                    <div className="col-span-2">
                      <dt className="font-medium text-foreground/80">Director</dt>
                      <dd>{movie.director.join(', ')}</dd>
                    </div>
                  ) : null}
                  {showWriters ? (
                    <div className="col-span-2">
                      <dt className="font-medium text-foreground/80">Writers</dt>
                      <dd>{movie.writers.join(', ')}</dd>
                    </div>
                  ) : null}
                  {budgetStr != null ? (
                    <div>
                      <dt className="font-medium text-foreground/80">Budget</dt>
                      <dd>{budgetStr}</dd>
                    </div>
                  ) : null}
                  {revenueStr != null ? (
                    <div>
                      <dt className="font-medium text-foreground/80">Revenue</dt>
                      <dd>{revenueStr}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            ) : null}

            {showCast ? (
              <section className="min-h-0 flex-1 space-y-2">
                <h3 className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">Cast</h3>
                <ScrollArea className="h-48 rounded-lg border border-border/60 bg-card/30 pr-2 shadow-sm motion-safe:transition-shadow motion-safe:duration-200 motion-safe:hover:shadow-md">
                  <ol className="list-decimal space-y-1.5 py-2 pl-5 text-sm leading-snug">
                    {movie.cast.map((name, i) => (
                      <li key={`${name}-${i}`} className="marker:text-muted-foreground">
                        {name}
                      </li>
                    ))}
                  </ol>
                </ScrollArea>
              </section>
            ) : null}
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
      const tid = window.setTimeout(() => {
        prevSelectedRef.current = null
        setSheetDelayedOpen(false)
      }, 0)
      return () => window.clearTimeout(tid)
    }

    const wasNull = prevSelectedRef.current === null
    prevSelectedRef.current = selectedMovieId

    if (wasNull) {
      const ensureClosed = window.setTimeout(() => {
        setSheetDelayedOpen(false)
      }, 0)
      const openAfterDelay = window.setTimeout(() => {
        setSheetDelayedOpen(true)
      }, 420)
      return () => {
        window.clearTimeout(ensureClosed)
        window.clearTimeout(openAfterDelay)
      }
    }

    const tid = window.setTimeout(() => {
      setSheetDelayedOpen(true)
    }, 0)
    return () => window.clearTimeout(tid)
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
