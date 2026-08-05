import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readExplorationContext } from '@/lib/exploration'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import type { Movie } from '@/types/galaxy'
import type { SearchIndex } from '@/types/searchIndex'
import { normalizeForSearch } from '@/utils/searchScore'

import {
  enterPersonSearchSession,
  lookupPersonKeyForRawName,
  sortIdsByRelease,
  tryEnterPersonSearchFromRawName,
} from '@/utils/personSearchSession'

function baseMovie(over: Partial<Movie> & Pick<Movie, 'id' | 'title'>): Movie {
  const { id, title, ...rest } = over
  return {
    x: 0,
    y: 0,
    z: 2000,
    size: 0.1,
    emissive: 0.5,
    genre_color: [0.2, 0.3, 0.4],
    title,
    original_title: '',
    overview: '',
    tagline: null,
    release_date: '2020-06-01',
    genres: ['Drama'],
    original_language: 'en',
    vote_count: 100,
    vote_average: 7,
    popularity: 1,
    imdb_rating: null,
    imdb_votes: null,
    runtime: null,
    revenue: 0,
    budget: 0,
    production_countries: [],
    production_companies: [],
    spoken_languages: [],
    cast: [],
    director: [],
    writers: [],
    producers: [],
    director_of_photography: [],
    music_composer: [],
    poster_url: '',
    id,
    imdb_id: null,
    ...rest,
  }
}

function resetExplorationStore(): void {
  useGalaxyInteractionStore.setState({
    explorationContext: { kind: 'idle' },
    searchQuery: '',
    searchResults: [],
  })
}

beforeEach(() => {
  resetExplorationStore()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  resetExplorationStore()
})

describe('sortIdsByRelease', () => {
  it('orders by release_date string', () => {
    const a = baseMovie({ id: 1, title: 'A', release_date: '2010-01-01', z: 2010 })
    const b = baseMovie({ id: 2, title: 'B', release_date: '2000-01-01', z: 2000 })
    const map = new Map<number, Movie>([
      [1, a],
      [2, b],
    ])
    expect(sortIdsByRelease([1, 2], map)).toEqual([2, 1])
  })
})

describe('lookupPersonKeyForRawName', () => {
  it('returns normalized key when present', () => {
    const key = normalizeForSearch('Jane Doe')
    const index: SearchIndex = {
      version: 't',
      people: {
        [key]: { full: 'Jane Doe', role_mask: 1, movie_ids: [1] },
      },
      genres: {},
    }
    expect(lookupPersonKeyForRawName(index, 'Jane Doe')).toBe(key)
  })

  it('returns null when absent', () => {
    const index: SearchIndex = { version: 't', people: {}, genres: {} }
    expect(lookupPersonKeyForRawName(index, 'Nobody Here')).toBeNull()
  })
})

describe('enterPersonSearchSession', () => {
  it('updates interaction store and calls z animator', () => {
    const setSpy = vi.spyOn(useGalaxyInteractionStore, 'setState')
    const zAnim = vi.fn()
    const key = normalizeForSearch('Pat Example')
    const index: SearchIndex = {
      version: 't',
      people: {
        [key]: { full: 'Pat Example', role_mask: 2, movie_ids: [10, 20], movie_roles: { '10': 2 } },
      },
      genres: {},
    }
    const m10 = baseMovie({ id: 10, title: 'Old', release_date: '1990-01-01', z: 1990.5 })
    const m20 = baseMovie({ id: 20, title: 'New', release_date: '2020-01-01', z: 2020.25 })
    const movieById = new Map<number, Movie>([
      [10, m10],
      [20, m20],
    ])

    const { applied, searchQuery } = enterPersonSearchSession({
      personKey: key,
      searchIndex: index,
      movieById,
      animateZCurrentTo: zAnim,
    })

    expect(applied).toBe(true)
    expect(searchQuery).toBe('Pat Example')
    expect(setSpy).toHaveBeenCalledWith({
      explorationContext: {
        kind: 'select',
        session: {
          relation: { kind: 'person', key },
          movieIds: [10, 20],
          metadata: {
            fullName: 'Pat Example',
            roleMask: 2,
            movieRoles: { '10': 2 },
          },
        },
      },
    })
    expect(zAnim).toHaveBeenCalledWith(1990.5, 700)
  })
})

describe('tryEnterPersonSearchFromRawName', () => {
  it('builds the complete Drawer person session, projects its UI query, and notifies lifecycle once', () => {
    const key = normalizeForSearch('Pat Example')
    const index: SearchIndex = {
      version: 't',
      people: {
        [key]: {
          full: 'Pat Example',
          role_mask: 3,
          movie_ids: [20, 10],
          movie_roles: { '10': 1, '20': 2 },
        },
      },
      genres: {},
    }
    const movieById = new Map<number, Movie>([
      [10, baseMovie({ id: 10, title: 'Old', release_date: '1990-01-01', z: 1990 })],
      [20, baseMovie({ id: 20, title: 'New', release_date: '2020-01-01', z: 2020 })],
    ])
    const lifecycleSnapshots: ReturnType<typeof readExplorationContext>[] = []
    const unsubscribe = useGalaxyInteractionStore.subscribe((state, previous) => {
      if (state.explorationContext !== previous.explorationContext) {
        lifecycleSnapshots.push(readExplorationContext())
      }
    })

    const applied = tryEnterPersonSearchFromRawName({
      rawName: ' Pat Example ',
      searchIndex: index,
      movieById,
    })
    unsubscribe()

    const expectedContext = {
      kind: 'select' as const,
      session: {
        relation: { kind: 'person' as const, key },
        movieIds: [10, 20],
        metadata: {
          fullName: 'Pat Example',
          roleMask: 3,
          movieRoles: { '10': 1, '20': 2 },
        },
      },
    }
    expect(applied).toBe(true)
    expect(readExplorationContext()).toEqual(expectedContext)
    expect(useGalaxyInteractionStore.getState().searchQuery).toBe('Pat Example')
    expect(lifecycleSnapshots).toEqual([expectedContext])
  })

  it('returns false without index', () => {
    const movieById = new Map<number, Movie>()
    expect(
      tryEnterPersonSearchFromRawName({
        rawName: 'X',
        searchIndex: null,
        movieById,
      }),
    ).toBe(false)
  })
})
