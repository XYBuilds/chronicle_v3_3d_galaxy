import { HUD_GALAXY_GLASS_SURFACE_CLASSNAME } from '@/hud/hudTopToolButtonChrome'
import {
  exitFocus,
  selectFocusMovieId,
  useExplorationSelector,
} from '@/lib/exploration'
import { useStrings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/**
 * P22.5 — Exit focus sits below the on-screen planet (`left-1/2` + downward offset).
 * P25.1 — Vertical offset 定稿：`50%+22rem`（`lg+` `24rem`），并受 safe-area / 短视口上限约束。
 */
export function FocusExitButton() {
  const focusMovieId = useExplorationSelector(selectFocusMovieId)
  const t = useStrings()

  if (focusMovieId === null) return null

  return (
    <div
      className={cn(
        'pointer-events-none fixed left-1/2 z-[var(--z-hud-focus-exit)] flex -translate-x-1/2 justify-center',
        /* Below viewport center (planet); cap so short viewports / home indicator don’t clip */
        'top-[min(calc(50%+var(--hud-focus-exit-below-center)),calc(100dvh-max(var(--hud-inset-md),env(safe-area-inset-bottom,0px))-var(--hud-focus-exit-viewport-pad)))] lg:top-[min(calc(50%+var(--hud-focus-exit-below-center-lg)),calc(100dvh-max(var(--hud-inset-md),env(safe-area-inset-bottom,0px))-var(--hud-focus-exit-viewport-pad)))]',
      )}
    >
      <button
        type="button"
        aria-label={t.hud.exitFocus}
        onClick={() => {
          console.log('[FocusExitButton] exit focus', { focusMovieId })
          exitFocus()
        }}
        className={cn(
          'pointer-events-auto rounded-full px-5 py-2 text-sm font-medium',
          /* idle — 与右上工具钮同款玻璃底；light 白字压在星空上，dark 沿用 foreground */
          HUD_GALAXY_GLASS_SURFACE_CLASSNAME,
          'text-white dark:text-foreground',
          'transition-[background-color,box-shadow,backdrop-filter,border-color,color] duration-200 ease-out',
          /* hover / focus / active — popover 实心；描边回到 theme border */
          'hover:border-border/80 hover:bg-popover/90 hover:text-popover-foreground hover:shadow-lg hover:backdrop-blur-md',
          'focus-visible:border-border/80 focus-visible:bg-popover/90 focus-visible:text-popover-foreground focus-visible:shadow-lg focus-visible:backdrop-blur-md focus-visible:ring-2 focus-visible:ring-ring/50',
          'active:border-border/80 active:bg-popover/90 active:text-popover-foreground active:shadow-lg active:backdrop-blur-md',
        )}
      >
        {t.hud.exitFocus}
      </button>
    </div>
  )
}
