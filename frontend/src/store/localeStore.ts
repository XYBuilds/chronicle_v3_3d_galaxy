import { create } from 'zustand'

import { DEFAULT_LOCALE, type LocaleId } from '@/lib/locales'

const STORAGE_KEY = 'tmc.locale'

/** Query → localStorage → navigator.language → default (plan P21.2). */
export function resolveInitialLocale(): LocaleId {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  const params = new URLSearchParams(window.location.search)
  const q = params.get('lang')
  if (q === 'zh' || q === 'en') return q
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'zh' || stored === 'en') return stored
  } catch {
    /* private mode / quota */
  }
  const nav = navigator.language?.toLowerCase() ?? ''
  if (nav.startsWith('zh')) return 'zh'
  return DEFAULT_LOCALE
}

interface LocaleState {
  locale: LocaleId
  setLocale: (l: LocaleId) => void
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: resolveInitialLocale(),
  setLocale: (l) => {
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* ignore */
    }
    set({ locale: l })
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href)
      u.searchParams.set('lang', l)
      window.history.replaceState({}, '', u.toString())
    }
  },
}))
