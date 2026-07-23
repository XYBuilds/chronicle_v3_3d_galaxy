import { describe, expect, it } from 'vitest'

import { LOCALE_IDS, LOCALES } from '@/lib/locales'
import { buildStrings } from '@/lib/strings'

function interpolationVariables(template: string): string[] {
  return [...template.matchAll(/\{\{(\w+)\}\}/g)].map(([, variable]) => variable!).sort()
}

describe('TMDB ID search locale strings', () => {
  it.each(LOCALE_IDS)('%s supplies every ID-tab label and interpolates its candidate label', (locale) => {
    const searchBar = buildStrings(locale).searchBar

    expect(searchBar.tabId.trim()).not.toBe('')
    expect(searchBar.placeholderId.trim()).not.toBe('')
    expect(searchBar.idInvalid.trim()).not.toBe('')
    expect(searchBar.idNoResults.trim()).not.toBe('')
    expect(searchBar.tmdbIdTag).toBe('TMDB')
    expect(searchBar.idSuggestionAriaLabel('Spirited Away', 129)).toContain('Spirited Away')
    expect(searchBar.idSuggestionAriaLabel('Spirited Away', 129)).toContain('129')
  })

  it.each(LOCALE_IDS)('%s preserves en.json candidate interpolation variables', (locale) => {
    expect(interpolationVariables(LOCALES[locale].searchBar.idSuggestionAriaLabel)).toEqual(
      interpolationVariables(LOCALES.en.searchBar.idSuggestionAriaLabel),
    )
  })
})
