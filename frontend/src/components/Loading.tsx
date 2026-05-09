import { useEffect, useRef, useState } from 'react'

import type { GalaxyGzipProgress } from '@/data/loadGalaxyGzip'
import { FullscreenButton } from '@/hud/FullscreenButton'
import { InfoButton } from '@/hud/InfoButton'
import { LanguageSwitch } from '@/hud/LanguageSwitch'
import { useStrings } from '@/lib/strings'
import { cn } from '@/lib/utils'

export type LoadingIndexStatus = 'pending' | 'loading' | 'ready' | 'skipped' | 'error'

export type LoadingMode = 'loading' | 'await-start'
type TransitionStage = 'loading' | 'cosmos-fade' | 'start-shown' | 'ready'

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
        : 0
    return { percent: Math.round(ratio * 70), stageKey: 'download' }
  }

  if (progress.phase === 'decompress') return { percent: 75, stageKey: 'decompress' }
  if (progress.phase === 'parse') return { percent: 85, stageKey: 'parse' }
  return { percent: 0, stageKey: 'download' }
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
  const { percent, stageKey } = computeLoadingDisplay(progress, indexStatus, effectiveGzipDone)
  const stageLabel =
    stageKey === 'download'
      ? s.loading.phaseDownload
      : stageKey === 'decompress'
        ? s.loading.phaseDecompress
        : stageKey === 'parse'
          ? s.loading.phaseParse
          : s.loading.phaseIndex
  const busy = mode === 'loading'
  const [transitionStage, setTransitionStage] = useState<TransitionStage>(
    mode === 'loading' ? 'loading' : 'ready',
  )
  const prevModeRef = useRef<LoadingMode>(mode)

  useEffect(() => {
    const prevMode = prevModeRef.current
    prevModeRef.current = mode

    if (mode === 'loading') {
      setTransitionStage('loading')
      return
    }

    if (prevMode === 'loading') {
      setTransitionStage('cosmos-fade')
      const timer1 = window.setTimeout(() => {
        setTransitionStage('start-shown')
      }, 500)
      const timer2 = window.setTimeout(() => {
        // Start appears first (no animation), then today fades in.
        setTransitionStage('ready')
      }, 516)
      return () => {
        window.clearTimeout(timer1)
        window.clearTimeout(timer2)
      }
    }

    setTransitionStage('ready')
  }, [mode])

  const loadingVisible = transitionStage === 'loading'
  const cosmosReady = transitionStage !== 'loading' && transitionStage !== 'cosmos-fade'
  const todayVisible = transitionStage === 'ready'
  const showStart = transitionStage === 'start-shown' || transitionStage === 'ready'
  const brandTypeSizeClass = 'font-butler text-[120px] tracking-[-0.02em] sm:text-[180px] lg:text-[240px]'
  const brandLineHeightClass = 'leading-[0.6]'

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
      {mode === 'await-start' ? (
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
        <p className={cn(brandTypeSizeClass, brandLineHeightClass)}>
          movie
        </p>
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
          todayVisible ? 'opacity-100' : 'opacity-0',
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

      {mode === 'await-start' && showStart && onStart ? (
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
