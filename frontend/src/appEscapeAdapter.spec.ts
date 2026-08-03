import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  executeAppEscape,
  type AppEscapeDependencies,
  type AppEscapeEvent,
} from '@/appEscapeAdapter'
import {
  dispatchExplorationIntent,
  readExplorationContext,
  type ExplorationContext,
  type ExplorationIntent,
  type SelectSession,
} from '@/lib/exploration'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'

const parentSession = {
  relation: { kind: 'genre', key: 'genre:app-escape' },
  movieIds: [101, 202],
  conditions: { operator: 'and', genres: ['Escape'] },
} satisfies SelectSession

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

function enterSelect(): void {
  dispatchExplorationIntent({ type: 'select/entered', session: parentSession })
}

function enterNestedFocus(): void {
  enterSelect()
  dispatchExplorationIntent({
    type: 'focus/requested',
    movieId: 202,
    policy: 'preserve-if-member',
  })
}

function enterReplacingFocus(): void {
  dispatchExplorationIntent({
    type: 'focus/requested',
    movieId: 303,
    policy: 'replace',
  })
}

function createEvent(): AppEscapeEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }
}

function createDependencies(): {
  dependencies: AppEscapeDependencies
  intents: ExplorationIntent[]
  snapshots: ExplorationContext[]
} {
  const intents: ExplorationIntent[] = []
  const snapshots: ExplorationContext[] = []
  return {
    dependencies: {
      readContext: vi.fn(readExplorationContext),
      dispatchIntent: vi.fn((intent: ExplorationIntent) => {
        intents.push(intent)
        snapshots.push(dispatchExplorationIntent(intent))
      }),
      clearSearchDraft: vi.fn(),
    },
    intents,
    snapshots,
  }
}

describe('App capture-phase Escape executor', () => {
  beforeEach(() => {
    resetStore()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  it('leaves an active info dialog unconsumed without reading or dispatching exploration state', () => {
    enterNestedFocus()
    const event = createEvent()
    const { dependencies, intents, snapshots } = createDependencies()

    executeAppEscape({
      event,
      infoDialogActive: true,
      searchInput: null,
      dependencies,
    })

    expect(dependencies.readContext).not.toHaveBeenCalled()
    expect(intents).toEqual([])
    expect(snapshots).toEqual([])
    expect(dependencies.clearSearchDraft).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
    expect(readExplorationContext()).toEqual({
      kind: 'focus',
      movieId: 202,
      parent: parentSession,
    })
  })

  it('consumes Search input Escape with one blur and no lifecycle dispatch', () => {
    enterNestedFocus()
    const event = createEvent()
    const searchInput = { blur: vi.fn() }
    const { dependencies, intents, snapshots } = createDependencies()

    executeAppEscape({
      event,
      infoDialogActive: false,
      searchInput,
      dependencies,
    })

    expect(searchInput.blur).toHaveBeenCalledOnce()
    expect(dependencies.readContext).not.toHaveBeenCalled()
    expect(intents).toEqual([])
    expect(snapshots).toEqual([])
    expect(dependencies.clearSearchDraft).not.toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
  })

  it.each([
    ['nested', enterNestedFocus, { kind: 'select', session: parentSession }],
    ['replacing', enterReplacingFocus, { kind: 'idle' }],
  ] satisfies Array<[string, () => void, ExplorationContext]>) (
    'dispatches exactly one focus/exited intent for %s focus and consumes the event',
    (_label, enterFocus, expectedSnapshot) => {
      enterFocus()
      const event = createEvent()
      const { dependencies, intents, snapshots } = createDependencies()

      executeAppEscape({
        event,
        infoDialogActive: false,
        searchInput: null,
        dependencies,
      })

      expect(intents).toEqual([{ type: 'focus/exited' }])
      expect(snapshots).toEqual([expectedSnapshot])
      expect(dependencies.dispatchIntent).toHaveBeenCalledOnce()
      expect(dependencies.clearSearchDraft).not.toHaveBeenCalled()
      expect(event.preventDefault).toHaveBeenCalledOnce()
      expect(event.stopPropagation).toHaveBeenCalledOnce()
      expect(readExplorationContext()).toEqual(expectedSnapshot)
    },
  )

  it('dispatches one select/cleared intent, clears one draft, and consumes the event', () => {
    enterSelect()
    const event = createEvent()
    const { dependencies, intents, snapshots } = createDependencies()

    executeAppEscape({
      event,
      infoDialogActive: false,
      searchInput: null,
      dependencies,
    })

    expect(intents).toEqual([{ type: 'select/cleared' }])
    expect(snapshots).toEqual([{ kind: 'idle' }])
    expect(dependencies.dispatchIntent).toHaveBeenCalledOnce()
    expect(dependencies.clearSearchDraft).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
    expect(readExplorationContext()).toEqual({ kind: 'idle' })
  })

  it('leaves idle Escape unconsumed without producing an intent', () => {
    const event = createEvent()
    const { dependencies, intents, snapshots } = createDependencies()

    executeAppEscape({
      event,
      infoDialogActive: false,
      searchInput: null,
      dependencies,
    })

    expect(dependencies.readContext).toHaveBeenCalledOnce()
    expect(intents).toEqual([])
    expect(snapshots).toEqual([])
    expect(dependencies.clearSearchDraft).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
    expect(readExplorationContext()).toEqual({ kind: 'idle' })
  })
})