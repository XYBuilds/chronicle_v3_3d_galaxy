import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link2, Mail } from 'lucide-react'

import {
  ShareIconDiscord,
  ShareIconFacebook,
  ShareIconReddit,
  ShareIconTelegram,
  ShareIconX,
} from '@/hud/sharePlatformIcons'
import { buildMovieSharePageUrl, buildSocialShareUrls } from '@/lib/shareLinks'
import { useStrings } from '@/lib/strings'

const iconActionClass =
  'flex size-9 shrink-0 items-center justify-center rounded-md text-foreground/90 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export interface DrawerMovieShareProps {
  movieId: number
  movieTitle: string
  releaseYear: string
}

/** P30.5 ? Drawer share row; deep link `/movie/:id` with platform intents. */
export function DrawerMovieShare({ movieId, movieTitle, releaseYear }: DrawerMovieShareProps) {
  const s = useStrings()
  const [linkCopied, setLinkCopied] = useState(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const shareTitle = s.drawer.share.title(movieTitle)
  const shareText = s.drawer.share.text(movieTitle, releaseYear)
  const url = useMemo(() => buildMovieSharePageUrl(movieId), [movieId])

  const socialUrls = useMemo(
    () => buildSocialShareUrls(shareTitle, shareText, url),
    [shareText, shareTitle, url],
  )

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

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
      console.error('[DrawerMovieShare] clipboard write failed', err)
    }
  }, [showLinkCopied, url])

  return (
    <section className="space-y-3" aria-labelledby="drawer-share-heading">
      <h3 id="drawer-share-heading" className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
        {s.drawer.sections.share}
      </h3>
      <div
        dir="ltr"
        role="group"
        aria-label={s.drawer.share.label}
        className="flex flex-row flex-wrap gap-1"
      >
        <button
          type="button"
          className={iconActionClass}
          aria-label={s.drawer.share.ariaCopyLink}
          title={s.drawer.share.ariaCopyLink}
          onClick={() => void onCopyLink()}
        >
          <Link2 className="size-[1.05rem]" strokeWidth={2} aria-hidden />
        </button>
        <a
          href={socialUrls.x}
          target="_blank"
          rel="noopener noreferrer"
          className={iconActionClass}
          aria-label={s.drawer.share.ariaX}
          title={s.drawer.share.ariaX}
        >
          <ShareIconX />
        </a>
        <a
          href={socialUrls.reddit}
          target="_blank"
          rel="noopener noreferrer"
          className={iconActionClass}
          aria-label={s.drawer.share.ariaReddit}
          title={s.drawer.share.ariaReddit}
        >
          <ShareIconReddit />
        </a>
        <a
          href={socialUrls.discord}
          target="_blank"
          rel="noopener noreferrer"
          className={iconActionClass}
          aria-label={s.drawer.share.ariaDiscord}
          title={s.drawer.share.ariaDiscord}
        >
          <ShareIconDiscord />
        </a>
        <a
          href={socialUrls.facebook}
          target="_blank"
          rel="noopener noreferrer"
          className={iconActionClass}
          aria-label={s.drawer.share.ariaFacebook}
          title={s.drawer.share.ariaFacebook}
        >
          <ShareIconFacebook />
        </a>
        <a
          href={socialUrls.email}
          className={iconActionClass}
          aria-label={s.drawer.share.ariaEmail}
          title={s.drawer.share.ariaEmail}
        >
          <Mail className="size-[1.05rem]" strokeWidth={2} aria-hidden />
        </a>
        <a
          href={socialUrls.telegram}
          target="_blank"
          rel="noopener noreferrer"
          className={iconActionClass}
          aria-label={s.drawer.share.ariaTelegram}
          title={s.drawer.share.ariaTelegram}
        >
          <ShareIconTelegram />
        </a>
      </div>
      {linkCopied ? (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {s.drawer.share.linkCopied}
        </p>
      ) : null}
    </section>
  )
}
