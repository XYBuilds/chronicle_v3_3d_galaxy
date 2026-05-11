import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import { useStrings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/**
 * P22.5 — Exit focus, anchored like {@link FocusLReference}: rating legend sits left of the on-screen
 * planet (`top-1/2` + horizontal offset); this control sits below the planet (`left-1/2` + downward offset).
 * P25.1 — Vertical offset 定稿：`50%+22rem`（`lg+` `24rem`），并受 safe-area / 短视口上限约束。
 */
export function FocusExitButton() {
  const selectedMovieId = useGalaxyInteractionStore((s) => s.selectedMovieId)
  const t = useStrings()

  if (selectedMovieId === null) return null

  return (
    <div
      className={cn(
        'pointer-events-none fixed left-1/2 z-[60] flex -translate-x-1/2 justify-center',
        /* Below viewport center (planet); cap so short viewports / home indicator don’t clip */
        'top-[min(calc(50%+22rem),calc(100dvh-max(1.5rem,env(safe-area-inset-bottom,0px))-4rem))] lg:top-[min(calc(50%+24rem),calc(100dvh-max(1.5rem,env(safe-area-inset-bottom,0px))-4rem))]',
      )}
    >
      <button
        type="button"
        aria-label={t.hud.exitFocus}
        onClick={() => {
          console.log('[FocusExitButton] exit focus', { selectedMovieId })
          useGalaxyInteractionStore.setState({ selectedMovieId: null })
        }}
        className={cn(
          'pointer-events-auto rounded-full border border-border/80 px-5 py-2 text-sm font-medium',
          /* idle — light：白字（压在星空画布上）；dark：沿用 foreground */
          'text-white dark:text-foreground',
          'transition-[background-color,box-shadow,backdrop-filter,color] duration-200 ease-out',
          /* idle — outline */
          'bg-transparent shadow-none backdrop-blur-none',
          /* active / hover / focus — 原实心 + 模糊；字色跟 popover */
          'hover:bg-popover/90 hover:text-popover-foreground hover:shadow-lg hover:backdrop-blur-md',
          'focus-visible:bg-popover/90 focus-visible:text-popover-foreground focus-visible:shadow-lg focus-visible:backdrop-blur-md focus-visible:ring-2 focus-visible:ring-ring/50',
          'active:bg-popover/90 active:text-popover-foreground active:shadow-lg active:backdrop-blur-md',
        )}
      >
        {t.hud.exitFocus}
      </button>
    </div>
  )
}
