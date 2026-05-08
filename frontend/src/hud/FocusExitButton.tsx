import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import { useStrings } from '@/lib/strings'

/** P22.5 — Viewport bottom floating exit; visible whenever a film is in focus (not tied to drawer mount). */
export function FocusExitButton() {
  const selectedMovieId = useGalaxyInteractionStore((s) => s.selectedMovieId)
  const t = useStrings()

  if (selectedMovieId === null) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom,0px))] z-[60] flex justify-center">
      <button
        type="button"
        aria-label={t.hud.exitFocus}
        onClick={() => {
          console.log('[FocusExitButton] exit focus', { selectedMovieId })
          useGalaxyInteractionStore.setState({ selectedMovieId: null })
        }}
        className="pointer-events-auto rounded-full border border-border/80 bg-popover/90 px-5 py-2 text-sm font-medium text-foreground shadow-lg backdrop-blur-md hover:bg-popover focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {t.hud.exitFocus}
      </button>
    </div>
  )
}
