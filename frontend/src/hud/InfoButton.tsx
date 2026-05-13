import { useState } from 'react'
import { Info } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { hudTopToolButtonChrome, type HudButtonStyleMode } from '@/hud/hudTopToolButtonChrome'
import { useStrings } from '@/lib/strings'
import { InfoModal } from '@/hud/InfoModal'
import { cn } from '@/lib/utils'

interface InfoButtonProps {
  styleMode?: HudButtonStyleMode
}

/** 右上角 INFO 入口（与 Lang / Fullscreen 同组）：打开居中占位 Modal。 */
export function InfoButton({ styleMode = 'default' }: InfoButtonProps) {
  const [open, setOpen] = useState(false)
  const s = useStrings()

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className={cn('size-10', hudTopToolButtonChrome(styleMode))}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="app-info-dialog"
        onClick={() => setOpen(true)}
      >
        <Info className="size-[1.15rem]" aria-hidden />
        <span className="sr-only">{s.hud.openInfo}</span>
      </Button>
      <InfoModal open={open} onOpenChange={setOpen} />
    </>
  )
}
