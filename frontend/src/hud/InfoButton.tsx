import { useState } from 'react'
import { Info } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { InfoSheet } from '@/hud/InfoSheet'
import { cn } from '@/lib/utils'

/**
 * 右上角 INFO 入口：仅打开占位侧栏，不承载正式对外文案。
 */
export function InfoButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className={cn(
          'fixed z-40 size-10 border border-white/10 bg-black/45 text-white/85 shadow-md backdrop-blur-sm',
          'pointer-events-auto motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-200',
          'hover:bg-black/55 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30',
          'right-3 top-3 sm:right-4 sm:top-4',
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="app-info-sheet"
        onClick={() => setOpen(true)}
      >
        <Info className="size-[1.15rem]" aria-hidden />
        <span className="sr-only">打开关于本体验的说明（占位内容）</span>
      </Button>
      <InfoSheet open={open} onOpenChange={setOpen} />
    </>
  )
}
