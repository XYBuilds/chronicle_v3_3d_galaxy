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

function gzipPhaseDone(
  progress: GalaxyGzipProgress | null | undefined,
  phase: GalaxyGzipProgress['phase'],
  gzipDone: boolean,
): boolean {
  if (gzipDone) return true
  if (!progress) return false
  const order: GalaxyGzipProgress['phase'][] = ['download', 'decompress', 'parse']
  return order.indexOf(progress.phase) > order.indexOf(phase)
}

function gzipPhaseActive(
  progress: GalaxyGzipProgress | null | undefined,
  phase: GalaxyGzipProgress['phase'],
  gzipDone: boolean,
): boolean {
  if (gzipDone) return false
  return progress?.phase === phase
}

function computeBarWidth(
  progress: GalaxyGzipProgress | null,
  indexStatus: LoadingIndexStatus,
  gzipDone: boolean,
): { widthPct: number; indeterminate: boolean } {
  if (gzipDone) {
    const terminal = indexStatus === 'ready' || indexStatus === 'skipped' || indexStatus === 'error'
    if (terminal) return { widthPct: 100, indeterminate: false }
    return { widthPct: 75, indeterminate: true }
  }
  if (!progress) return { widthPct: 0, indeterminate: false }
  const { phase, downloadedBytes, totalBytes } = progress
  if (phase === 'download') {
    const r =
      totalBytes !== null && totalBytes > 0 ? Math.min(1, downloadedBytes / Math.max(1, totalBytes)) : 0
    return { widthPct: 25 * r, indeterminate: false }
  }
  if (phase === 'decompress') return { widthPct: 50, indeterminate: false }
  if (phase === 'parse') return { widthPct: 75, indeterminate: false }
  return { widthPct: 75, indeterminate: false }
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
  const { widthPct, indeterminate } = computeBarWidth(progress, indexStatus, effectiveGzipDone)

  const showSteps =
    mode === 'await-start' || (mode === 'loading' && (progress !== null || gzipDone))
  const busy = mode === 'loading'

  const indexRowLabel = (() => {
    if (indexStatus === 'skipped') return s.loading.phaseIndexSkipped
    if (indexStatus === 'error') return s.loading.phaseIndexFailed
    return s.loading.phaseIndex
  })()

  const footerMessage = (() => {
    if (progress?.message) return progress.message
    if (effectiveGzipDone && indexStatus === 'loading') return s.searchBar.indexLoading
    return null
  })()

  const indexActive = indexStatus === 'loading'
  const indexDoneStyle = indexStatus === 'ready'
  const indexSkippedStyle = indexStatus === 'skipped'
  const indexErrorStyle = indexStatus === 'error'

  return (
    <div
      role={mode === 'await-start' ? 'dialog' : 'status'}
      aria-busy={busy}
      aria-label={label}
      aria-labelledby={mode === 'await-start' ? 'cover-title' : undefined}
      className={cn(
        'fixed inset-0 z-50 flex min-h-0 flex-col bg-background/80 text-foreground backdrop-blur-sm',
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6">
        {mode === 'await-start' ? (
          <h1 id="cover-title" className="sr-only">
            {s.cover.title}
          </h1>
        ) : null}

        {showSteps ? (
          <div className="flex w-full max-w-md flex-col gap-3">
            <ol className="flex justify-between gap-1 text-[11px] text-muted-foreground sm:gap-2 sm:text-xs">
              <li
                className={cn(
                  'flex-1 text-center',
                  gzipPhaseActive(progress, 'download', effectiveGzipDone) && 'font-medium text-foreground',
                  gzipPhaseDone(progress, 'download', effectiveGzipDone) && 'text-primary',
                )}
              >
                {s.loading.phaseDownload}
              </li>
              <li
                className={cn(
                  'flex-1 text-center',
                  gzipPhaseActive(progress, 'decompress', effectiveGzipDone) && 'font-medium text-foreground',
                  gzipPhaseDone(progress, 'decompress', effectiveGzipDone) && 'text-primary',
                )}
              >
                {s.loading.phaseDecompress}
              </li>
              <li
                className={cn(
                  'flex-1 text-center',
                  gzipPhaseActive(progress, 'parse', effectiveGzipDone) && 'font-medium text-foreground',
                  gzipPhaseDone(progress, 'parse', effectiveGzipDone) && 'text-primary',
                )}
              >
                {s.loading.phaseParse}
              </li>
              <li
                className={cn(
                  'flex-1 text-center',
                  indexActive && 'font-medium text-foreground',
                  indexDoneStyle && 'text-primary',
                  indexSkippedStyle && 'text-muted-foreground opacity-70',
                  indexErrorStyle && 'font-medium text-destructive',
                )}
              >
                {indexRowLabel}
              </li>
            </ol>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full bg-primary transition-[width] duration-150 ease-out',
                  indeterminate && 'animate-pulse',
                )}
                style={{ width: `${Math.round(widthPct)}%` }}
              />
            </div>
            {footerMessage ? (
              <p className="text-center text-xs text-muted-foreground">{footerMessage}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {mode === 'await-start' && onStart ? (
        <div className="flex shrink-0 justify-center px-6 pb-10 pt-4">
          <button
            type="button"
            autoFocus
            aria-label={s.cover.startAriaLabel}
            onClick={onStart}
            className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[--ui-edge-color-strong]"
          >
            {s.cover.start}
          </button>
        </div>
      ) : null}
    </div>
  )
}
