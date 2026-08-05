import {
  dispatchExplorationIntent,
  readExplorationContext,
} from './storeAdapter'

/** Return the shared test store to idle through the same lifecycle seam as production callers. */
export function resetExplorationContext(): void {
  if (readExplorationContext().kind === 'focus') {
    dispatchExplorationIntent({ type: 'focus/exited' })
  }
  if (readExplorationContext().kind === 'select') {
    dispatchExplorationIntent({ type: 'select/cleared' })
  }
  if (readExplorationContext().kind !== 'idle') {
    throw new Error('[exploration test] lifecycle reset did not reach idle')
  }
}