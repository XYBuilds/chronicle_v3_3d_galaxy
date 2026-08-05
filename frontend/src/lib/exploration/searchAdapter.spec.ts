import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  beginFocusEchoQueryEdit,
  clearFocusEchoInput,
  INITIAL_FOCUS_ECHO_INPUT_STATE,
} from '@/components/focusEchoInputState'
import {
  beginIdTabQueryEdit,
  clearIdTabInput,
  INITIAL_ID_TAB_INPUT_STATE,
} from '@/components/idTabInputState'
import {
  alignSearchTabToActiveSelect,
  applySearchExplicitClear,
  applySearchTabChangeClear,
  clearActiveSelectSession,
  dispatchExplorationIntent,
  enterGenreSelectSession,
  hasActiveSelectRelation,
  readExplorationContext,
  requestReplacingMovieFocus,
  subscribeExplorationContext,
} from '@/lib/exploration'
import {
  setSearchQuery,
  useGalaxyInteractionStore,
} from '@/store/galaxyInteractionStore'
import type { SearchIndex } from '@/types/searchIndex'

import { resetExplorationContext } from './testHelpers'

const genreIndex: SearchIndex = {
  version: 'test',
  people: {},
  genres: {
    Drama: { count: 2, movie_ids: [10, 20] },
    History: { count: 1, movie_ids: [20] },
    Comedy: { count: 1, movie_ids: [10] },
  },
}

function resetStore(): void {
  resetExplorationContext()
  useGalaxyInteractionStore.setState({
    searchQuery: '',
    searchResults: [],
  })
}

describe('search exploration adapter', () => {
  beforeEach(() => {
    resetStore()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  it.each([
    ['movie', 'person', 'person'],
    ['genre', 'person', 'person'],
    ['movie', 'genre', 'genre'],
    ['id', null, 'id'],
  ] as const)(
    'aligns local %s tab to active %s Select relation as %s',
    (currentTab, activeRelation, expectedTab) => {
      expect(alignSearchTabToActiveSelect(currentTab, activeRelation)).toBe(expectedTab)
    },
  )

  it('enters a genre session once and atomically replaces it when conditions change', () => {
    const first = enterGenreSelectSession({
      genreNames: ['Drama'],
      searchIndex: genreIndex,
      movieById: new Map(),
    })
    expect(first?.session).toEqual({
      relation: { kind: 'genre', key: 'genre:drama' },
      movieIds: [10, 20],
      conditions: { operator: 'and', genres: ['Drama'] },
    })

    dispatchExplorationIntent({
      type: 'focus/requested',
      movieId: 10,
      policy: 'preserve-if-member',
    })
    const snapshots: ReturnType<typeof readExplorationContext>[] = []
    const unsubscribe = subscribeExplorationContext((context) => {
      snapshots.push(context)
    })

    const replacement = enterGenreSelectSession({
      genreNames: ['Drama', 'History'],
      searchIndex: genreIndex,
      movieById: new Map(),
    })
    unsubscribe()

    expect(replacement?.searchQuery).toBe('Drama + History')
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toEqual({
      kind: 'select',
      session: {
        relation: { kind: 'genre', key: 'genre:drama+history' },
        movieIds: [20],
        conditions: { operator: 'and', genres: ['Drama', 'History'] },
      },
    })
  })

  it.each([
    ['person', {
      relation: { kind: 'person' as const, key: 'pat-example' },
      movieIds: [10],
      metadata: { fullName: 'Pat Example', roleMask: 1 },
    }],
    ['genre', {
      relation: { kind: 'genre' as const, key: 'genre:drama' },
      movieIds: [10],
      conditions: { operator: 'and' as const, genres: ['Drama'] },
    }],
  ] as const)('clears active %s parent session, including nested focus', (_kind, session) => {
    dispatchExplorationIntent({ type: 'select/entered', session })
    dispatchExplorationIntent({
      type: 'focus/requested',
      movieId: 10,
      policy: 'preserve-if-member',
    })

    expect(hasActiveSelectRelation(readExplorationContext(), _kind)).toBe(true)
    expect(clearActiveSelectSession(_kind)).toBe(true)
    expect(readExplorationContext()).toEqual({ kind: 'idle' })
    expect(clearActiveSelectSession(_kind)).toBe(false)
  })

  it.each([
    ['person', 'movie', {
      relation: { kind: 'person' as const, key: 'pat-example' },
      movieIds: [10],
      metadata: { fullName: 'Pat Example', roleMask: 1 },
    }],
    ['genre', 'id', {
      relation: { kind: 'genre' as const, key: 'genre:drama' },
      movieIds: [10],
      conditions: { operator: 'and' as const, genres: ['Drama'] },
    }],
  ] as const)(
    'tab-change seam clears nested %s focus to idle when leaving for %s',
    (currentTab, nextTab, session) => {
      dispatchExplorationIntent({ type: 'select/entered', session })
      dispatchExplorationIntent({
        type: 'focus/requested',
        movieId: 10,
        policy: 'preserve-if-member',
      })
      let notifications = 0
      const unsubscribe = subscribeExplorationContext(() => {
        notifications += 1
      })

      const action = applySearchTabChangeClear(currentTab, nextTab)
      unsubscribe()

      expect(action).toEqual({
        selectRelation: currentTab,
        clearTextQuery: true,
        clearGenreSelection: currentTab === 'genre',
      })
      expect(notifications).toBe(1)
      expect(readExplorationContext()).toEqual({ kind: 'idle' })
    },
  )

  it.each([
    ['movie', 'id'],
    ['id', 'movie'],
  ] as const)('tab-change seam sends no lifecycle clear for %s -> %s', (currentTab, nextTab) => {
    const personSession = {
      relation: { kind: 'person' as const, key: 'pat-example' },
      movieIds: [10],
      metadata: { fullName: 'Pat Example', roleMask: 1 },
    }
    dispatchExplorationIntent({ type: 'select/entered', session: personSession })
    dispatchExplorationIntent({
      type: 'focus/requested',
      movieId: 10,
      policy: 'preserve-if-member',
    })
    let notifications = 0
    const unsubscribe = subscribeExplorationContext(() => {
      notifications += 1
    })

    const action = applySearchTabChangeClear(currentTab, nextTab)
    unsubscribe()

    expect(action.selectRelation).toBeNull()
    expect(notifications).toBe(0)
    expect(readExplorationContext()).toEqual({
      kind: 'focus',
      movieId: 10,
      parent: personSession,
    })
  })

  it('explicit Genre clear removes its canonical parent and describes all local cleanup', () => {
    enterGenreSelectSession({
      genreNames: ['Drama'],
      searchIndex: genreIndex,
      movieById: new Map(),
    })
    setSearchQuery('Drama')
    useGalaxyInteractionStore.setState({
      searchResults: [{ kind: 'genre', genreName: 'History', label: 'History', count: 1 }],
    })

    const action = applySearchExplicitClear('genre')
    if (action.clearTextQuery) setSearchQuery('')

    expect(action).toEqual({
      selectRelation: 'genre',
      clearTextQuery: true,
      clearGenreSelection: true,
    })
    expect(readExplorationContext()).toEqual({ kind: 'idle' })
    expect(useGalaxyInteractionStore.getState().searchQuery).toBe('')
    expect(useGalaxyInteractionStore.getState().searchResults).toHaveLength(1)
  })

  it('keeps a nested parent when Title and ID clears remain local', () => {
    const personSession = {
      relation: { kind: 'person' as const, key: 'pat-example' },
      movieIds: [10],
      metadata: { fullName: 'Pat Example', roleMask: 1 },
    }
    dispatchExplorationIntent({ type: 'select/entered', session: personSession })
    dispatchExplorationIntent({
      type: 'focus/requested',
      movieId: 10,
      policy: 'preserve-if-member',
    })

    const titleCleared = clearFocusEchoInput(
      beginFocusEchoQueryEdit(INITIAL_FOCUS_ECHO_INPUT_STATE, 'title draft'),
    )
    const idCleared = clearIdTabInput(
      beginIdTabQueryEdit(INITIAL_ID_TAB_INPUT_STATE, '10'),
    )

    expect(titleCleared.query).toBe('')
    expect(idCleared.query).toBe('')
    expect(readExplorationContext()).toEqual({
      kind: 'focus',
      movieId: 10,
      parent: personSession,
    })
  })

  it('uses replacing focus for title or ID lookup without inheriting the parent', () => {
    dispatchExplorationIntent({
      type: 'select/entered',
      session: {
        relation: { kind: 'genre', key: 'genre:drama' },
        movieIds: [10, 20],
        conditions: { operator: 'and', genres: ['Drama'] },
      },
    })

    requestReplacingMovieFocus(20)

    expect(readExplorationContext()).toEqual({ kind: 'focus', movieId: 20 })
  })
})