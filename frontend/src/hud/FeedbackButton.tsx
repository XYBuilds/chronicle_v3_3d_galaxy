import { useEffect } from 'react'
import { MessageSquareText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { hudTopToolButtonChrome, type HudButtonStyleMode } from '@/hud/hudTopToolButtonChrome'
import { ensureTallyEmbedScript, getTallyFeedbackFormId, refreshTallyEmbeds } from '@/lib/tallyFeedback'
import { useStrings } from '@/lib/strings'
import { cn } from '@/lib/utils'

interface FeedbackButtonProps {
  styleMode?: HudButtonStyleMode
}

/** P28.2 — HUD 右上工具条最左：打开 Tally 反馈弹层（图标 + 文案，`data-tally-open` + embed.js）。 */
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
      size="sm"
      className={cn(
        'h-10 min-h-10 shrink-0 gap-2 px-3 text-[0.8rem] whitespace-nowrap',
        hudTopToolButtonChrome(styleMode),
      )}
      aria-label={s.hud.openFeedback}
      title={s.hud.openFeedback}
      data-tally-open={formId}
      data-tally-layout="modal"
      data-tally-width="640"
      data-tally-emoji-text="💭"
      data-tally-emoji-animation="head-shake"
      data-tally-auto-close="3000"
    >
      <MessageSquareText className="size-[1.15rem] shrink-0" aria-hidden />
      <span>{s.hud.openFeedback}</span>
    </Button>
  )
}
