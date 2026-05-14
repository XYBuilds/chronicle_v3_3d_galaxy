import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link2, Mail, Share2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { hudTopToolButtonChrome, type HudButtonStyleMode } from '@/hud/hudTopToolButtonChrome'
import {
  ShareIconDiscord,
  ShareIconFacebook,
  ShareIconReddit,
  ShareIconTelegram,
  ShareIconX,
} from '@/hud/sharePlatformIcons'
import { useStrings } from '@/lib/strings'
import { cn } from '@/lib/utils'

export interface ShareMovieTodayButtonProps {
  movieTitle: string
  releaseYear: string
  styleMode?: HudButtonStyleMode
}

function sharePageUrl(): string {
  return new URL('/', window.location.origin).href
}

/** P28.3: production invite via ``VITE_DISCORD_INVITE_URL``; generic fallback otherwise. */
function discordCommunityHref(): string {
  const raw = import.meta.env.VITE_DISCORD_INVITE_URL
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (t && /^https?:\/\//i.test(t)) return t
  return 'https://discord.com/'
}

const iconMenuItemClass =
  'flex size-9 shrink-0 items-center justify-center rounded-md text-white/90 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35'

/** P27.1 — HUD 右上：下拉仅图标 — 链接、X、Reddit、Discord、Facebook、Mail、Telegram。 */
export function ShareMovieTodayButton({
  movieTitle,
  releaseYear,
  styleMode = 'default',
}: ShareMovieTodayButtonProps) {
  const s = useStrings()
  const [open, setOpen] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const shareTitle = s.hud.shareTheMovieTodayTitle(movieTitle)
  const shareText = s.hud.shareTheMovieTodayText(movieTitle, releaseYear)
  const url = useMemo(() => sharePageUrl(), [])

  const socialUrls = useMemo(() => {
    const body = `${shareText}\n\n${url}`
    return {
      x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(body)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`,
      reddit: `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(shareTitle)}`,
      discord: discordCommunityHref(),
      email: `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(body)}`,
    }
  }, [shareText, shareTitle, url])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current
      if (el && !el.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      e.stopPropagation()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  const showLinkCopied = useCallback(() => {
    setLinkCopied(true)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setLinkCopied(false)
      toastTimerRef.current = null
    }, 2500)
  }, [])

  const onCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url)
      showLinkCopied()
    } catch (err) {
      console.error('[ShareMovieToday] clipboard write failed', err)
    }
  }, [showLinkCopied, url])

  return (
    <>
      <div ref={rootRef} className="relative shrink-0 pointer-events-auto">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={s.hud.shareTheMovieToday}
          title={s.hud.shareTheMovieToday}
          aria-expanded={open}
          aria-haspopup="menu"
          className={cn(
            'size-10',
            hudTopToolButtonChrome(styleMode),
            open &&
              (styleMode === 'outline' ? 'bg-black/10 ring-2 ring-black/20' : 'bg-black/55 ring-2 ring-white/25'),
          )}
          onClick={() => setOpen((o) => !o)}
        >
          <Share2 className="size-[1.15rem]" aria-hidden />
        </Button>

        {open ? (
          <div
            dir="ltr"
            role="menu"
            aria-orientation="horizontal"
            className={cn(
              'absolute right-0 top-[calc(100%+0.25rem)] z-[var(--z-hud-lang-menu)] flex w-max max-w-[min(32rem,calc(100vw-2rem))] flex-row flex-nowrap gap-0.5 rounded-lg border border-white/10 bg-black/90 p-1.5 shadow-lg backdrop-blur-md',
            )}
          >
            <button
              type="button"
              role="menuitem"
              className={iconMenuItemClass}
              aria-label={s.hud.shareTheMovieTodayAriaCopyLink}
              title={s.hud.shareTheMovieTodayAriaCopyLink}
              onClick={() => void onCopyLink()}
            >
              <Link2 className="size-[1.05rem]" strokeWidth={2} aria-hidden />
            </button>
            <a
              role="menuitem"
              href={socialUrls.x}
              target="_blank"
              rel="noopener noreferrer"
              className={iconMenuItemClass}
              aria-label={s.hud.shareTheMovieTodayAriaX}
              title={s.hud.shareTheMovieTodayAriaX}
              onClick={() => setOpen(false)}
            >
              <ShareIconX />
            </a>
            <a
              role="menuitem"
              href={socialUrls.reddit}
              target="_blank"
              rel="noopener noreferrer"
              className={iconMenuItemClass}
              aria-label={s.hud.shareTheMovieTodayAriaReddit}
              title={s.hud.shareTheMovieTodayAriaReddit}
              onClick={() => setOpen(false)}
            >
              <ShareIconReddit />
            </a>
            <a
              role="menuitem"
              href={socialUrls.discord}
              target="_blank"
              rel="noopener noreferrer"
              className={iconMenuItemClass}
              aria-label={s.hud.shareTheMovieTodayAriaDiscord}
              title={s.hud.shareTheMovieTodayAriaDiscord}
              onClick={() => setOpen(false)}
            >
              <ShareIconDiscord />
            </a>
            <a
              role="menuitem"
              href={socialUrls.facebook}
              target="_blank"
              rel="noopener noreferrer"
              className={iconMenuItemClass}
              aria-label={s.hud.shareTheMovieTodayAriaFacebook}
              title={s.hud.shareTheMovieTodayAriaFacebook}
              onClick={() => setOpen(false)}
            >
              <ShareIconFacebook />
            </a>
            <a
              role="menuitem"
              href={socialUrls.email}
              className={iconMenuItemClass}
              aria-label={s.hud.shareTheMovieTodayAriaEmail}
              title={s.hud.shareTheMovieTodayAriaEmail}
              onClick={() => setOpen(false)}
            >
              <Mail className="size-[1.05rem]" strokeWidth={2} aria-hidden />
            </a>
            <a
              role="menuitem"
              href={socialUrls.telegram}
              target="_blank"
              rel="noopener noreferrer"
              className={iconMenuItemClass}
              aria-label={s.hud.shareTheMovieTodayAriaTelegram}
              title={s.hud.shareTheMovieTodayAriaTelegram}
              onClick={() => setOpen(false)}
            >
              <ShareIconTelegram />
            </a>
          </div>
        ) : null}
      </div>
      {linkCopied ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'pointer-events-none fixed left-1/2 top-[max(5rem,env(safe-area-inset-top,0px)+3rem)] z-[200] max-w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md border px-4 py-2 text-center text-sm shadow-lg',
            styleMode === 'outline'
              ? 'border-black/25 bg-white/95 text-black'
              : 'border-white/15 bg-black/80 text-white backdrop-blur-sm',
          )}
        >
          {s.hud.shareTheMovieTodayLinkCopied}
        </div>
      ) : null}
    </>
  )
}
