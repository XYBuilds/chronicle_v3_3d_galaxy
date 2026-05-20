import { describe, expect, it } from 'vitest'

import en from '@/lib/locales/en.json'
import { LOCALE_IDS, LOCALES } from '@/lib/locales'
import { buildStrings } from '@/lib/strings'

describe('drawer.poster strings export (Phase 31)', () => {
  it('maps en.json poster namespace through buildStrings', () => {
    const str = buildStrings('en')
    expect(str.drawer.poster).toEqual(en.drawer.poster)
    expect(str.drawer.posterAlt('Inception')).toBe('Poster for Inception')
  })

  it.each(LOCALE_IDS)('%s exposes drawer.poster leaf keys', (localeId) => {
    const raw = LOCALES[localeId]
    expect(raw.drawer.poster).toBeDefined()
    expect(Object.keys(raw.drawer.poster).sort()).toEqual(
      Object.keys(en.drawer.poster).sort(),
    )
    const str = buildStrings(localeId)
    expect(str.drawer.poster.empty).toBeTruthy()
    expect(str.drawer.poster.retry).toBeTruthy()
  })
})
