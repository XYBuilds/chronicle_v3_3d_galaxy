import { useCallback, useEffect, useState } from 'react'
import { Maximize, Minimize } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { STRINGS } from '@/lib/strings'
import { cn } from '@/lib/utils'

import {
  getGalaxyFullscreenElement,
  isGalaxyFullscreenAvailable,
  toggleGalaxyFullscreen,
} from '@/hud/fullscreenApi'

function syncFullscreenState(): boolean {
  return getGalaxyFullscreenElement() !== null
}

/** HUD 右上角全屏切换（位于 Info 左侧）；图标随 fullscreenchange / webkitfullscreenchange 同步。 */
export function FullscreenButton() {
  const [supported, setSupported] = useState(() =>
    typeof document !== 'undefined' ? isGalaxyFullscreenAvailable() : false,
  )
  const [isFullscreen, setIsFullscreen] = useState(syncFullscreenState)

  useEffect(() => {
    setSupported(isGalaxyFullscreenAvailable())
  }, [])

  useEffect(() => {
    const onChange = () => setIsFullscreen(syncFullscreenState())
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange as EventListener)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange as EventListener)
    }
  }, [])

  const onClick = useCallback(() => {
    void toggleGalaxyFullscreen().catch(() => {
      /* user gesture / policy — ignore */
    })
  }, [])

  if (!supported) return null

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      className={cn(
        'fixed z-40 size-10 border border-white/10 bg-black/45 text-white/85 shadow-md backdrop-blur-sm',
        'pointer-events-auto motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-200',
        'hover:bg-black/55 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30',
        'right-[3.75rem] top-3 sm:right-16 sm:top-4',
      )}
      aria-pressed={isFullscreen}
      aria-label={STRINGS.hud.toggleFullscreen}
      onClick={onClick}
    >
      {isFullscreen ? (
        <Minimize className="size-[1.15rem]" aria-hidden />
      ) : (
        <Maximize className="size-[1.15rem]" aria-hidden />
      )}
    </Button>
  )
}
