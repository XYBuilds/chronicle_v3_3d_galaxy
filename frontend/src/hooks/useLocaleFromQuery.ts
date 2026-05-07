import { useEffect } from 'react'

import { useLocaleStore } from '@/store/localeStore'

const LANG_PARAM = 'lang'

/**
 * P21.2: `?lang=en|zh` applies locale to HUD copy (mirrors {@link useThemeFromQuery}).
 * Precedence at boot is resolved in {@link resolveInitialLocale}; this effect re-syncs after mount.
 */
export function useLocaleFromQuery(): void {
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get(LANG_PARAM)
    if (raw === 'zh' || raw === 'en') {
      useLocaleStore.getState().setLocale(raw)
      if (import.meta.env.DEV) {
        console.log('[useLocaleFromQuery] applied', { lang: raw })
      }
    }
  }, [])
}
