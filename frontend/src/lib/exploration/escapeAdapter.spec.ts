import { describe, expect, it } from 'vitest'

import {
  decideEscapePriority,
  type EscapePriorityInput,
} from '@/lib/exploration/escapeAdapter'
import type { ExplorationContext, ExplorationIntent, SelectSession } from '@/lib/exploration'

const session = {
  relation: { kind: 'genre', key: 'genre:escape' },
  movieIds: [11, 22],
  conditions: { operator: 'and', genres: ['Escape'] },
} satisfies SelectSession

const contexts: Record<string, ExplorationContext> = {
  idle: { kind: 'idle' },
  select: { kind: 'select', session },
  nested: { kind: 'focus', movieId: 22, parent: session },
  replacing: { kind: 'focus', movieId: 33 },
}

function decide(overrides: Partial<EscapePriorityInput>): ReturnType<typeof decideEscapePriority> {
  return decideEscapePriority({
    infoDialogActive: false,
    searchInputFocused: false,
    context: contexts.idle,
    ...overrides,
  })
}

describe('Escape priority adapter', () => {
  it('lets the info dialog keep Escape without a lifecycle intent', () => {
    expect(decide({ infoDialogActive: true, context: contexts.nested })).toEqual({
      type: 'ignored',
    })
  })

  it('blurs the search input before considering focus or select', () => {
    expect(decide({ searchInputFocused: true, context: contexts.nested })).toEqual({
      type: 'blur-search-input',
    })
  })

  const lifecycleCases = [
    ['nested focus', contexts.nested, { type: 'focus/exited' }],
    ['replacing focus', contexts.replacing, { type: 'focus/exited' }],
    ['select session', contexts.select, { type: 'select/cleared' }],
  ] satisfies Array<[string, ExplorationContext, ExplorationIntent]>

  it.each(lifecycleCases)(
    'returns one lifecycle intent for %s', (_label, context, intent) => {
      expect(decide({ context })).toEqual({ type: 'lifecycle-intent', intent })
    },
  )

  it('does not produce a second lifecycle action for idle or a single decision', () => {
    const action = decide({ context: contexts.nested })
    expect(action).toEqual({
      type: 'lifecycle-intent',
      intent: { type: 'focus/exited' },
    })
    expect(decide({ context: contexts.idle })).toEqual({ type: 'ignored' })
  })
})
