import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  decideExploration,
  dispatchExplorationIntent,
  readExplorationContext,
  type ExplorationContext,
  type ExplorationIntent,
  type SelectSession,
} from '@/lib/exploration'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'

const personSession = {
  relation: { kind: 'person', key: 'pat-example' },
  movieIds: [10, 20, 30],
  metadata: {
    fullName: 'Pat Example',
    roleMask: 3,
    movieRoles: { '10': 1, '20': 2, '30': 1 },
  },
} satisfies SelectSession

const genreSession = {
  relation: { kind: 'genre', key: 'genre:drama+history' },
  movieIds: [20, 40],
  conditions: { operator: 'and', genres: ['Drama', 'History'] },
} satisfies SelectSession

const idle = { kind: 'idle' } satisfies ExplorationContext
const selected = { kind: 'select', session: personSession } satisfies ExplorationContext
const nestedFocus = {
  kind: 'focus',
  movieId: 20,
  parent: personSession,
} satisfies ExplorationContext
const replacingFocus = { kind: 'focus', movieId: 40 } satisfies ExplorationContext

function resetStore(): void {
  useGalaxyInteractionStore.setState({
    selectedMovieId: null,
    searchMode: 'idle',
    selectionIds: null,
    selectionPersonKey: null,
    selectionRelationKey: null,
    selectionPersonMetadata: null,
    selectionGenreConditions: null,
  })
}

describe('decideExploration transition matrix', () => {
  it.each([
    {
      label: 'idle + select/entered',
      current: idle,
      intent: { type: 'select/entered', session: personSession },
      expected: selected,
    },
    {
      label: 'idle + select/cleared',
      current: idle,
      intent: { type: 'select/cleared' },
      expected: idle,
    },
    {
      label: 'idle + focus/requested',
      current: idle,
      intent: { type: 'focus/requested', movieId: 40, policy: 'preserve-if-member' },
      expected: replacingFocus,
    },
    {
      label: 'idle + focus/exited',
      current: idle,
      intent: { type: 'focus/exited' },
      expected: idle,
    },
    {
      label: 'select + select/entered',
      current: selected,
      intent: { type: 'select/entered', session: genreSession },
      expected: { kind: 'select', session: genreSession },
    },
    {
      label: 'select + select/cleared',
      current: selected,
      intent: { type: 'select/cleared' },
      expected: idle,
    },
    {
      label: 'select + focus/requested',
      current: selected,
      intent: { type: 'focus/requested', movieId: 20, policy: 'preserve-if-member' },
      expected: nestedFocus,
    },
    {
      label: 'select + focus/exited',
      current: selected,
      intent: { type: 'focus/exited' },
      expected: selected,
    },
    {
      label: 'replacing focus + select/entered',
      current: replacingFocus,
      intent: { type: 'select/entered', session: genreSession },
      expected: { kind: 'select', session: genreSession },
    },
    {
      label: 'replacing focus + select/cleared',
      current: replacingFocus,
      intent: { type: 'select/cleared' },
      expected: replacingFocus,
    },
    {
      label: 'replacing focus + focus/requested',
      current: replacingFocus,
      intent: { type: 'focus/requested', movieId: 50, policy: 'preserve-if-member' },
      expected: { kind: 'focus', movieId: 50 },
    },
    {
      label: 'replacing focus + focus/exited',
      current: replacingFocus,
      intent: { type: 'focus/exited' },
      expected: idle,
    },
    {
      label: 'focus + select/entered',
      current: nestedFocus,
      intent: { type: 'select/entered', session: genreSession },
      expected: { kind: 'select', session: genreSession },
    },
    {
      label: 'nested focus + select/cleared',
      current: nestedFocus,
      intent: { type: 'select/cleared' },
      expected: idle,
    },
    {
      label: 'focus + focus/requested',
      current: nestedFocus,
      intent: { type: 'focus/requested', movieId: 30, policy: 'preserve-if-member' },
      expected: { kind: 'focus', movieId: 30, parent: personSession },
    },
    {
      label: 'nested focus + focus/exited',
      current: nestedFocus,
      intent: { type: 'focus/exited' },
      expected: selected,
    },
  ] satisfies Array<{
    label: string
    current: ExplorationContext
    intent: ExplorationIntent
    expected: ExplorationContext
  }>)('$label', ({ current, intent, expected }) => {
    expect(decideExploration(current, intent)).toEqual(expected)
  })

  it('exits replacing focus to idle and ignores select clear without a parent', () => {
    expect(decideExploration(replacingFocus, { type: 'focus/exited' })).toEqual(idle)
    expect(decideExploration(replacingFocus, { type: 'select/cleared' })).toBe(
      replacingFocus,
    )
  })
})

describe('focus policy', () => {
  it('preserves a parent only for a member target', () => {
    expect(
      decideExploration(selected, {
        type: 'focus/requested',
        movieId: 30,
        policy: 'preserve-if-member',
      }),
    ).toEqual({ kind: 'focus', movieId: 30, parent: personSession })

    expect(
      decideExploration(selected, {
        type: 'focus/requested',
        movieId: 99,
        policy: 'preserve-if-member',
      }),
    ).toEqual({ kind: 'focus', movieId: 99 })
  })

  it('replace always removes the parent', () => {
    expect(
      decideExploration(nestedFocus, {
        type: 'focus/requested',
        movieId: 20,
        policy: 'replace',
      }),
    ).toEqual({ kind: 'focus', movieId: 20 })
  })
})

describe('validation and idempotence', () => {
  it.each([
    ['empty movie IDs', { ...personSession, movieIds: [] }],
    ['duplicate movie IDs', { ...personSession, movieIds: [10, 10] }],
    ['invalid movie ID', { ...personSession, movieIds: [0, 20] }],
    [
      'wrong relation payload',
      {
        relation: { kind: 'person', key: 'pat-example' },
        movieIds: [10],
        conditions: { operator: 'and', genres: ['Drama'] },
      },
    ],
  ])('rejects %s', (_label, session) => {
    expect(() =>
      decideExploration(idle, {
        type: 'select/entered',
        session,
      } as unknown as ExplorationIntent),
    ).toThrow(/exploration/i)
  })

  it('rejects invalid focus IDs, policies, and non-member parents', () => {
    expect(() =>
      decideExploration(idle, {
        type: 'focus/requested',
        movieId: Number.NaN,
        policy: 'replace',
      }),
    ).toThrow(/movieId/)
    expect(() =>
      decideExploration(idle, {
        type: 'focus/requested',
        movieId: 10,
        policy: 'keep',
      } as unknown as ExplorationIntent),
    ).toThrow(/policy/)
    expect(() =>
      decideExploration(
        { kind: 'focus', movieId: 99, parent: personSession },
        { type: 'focus/exited' },
      ),
    ).toThrow(/belong/)
  })

  it('returns the same object for legal repeated intents', () => {
    expect(decideExploration(idle, { type: 'select/cleared' })).toBe(idle)
    expect(decideExploration(selected, { type: 'focus/exited' })).toBe(selected)
    expect(
      decideExploration(selected, { type: 'select/entered', session: personSession }),
    ).toBe(selected)
    expect(
      decideExploration(nestedFocus, {
        type: 'focus/requested',
        movieId: 20,
        policy: 'preserve-if-member',
      }),
    ).toBe(nestedFocus)
    expect(
      decideExploration(replacingFocus, {
        type: 'focus/requested',
        movieId: 40,
        policy: 'replace',
      }),
    ).toBe(replacingFocus)
  })

  it('copies ordered session collections at the decision boundary', () => {
    const movieIds = [10, 20]
    const genres = ['Drama', 'History']
    const session = {
      relation: { kind: 'genre' as const, key: 'genre:drama+history' },
      movieIds,
      conditions: { operator: 'and' as const, genres },
    }

    const result = decideExploration(idle, { type: 'select/entered', session })
    movieIds.reverse()
    genres.reverse()

    expect(result).toEqual({
      kind: 'select',
      session: {
        relation: { kind: 'genre', key: 'genre:drama+history' },
        movieIds: [10, 20],
        conditions: { operator: 'and', genres: ['Drama', 'History'] },
      },
    })
  })
})

describe('legacy Zustand adapter', () => {
  beforeEach(() => {
    resetStore()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  it('projects a nested focus in one complete store notification', () => {
    dispatchExplorationIntent({ type: 'select/entered', session: personSession })
    const snapshots: Array<ReturnType<typeof useGalaxyInteractionStore.getState>> = []
    const unsubscribe = useGalaxyInteractionStore.subscribe((state) => snapshots.push(state))

    dispatchExplorationIntent({
      type: 'focus/requested',
      movieId: 20,
      policy: 'preserve-if-member',
    })
    unsubscribe()

    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toMatchObject({
      selectedMovieId: 20,
      searchMode: 'person',
      selectionIds: [10, 20, 30],
      selectionPersonKey: 'pat-example',
      selectionRelationKey: 'pat-example',
      selectionPersonMetadata: personSession.metadata,
      selectionGenreConditions: null,
    })
    expect(readExplorationContext()).toEqual(nestedFocus)
  })

  it('atomically clears nested focus with its parent and restores a parent on focus exit', () => {
    dispatchExplorationIntent({ type: 'select/entered', session: personSession })
    dispatchExplorationIntent({
      type: 'focus/requested',
      movieId: 20,
      policy: 'preserve-if-member',
    })

    dispatchExplorationIntent({ type: 'focus/exited' })
    expect(readExplorationContext()).toEqual(selected)

    dispatchExplorationIntent({
      type: 'focus/requested',
      movieId: 20,
      policy: 'preserve-if-member',
    })
    const snapshots: ExplorationContext[] = []
    const unsubscribe = useGalaxyInteractionStore.subscribe(() => {
      snapshots.push(readExplorationContext())
    })
    dispatchExplorationIntent({ type: 'select/cleared' })
    unsubscribe()

    expect(snapshots).toEqual([idle])
  })

  it('does not notify for an idempotent dispatch', () => {
    let notifications = 0
    const unsubscribe = useGalaxyInteractionStore.subscribe(() => {
      notifications += 1
    })
    dispatchExplorationIntent({ type: 'focus/exited' })
    unsubscribe()
    expect(notifications).toBe(0)
  })

  it('logs only context kinds and a bounded collection summary', () => {
    dispatchExplorationIntent({ type: 'select/entered', session: personSession })

    expect(console.log).toHaveBeenLastCalledWith('[Exploration] dispatch', {
      fromKind: 'idle',
      toKind: 'select',
      collectionLength: 3,
      collectionSample: [10, 20, 30],
    })
  })

  it('fails fast when legacy lifecycle fields are structurally incomplete', () => {
    useGalaxyInteractionStore.setState({
      searchMode: 'person',
      selectionIds: [10],
      selectionPersonKey: 'pat-example',
      selectionRelationKey: 'pat-example',
      selectionPersonMetadata: null,
    })

    expect(() => readExplorationContext()).toThrow(/metadata/)
  })

  it('fails fast for invalid or non-member legacy focus IDs', () => {
    useGalaxyInteractionStore.setState({ selectedMovieId: 0 })
    expect(() => readExplorationContext()).toThrow(/movieId/)

    resetStore()
    dispatchExplorationIntent({ type: 'select/entered', session: personSession })
    useGalaxyInteractionStore.setState({ selectedMovieId: 99 })
    expect(() => readExplorationContext()).toThrow(/belong/)
  })
})