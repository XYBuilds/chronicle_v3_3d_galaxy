import { create } from 'zustand'

import {
  DEFAULT_LOCALE,
  isLocaleId,
  localeToHtmlLang,
  type LocaleId,
} from '@/lib/locales'

const STORAGE_KEY = 'tmc.locale'

/** True when UI uses right-to-left document direction (Arabic). */
export function isLocaleRtl(locale: LocaleId): boolean {
  return locale === 'ar'
}

/** Sets `<html lang>` and `dir` for RTL (Arabic). */
export function syncHtmlLangDir(locale: LocaleId): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = localeToHtmlLang(locale)
  document.documentElement.dir = isLocaleRtl(locale) ? 'rtl' : 'ltr'
}

/** Query → localStorage → navigator.language → default (plan P21.2). */
export function resolveInitialLocale(): LocaleId {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  const params = new URLSearchParams(window.location.search)
  const q = params.get('lang')
  if (isLocaleId(q)) return q
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLocaleId(stored)) return stored
  } catch {
    /* private mode / quota */
  }
  const nav = navigator.language?.toLowerCase() ?? ''
  if (
    nav.startsWith('zh-tw') ||
    nav.startsWith('zh-hk') ||
    nav.startsWith('zh-mo') ||
    nav === 'zh-hant'
  ) {
    return 'zh-Hant'
  }
  if (nav.startsWith('zh')) return 'zh'
  if (nav.startsWith('ja')) return 'ja'
  if (nav.startsWith('es')) return 'es'
  if (nav.startsWith('fr')) return 'fr'
  if (nav.startsWith('ar')) return 'ar'
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
    syncHtmlLangDir(l)
    set({ locale: l })
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href)
      u.searchParams.set('lang', l)
      window.history.replaceState({}, '', u.toString())
    }
  },
}))

syncHtmlLangDir(useLocaleStore.getState().locale)
