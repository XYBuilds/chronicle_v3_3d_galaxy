import type {
  ExplorationContext,
  GenreSelectConditions,
  GenreSelectSession,
  PersonSelectMetadata,
  PersonSelectSession,
  SelectSession,
} from './types'

export type ExplorationMaskMode = 0 | 1 | 2

export interface ExplorationSelection {
  readonly focusMovieId: number | null
  readonly parentSession: SelectSession | null
  readonly collectionMovieIds: readonly number[] | null
  readonly personMetadata: PersonSelectMetadata | null
  readonly genreConditions: GenreSelectConditions | null
  readonly maskMode: ExplorationMaskMode
}

function isPersonSession(session: SelectSession): session is PersonSelectSession {
  return session.relation.kind === 'person'
}

function isGenreSession(session: SelectSession): session is GenreSelectSession {
  return session.relation.kind === 'genre'
}

export function selectFocusMovieId(context: ExplorationContext): number | null {
  return context.kind === 'focus' ? context.movieId : null
}

export function selectParentSession(context: ExplorationContext): SelectSession | null {
  if (context.kind === 'select') return context.session
  if (context.kind === 'focus') return context.parent ?? null
  return null
}

export function selectCollectionMovieIds(
  context: ExplorationContext,
): readonly number[] | null {
  return selectParentSession(context)?.movieIds ?? null
}

export function selectPersonMetadata(
  context: ExplorationContext,
): PersonSelectMetadata | null {
  const session = selectParentSession(context)
  return session !== null && isPersonSession(session) ? session.metadata : null
}

export function selectGenreConditions(
  context: ExplorationContext,
): GenreSelectConditions | null {
  const session = selectParentSession(context)
  return session !== null && isGenreSession(session) ? session.conditions : null
}

export function selectMaskMode(context: ExplorationContext): ExplorationMaskMode {
  if (context.kind === 'focus') return 2
  if (context.kind === 'select') return 1
  return 0
}

export function selectExploration(context: ExplorationContext): ExplorationSelection {
  const parentSession = selectParentSession(context)
  return Object.freeze({
    focusMovieId: selectFocusMovieId(context),
    parentSession,
    collectionMovieIds: parentSession?.movieIds ?? null,
    personMetadata: selectPersonMetadata(context),
    genreConditions: selectGenreConditions(context),
    maskMode: selectMaskMode(context),
  })
}