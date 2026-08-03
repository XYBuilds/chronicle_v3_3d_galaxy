import type { ExplorationContext, ExplorationIntent } from './types'

export type EscapePriorityInput = {
  infoDialogActive: boolean
  searchInputFocused: boolean
  context: ExplorationContext
}

export type EscapePriorityAction =
  | { type: 'ignored' }
  | { type: 'blur-search-input' }
  | { type: 'lifecycle-intent'; intent: ExplorationIntent }

/**
 * Chooses exactly one semantic layer for a capture-phase Escape press.
 * DOM focus checks stay in the App adapter; lifecycle transitions stay in exploration.
 */
export function decideEscapePriority({
  infoDialogActive,
  searchInputFocused,
  context,
}: EscapePriorityInput): EscapePriorityAction {
  if (infoDialogActive) return { type: 'ignored' }
  if (searchInputFocused) return { type: 'blur-search-input' }
  if (context.kind === 'focus') {
    return { type: 'lifecycle-intent', intent: { type: 'focus/exited' } }
  }
  if (context.kind === 'select') {
    return { type: 'lifecycle-intent', intent: { type: 'select/cleared' } }
  }
  return { type: 'ignored' }
}
