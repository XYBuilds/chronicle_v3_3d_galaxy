import { Button } from '@/components/ui/button'
import { useStrings } from '@/lib/strings'
import { useLocaleStore } from '@/store/localeStore'
import { cn } from '@/lib/utils'

/** HUD 右上：界面语言 EN ↔ 中文（顺序在 Info 与 Fullscreen 之间）。 */
export function LanguageSwitch() {
  const s = useStrings()
  const locale = useLocaleStore((x) => x.locale)
  const setLocale = useLocaleStore((x) => x.setLocale)
  const next = locale === 'en' ? 'zh' : 'en'
  const label = locale === 'en' ? 'EN' : '中'

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      aria-label={s.hud.toggleLanguage}
      title={s.hud.toggleLanguage}
      className={cn(
        'h-10 min-w-10 shrink-0 border border-white/10 bg-black/45 px-2 text-xs font-semibold text-white/85 shadow-md backdrop-blur-sm',
        'pointer-events-auto motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-200',
        'hover:bg-black/55 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30',
      )}
      onClick={() => setLocale(next)}
    >
      {label}
    </Button>
  )
}
