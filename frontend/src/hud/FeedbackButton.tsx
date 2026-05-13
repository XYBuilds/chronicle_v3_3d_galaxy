import { useEffect } from 'react'
import { MessageSquareText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ensureTallyEmbedScript, getTallyFeedbackFormId, refreshTallyEmbeds } from '@/lib/tallyFeedback'
import { useStrings } from '@/lib/strings'
import { cn } from '@/lib/utils'

type HudButtonStyleMode = 'default' | 'outline'

interface FeedbackButtonProps {
  styleMode?: HudButtonStyleMode
}

/** P28.2 — HUD 右上：打开 Tally 反馈弹层（`data-tally-open` + embed.js）。 */
export function FeedbackButton({ styleMode = 'default' }: FeedbackButtonProps) {
  const s = useStrings()
  const formId = getTallyFeedbackFormId()

  useEffect(() => {
    if (!formId) return
    let cancelled = false
    ensureTallyEmbedScript()
      .then(() => {
        if (cancelled) return
        refreshTallyEmbeds()
      })
      .catch((err) => {
        console.error(err)
      })
    return () => {
      cancelled = true
    }
  }, [formId])

  if (!formId) return null

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      className={cn(
        'size-10',
        styleMode === 'outline'
          ? 'border border-black/35 bg-transparent text-black/85 shadow-none'
          : 'border border-white/10 bg-black/45 text-white/85 shadow-md backdrop-blur-sm',
        'pointer-events-auto motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-200',
        styleMode === 'outline'
          ? 'hover:bg-black/5 hover:text-black focus-visible:ring-2 focus-visible:ring-black/30'
          : 'hover:bg-black/55 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30',
      )}
      aria-label={s.hud.openFeedback}
      data-tally-open={formId}
      data-tally-layout="modal"
      data-tally-width="640"
      data-tally-emoji-text="💭"
      data-tally-emoji-animation="tada"
    >
      <MessageSquareText className="size-[1.15rem]" aria-hidden />
      <span className="sr-only">{s.hud.openFeedback}</span>
    </Button>
  )
}
