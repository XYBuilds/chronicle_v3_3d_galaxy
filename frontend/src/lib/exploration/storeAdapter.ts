import type { GalaxyInteractionState } from '@/store/galaxyInteractionStore'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'

import {
  assertValidExplorationContext,
  copyValidatedSelectSession,
  decideExploration,
} from './decision'
import type {
  ExplorationContext,
  ExplorationIntent,
  PersonSelectSession,
  SelectSession,
} from './types'

const LOG_SAMPLE_LIMIT = 3

type LifecycleProjection = Pick<
  GalaxyInteractionState,
  | 'selectedMovieId'
  | 'searchMode'
  | 'selectionIds'
  | 'selectionPersonKey'
  | 'selectionRelationKey'
  | 'selectionPersonMetadata'
  | 'selectionGenreConditions'
>

function fail(message: string): never {
  throw new TypeError(`[exploration adapter] ${message}`)
}

function readSession(state: GalaxyInteractionState): SelectSession | null {
  if (state.searchMode !== 'person' && state.searchMode !== 'genre') {
    if (
      state.selectionIds !== null ||
      state.selectionPersonKey !== null ||
      state.selectionRelationKey !== null ||
      state.selectionPersonMetadata !== null ||
      state.selectionGenreConditions !== null
    ) {
      fail('non-select searchMode cannot retain select session fields')
    }
    return null
  }
  if (state.selectionIds === null) fail('active select session requires selectionIds')
  if (state.selectionRelationKey === null) {
    fail('active select session requires selectionRelationKey')
  }

  if (state.searchMode === 'person') {
    if (state.selectionPersonKey === null) {
      fail('person session requires selectionPersonKey')
    }
    if (state.selectionPersonKey !== state.selectionRelationKey) {
      fail('person relation identity must match selectionPersonKey')
    }
    if (state.selectionPersonMetadata === null) {
      fail('person session requires metadata')
    }
    if (state.selectionGenreConditions !== null) {
      fail('person session cannot retain genre conditions')
    }
    return copyValidatedSelectSession({
      relation: { kind: 'person', key: state.selectionRelationKey },
      movieIds: state.selectionIds,
      metadata: state.selectionPersonMetadata,
    })
  }

  if (state.selectionPersonKey !== null || state.selectionPersonMetadata !== null) {
    fail('genre session cannot retain person metadata')
  }
  if (state.selectionGenreConditions === null) {
    fail('genre session requires selectionGenreConditions')
  }
  return copyValidatedSelectSession({
    relation: { kind: 'genre', key: state.selectionRelationKey },
    movieIds: state.selectionIds,
    conditions: state.selectionGenreConditions,
  })
}

function readContextFromState(state: GalaxyInteractionState): ExplorationContext {
  const session = readSession(state)
  const context: ExplorationContext =
    state.selectedMovieId === null
      ? session === null
        ? { kind: 'idle' }
        : { kind: 'select', session }
      : session === null
        ? { kind: 'focus', movieId: state.selectedMovieId }
        : { kind: 'focus', movieId: state.selectedMovieId, parent: session }
  assertValidExplorationContext(context)
  return context
}

function sessionOf(context: ExplorationContext): SelectSession | null {
  if (context.kind === 'select') return context.session
  if (context.kind === 'focus') return context.parent ?? null
  return null
}

function isPersonSession(session: SelectSession): session is PersonSelectSession {
  return session.relation.kind === 'person'
}

function projectContext(context: ExplorationContext): LifecycleProjection {
  const session = sessionOf(context)
  const selectedMovieId = context.kind === 'focus' ? context.movieId : null
  if (session === null) {
    return {
      selectedMovieId,
      searchMode: 'idle',
      selectionIds: null,
      selectionPersonKey: null,
      selectionRelationKey: null,
      selectionPersonMetadata: null,
      selectionGenreConditions: null,
    }
  }
  if (isPersonSession(session)) {
    return {
      selectedMovieId,
      searchMode: 'person',
      selectionIds: [...session.movieIds],
      selectionPersonKey: session.relation.key,
      selectionRelationKey: session.relation.key,
      selectionPersonMetadata: {
        ...session.metadata,
        ...(session.metadata.movieRoles === undefined
          ? {}
          : { movieRoles: { ...session.metadata.movieRoles } }),
      },
      selectionGenreConditions: null,
    }
  }
  return {
    selectedMovieId,
    searchMode: 'genre',
    selectionIds: [...session.movieIds],
    selectionPersonKey: null,
    selectionRelationKey: session.relation.key,
    selectionPersonMetadata: null,
    selectionGenreConditions: {
      operator: 'and',
      genres: [...session.conditions.genres],
    },
  }
}

function logDispatch(current: ExplorationContext, next: ExplorationContext): void {
  const session = sessionOf(next)
  console.log('[Exploration] dispatch', {
    fromKind: current.kind,
    toKind: next.kind,
    collectionLength: session?.movieIds.length ?? 0,
    collectionSample: session?.movieIds.slice(0, LOG_SAMPLE_LIMIT) ?? [],
  })
}

export function readExplorationContext(): ExplorationContext {
  return readContextFromState(useGalaxyInteractionStore.getState())
}

export function dispatchExplorationIntent(intent: ExplorationIntent): ExplorationContext {
  const current = readExplorationContext()
  const next = decideExploration(current, intent)
  if (next !== current) {
    useGalaxyInteractionStore.setState(projectContext(next))
  }
  logDispatch(current, next)
  return next
}