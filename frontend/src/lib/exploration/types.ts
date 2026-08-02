export type FocusPolicy = 'preserve-if-member' | 'replace'

export interface PersonRelationIdentity {
  kind: 'person'
  key: string
}

export interface GenreRelationIdentity {
  kind: 'genre'
  key: string
}

export interface PersonSelectMetadata {
  fullName: string
  roleMask: number
  movieRoles?: Readonly<Record<string, number>>
}

export interface GenreSelectConditions {
  operator: 'and'
  genres: readonly string[]
}

export interface PersonSelectSession {
  relation: PersonRelationIdentity
  movieIds: readonly number[]
  metadata: PersonSelectMetadata
}

export interface GenreSelectSession {
  relation: GenreRelationIdentity
  movieIds: readonly number[]
  conditions: GenreSelectConditions
}

export type SelectSession = PersonSelectSession | GenreSelectSession

export type ExplorationContext =
  | { kind: 'idle' }
  | { kind: 'select'; session: SelectSession }
  | { kind: 'focus'; movieId: number; parent?: SelectSession }

export type ExplorationIntent =
  | { type: 'select/entered'; session: SelectSession }
  | { type: 'select/cleared' }
  | { type: 'focus/requested'; movieId: number; policy: FocusPolicy }
  | { type: 'focus/exited' }