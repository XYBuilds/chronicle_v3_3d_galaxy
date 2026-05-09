import { cn } from '@/lib/utils'

/**
 * P23.3 — Cover stage brand overlay (`the movie cosmos` / `today`), pointer-events none so canvas orbit works.
 * No click hint (see STRINGS.cover.todayHint — not rendered).
 */
export function CoverBackdrop() {
  const brandTypeSizeClass = 'font-butler text-[120px] tracking-[-0.02em] sm:text-[180px] lg:text-[240px]'
  const brandLineHeightClass = 'leading-[0.6]'

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 lowercase text-white sm:left-12"
      >
        <p className={cn(brandTypeSizeClass, brandLineHeightClass)}>the</p>
        <p className={cn(brandTypeSizeClass, brandLineHeightClass)}>movie</p>
        <p className={cn(brandTypeSizeClass, brandLineHeightClass, 'opacity-[0.04]')}>cosmos</p>
      </div>

      <p
        aria-hidden
        className={cn(
          'pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 lowercase text-white opacity-100 sm:right-12',
          brandTypeSizeClass,
        )}
      >
        today
      </p>
    </>
  )
}
