import { useStrings } from '@/lib/strings'
import { cn } from '@/lib/utils'

const TMDB_LOGO_SRC = '/assets/tmdb-logo-short.svg'
const TMDB_HOME = 'https://www.themoviedb.org/'
const TMDB_ATTRIBUTION_DOC = 'https://www.themoviedb.org/about/logos-attribution'

export interface TmdbAttributionProps {
  className?: string
  /** `footer` = persistent HUD badge; `info` = larger block inside About modal. */
  variant?: 'footer' | 'info'
}

/**
 * TMDB API Terms §3 — logo + mandatory notice on every application surface.
 * Logo asset: official TMDB short mark (see NOTICE / P34.7 guide).
 */
export function TmdbAttribution({ className, variant = 'footer' }: TmdbAttributionProps) {
  const s = useStrings()
  const isInfo = variant === 'info'

  const textSize = isInfo ? 'text-sm' : 'text-[0.65rem] sm:text-xs'
  const learnMoreLink = (
    <a
      href={TMDB_ATTRIBUTION_DOC}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline-offset-2 hover:underline"
    >
      {s.attribution.learnMore}
    </a>
  )

  return (
    <aside
      className={cn(
        'pointer-events-auto',
        isInfo
          ? 'space-y-3 text-left'
          : 'w-[min(21rem,calc(100vw-2*var(--hud-inset-md)-0.5rem))] text-right sm:w-[min(24rem,calc(100vw-2*var(--hud-inset-md)-0.5rem))]',
        className,
      )}
      aria-label={s.attribution.regionLabel}
    >
      <a
        href={TMDB_HOME}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'inline-block rounded-sm opacity-90 transition-opacity hover:opacity-100',
          !isInfo && 'ms-auto',
          isInfo ? 'mb-1' : 'mb-1.5',
        )}
      >
        <img
          src={TMDB_LOGO_SRC}
          alt={s.attribution.logoAlt}
          width={isInfo ? 120 : 72}
          height={isInfo ? 52 : 32}
          className="h-auto w-auto max-w-full"
          decoding="async"
        />
      </a>
      {isInfo ? (
        <p className={cn('leading-relaxed text-muted-foreground', textSize)}>
          {s.attribution.notice} {learnMoreLink}
        </p>
      ) : (
        <div className={cn('space-y-1 text-muted-foreground', textSize)}>
          <p className="text-pretty leading-[1.4]">
            {s.attribution.notice}
          </p>
          <p className="leading-[1.35]">{learnMoreLink}</p>
        </div>
      )}
    </aside>
  )
}
