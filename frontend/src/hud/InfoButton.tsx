import { useState } from 'react'
import { Info } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useStrings } from '@/lib/strings'
import { InfoModal } from '@/hud/InfoModal'
import { cn } from '@/lib/utils'

type HudButtonStyleMode = 'default' | 'outline'

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
