import en from './en.json'
import zh from './zh.json'

export const LOCALES = { en, zh } as const
export type LocaleId = keyof typeof LOCALES
export const LOCALE_IDS: readonly LocaleId[] = ['en', 'zh'] as const
export const DEFAULT_LOCALE: LocaleId = 'en'
