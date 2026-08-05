import type {
  ExplorationContext,
  ExplorationIntent,
  GenreSelectConditions,
  GenreSelectSession,
  PersonSelectMetadata,
  PersonSelectSession,
  SelectSession,
} from './types'

const ROLE_MASK_MAX = 63

function fail(message: string): never {
  throw new TypeError(`[exploration] ${message}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) fail(`${label} must be an object`)
}

function assertExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
  label: string,
): void {
  const keys = Object.keys(value)
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${label}.${key} is required`)
  }
  const allowed = new Set([...required, ...optional])
  const unexpected = keys.find((key) => !allowed.has(key))
  if (unexpected !== undefined) fail(`${label}.${unexpected} is not allowed`)
}

function assertCanonicalText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    fail(`${label} must be a non-empty trimmed string`)
  }
}

function assertMovieId(value: unknown, label = 'movieId'): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    fail(`${label} must be a positive safe integer`)
  }
}

function assertMovieIds(value: unknown): asserts value is readonly number[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail('session.movieIds must be a non-empty ordered array')
  }
  const seen = new Set<number>()
  for (let index = 0; index < value.length; index += 1) {
    const movieId = value[index]
    assertMovieId(movieId, `session.movieIds[${index}]`)
    if (seen.has(movieId)) fail(`session.movieIds contains duplicate ID ${movieId}`)
    seen.add(movieId)
  }
}

function assertPersonMetadata(value: unknown): asserts value is PersonSelectMetadata {
  assertRecord(value, 'session.metadata')
  assertExactKeys(value, ['fullName', 'roleMask'], ['movieRoles'], 'session.metadata')
  assertCanonicalText(value.fullName, 'session.metadata.fullName')
  if (
    !Number.isInteger(value.roleMask) ||
    (value.roleMask as number) <= 0 ||
    (value.roleMask as number) > ROLE_MASK_MAX
  ) {
    fail(`session.metadata.roleMask must be an integer from 1 to ${ROLE_MASK_MAX}`)
  }
  if (value.movieRoles === undefined) return

  assertRecord(value.movieRoles, 'session.metadata.movieRoles')
  const roleMask = value.roleMask as number
  for (const [movieIdKey, roleValue] of Object.entries(value.movieRoles)) {
    if (!/^[1-9]\d*$/.test(movieIdKey) || !Number.isSafeInteger(Number(movieIdKey))) {
      fail(`session.metadata.movieRoles key ${movieIdKey} is not a valid movie ID`)
    }
    if (
      !Number.isInteger(roleValue) ||
      (roleValue as number) <= 0 ||
      ((roleValue as number) & ~roleMask) !== 0
    ) {
      fail(`session.metadata.movieRoles.${movieIdKey} must be a subset of roleMask`)
    }
  }
}

function assertGenreConditions(value: unknown): asserts value is GenreSelectConditions {
  assertRecord(value, 'session.conditions')
  assertExactKeys(value, ['operator', 'genres'], [], 'session.conditions')
  if (value.operator !== 'and') fail('session.conditions.operator must be "and"')
  if (!Array.isArray(value.genres) || value.genres.length === 0) {
    fail('session.conditions.genres must be a non-empty ordered array')
  }
  const seen = new Set<string>()
  for (let index = 0; index < value.genres.length; index += 1) {
    const genre = value.genres[index]
    assertCanonicalText(genre, `session.conditions.genres[${index}]`)
    if (seen.has(genre)) fail(`session.conditions.genres contains duplicate ${genre}`)
    seen.add(genre)
  }
}

function assertRelation(value: unknown, expectedKind: 'person' | 'genre'): void {
  assertRecord(value, 'session.relation')
  assertExactKeys(value, ['kind', 'key'], [], 'session.relation')
  if (value.kind !== expectedKind) fail(`session.relation.kind must be "${expectedKind}"`)
  assertCanonicalText(value.key, 'session.relation.key')
}

function assertSelectSession(value: unknown): asserts value is SelectSession {
  assertRecord(value, 'session')
  assertRecord(value.relation, 'session.relation')
  const relationKind = value.relation.kind
  if (relationKind === 'person') {
    assertExactKeys(value, ['relation', 'movieIds', 'metadata'], [], 'session')
    assertRelation(value.relation, 'person')
    assertMovieIds(value.movieIds)
    assertPersonMetadata(value.metadata)
    const memberIds = new Set(value.movieIds)
    for (const movieIdKey of Object.keys(value.metadata.movieRoles ?? {})) {
      if (!memberIds.has(Number(movieIdKey))) {
        fail(`session.metadata.movieRoles.${movieIdKey} is not a session member`)
      }
    }
    return
  }
  if (relationKind === 'genre') {
    assertExactKeys(value, ['relation', 'movieIds', 'conditions'], [], 'session')
    assertRelation(value.relation, 'genre')
    assertMovieIds(value.movieIds)
    assertGenreConditions(value.conditions)
    return
  }
  fail('session.relation.kind must be "person" or "genre"')
}

export function assertValidExplorationContext(
  value: unknown,
): asserts value is ExplorationContext {
  assertRecord(value, 'context')
  if (value.kind === 'idle') {
    assertExactKeys(value, ['kind'], [], 'context')
    return
  }
  if (value.kind === 'select') {
    assertExactKeys(value, ['kind', 'session'], [], 'context')
    assertSelectSession(value.session)
    return
  }
  if (value.kind === 'focus') {
    assertExactKeys(value, ['kind', 'movieId'], ['parent'], 'context')
    assertMovieId(value.movieId)
    if (Object.hasOwn(value, 'parent')) {
      if (value.parent === undefined) fail('context.parent must be omitted for replacing focus')
      assertSelectSession(value.parent)
      if (!value.parent.movieIds.includes(value.movieId as number)) {
        fail('context.movieId must belong to context.parent')
      }
    }
    return
  }
  fail('context.kind must be "idle", "select", or "focus"')
}

function assertExplorationIntent(value: unknown): asserts value is ExplorationIntent {
  assertRecord(value, 'intent')
  if (value.type === 'select/entered') {
    assertExactKeys(value, ['type', 'session'], [], 'intent')
    assertSelectSession(value.session)
    return
  }
  if (value.type === 'select/cleared' || value.type === 'focus/exited') {
    assertExactKeys(value, ['type'], [], 'intent')
    return
  }
  if (value.type === 'focus/requested') {
    assertExactKeys(value, ['type', 'movieId', 'policy'], [], 'intent')
    assertMovieId(value.movieId)
    if (value.policy !== 'preserve-if-member' && value.policy !== 'replace') {
      fail('intent.policy must be "preserve-if-member" or "replace"')
    }
    return
  }
  fail('intent.type is not supported')
}

function copyPersonMetadata(metadata: PersonSelectMetadata): PersonSelectMetadata {
  const movieRoles =
    metadata.movieRoles === undefined
      ? undefined
      : Object.freeze({ ...metadata.movieRoles })
  return Object.freeze({
    fullName: metadata.fullName,
    roleMask: metadata.roleMask,
    ...(movieRoles === undefined ? {} : { movieRoles }),
  })
}

function copyGenreConditions(conditions: GenreSelectConditions): GenreSelectConditions {
  return Object.freeze({
    operator: 'and',
    genres: Object.freeze([...conditions.genres]),
  })
}

function isPersonSession(session: SelectSession): session is PersonSelectSession {
  return session.relation.kind === 'person'
}

function isGenreSession(session: SelectSession): session is GenreSelectSession {
  return session.relation.kind === 'genre'
}

function copySession(session: SelectSession): SelectSession {
  if (isPersonSession(session)) {
    return Object.freeze({
      relation: Object.freeze({ ...session.relation }),
      movieIds: Object.freeze([...session.movieIds]),
      metadata: copyPersonMetadata(session.metadata),
    })
  }
  return Object.freeze({
    relation: Object.freeze({ ...session.relation }),
    movieIds: Object.freeze([...session.movieIds]),
    conditions: copyGenreConditions(session.conditions),
  })
}

function recordsEqual(
  left: Readonly<Record<string, number>> | undefined,
  right: Readonly<Record<string, number>> | undefined,
): boolean {
  if (left === right) return true
  if (left === undefined || right === undefined) return false
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return (
    arraysEqual(leftKeys, rightKeys) &&
    leftKeys.every((key) => left[key] === right[key])
  )
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function sessionsEqual(left: SelectSession, right: SelectSession): boolean {
  if (left.relation.kind !== right.relation.kind) return false
  if (left.relation.key !== right.relation.key || !arraysEqual(left.movieIds, right.movieIds)) {
    return false
  }
  if (isPersonSession(left) && isPersonSession(right)) {
    return (
      left.metadata.fullName === right.metadata.fullName &&
      left.metadata.roleMask === right.metadata.roleMask &&
      recordsEqual(left.metadata.movieRoles, right.metadata.movieRoles)
    )
  }
  if (isGenreSession(left) && isGenreSession(right)) {
    return (
      left.conditions.operator === right.conditions.operator &&
      arraysEqual(left.conditions.genres, right.conditions.genres)
    )
  }
  return false
}

function parentFor(current: ExplorationContext): SelectSession | undefined {
  if (current.kind === 'select') return current.session
  if (current.kind === 'focus') return current.parent
  return undefined
}

export function decideExploration(
  current: ExplorationContext,
  intent: ExplorationIntent,
): ExplorationContext {
  assertValidExplorationContext(current)
  assertExplorationIntent(intent)

  switch (intent.type) {
    case 'select/entered': {
      if (current.kind === 'select' && sessionsEqual(current.session, intent.session)) {
        return current
      }
      return { kind: 'select', session: copySession(intent.session) }
    }
    case 'select/cleared':
      if (current.kind === 'select' || (current.kind === 'focus' && current.parent !== undefined)) {
        return { kind: 'idle' }
      }
      return current
    case 'focus/requested': {
      const availableParent = parentFor(current)
      const parent =
        intent.policy === 'preserve-if-member' &&
        availableParent?.movieIds.includes(intent.movieId)
          ? availableParent
          : undefined
      if (
        current.kind === 'focus' &&
        current.movieId === intent.movieId &&
        current.parent === parent
      ) {
        return current
      }
      return parent === undefined
        ? { kind: 'focus', movieId: intent.movieId }
        : { kind: 'focus', movieId: intent.movieId, parent }
    }
    case 'focus/exited':
      if (current.kind !== 'focus') return current
      return current.parent === undefined
        ? { kind: 'idle' }
        : { kind: 'select', session: current.parent }
  }
}
