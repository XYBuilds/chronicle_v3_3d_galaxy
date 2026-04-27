import { useEffect } from 'react'

const THEME_PARAM = 'theme'

/**
 * P9.5: `?theme=light|dark` sets `document.documentElement.dataset.theme` for HUD tokens
 * and toggles `class="dark"` so Tailwind `dark:` matches. Default: `dark` + no `data-theme`.
 * Canvas stays black (`App.tsx`); only DOM / CSS variables change.
 */
export function useThemeFromQuery(): void {
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get(THEME_PARAM)
    const root = document.documentElement
    if (raw === 'light') {
      root.dataset.theme = 'light'
      root.classList.remove('dark')
      if (import.meta.env.DEV) {
        console.log('[useThemeFromQuery] applied', { theme: 'light' })
      }
      return
    }
    if (raw === 'dark') {
      root.dataset.theme = 'dark'
      root.classList.add('dark')
      if (import.meta.env.DEV) {
        console.log('[useThemeFromQuery] applied', { theme: 'dark' })
      }
      return
    }
    delete root.dataset.theme
    root.classList.add('dark')
  }, [])
}
