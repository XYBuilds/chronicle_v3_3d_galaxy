import ar from './ar.json'
import en from './en.json'
import es from './es.json'
import fr from './fr.json'
import ja from './ja.json'
import zh from './zh.json'
import zhHant from './zh-Hant.json'

export const LOCALES = {
  en,
  zh,
  es,
  ja,
  ar,
  fr,
  'zh-Hant': zhHant,
} as const

export type LocaleId = keyof typeof LOCALES

/** Stable menu order (native-language labels via {@link LOCALE_NATIVE_LABELS}). */
export const LOCALE_IDS: readonly LocaleId[] = [
  'en',
  'zh',
  'zh-Hant',
  'ja',
  'es',
  'fr',
  'ar',
] as const

export const DEFAULT_LOCALE: LocaleId = 'en'

/** Endonyms for the language picker — always shown in each language's native form (not UI locale). */
export const LOCALE_NATIVE_LABELS: Record<LocaleId, string> = {
  en: 'English',
  zh: '简体中文',
  es: 'Español',
  ja: '日本語',
  ar: 'العربية',
  fr: 'Français',
  'zh-Hant': '繁體中文',
}

/** Valid stored / URL `lang` token. */
export function isLocaleId(value: string | null | undefined): value is LocaleId {
  return value != null && value !== '' && (LOCALE_IDS as readonly string[]).includes(value)
}

/** BCP 47 `lang` for `<html lang>` (semantic script distinction for Chinese). */
export function localeToHtmlLang(locale: LocaleId): string {
  if (locale === 'zh') return 'zh-Hans'
  return locale
}
