import { describe, expect, it } from 'vitest'

import type { GalaxyData } from '@/types/galaxy'
import { galaxyMinimalFixture } from '@/types/galaxyMinimalFixture'
import type { SearchIndex } from '@/types/searchIndex'
import { parseGalaxyJsonPayload } from '@/utils/loadGalaxyData'

import { parseAndValidateSearchIndex } from './validateSearchIndex'

const searchFixture: SearchIndex = {
  version: 'fixture',
  people: {
    'ada lovelace': { full: 'Ada Lovelace', role_mask: 1, movie_ids: [1, 42] },
    'christopher nolan': { full: 'Christopher Nolan', role_mask: 3, movie_ids: [7] },
  },
  genres: {
    Drama: { count: 1, movie_ids: [1] },
  },
}

describe('parseAndValidateSearchIndex (P12.1)', () => {
  it('accepts people + genres with role_mask in [0, 63] and genre count === len(movie_ids)', () => {
    const data = parseAndValidateSearchIndex(searchFixture, ['Drama'])
    expect(data.people['christopher nolan']!.role_mask).toBe(3)
    expect(data.genres.Drama!.count).toBe(1)
  })

  it('rejects role_mask > 63', () => {
    const bad: unknown = {
      version: 'v',
      people: { x: { full: 'X', role_mask: 64, movie_ids: [1] } },
      genres: { Drama: { count: 1, movie_ids: [1] } },
    }
    expect(() => parseAndValidateSearchIndex(bad, ['Drama'])).toThrow(/63/)
  })

  it('rejects genre count < 1 or empty movie_ids', () => {
    const bad: unknown = {
      version: 'v',
      people: {},
      genres: { Drama: { count: 0, movie_ids: [] } },
    }
    expect(() => parseAndValidateSearchIndex(bad, ['Drama'])).toThrow(/count/)
  })

  it('rejects when genre keys do not match palette', () => {
    expect(() => parseAndValidateSearchIndex(searchFixture, ['Drama', 'Action'])).toThrow(/genres keys/)
  })

  it('skips palette strict check when genrePaletteKeys is null', () => {
    const data = parseAndValidateSearchIndex(searchFixture, null)
    expect(Object.keys(data.genres)).toEqual(['Drama'])
  })
})

describe('parseGalaxyJsonPayload + has_search_index (P12.1)', () => {
  it('requires title_normalized when meta.has_search_index is true', () => {
    const bad = JSON.parse(JSON.stringify(galaxyMinimalFixture)) as GalaxyData
    bad.meta.has_search_index = true
    delete (bad.movies[0] as { title_normalized?: string }).title_normalized
    expect(() => parseGalaxyJsonPayload(bad)).toThrow(/title_normalized/)
  })

  it('accepts has_search_index with non-empty title_normalized', () => {
    const ok = JSON.parse(JSON.stringify(galaxyMinimalFixture)) as GalaxyData
    ok.meta.has_search_index = true
    ok.movies[0].title_normalized = 'fixture'
    const data = parseGalaxyJsonPayload(ok)
    expect(data.meta.has_search_index).toBe(true)
    expect(data.movies[0]!.title_normalized).toBe('fixture')
  })
})
