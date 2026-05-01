import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Star } from 'lucide-react'

import { GenreBadgesList } from '@/components/GenreBadgesList'
import {
  buildDrawerDetailsFields,
  type DrawerDetailFieldId,
} from '@/components/drawerDetailsLayout'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { buttonVariants } from '@/components/ui/button-variants'
import { CloseButton } from '@/components/ui/close-button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useGalaxyDataStore } from '@/store/galaxyDataStore'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import type { Movie } from '@/types/galaxy'
import { STRINGS } from '@/lib/strings'
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

/** Isolated poster + error state so remounting via `key` resets without an effect. */
function DrawerPoster({ posterUrl, title }: { posterUrl: string; title: string }) {
  const [failed, setFailed] = useState(false)
  const trimmed = posterUrl.trim()
  const show = Boolean(trimmed) && !failed
  return show ? (
    <img
      src={trimmed}
      alt={STRINGS.drawer.posterAlt(title)}
      className="absolute inset-0 size-full object-cover"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 via-accent to-secondary text-muted-foreground">
      <span className="rounded-md border border-border/60 bg-background/10 px-3 py-2 text-[0.65rem] font-bold uppercase tracking-wider backdrop-blur-sm">
        {STRINGS.drawer.posterPlaceholder}
      </span>
    </div>
  )
}

export interface MovieDetailDrawerHudProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  movie: Movie | null
}

const externalHudLinkClass = cn(
  buttonVariants({ variant: 'ghost', size: 'sm' }),
  'h-6 rounded-full px-2 text-[0.68rem] text-muted-foreground hover:text-foreground',
)

const detailFieldLabelClass = 'text-xs font-semibold leading-snug text-foreground'

function drawerDetailLabel(id: DrawerDetailFieldId): string {
  switch (id) {
    case 'runtime':
      return STRINGS.drawer.details.runtime
    case 'language':
      return STRINGS.drawer.details.language
    case 'director':
      return STRINGS.drawer.details.director
    case 'producers':
      return STRINGS.drawer.details.producers
    case 'writers':
      return STRINGS.drawer.details.writers
    case 'directorOfPhotography':
      return STRINGS.drawer.details.directorOfPhotography
    case 'musicComposer':
      return STRINGS.drawer.details.composer
    case 'budget':
      return STRINGS.drawer.details.budget
    case 'revenue':
      return STRINGS.drawer.details.revenue
    default: {
      const _exhaustive: never = id
      return _exhaustive
    }
  }
}

/** Scrollable body: keep scroll affordance, hide native scrollbar (trackpad / wheel / touch still work). */
const drawerBodyScrollClass =
  'min-h-0 flex-1 overflow-y-auto overflow-x-hidden motion-safe:scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'

/**
 * Click HUD: shadcn Sheet with poster, scores, overview, and cast list.
 * Use {@link MovieDetailDrawer} in the app; use this in Storybook with mock props.
 */
export function MovieDetailDrawerHud({ open, onOpenChange, movie }: MovieDetailDrawerHudProps) {
  const title = movie?.title ?? STRINGS.drawer.fallbackTitle
  const genrePalette = useGalaxyDataStore((s) => s.data?.meta.genre_palette) ?? null

  const detailFields = useMemo(() => (movie ? buildDrawerDetailsFields(movie) : []), [movie])
  const showDetailsSection = movie != null
  const imdbIdTrimmed = movie?.imdb_id?.trim() ?? ''
  const showImdbLink = imdbIdTrimmed.length > 0
  const tmdbMovieUrl = movie != null ? `https://www.themoviedb.org/movie/${movie.id}` : ''
  const overviewText = movie?.overview?.trim() ?? ''
  const showOverview = overviewText.length > 0
  const showCast = movie != null && movie.cast.length > 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false} disablePointerDismissal>
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          /* Override `sheet` default `data-[side=right]:sm:max-w-sm` (plain `sm:max-w-*` loses merge/specificity). */
          'min-h-0 max-h-[100dvh] gap-0 overflow-hidden border-l border-border bg-popover p-0 data-[side=right]:sm:max-w-lg',
          'transition-[transform,opacity] duration-[300ms] ease-[var(--sheet-ease)] data-ending-style:duration-[450ms]',
        )}
        style={{ ['--sheet-ease' as string]: SHEET_OPEN_EASE }}
      >
        <SheetClose
          render={<CloseButton variant="secondary" className="absolute right-5 top-5 z-30" />}
        />
        <SheetHeader className="relative z-20 shrink-0 gap-0 border-b border-border/70 bg-popover px-6 pb-5 pt-7 text-left shadow-[0_6px_18px_-10px_color-mix(in_oklch,var(--foreground)_10%,transparent)] sm:px-7">
          <SheetTitle className="pr-10 text-2xl font-bold leading-tight tracking-tight text-foreground">{title}</SheetTitle>
          <SheetDescription className="sr-only">
            {movie
              ? STRINGS.drawer.sheetDescription(movie.title, formatReleaseDate(movie.release_date))
              : STRINGS.drawer.sheetDescriptionEmpty}
          </SheetDescription>
          {movie && movie.original_title && movie.original_title !== movie.title ? (
            <p className="mt-2 text-sm font-medium leading-snug text-muted-foreground">{movie.original_title}</p>
          ) : null}
          {movie ? (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1 text-foreground">
                  <Star className="size-3 fill-current" aria-hidden />
                  <span className="tabular-nums">{movie.vote_average.toFixed(1)}</span>
                </span>
                <span>{STRINGS.drawer.votesLine(formatVoteCount(movie.vote_count))}</span>
                <span className="text-foreground">{formatReleaseDate(movie.release_date)}</span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {movie.genres.length > 0 ? (
                  <GenreBadgesList genres={movie.genres} genrePalette={genrePalette} />
                ) : null}
                <a
                  href={tmdbMovieUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={externalHudLinkClass}
                >
                  {STRINGS.drawer.links.tmdb}
                  <ExternalLink className="size-3.5 opacity-80" aria-hidden />
                </a>
                {showImdbLink ? (
                  <a
                    href={`https://www.imdb.com/title/${encodeURIComponent(imdbIdTrimmed)}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={externalHudLinkClass}
                  >
                    {STRINGS.drawer.links.imdb}
                    <ExternalLink className="size-3.5 opacity-80" aria-hidden />
                  </a>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetHeader>

        {movie ? (
          <div className={cn('flex flex-col gap-7 px-6 py-5 sm:px-7', drawerBodyScrollClass)}>
            {/*
              Header stays fixed; only this column scrolls; scrollbar visually hidden.
            */}
            <div className="group/poster">
              <AspectRatio
                ratio={2 / 3}
                className={cn(
                  'w-full overflow-hidden rounded-xl bg-muted shadow-sm',
                  'motion-safe:transition-[box-shadow,border-color,transform] motion-safe:duration-200',
                  'motion-safe:hover:shadow-md motion-safe:hover:brightness-[1.02]',
                )}
              >
                <DrawerPoster key={`${movie.id}|${movie.poster_url}`} posterUrl={movie.poster_url} title={movie.title} />
              </AspectRatio>
            </div>

            {movie.tagline ? (
              <blockquote className="border-l-2 border-border pl-4 text-sm italic leading-relaxed text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-2 motion-safe:duration-300">
                &ldquo;{movie.tagline}&rdquo;
              </blockquote>
            ) : null}

            {showOverview ? (
              <section className="space-y-3">
                <h3 className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                  {STRINGS.drawer.sections.overview}
                </h3>
                <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{overviewText}</p>
              </section>
            ) : null}

            {showDetailsSection ? (
              <section className="space-y-3">
                <h3 className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                  {STRINGS.drawer.sections.details}
                </h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-5 text-sm">
                  {detailFields.map((field) => (
                    <div key={field.id} className="min-w-0">
                      <div className={detailFieldLabelClass}>{drawerDetailLabel(field.id)}</div>
                      <div className="text-muted-foreground">{field.value}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {showCast ? (
              <section className="space-y-3">
                <h3 className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                  {STRINGS.drawer.sections.cast}
                </h3>
                <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
                  {movie.cast.map((name, i) => (
                    <div key={`${name}-${i}`} className="flex min-w-0 items-baseline gap-2">
                      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                      <span className="min-w-0 flex-1 truncate text-xs leading-snug text-foreground">{name}</span>
                    </div>
                  ))}
                </div>
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
        `[MovieDetailDrawer] open id=${movie.id} title=${JSON.stringify(movie.title)} | genres=${movie.genres.length} cast=${movie.cast.length} dop=${movie.director_of_photography.length} producers=${movie.producers.length} composer=${movie.music_composer.length} imdb=${movie.imdb_id ? 'yes' : 'no'}`,
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
