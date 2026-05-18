import { Coffee } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button-variants'
import { hudTopToolButtonChrome, type HudButtonStyleMode } from '@/hud/hudTopToolButtonChrome'
import { getKofiSupportUrl } from '@/lib/kofiSupport'
import { useStrings } from '@/lib/strings'
import { cn } from '@/lib/utils'

interface SupportButtonProps {
  styleMode?: HudButtonStyleMode
}

/** P28.1 — HUD 右上：打开 Ko-fi / 支持页（`VITE_KOFI_URL` 或内置默认页）。 */
export function SupportButton({ styleMode = 'default' }: SupportButtonProps) {
  const s = useStrings()
  const url = getKofiSupportUrl()

  if (!url) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        buttonVariants({ variant: 'secondary', size: 'sm' }),
        'h-10 min-h-10 shrink-0 gap-2 px-3 text-[0.8rem] whitespace-nowrap no-underline',
        hudTopToolButtonChrome(styleMode),
      )}
      aria-label={s.hud.openSupport}
      title={s.hud.openSupport}
    >
      <Coffee className="size-[1.15rem] shrink-0" aria-hidden />
      <span>{s.hud.openSupport}</span>
    </a>
  )
}
