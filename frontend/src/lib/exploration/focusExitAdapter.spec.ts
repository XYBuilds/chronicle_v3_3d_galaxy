import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  decideEscapePriority,
  dispatchExplorationIntent,
  readExplorationContext,
  type ExplorationContext,
  type ExplorationIntent,
  type SelectSession,
} from '@/lib/exploration'
import { exitFocus } from '@/lib/exploration/focusExit'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'

const parentSession = {
  relation: { kind: 'person', key: 'focus-exit-person' },
  movieIds: [101, 202],
  metadata: { fullName: 'Focus Exit Person', roleMask: 1 },
} satisfies SelectSession

const nestedFocus = {
  kind: 'focus',
  movieId: 202,
  parent: parentSession,
} satisfies ExplorationContext

const replacingFocus = { kind: 'focus', movieId: 303 } satisfies ExplorationContext

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

function pressExplorationEscape(): ExplorationIntent | null {
  const action = decideEscapePriority({
    infoDialogActive: false,
    searchInputFocused: false,
    context: readExplorationContext(),
  })
  if (action.type !== 'lifecycle-intent') return null
  dispatchExplorationIntent(action.intent)
  return action.intent
}

describe('focus exit adapter', () => {
  beforeEach(() => {
    resetStore()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  it('dispatches one focus/exited intent and restores a nested parent session', () => {
    dispatchExplorationIntent({ type: 'select/entered', session: parentSession })
    dispatchExplorationIntent({
      type: 'focus/requested',
      movieId: 202,
      policy: 'preserve-if-member',
    })
    expect(readExplorationContext()).toEqual(nestedFocus)
    const snapshots: ExplorationContext[] = []
    const unsubscribe = useGalaxyInteractionStore.subscribe(() => {
      snapshots.push(readExplorationContext())
    })

    exitFocus()
    unsubscribe()

    expect(snapshots).toEqual([
      { kind: 'select', session: parentSession },
    ])
    expect(readExplorationContext()).toEqual({ kind: 'select', session: parentSession })
  })

  it('dispatches one focus/exited intent and returns replacing focus to idle', () => {
    dispatchExplorationIntent({
      type: 'focus/requested',
      movieId: replacingFocus.movieId,
      policy: 'replace',
    })
    const snapshots: ExplorationContext[] = []
    const unsubscribe = useGalaxyInteractionStore.subscribe(() => {
      snapshots.push(readExplorationContext())
    })

    exitFocus()
    unsubscribe()

    expect(snapshots).toEqual([{ kind: 'idle' }])
    expect(readExplorationContext()).toEqual({ kind: 'idle' })
  })

  it('uses one Escape press per nested focus-stack layer', () => {
    dispatchExplorationIntent({ type: 'select/entered', session: parentSession })
    dispatchExplorationIntent({
      type: 'focus/requested',
      movieId: 202,
      policy: 'preserve-if-member',
    })
    const snapshots: ExplorationContext[] = []
    const unsubscribe = useGalaxyInteractionStore.subscribe(() => {
      snapshots.push(readExplorationContext())
    })

    expect(pressExplorationEscape()).toEqual({ type: 'focus/exited' })
    expect(readExplorationContext()).toEqual({ kind: 'select', session: parentSession })
    expect(pressExplorationEscape()).toEqual({ type: 'select/cleared' })
    unsubscribe()

    expect(snapshots).toEqual([
      { kind: 'select', session: parentSession },
      { kind: 'idle' },
    ])
  })

  it('is safe when no focus is active and does not clear a select session', () => {
    dispatchExplorationIntent({ type: 'select/entered', session: parentSession })
    const snapshots: ExplorationContext[] = []
    const unsubscribe = useGalaxyInteractionStore.subscribe(() => {
      snapshots.push(readExplorationContext())
    })

    exitFocus()
    unsubscribe()

    expect(snapshots).toEqual([])
    expect(readExplorationContext()).toEqual({ kind: 'select', session: parentSession })
  })
})
