import { useEffect, useState } from 'react'

import { useCoverModeStore } from '@/store/coverModeStore'
import { cn } from '@/lib/utils'

export interface CoverBackdropProps {
  /** P23.4 — SR / Tab: focus target over the perlin sphere (pointer-events none until :focus-visible). */
  todayFocusAriaLabel: string
  showTodayFocusTrap: boolean
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * P23.3 — Cover stage brand overlay (`the movie cosmos` / `today`), pointer-events none so canvas orbit works.
 * No click hint (see STRINGS.cover.todayHint — not rendered).
 * P23.4 — Invisible focusable control for Enter/Space (see global key handler in App).
 * P23.4b — 1000ms entry: the/movie color universe → brand-muted; cosmos `--cosmos-universe-bg` + opacity 100%→0; today opacity 0→100%.
 */
export function CoverBackdrop({ todayFocusAriaLabel, showTodayFocusTrap }: CoverBackdropProps) {
  const onActivateToday = () => {
    useCoverModeStore.getState().exitCoverIntoFocus()
  }
  const brandTypeSizeClass = 'font-butler text-[120px] tracking-[-0.02em] sm:text-[180px] lg:text-[240px]'
  const brandLineHeightClass = 'leading-[0.6]'

  const [entrySettled, setEntrySettled] = useState(() => prefersReducedMotion())

  useEffect(() => {
    if (prefersReducedMotion()) {
      setEntrySettled(true)
      return
    }
    setEntrySettled(false)
    const t = window.setTimeout(() => setEntrySettled(true), 1000)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    if (entrySettled) {
      console.log('[CoverBackdrop] P23.4b cover entry animation settled')
    }
  }, [entrySettled])

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 lowercase sm:left-12"
      >
        <p
          className={cn(
            brandTypeSizeClass,
            brandLineHeightClass,
            !entrySettled && 'cosmos-cover-entry-the-movie',
            entrySettled && 'text-[color:var(--cosmos-brand-muted)]',
          )}
        >
          the
        </p>
        <p
          className={cn(
            brandTypeSizeClass,
            brandLineHeightClass,
            !entrySettled && 'cosmos-cover-entry-the-movie',
            entrySettled && 'text-[color:var(--cosmos-brand-muted)]',
          )}
        >
          movie
        </p>
        <p
          className={cn(
            brandTypeSizeClass,
            brandLineHeightClass,
            !entrySettled && 'cosmos-cover-entry-cosmos-opacity',
            entrySettled && 'text-[color:var(--cosmos-universe-bg)] opacity-0',
          )}
        >
          cosmos
        </p>
      </div>

      <p
        aria-hidden
        className={cn(
          'pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 lowercase sm:right-12',
          brandTypeSizeClass,
          brandLineHeightClass,
          !entrySettled && 'cosmos-cover-entry-today-opacity',
          entrySettled && 'text-[color:var(--cosmos-brand-muted)] opacity-100',
        )}
      >
        today
      </p>

      {showTodayFocusTrap ? (
        <button
          type="button"
          className={cn(
            'pointer-events-none fixed left-1/2 top-1/2 z-[1] h-[min(42vw,320px)] w-[min(42vw,320px)] -translate-x-1/2 -translate-y-1/2 rounded-full border-0 bg-transparent p-0 opacity-0',
            'focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55',
          )}
          aria-label={todayFocusAriaLabel}
          onClick={onActivateToday}
        />
      ) : null}
    </>
  )
}