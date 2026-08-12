import { useLayoutEffect, type ReactNode } from 'react'

import { FeedbackButton } from '@/hud/FeedbackButton'
import { FullscreenButton } from '@/hud/FullscreenButton'
import { InfoButton } from '@/hud/InfoButton'
import { LanguageSwitch } from '@/hud/LanguageSwitch'
import { SupportButton } from '@/hud/SupportButton'
import { TmdbAttribution } from '@/hud/TmdbAttribution'
import type { LocaleId } from '@/lib/locales'
import { cn } from '@/lib/utils'
import { applyHudLocale, resetHudStoryStores } from '@/storybook/hudStoryState'

const HUD_CANVAS_CLASSNAME =
  'relative isolate min-h-dvh w-full overflow-hidden bg-[color:var(--cosmos-universe-bg)] text-foreground'

export function HudCanvas({
  children,
  className,
  locale = 'en',
  prepare,
}: {
  children: ReactNode
  className?: string
  locale?: LocaleId
  prepare?: () => void
}): React.JSX.Element {
  useLayoutEffect(() => {
    resetHudStoryStores()
    prepare?.()
    applyHudLocale(locale)
  }, [locale, prepare])
  return <div className={cn(HUD_CANVAS_CLASSNAME, className)}>{children}</div>
}

/** Live top-tools order from App: Feedback → Support → Info → Lang → Fullscreen. */
export function HudTopToolsCluster(): React.JSX.Element {
  return (
    <div
      dir="ltr"
      className="pointer-events-none fixed z-[var(--z-hud-top-tools)] flex items-center gap-[var(--hud-gap-stack)] right-[max(var(--hud-inset-sm),env(safe-area-inset-right,0px))] top-[max(var(--hud-inset-sm),env(safe-area-inset-top,0px))] sm:right-[max(var(--hud-inset-md),env(safe-area-inset-right,0px))] sm:top-[max(var(--hud-inset-md),env(safe-area-inset-top,0px))]"
    >
      <FeedbackButton />
      <SupportButton />
      <InfoButton />
      <LanguageSwitch />
      <FullscreenButton />
    </div>
  )
}

export function HudAttributionFooter(): React.JSX.Element {
  return (
    <TmdbAttribution className="pointer-events-none fixed z-[var(--z-hud-attribution)] bottom-[max(var(--hud-inset-sm),env(safe-area-inset-bottom,0px))] right-[max(var(--hud-inset-sm),env(safe-area-inset-right,0px))] sm:bottom-[max(var(--hud-inset-md),env(safe-area-inset-bottom,0px))] sm:right-[max(var(--hud-inset-md),env(safe-area-inset-right,0px))] [&_a]:pointer-events-auto" />
  )
}
