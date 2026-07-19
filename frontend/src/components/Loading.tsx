import type { GalaxyGzipProgress } from '@/data/loadGalaxyGzip'
import { useStrings } from '@/lib/strings'
import { cn } from '@/lib/utils'

export type LoadingIndexStatus = 'pending' | 'loading' | 'ready' | 'skipped' | 'error'

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
}

function computeLoadingDisplay(
  progress: GalaxyGzipProgress | null,
  indexStatus: LoadingIndexStatus,
  gzipDone: boolean,
): { percent: number; stageKey: 'download' | 'decompress' | 'parse' | 'index' } {
  if (gzipDone) {
    const done = indexStatus === 'ready' || indexStatus === 'skipped' || indexStatus === 'error'
    return { percent: done ? 100 : 90, stageKey: 'index' }
  }

  if (!progress) return { percent: 0, stageKey: 'download' }

  if (progress.phase === 'download') {
    const ratio =
      progress.totalBytes !== null && progress.totalBytes > 0
        ? Math.min(1, progress.downloadedBytes / Math.max(1, progress.totalBytes))
        : progress.downloadedBytes > 0
          ? 0.02
          : 0
    const pct = Math.round(ratio * 70)
    /** Manifest / TCP stall before first byte: avoid an indefinite 0% bar. */
    const downloadPct = progress.downloadedBytes === 0 ? Math.max(pct, 3) : pct
    return { percent: downloadPct, stageKey: 'download' }
  }

  if (progress.phase === 'decompress') return { percent: 75, stageKey: 'decompress' }
  if (progress.phase === 'parse') return { percent: 85, stageKey: 'parse' }
  return { percent: 0, stageKey: 'download' }
}

/** Full-screen loading overlay: gzip + search-index progress (four steps). */
export function Loading({
  className,
  label: labelProp,
  progress = null,
  gzipDone = false,
  indexStatus = 'pending',
}: LoadingProps) {
  const s = useStrings()
  const label = labelProp ?? s.loading.title
  const { percent, stageKey } = computeLoadingDisplay(progress, indexStatus, gzipDone)
  const stageLabel =
    stageKey === 'download'
      ? s.loading.phaseDownload
      : stageKey === 'decompress'
        ? s.loading.phaseDecompress
        : stageKey === 'parse'
          ? s.loading.phaseParse
          : s.loading.phaseIndex
  const busy = true

  const brandTypeSizeClass = 'font-butler text-[120px] tracking-[-0.02em] sm:text-[180px] lg:text-[240px]'
  const brandLineHeightClass = 'leading-[0.6]'

  return (
    <div
      role="status"
      aria-busy={busy}
      aria-label={label}
      className={cn(
        'fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden bg-[color:var(--cosmos-universe-bg)]',
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 lowercase sm:left-12"
      >
        <p className={cn(brandTypeSizeClass, brandLineHeightClass, 'text-white/90')}>the</p>
        <p className={cn(brandTypeSizeClass, brandLineHeightClass, 'text-white/90')}>movie</p>
        <p className={cn(brandTypeSizeClass, brandLineHeightClass, 'text-white/90')}>cosmos</p>
      </div>

      <p
        className="absolute bottom-8 left-8 max-w-[min(100vw-4rem,28rem)] text-left text-[18px] font-normal text-white/55 sm:bottom-10 sm:left-12 sm:text-[20px]"
        aria-live="polite"
      >
        {percent}% {stageLabel}
      </p>
    </div>
  )
}