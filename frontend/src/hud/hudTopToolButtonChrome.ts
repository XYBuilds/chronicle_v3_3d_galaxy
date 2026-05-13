import { cn } from '@/lib/utils'

/** Loading / light 底图上复用的 HUD 右上工具钮外观（与 P14.2 玻璃边一致）。 */
export type HudButtonStyleMode = 'default' | 'outline'

/** 半透明玻璃钮 + outline 变体；hover / focus 与过渡写在一处，避免各组件复制长串 class。 */
export function hudTopToolButtonChrome(styleMode: HudButtonStyleMode): string {
  return cn(
    styleMode === 'outline'
      ? 'border border-black/35 bg-transparent text-black/85 shadow-none hover:bg-black/5 hover:text-black focus-visible:ring-2 focus-visible:ring-black/30'
      : 'border border-white/10 bg-black/45 text-white/85 shadow-md backdrop-blur-sm hover:bg-black/55 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30',
    'pointer-events-auto motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-200',
  )
}
