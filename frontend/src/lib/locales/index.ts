import en from './en.json'
import es from './es.json'
import zh from './zh.json'

export const LOCALES = { en, zh, es } as const
export type LocaleId = keyof typeof LOCALES
export const LOCALE_IDS: readonly LocaleId[] = ['en', 'zh', 'es'] as const
export const DEFAULT_LOCALE: LocaleId = 'en'

/** Endonyms for the language picker — always shown in each language's native form (not UI locale). */
export const LOCALE_NATIVE_LABELS: Record<LocaleId, string> = {
  en: 'English',
  zh: '中文',
  es: 'Español',
}

/** Valid stored / URL `lang` token. */
export function isLocaleId(value: string | null | undefined): value is LocaleId {
  return value != null && value !== '' && (LOCALE_IDS as readonly string[]).includes(value)
}
