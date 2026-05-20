import { describe, expect, it } from 'vitest'

import en from '@/lib/locales/en.json'
import { getSearchBarTextPlaceholder } from '@/components/searchBarPlaceholder'

const ui = en.searchBar

describe('getSearchBarTextPlaceholder', () => {
  it('uses disabled copy when search index is blocked', () => {
    expect(getSearchBarTextPlaceholder(true, 'movie', ui)).toBe(ui.placeholderDisabled)
    expect(getSearchBarTextPlaceholder(true, 'person', ui)).toBe(ui.placeholderDisabled)
  })

  it('uses movie and person placeholders per tab', () => {
    expect(getSearchBarTextPlaceholder(false, 'movie', ui)).toBe(ui.placeholderMovie)
    expect(getSearchBarTextPlaceholder(false, 'person', ui)).toBe(ui.placeholderPerson)
  })

  it('genre tab resolves to person placeholder (input hidden; chip UI uses genreMultiEmptyHint)', () => {
    expect(getSearchBarTextPlaceholder(false, 'genre', ui)).toBe(ui.placeholderPerson)
  })
})

describe('Phase 31 search placeholder copy (en SSOT)', () => {
  it('documents title and person search guidance', () => {
    expect(ui.placeholderMovie).toBe('Search English or original titles…')
    expect(ui.placeholderPerson).toBe('Search people by English name…')
    expect(ui.placeholderGenre).toBe('Drama / Comedy / Thriller …')
  })
})
