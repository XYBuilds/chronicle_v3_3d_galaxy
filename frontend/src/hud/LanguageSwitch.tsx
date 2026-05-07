import { Languages } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { LOCALE_IDS, type LocaleId } from '@/lib/locales'
import { useStrings } from '@/lib/strings'
import { useLocaleStore } from '@/store/localeStore'
import { cn } from '@/lib/utils'

/** HUD 右上：语言下拉（Lucide `Languages`）；顺序在 Info 与 Fullscreen 之间。 */
export function LanguageSwitch() {
  const s = useStrings()
  const locale = useLocaleStore((x) => x.locale)
  const setLocale = useLocaleStore((x) => x.setLocale)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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

  const pick = (id: LocaleId) => {
    setLocale(id)
    setOpen(false)
  }

  const labels: Record<LocaleId, string> = {
    en: s.hud.languageEnglish,
    zh: s.hud.languageChinese,
    es: s.hud.languageSpanish,
  }

  return (
    <div ref={rootRef} className="relative shrink-0 pointer-events-auto">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={s.hud.toggleLanguage}
        title={s.hud.toggleLanguage}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'size-10 border border-white/10 bg-black/45 text-white/85 shadow-md backdrop-blur-sm',
          'motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-200',
          'hover:bg-black/55 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30',
          open && 'bg-black/55 ring-2 ring-white/25',
        )}
        onClick={() => setOpen((o) => !o)}
      >
        <Languages className="size-[1.15rem]" aria-hidden />
      </Button>

      {open ? (
        <ul
          role="menu"
          aria-orientation="vertical"
          className={cn(
            'absolute right-0 top-[calc(100%+0.25rem)] z-[60] min-w-[10rem] rounded-lg border border-white/10 bg-black/90 py-1 shadow-lg backdrop-blur-md',
          )}
        >
          {LOCALE_IDS.map((id) => (
            <li key={id} role="presentation">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={locale === id}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white/90',
                  'hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none',
                  locale === id && 'bg-white/15 font-medium text-white',
                )}
                onClick={() => pick(id)}
              >
                <span className="flex-1">{labels[id]}</span>
                {locale === id ? (
                  <span className="text-xs text-white/70" aria-hidden>
                    ✓
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
