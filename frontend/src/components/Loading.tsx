import { useEffect, useState } from 'react'

import type { GalaxyGzipProgress } from '@/data/loadGalaxyGzip'
import { FullscreenButton } from '@/hud/FullscreenButton'
import { InfoButton } from '@/hud/InfoButton'
import { LanguageSwitch } from '@/hud/LanguageSwitch'
import { useStrings } from '@/lib/strings'
import { cn } from '@/lib/utils'

export type LoadingIndexStatus = 'pending' | 'loading' | 'ready' | 'skipped' | 'error'

type TransitionStage = 'loading' | 'cosmos-fade' | 'brand-ready'

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

/**
 * Full-screen loading overlay: gzip + search-index progress (four steps).
 * P23.3 — Cover brand + Start CTA removed; see {@link CoverBackdrop}.
 */
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
  const [transitionStage, setTransitionStage] = useState<TransitionStage>('loading')

  useEffect(() => {
    if (!gzipDone) {
      setTransitionStage('loading')
      return
    }
    const indexTerminal =
      indexStatus === 'ready' || indexStatus === 'skipped' || indexStatus === 'error'
    if (!indexTerminal) {
      setTransitionStage('loading')
      return
    }
    setTransitionStage('cosmos-fade')
    const t = window.setTimeout(() => setTransitionStage('brand-ready'), 500)
    return () => window.clearTimeout(t)
  }, [gzipDone, indexStatus])

  const loadingVisible = transitionStage === 'loading'
  const cosmosReady = transitionStage !== 'loading' && transitionStage !== 'cosmos-fade'
  const brandTypeSizeClass = 'font-butler text-[120px] tracking-[-0.02em] sm:text-[180px] lg:text-[240px]'
  const brandLineHeightClass = 'leading-[0.6]'

  useEffect(() => {
    if (transitionStage !== 'brand-ready') return
    console.log('[Loading] brand-ready (hud chrome visible)')
  }, [transitionStage])

  return (
    <div
      role="status"
      aria-busy={busy}
      aria-label={label}
      className={cn(
        'fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden bg-[#f2f2f2] text-black',
        className,
      )}
    >
      {transitionStage === 'brand-ready' ? (
        <div className="pointer-events-none fixed right-3 top-3 z-40 flex items-center gap-2 sm:right-4 sm:top-4">
          <InfoButton styleMode="outline" />
          <LanguageSwitch styleMode="outline" />
          <FullscreenButton styleMode="outline" />
        </div>
      ) : null}

      <div
        aria-hidden
        className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 lowercase sm:left-12"
      >
        <p className={cn(brandTypeSizeClass, brandLineHeightClass)}>the</p>
        <p className={cn(brandTypeSizeClass, brandLineHeightClass)}>movie</p>
        <p
          className={cn(
            brandTypeSizeClass,
            brandLineHeightClass,
            'transition-opacity duration-500',
            cosmosReady ? 'opacity-[0.04] text-black' : 'opacity-100 text-black',
          )}
        >
          cosmos
        </p>
      </div>

      <p
        aria-hidden
        className={cn(
          'pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 lowercase transition-opacity duration-500 sm:right-12',
          brandTypeSizeClass,
          cosmosReady ? 'opacity-100' : 'opacity-0',
        )}
      >
        today
      </p>

      {loadingVisible ? (
        <p
          className="absolute right-8 top-1/2 -translate-y-1/2 text-[18px] font-normal text-black/50 sm:right-12 sm:text-[20px]"
          aria-live="polite"
        >
          {percent}% {stageLabel}
        </p>
      ) : null}
    </div>
  )
}
