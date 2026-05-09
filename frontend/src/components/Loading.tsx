import type { GalaxyGzipProgress } from '@/data/loadGalaxyGzip'
import { useStrings } from '@/lib/strings'
import { cn } from '@/lib/utils'

export type LoadingIndexStatus = 'pending' | 'loading' | 'ready' | 'skipped' | 'error'

export type LoadingMode = 'loading' | 'await-start'

export interface LoadingProps {
  className?: string
  /** Accessible label for the loading region */
  label?: string
  /** Gzip fetch / gunzip / parse progress from the data store */
  progress?: GalaxyGzipProgress | null
  /**
   * When true, Download / Decompress / Parse are shown complete (galaxy_data ready;
   * only the search-index row animates). Ignored when `progress` is still driving gzip phases.
   */
  gzipDone?: boolean
  /** Search index hydrate status (fourth step indicator). */
  indexStatus?: LoadingIndexStatus
  /** P15.2 — when `await-start`, Start CTA pinned to bottom of viewport. */
  mode?: LoadingMode
  /** P15.2 — Start button click handler. */
  onStart?: () => void
}

function computeLoadingDisplay(
  progress: GalaxyGzipProgress | null,
  indexStatus: LoadingIndexStatus,
  gzipDone: boolean,
): { percent: number; stageLabel: string } {
  if (gzipDone) {
    const done = indexStatus === 'ready' || indexStatus === 'skipped' || indexStatus === 'error'
    return { percent: done ? 100 : 90, stageLabel: 'Search Index' }
  }

  if (!progress) return { percent: 0, stageLabel: 'Download' }

  if (progress.phase === 'download') {
    const ratio =
      progress.totalBytes !== null && progress.totalBytes > 0
        ? Math.min(1, progress.downloadedBytes / Math.max(1, progress.totalBytes))
        : 0
    return { percent: Math.round(ratio * 70), stageLabel: 'Download' }
  }

  if (progress.phase === 'decompress') return { percent: 75, stageLabel: 'Decompress' }
  if (progress.phase === 'parse') return { percent: 85, stageLabel: 'Parse' }
  return { percent: 0, stageLabel: 'Download' }
}

/**
 * Full-screen loading overlay: gzip + search-index progress (four steps) and optional Cover Start.
 */
export function Loading({
  className,
  label: labelProp,
  progress = null,
  gzipDone = false,
  indexStatus = 'pending',
  mode = 'loading',
  onStart,
}: LoadingProps) {
  const s = useStrings()
  const label = labelProp ?? s.loading.title
  const effectiveGzipDone = gzipDone || mode === 'await-start'
  const { percent, stageLabel } = computeLoadingDisplay(progress, indexStatus, effectiveGzipDone)
  const busy = mode === 'loading'
  const loadingVisible = mode === 'loading'

  return (
    <div
      role={mode === 'await-start' ? 'dialog' : 'status'}
      aria-busy={busy}
      aria-label={label}
      aria-labelledby={mode === 'await-start' ? 'cover-title' : undefined}
      className={cn(
        'fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden bg-[#f2f2f2] text-black',
        className,
      )}
    >
      {mode === 'await-start' ? (
        <h1 id="cover-title" className="sr-only">
          {s.cover.title}
        </h1>
      ) : null}

      <div
        aria-hidden
        className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 lowercase leading-none sm:left-12"
      >
        <p className="font-butler text-[80px] tracking-[-0.02em] sm:text-[120px] lg:text-[160px]">the</p>
        <p className="-mt-3 font-butler text-[80px] tracking-[-0.02em] sm:-mt-5 sm:text-[120px] lg:text-[160px]">
          movie
        </p>
        <p
          className={cn(
            '-mt-3 font-butler text-[80px] tracking-[-0.02em] transition-opacity duration-400 sm:-mt-5 sm:text-[120px] lg:text-[160px]',
            loadingVisible ? 'opacity-100 text-black' : 'opacity-[0.04] text-black',
          )}
        >
          cosmos
        </p>
      </div>

      <p
        aria-hidden
        className={cn(
          'pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 font-butler text-[80px] tracking-[-0.02em] lowercase transition-opacity duration-400 sm:right-12 sm:text-[120px] lg:text-[160px]',
          loadingVisible ? 'opacity-0' : 'opacity-100',
        )}
      >
        today
      </p>

      {loadingVisible ? (
        <p
          className="absolute bottom-10 right-8 text-[18px] font-normal text-black/50 sm:bottom-12 sm:right-12 sm:text-[20px]"
          aria-live="polite"
        >
          {percent}% {stageLabel}
        </p>
      ) : null}

      {mode === 'await-start' && onStart ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6">
          <button
            type="button"
            autoFocus
            aria-label={s.cover.startAriaLabel}
            onClick={onStart}
            className="rounded-md border border-black/50 bg-black px-8 py-3 text-base font-normal text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-black/60"
          >
            {s.cover.start}
          </button>
        </div>
      ) : null}
    </div>
  )
}
