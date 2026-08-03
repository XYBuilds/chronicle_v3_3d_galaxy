import type { ExplorationContext, ExplorationIntent } from '@/lib/exploration'

export type ThreeClickTarget =
  | { type: 'active-movie'; movieId: number }
  | { type: 'focus-planet' }
  | { type: 'blank' }

export type ThreeClickDecision =
  | { type: 'lifecycle-intent'; intent: ExplorationIntent }
  | { type: 'ignored'; reason: 'focus-planet' | 'focus-blank' | 'macro-blank' }

export function decideThreeClick(input: {
  context: ExplorationContext
  target: ThreeClickTarget
}): ThreeClickDecision {
  if (input.target.type === 'active-movie') {
    return {
      type: 'lifecycle-intent',
      intent: {
        type: 'focus/requested',
        movieId: input.target.movieId,
        policy: 'preserve-if-member',
      },
    }
  }
  if (input.target.type === 'focus-planet') {
    return { type: 'ignored', reason: 'focus-planet' }
  }
  return input.context.kind === 'focus'
    ? { type: 'ignored', reason: 'focus-blank' }
    : { type: 'ignored', reason: 'macro-blank' }
}